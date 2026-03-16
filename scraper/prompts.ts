/**
 * scraper/prompts.ts
 *
 * Closed-world prompt templates for the Phase 1 AI Signal Layer.
 *
 * Rules enforced in every prompt:
 *  - Only use the context provided. Never invent data.
 *  - Never claim "confirmed shortage" unless context explicitly states it.
 *  - Never emit specific wait-day counts unless they appear in the provided data.
 *  - Output must be concise prose only — no bullet lists, no markdown.
 *  - If no news context is available, say so explicitly.
 */

import {
  CITY_BRIEFING_PROMPT_VERSION,
  NATIONAL_SNAPSHOT_PROMPT_VERSION,
  NEWS_CLASSIFIER_PROMPT_VERSION,
  SIGNAL_TYPES,
  SIGNAL_STRENGTH_LEVELS,
  NEWS_BODY_MAX_CHARS,
  type SignalType,
  type SignalStrength,
} from './config';

// ── Helpers ────────────────────────────────────────────────────────

/** Strip HTML tags and trim length before sending to LLM. */
export function sanitizeNewsText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')       // strip HTML
    .replace(/&[a-z]+;/gi, ' ')     // decode common entities
    .replace(/\s{2,}/g, ' ')        // collapse whitespace
    .trim()
    .slice(0, NEWS_BODY_MAX_CHARS);
}

/** Very lightweight heuristic: reject text that looks like prompt injection. */
export function looksLikeInjection(text: string): boolean {
  const lower = text.toLowerCase();
  const injectionPatterns = [
    'ignore previous',
    'ignore all previous',
    'disregard instructions',
    'new instructions:',
    'system:',
    '---\nsystem',
    'act as',
    'you are now',
    'forget everything',
    'override instructions',
  ];
  return injectionPatterns.some(p => lower.includes(p));
}

// ── News Event Classifier Prompt ───────────────────────────────────

export interface NewsClassifierInput {
  title: string;
  body: string | null;
  source: string;
}

export interface NewsClassifierOutput {
  summary: string;       // 1–2 sentence concise summary
  signal_type: SignalType;
  signal_strength: SignalStrength;
  tags: string[];        // up to 5 lowercase tags
  country: string;       // 'India' or ISO country name
  state: string | null;  // Indian state if identifiable, else null
  city: string | null;   // Indian city if identifiable, else null
  is_confirmed: boolean; // only true if article explicitly confirms shortage/event
}

export function buildNewsClassifierPrompt(input: NewsClassifierInput): string {
  const safeBody = input.body ? sanitizeNewsText(input.body) : '(no body available)';
  const safeTitle = sanitizeNewsText(input.title);

  return `You are a news classifier for an LPG supply monitoring system. Your only job is to classify news articles about LPG and energy supply in India.

CONTEXT:
Title: ${safeTitle}
Source: ${input.source}
Body: ${safeBody}

TASK:
Classify this article and return a JSON object with exactly these fields:
- summary: 1-2 sentence factual summary using only information in the article. Never invent facts.
- signal_type: one of ${SIGNAL_TYPES.map(s => `"${s}"`).join(', ')}
- signal_strength: one of ${SIGNAL_STRENGTH_LEVELS.map(s => `"${s}"`).join(', ')}
- tags: array of up to 5 lowercase keyword tags relevant to LPG supply monitoring
- country: country name (usually "India")
- state: Indian state name if the article mentions a specific state, otherwise null
- city: Indian city name if the article mentions a specific city, otherwise null
- is_confirmed: true ONLY if the article explicitly states a confirmed shortage or confirmed supply disruption. Default to false.

RULES:
1. Only use information present in the article. Do not infer or guess.
2. Never set is_confirmed to true unless the article explicitly uses words like "confirmed", "official", "announced".
3. Keep summary factual and brief. Do not add interpretation.
4. Return valid JSON only. No markdown, no explanation outside the JSON.

Prompt version: ${NEWS_CLASSIFIER_PROMPT_VERSION}`;
}

// ── City Briefing Prompt ───────────────────────────────────────────

export interface CityBriefingInput {
  city: string;
  state: string;
  delay_signal: string;     // categorical: "High Delay Signal" | "Moderate" | "Mild" | "Stable"
  stress_signal: string;    // categorical: "High" | "Elevated" | "Moderate" | "Low"
  last_updated: string;     // ISO timestamp of last data point
  news_items: Array<{
    title: string;
    source: string;
    published_at: string | null;
    signal_type: string;
    is_confirmed: boolean;
  }>;
}

