/**
 * scraper/briefing.ts
 *
 * City Briefing Agent + National Snapshot — Phase 1.
 *
 * LLM is used ONLY for generating short prose summaries.
 * All input signals (delay, stress) are deterministic categorical labels
 * derived from existing DB data — never raw numerics passed to the LLM.
 *
 * Safety rules:
 *  - Skip generation if data is stale/degraded (freshness check first)
 *  - Banned phrase check on all LLM outputs before writing
 *  - Write safe fallback if LLM fails or output is rejected
 *  - Never expose LLM to shortage_pct raw numbers — pass only categorical labels
 *  - Log every generation attempt via job_runs
 */

import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import {
  LLM_MODEL,
  LLM_MAX_TOKENS,
  LLM_TEMPERATURE,
  BANNED_PHRASES_LITERAL,
  BANNED_PHRASES_REGEX,
  BRIEFING_FALLBACK_SUMMARY,
  SNAPSHOT_FALLBACK_SUMMARY,
  CITY_BRIEFING_TTL_HOURS,
  NATIONAL_SNAPSHOT_TTL_HOURS,
  MAX_NEWS_PER_BRIEFING,
  CITY_BRIEFING_PROMPT_VERSION,
  NATIONAL_SNAPSHOT_PROMPT_VERSION,
  FRESHNESS_DEGRADED_HOURS,
} from './config';
import {
  buildCityBriefingPrompt,
  buildNationalSnapshotPrompt,
  type CityBriefingInput,
  type CityBriefingOutput,
  type NationalSnapshotInput,
  type NationalSnapshotOutput,
} from './prompts';
import { writeJobRun, type JobStatus } from './integrity';

// ── Clients ───────────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || ''
  );
}

function getGemini() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
}

// ── Categorical signal mapping ────────────────────────────────────
// These functions mirror the frontend label logic — deterministic only.
// Do NOT pass raw wait_days or shortage_pct values to the LLM.

export function toDelaySignal(waitDays: number): string {
  if (waitDays >= 10) return 'High Delay Signal';
  if (waitDays >= 6)  return 'Moderate';
  if (waitDays >= 3)  return 'Mild';
  return 'Stable';
}

export function toStressSignal(shortagePct: number): string {
  if (shortagePct >= 25) return 'High';
  if (shortagePct >= 15) return 'Elevated';
  if (shortagePct >= 8)  return 'Moderate';
  return 'Low';
}

// ── Banned phrase filter ──────────────────────────────────────────

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

// ── LLM call wrapper ──────────────────────────────────────────────

async function callLLM(
  gemini: GoogleGenAI,
  prompt: string
): Promise<string | null> {
  try {
    const response = await gemini.models.generateContent({
      model:    LLM_MODEL,
      contents: prompt,
      config:   { maxOutputTokens: LLM_MAX_TOKENS, temperature: LLM_TEMPERATURE },
    });

    const text = (response.text ?? '').trim();
    return text || null;
  } catch (err) {
    console.error('[briefing] LLM call failed:', err);
    return null;
  }
}

// ── City briefing generation ──────────────────────────────────────

interface CitySignalRow {
  city: string;
  state: string;
  wait_days: number;
  shortage_pct: number;
  last_updated: string;
}

interface NewsEventRow {
  headline: string;
  source_urls: string[];
  published_at: string | null;
  signal_type: string;
  is_confirmed: boolean;
  state: string | null;
  city: string | null;
}

/**
 * Fetch the best signal row per city (highest wait_days).
 */
async function fetchCitySignals(supabase: ReturnType<typeof getSupabase>): Promise<CitySignalRow[]> {
  const { data } = await supabase
    .from('city_data')
    .select('city, state, wait_days, shortage_pct, last_updated')
    .neq('state', 'Unknown')
    .order('wait_days', { ascending: false });

  if (!data) return [];

  // Deduplicate to best row per city
  const bestByCity = new Map<string, CitySignalRow>();
  for (const row of data) {
    const existing = bestByCity.get(row.city);
    if (!existing || row.wait_days > existing.wait_days) {
      bestByCity.set(row.city, {
        city:         row.city,
        state:        row.state,
        wait_days:    Number(row.wait_days),
        shortage_pct: Number(row.shortage_pct),
        last_updated: row.last_updated,
      });
    }
  }
  return Array.from(bestByCity.values());
}

