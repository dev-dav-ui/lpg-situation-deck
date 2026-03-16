/**
 * scraper/events.ts
 *
 * News Event Processor — Phase 1, mixed deterministic + LLM.
 *
 * Pipeline:
 *   news_raw (ingested RSS items)
 *   → deduplication (deterministic)
 *   → LLM classification + summary (claude-haiku)
 *   → news_events (stored result)
 *
 * LLM does ONLY:
 *   - short factual summary
 *   - signal_type classification (closed vocabulary)
 *   - signal_strength classification (closed vocabulary)
 *   - region linking (city/state extraction)
 *   - tags (up to 5 lowercase keywords)
 *   - is_confirmed flag
 *
 * LLM is NEVER asked to generate numeric signals, shortage counts, or map states.
 * All LLM output is validated before writing to news_events.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import {
  LLM_MODEL,
  LLM_MAX_TOKENS,
  LLM_TEMPERATURE,
  BANNED_PHRASES_LITERAL,
  BANNED_PHRASES_REGEX,
  SIGNAL_TYPES,
  SIGNAL_STRENGTH_LEVELS,
  getSourceTier,
  type SignalType,
  type SignalStrength,
} from './config';
import {
  buildNewsClassifierPrompt,
  sanitizeNewsText,
  looksLikeInjection,
  type NewsClassifierInput,
  type NewsClassifierOutput,
} from './prompts';
import { writeJobRun, type JobStatus } from './integrity';

// ── Clients ───────────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || ''
  );
}

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });
}

// ── Ingest RSS feeds → news_raw ───────────────────────────────────

export interface RawNewsItem {
  source: string;
  url: string;
  title: string;
  body: string | null;
  published_at: string | null;
  source_tier: 1 | 2 | 3;
}

/**
 * Build a stable dedup key for a news item.
 * Based on normalised title — robust to minor URL variations.
 */
export function buildDedupKey(title: string, source: string): string {
  const normalised = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return `${source.toLowerCase().replace(/\s+/g, '_')}::${normalised}`;
}

/**
 * Ingest raw news items into news_raw, skipping duplicates.
 * Returns list of newly inserted rows (with their db ids).
 */
export async function ingestRawNews(items: RawNewsItem[]): Promise<string[]> {
  const supabase = getSupabase();
  const newIds: string[] = [];

  // Load existing dedup keys from last 7 days to avoid re-processing
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: existingKeys } = await supabase
    .from('news_raw')
    .select('dedup_key')
    .gte('ingested_at', sevenDaysAgo);

  const knownKeys = new Set(existingKeys?.map((r: { dedup_key: string }) => r.dedup_key) ?? []);

  for (const item of items) {
    // Reject likely injection attempts before writing to DB
    if (looksLikeInjection(item.title) || (item.body && looksLikeInjection(item.body))) {
      console.warn(`[events] Possible injection attempt rejected: "${item.title.slice(0, 60)}"`);
      continue;
    }

    const dedupKey = buildDedupKey(item.title, item.source);
    if (knownKeys.has(dedupKey)) continue;

    const { data, error } = await supabase
      .from('news_raw')
      .insert({
        source:      item.source,
        url:         item.url,
        title:       sanitizeNewsText(item.title),
        body:        item.body ? sanitizeNewsText(item.body) : null,
        published_at: item.published_at,
        ingested_at: new Date().toISOString(),
        dedup_key:   dedupKey,
        source_tier: item.source_tier,
      })
      .select('id')
      .single();

    if (!error && data?.id) {
      newIds.push(data.id);
      knownKeys.add(dedupKey); // prevent dupe within same batch
    } else if (error) {
      console.error(`[events] Failed to insert raw news: ${error.message}`);
    }
  }

  console.log(`[events] Ingested ${newIds.length}/${items.length} new raw news items`);
  return newIds;
}

// ── LLM classification ────────────────────────────────────────────

/** Validate LLM classifier output — reject or sanitize bad fields. */
function validateClassifierOutput(raw: unknown, input: NewsClassifierInput): NewsClassifierOutput | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  // Required fields
  if (typeof obj.summary !== 'string' || obj.summary.trim().length === 0) return null;
  if (!SIGNAL_TYPES.includes(obj.signal_type as SignalType)) return null;
  if (!SIGNAL_STRENGTH_LEVELS.includes(obj.signal_strength as SignalStrength)) return null;

  // Tags — must be array of strings
  const rawTags = Array.isArray(obj.tags) ? obj.tags : [];
  const tags = rawTags
    .filter((t: unknown) => typeof t === 'string')
    .map((t: string) => t.toLowerCase().slice(0, 40))
    .slice(0, 5);

  return {
    summary:         obj.summary.slice(0, 500),
    signal_type:     obj.signal_type as SignalType,
    signal_strength: obj.signal_strength as SignalStrength,
    tags,
    country:         typeof obj.country === 'string' ? obj.country.slice(0, 100) : 'India',
    state:           typeof obj.state === 'string' ? obj.state.slice(0, 100) : null,
    city:            typeof obj.city === 'string' ? obj.city.slice(0, 100) : null,
    is_confirmed:    typeof obj.is_confirmed === 'boolean' ? obj.is_confirmed : false,
  };
}

/** Check LLM summary for banned phrases. Returns rejected phrases or empty array. */
function checkBannedPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];

  for (const phrase of BANNED_PHRASES_LITERAL) {
    if (lower.includes(phrase)) found.push(phrase);
  }
  for (const pattern of BANNED_PHRASES_REGEX) {
    if (new RegExp(pattern, 'i').test(text)) found.push(pattern);
  }
  return found;
}