export interface CityBriefingOutput {
  summary: string;  // 2–3 sentence prose briefing
}

export function buildCityBriefingPrompt(input: CityBriefingInput): string {
  const newsSection = input.news_items.length > 0
    ? input.news_items.map((n, i) =>
        `[${i + 1}] "${n.title}" (${n.source}, ${n.published_at ?? 'date unknown'}, signal: ${n.signal_type}, confirmed: ${n.is_confirmed})`
      ).join('\n')
    : '(no recent verified news available for this city or state)';

  return `You are generating a supply signal briefing for a public monitoring dashboard.

CITY DATA:
City: ${input.city}
State: ${input.state}
Delay signal: ${input.delay_signal}
Supply stress signal: ${input.stress_signal}
Data last updated: ${input.last_updated}

RECENT NEWS CONTEXT:
${newsSection}

TASK:
Write a 2–3 sentence factual briefing about the LPG supply situation in ${input.city}.

RULES:
1. Only use the data and news items provided above. Do not add facts that are not present.
2. Do not claim "confirmed shortage" unless a news item explicitly has is_confirmed: true.
3. If no news context is available, say that signals are present but no verified news context is available for this area.
4. Do not use specific wait-day numbers unless they appear in the context provided.
5. Use plain prose only. No bullet points, no markdown, no headers.
6. Keep the tone factual and measured. Avoid alarmist language.
7. Do not make predictions about future supply.
8. End with the data timestamp context so readers know when signals were last verified.

Return only the briefing text. No JSON, no preamble.

Prompt version: ${CITY_BRIEFING_PROMPT_VERSION}`;
}

// ── National Snapshot Prompt ───────────────────────────────────────

export interface NationalSnapshotInput {
  cities_covered: number;
  high_signal_cities: string[];    // cities with delay_signal = "High Delay Signal"
  elevated_cities: string[];       // moderate/elevated stress
  key_states: Array<{
    state: string;
    delay_signal: string;
    stress_signal: string;
  }>;
  news_items: Array<{
    title: string;
    source: string;
    published_at: string | null;
    signal_type: string;
    is_confirmed: boolean;
  }>;
  generated_at: string;
}

export interface NationalSnapshotOutput {
  headline_summary: string;   // 1 sentence
  situation_detail: string;   // 2–3 sentence prose
}

export function buildNationalSnapshotPrompt(input: NationalSnapshotInput): string {
  const highCitiesList = input.high_signal_cities.length > 0
    ? input.high_signal_cities.join(', ')
    : 'none flagged';

  const elevatedList = input.elevated_cities.length > 0
    ? input.elevated_cities.join(', ')
    : 'none flagged';

  const statesList = input.key_states.length > 0
    ? input.key_states.map(s => `${s.state} (delay: ${s.delay_signal}, stress: ${s.stress_signal})`).join('; ')
    : 'no state-level data available';

  const newsSection = input.news_items.length > 0
    ? input.news_items.map((n, i) =>
        `[${i + 1}] "${n.title}" (${n.source}, ${n.published_at ?? 'date unknown'}, signal: ${n.signal_type}, confirmed: ${n.is_confirmed})`
      ).join('\n')
    : '(no recent verified national news available)';

  return `You are generating a national LPG supply situation snapshot for a public monitoring dashboard.

NATIONAL SIGNAL DATA:
Cities covered: ${input.cities_covered}
High delay signal cities: ${highCitiesList}
Elevated stress cities: ${elevatedList}
Key states: ${statesList}
Snapshot generated at: ${input.generated_at}

RECENT NEWS CONTEXT:
${newsSection}

TASK:
Write a national situation snapshot with two fields:
1. headline_summary: A single factual sentence summarising the national LPG supply signal level.
2. situation_detail: 2–3 sentences of factual detail about which regions show elevated signals and any verified news context.

RULES:
1. Only use data provided above. Do not invent cities, states, or facts.
2. Do not claim "confirmed shortage" unless a news item explicitly has is_confirmed: true.
3. If no news context is available, note that signals are present but no verified news context is available.
4. Use plain prose only — no bullet points, no markdown, no numbered lists.
5. Keep tone factual and measured. Avoid alarmist language or predictions.
6. Do not include specific wait-day numbers unless present in context.

Return a JSON object with exactly two string fields: "headline_summary" and "situation_detail".
No other text outside the JSON.

Prompt version: ${NATIONAL_SNAPSHOT_PROMPT_VERSION}`;
}