/**
 * Fetch recent relevant news events for a given city or state.
 */
async function fetchCityNews(
  supabase: ReturnType<typeof getSupabase>,
  city: string,
  state: string
): Promise<NewsEventRow[]> {
  const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

  // City-specific + state-level + national (null state = national)
  const { data } = await supabase
    .from('news_events')
    .select('headline, source_urls, published_at, signal_type, is_confirmed, state, city')
    .gte('created_at', twoDaysAgo)
    .or(`city.eq.${city},state.eq.${state},state.is.null`)
    .neq('signal_type', 'unrelated')
    .order('published_at', { ascending: false })
    .limit(MAX_NEWS_PER_BRIEFING);

  return (data ?? []) as NewsEventRow[];
}

/**
 * Check if a city briefing already exists and is still valid (within TTL).
 */
async function briefingIsValid(
  supabase: ReturnType<typeof getSupabase>,
  city: string
): Promise<boolean> {
  const { data } = await supabase
    .from('city_briefings')
    .select('valid_until')
    .eq('city', city)
    .order('generated_at', { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return false;
  const validUntil = new Date(data[0].valid_until);
  return validUntil > new Date();
}

/**
 * Generate and store briefing for a single city.
 * Skips if existing briefing is still valid.
 */
async function generateCityBriefing(
  supabase: ReturnType<typeof getSupabase>,
  gemini: GoogleGenAI,
  signal: CitySignalRow
): Promise<void> {
  // Check if briefing is still valid
  if (await briefingIsValid(supabase, signal.city)) {
    return; // still fresh, skip
  }

  const newsItems = await fetchCityNews(supabase, signal.city, signal.state);

  const delaySignal  = toDelaySignal(signal.wait_days);
  const stressSignal = toStressSignal(signal.shortage_pct);

  const input: CityBriefingInput = {
    city:          signal.city,
    state:         signal.state,
    delay_signal:  delaySignal,
    stress_signal: stressSignal,
    last_updated:  signal.last_updated,
    news_items:    newsItems.map(n => ({
      title:        n.headline,
      source:       Array.isArray(n.source_urls) ? n.source_urls[0] : 'unknown',
      published_at: n.published_at,
      signal_type:  n.signal_type,
      is_confirmed: n.is_confirmed,
    })),
  };

  const prompt   = buildCityBriefingPrompt(input);
  const llmText  = await callLLM(gemini, prompt);

  let summary: string;
  let modelVersion: string;

  if (llmText) {
    const bannedFound = checkBannedPhrases(llmText);
    if (bannedFound.length > 0) {
      console.warn(`[briefing] ${signal.city}: banned phrases found (${bannedFound.join(', ')}), using fallback`);
      summary = BRIEFING_FALLBACK_SUMMARY;
      modelVersion = 'fallback/banned';
    } else {
      summary = llmText.slice(0, 1000);
      modelVersion = LLM_MODEL;
    }
  } else {
    summary = BRIEFING_FALLBACK_SUMMARY;
    modelVersion = 'fallback/llm_error';
  }

  const validUntil = new Date(Date.now() + CITY_BRIEFING_TTL_HOURS * 3600 * 1000);

  await supabase.from('city_briefings').insert({
    city:           signal.city,
    state:          signal.state,
    generated_at:   new Date().toISOString(),
    valid_until:    validUntil.toISOString(),
    delay_signal:   delaySignal,
    stress_signal:  stressSignal,
    summary,
    source_news:    newsItems.map(n => n.headline),
    confidence:     newsItems.length > 0 ? 'medium' : 'low',
    model_version:  modelVersion,
    prompt_version: CITY_BRIEFING_PROMPT_VERSION,
  });
}

// ── National snapshot generation ──────────────────────────────────

/**
 * Check if there's a valid national snapshot within TTL.
 */
async function snapshotIsValid(
  supabase: ReturnType<typeof getSupabase>
): Promise<boolean> {
  const { data } = await supabase
    .from('national_snapshot')
    .select('valid_until')
    .order('generated_at', { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return false;
  const validUntil = new Date(data[0].valid_until);
  return validUntil > new Date();
}

/**
 * Fetch recent national-level news events (no specific state/city).
 */
async function fetchNationalNews(
  supabase: ReturnType<typeof getSupabase>
): Promise<NewsEventRow[]> {
  const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

  const { data } = await supabase
    .from('news_events')
    .select('headline, source_urls, published_at, signal_type, is_confirmed, state, city')
    .gte('created_at', twoDaysAgo)
    .neq('signal_type', 'unrelated')
    .order('published_at', { ascending: false })
    .limit(MAX_NEWS_PER_BRIEFING * 2);

  return (data ?? []) as NewsEventRow[];
}

export async function generateNationalSnapshot(
  supabase: ReturnType<typeof getSupabase>,
  gemini: GoogleGenAI,
  signals: CitySignalRow[]
): Promise<void> {
  if (await snapshotIsValid(supabase)) {
    console.log('[briefing] National snapshot still valid, skipping');
    return;
  }

  const highSignalCities = signals
    .filter(s => toDelaySignal(s.wait_days) === 'High Delay Signal')
    .map(s => s.city)
    .slice(0, 10);

  const elevatedCities = signals
    .filter(s => {
      const stress = toStressSignal(s.shortage_pct);
      return stress === 'High' || stress === 'Elevated';
    })
    .map(s => s.city)
    .slice(0, 10);

  // Build key states from state_summary
  const { data: stateSummary } = await supabase
    .from('state_summary')
    .select('state_name, avg_wait_days, shortage_pct')
    .order('avg_wait_days', { ascending: false })
    .limit(8);

  const keyStates = (stateSummary ?? []).map((s: { state_name: string; avg_wait_days: number; shortage_pct: number }) => ({
    state:         s.state_name,
    delay_signal:  toDelaySignal(Number(s.avg_wait_days)),
    stress_signal: toStressSignal(Number(s.shortage_pct)),
  }));

  const newsItems = await fetchNationalNews(supabase);
  const generatedAt = new Date().toISOString();

  const input: NationalSnapshotInput = {
    cities_covered:     signals.length,
    high_signal_cities: highSignalCities,
    elevated_cities:    elevatedCities,
    key_states:         keyStates,
    news_items:         newsItems.map(n => ({
      title:        n.headline,
      source:       Array.isArray(n.source_urls) ? n.source_urls[0] : 'unknown',
      published_at: n.published_at,
      signal_type:  n.signal_type,
      is_confirmed: n.is_confirmed,
    })),
    generated_at: generatedAt,
  };

  const prompt  = buildNationalSnapshotPrompt(input);
  const llmText = await callLLM(gemini, prompt);

  let headlineSummary: string;
  let situationDetail: string;
  let modelVersion: string;

  if (llmText) {
    // Parse JSON response
    let parsed: NationalSnapshotOutput | null = null;
    try {
      const jsonStr = llmText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const obj = JSON.parse(jsonStr) as Record<string, unknown>;
      if (typeof obj.headline_summary === 'string' && typeof obj.situation_detail === 'string') {
        parsed = {
          headline_summary: obj.headline_summary,
          situation_detail: obj.situation_detail,
        };
      }
    } catch {
      console.warn('[briefing] National snapshot: LLM returned non-JSON, using raw as detail');
    }

    if (parsed) {
      const bannedInHeadline = checkBannedPhrases(parsed.headline_summary);
      const bannedInDetail   = checkBannedPhrases(parsed.situation_detail);

      if (bannedInHeadline.length > 0 || bannedInDetail.length > 0) {
        console.warn('[briefing] National snapshot: banned phrases detected, using fallback');
        headlineSummary = 'LPG supply monitoring active across India.';
        situationDetail = SNAPSHOT_FALLBACK_SUMMARY;
        modelVersion = 'fallback/banned';
      } else {
        headlineSummary = parsed.headline_summary.slice(0, 300);
        situationDetail = parsed.situation_detail.slice(0, 1000);
        modelVersion    = LLM_MODEL;
      }
    } else {
      // LLM returned text but not valid JSON — use raw as detail
      const bannedFound = checkBannedPhrases(llmText);
      headlineSummary = 'LPG supply signals present across monitored cities.';
      situationDetail = bannedFound.length > 0 ? SNAPSHOT_FALLBACK_SUMMARY : llmText.slice(0, 500);
      modelVersion    = bannedFound.length > 0 ? 'fallback/banned' : LLM_MODEL;
    }
  } else {
    headlineSummary = 'LPG supply monitoring active across India.';
    situationDetail = SNAPSHOT_FALLBACK_SUMMARY;
    modelVersion    = 'fallback/llm_error';
  }

  const validUntil = new Date(Date.now() + NATIONAL_SNAPSHOT_TTL_HOURS * 3600 * 1000);

  await supabase.from('national_snapshot').insert({
    generated_at:     generatedAt,
    valid_until:      validUntil.toISOString(),
    cities_covered:   signals.length,
    headline_summary: headlineSummary,
    situation_detail: situationDetail,
    key_states:       keyStates.map(s => s.state),
    confidence:       newsItems.length > 0 ? 'medium' : 'low',
    source_news:      newsItems.map(n => n.headline),
    model_version:    modelVersion,
    prompt_version:   NATIONAL_SNAPSHOT_PROMPT_VERSION,
  });

  console.log('[briefing] National snapshot generated');
}

// ── Main entry point ──────────────────────────────────────────────

export async function runBriefingPipeline(
  systemStatus: string = 'healthy'
): Promise<void> {
  const startedAt = new Date();
  console.log('[briefing] Starting briefing generation...');

  // Safety gate: skip LLM if data is degraded
  if (systemStatus === 'degraded' || systemStatus === 'corrupted') {
    console.warn(`[briefing] Skipping briefing generation — system status: ${systemStatus}`);
    await writeJobRun('briefing', startedAt, 'skipped', { reason: `system_status_${systemStatus}` });
    return;
  }

  let jobStatus: JobStatus = 'success';
  let jobError: string | undefined;
  let citiesGenerated = 0;

  try {
    const supabase = getSupabase();
    const gemini   = getGemini();

    const signals = await fetchCitySignals(supabase);

    if (signals.length === 0) {
      console.warn('[briefing] No city signals found, skipping');
      await writeJobRun('briefing', startedAt, 'skipped', { reason: 'no_city_signals' });
      return;
    }

    // Check overall data freshness before generating briefings
    const latestUpdated = signals
      .map(s => new Date(s.last_updated).getTime())
      .sort((a, b) => b - a)[0];

    const lagHours = (Date.now() - latestUpdated) / 3600000;
    if (lagHours > FRESHNESS_DEGRADED_HOURS) {
      console.warn(`[briefing] Data too stale (${lagHours.toFixed(1)}h), writing fallback national snapshot only`);
      await supabase.from('national_snapshot').insert({
        generated_at:     new Date().toISOString(),
        valid_until:      new Date(Date.now() + NATIONAL_SNAPSHOT_TTL_HOURS * 3600 * 1000).toISOString(),
        cities_covered:   signals.length,
        headline_summary: 'LPG supply monitoring active. Signal data is being refreshed.',
        situation_detail: SNAPSHOT_FALLBACK_SUMMARY,
        key_states:       [],
        confidence:       'low',
        source_news:      [],
        model_version:    'fallback/stale_data',
        prompt_version:   NATIONAL_SNAPSHOT_PROMPT_VERSION,
      });
      await writeJobRun('briefing', startedAt, 'skipped', { reason: 'stale_data', lag_hours: lagHours });
      return;
    }

    // Generate national snapshot first
    await generateNationalSnapshot(supabase, gemini, signals);

    // Generate city briefings — prioritise high-signal cities
    const prioritised = [...signals].sort((a, b) => b.wait_days - a.wait_days);

    for (const signal of prioritised) {
      try {
        await generateCityBriefing(supabase, gemini, signal);
        citiesGenerated++;
      } catch (err) {
        console.error(`[briefing] Failed for ${signal.city}:`, err);
      }
    }

    console.log(`[briefing] Generated briefings for ${citiesGenerated} cities`);
  } catch (err) {
    const msg = String(err);
    console.error('[briefing] Briefing pipeline failed:', msg);
    jobStatus = 'fail';
    jobError  = msg;
  }

  await writeJobRun('briefing', startedAt, jobStatus, { cities_generated: citiesGenerated }, jobError);
}