/** Call Claude to classify a single news item. Returns null on failure. */
async function classifyNewsItem(
  anthropic: Anthropic,
  input: NewsClassifierInput
): Promise<NewsClassifierOutput | null> {
  const prompt = buildNewsClassifierPrompt(input);

  let rawText: string;
  try {
    const response = await anthropic.messages.create({
      model:       LLM_MODEL,
      max_tokens:  LLM_MAX_TOKENS,
      temperature: LLM_TEMPERATURE,
      messages:    [{ role: 'user', content: prompt }],
    });

    const block = response.content[0];
    if (block.type !== 'text') return null;
    rawText = block.text.trim();
  } catch (err) {
    console.error('[events] LLM call failed:', err);
    return null;
  }

  // Parse JSON
  let parsed: unknown;
  try {
    // Handle LLM wrapping in markdown code fences
    const jsonStr = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    console.warn('[events] LLM returned non-JSON:', rawText.slice(0, 200));
    return null;
  }

  // Validate structure
  const validated = validateClassifierOutput(parsed, input);
  if (!validated) {
    console.warn('[events] LLM output failed validation');
    return null;
  }

  // Check banned phrases
  const bannedFound = checkBannedPhrases(validated.summary);
  if (bannedFound.length > 0) {
    console.warn(`[events] LLM output contained banned phrases: ${bannedFound.join(', ')}. Replacing summary.`);
    validated.summary = 'Signals detected. Verify with official sources before acting.';
    // Keep classification but sanitize summary
  }

  return validated;
}

// ── Process unclassified raw news → news_events ───────────────────

export async function processNewsEvents(rawIds: string[]): Promise<number> {
  if (rawIds.length === 0) return 0;

  const supabase  = getSupabase();
  const anthropic = getAnthropic();
  let processed   = 0;

  // Load the raw items
  const { data: rawItems, error } = await supabase
    .from('news_raw')
    .select('id, source, title, body, published_at, source_tier')
    .in('id', rawIds);

  if (error || !rawItems || rawItems.length === 0) {
    console.error('[events] Failed to load raw news items:', error?.message);
    return 0;
  }

  // Also load existing news_events raw_ids to avoid re-processing
  const { data: existingEvents } = await supabase
    .from('news_events')
    .select('raw_id')
    .in('raw_id', rawIds);

  const processedRawIds = new Set(existingEvents?.map((e: { raw_id: string }) => e.raw_id) ?? []);

  for (const raw of rawItems) {
    if (processedRawIds.has(raw.id)) continue;

    const input: NewsClassifierInput = {
      title:  raw.title,
      body:   raw.body,
      source: raw.source,
    };

    const classification = await classifyNewsItem(anthropic, input);

    // Build the event row — if LLM failed, write a minimal deterministic event
    const eventRow = {
      raw_id:          raw.id,
      headline:        raw.title.slice(0, 500),
      summary:         classification?.summary ?? 'Classification unavailable.',
      tags:            classification?.tags ?? [],
      country:         classification?.country ?? 'India',
      state:           classification?.state ?? null,
      city:            classification?.city ?? null,
      signal_type:     classification?.signal_type ?? 'unrelated',
      signal_strength: classification?.signal_strength ?? 'none',
      is_confirmed:    classification?.is_confirmed ?? false,
      source_urls:     [raw.source],
      published_at:    raw.published_at,
      created_at:      new Date().toISOString(),
    };

    const { error: insertError } = await supabase.from('news_events').insert(eventRow);

    if (insertError) {
      console.error(`[events] Failed to write news_event for raw ${raw.id}:`, insertError.message);
    } else {
      processed++;
    }
  }

  console.log(`[events] Processed ${processed}/${rawItems.length} news events`);
  return processed;
}

// ── Build RawNewsItem list from existing scraper news output ──────

/**
 * Convert the existing news_impact rows into RawNewsItem format for
 * ingestion into news_raw. Called once per pipeline run to backfill
 * the new table from already-scraped headlines.
 */
export async function syncNewsImpactToRaw(): Promise<RawNewsItem[]> {
  const supabase = getSupabase();
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data } = await supabase
    .from('news_impact')
    .select('headline, source, url, created_at')
    .gte('created_at', yesterday);

  if (!data) return [];

  return data.map((row: { headline: string; source: string; url: string; created_at: string }) => ({
    source:      row.source || 'unknown',
    url:         row.url || '',
    title:       row.headline,
    body:        null,
    published_at: row.created_at,
    source_tier: getSourceTier(row.source || 'unknown'),
  }));
}

// ── Main entry point ──────────────────────────────────────────────

export async function runEventsPipeline(): Promise<void> {
  const startedAt = new Date();
  console.log('[events] Starting news event processing...');

  let jobStatus: JobStatus = 'success';
  let jobError: string | undefined;
  let processed = 0;

  try {
    // Sync recent news_impact items into news_raw
    const items = await syncNewsImpactToRaw();
    const newRawIds = await ingestRawNews(items);

    // Classify new items
    if (newRawIds.length > 0) {
      processed = await processNewsEvents(newRawIds);
    } else {
      console.log('[events] No new raw news items to process');
      jobStatus = 'skipped';
    }
  } catch (err) {
    const msg = String(err);
    console.error('[events] Events pipeline failed:', msg);
    jobStatus = 'fail';
    jobError = msg;
  }

  await writeJobRun('events', startedAt, jobStatus, { processed }, jobError);
}
