/**
 * scraper/config.ts
 *
 * Centralised thresholds, source credibility tiers, and safety rules
 * for the Phase 1 AI Signal Layer.
 *
 * All values here drive deterministic checks — NOT LLM prompts.
 * Keep this file free of imports so it can be safely required anywhere.
 */

// ── Price validation bounds ────────────────────────────────────────

export const PRICE_BOUNDS = {
  domestic:   { min: 600,  max: 1200 },
  commercial: { min: 1200, max: 2500 },
} as const;

// Fraction of previous price that counts as an anomalous spike/drop
export const PRICE_SPIKE_THRESHOLD  = 0.20; // 20%
// Fraction of previous wait_days that counts as anomalous
export const WAIT_SPIKE_THRESHOLD   = 2.00; // 200%

// Maximum wait_days value we'll ever trust — anything above is clamped/flagged
export const WAIT_DAYS_MAX          = 60;

// ── Freshness thresholds ───────────────────────────────────────────

// If latest city_data row is older than this, we flag data as stale
export const FRESHNESS_STALE_HOURS  = 8;   // hours
// If older than this, we flag as degraded and skip LLM briefings
export const FRESHNESS_DEGRADED_HOURS = 26; // hours

// ── Signal integrity checks ────────────────────────────────────────

// Minimum distinct cities we expect in a healthy scrape run
export const MIN_EXPECTED_CITIES    = 15;

// Minimum fraction of expected cities actually present to be considered healthy
export const CITY_COVERAGE_THRESHOLD = 0.6; // 60%

// Number of hours after a scraper job finishes that counts as "on schedule"
export const SCRAPER_LAG_WARN_HOURS = 7;
export const SCRAPER_LAG_FAIL_HOURS = 14;

// ── Source credibility tiers ───────────────────────────────────────
//
// Tier 1 — Official / government / major oil marketing companies
// Tier 2 — Major national trusted media
// Tier 3 — Local / community / weaker corroboration
//
// These tiers are used by the news event processor to weight signals.
// They are stored alongside news_events rows so the briefing agent
// can optionally filter to higher-confidence sources.

export const SOURCE_TIERS: Record<string, 1 | 2 | 3> = {
  // Tier 1 — Official sources
  'PPAC':             1,
  'IOCL':             1,
  'IndianOil':        1,
  'BPCL':             1,
  'HPCL':             1,
  'Ministry of Petroleum': 1,
  'Petroleum Ministry': 1,
  'PIB':              1,

  // Tier 2 — Major national media
  'Economic Times':   2,
  'Livemint':         2,
  'Business Standard': 2,
  'Mint':             2,
  'Hindu BusinessLine': 2,
  'NDTV':             2,
  'India Today':      2,
  'Reuters':          2,
  'Bloomberg':        2,
  'Press Trust of India': 2,
  'PTI':              2,
  'ANI':              2,

  // Tier 3 — Local / community / aggregators (default if unknown)
  'default':          3,
} as const;

export type SourceTier = 1 | 2 | 3;

export function getSourceTier(sourceName: string): SourceTier {
  return SOURCE_TIERS[sourceName] ?? SOURCE_TIERS['default'];
}

// ── Banned phrases for LLM output filtering ────────────────────────
//
// If any of these appear in LLM-generated text, the output is rejected
// and a safe fallback summary is written instead.
//
// Checked case-insensitively. Entries may include regexes as strings
// (used with RegExp constructor).

export const BANNED_PHRASES_LITERAL: string[] = [
  'confirmed shortage',
  'confirmed supply shortage',
  'confirmed lpg shortage',
  'guaranteed',
  'definitely out',
  'out of gas',
  'out of lpg',
  'no gas available',
  'zero stock',
  'completely out',
  'stock depleted',
  'supply exhausted',
  'exhausted supply',
  'imminent shortage',
  'shortage is imminent',
  'crisis is confirmed',
  'officially confirmed',
  'government confirmed',
];

// Regex patterns — matched against LLM output with new RegExp(pattern, 'i')
export const BANNED_PHRASES_REGEX: string[] = [
  // Any claim of specific wait-day numbers not grounded in passed context
  // (guarded via prompt design, but belt-and-suspenders here)
  '\\d+\\s*(?:days?|weeks?)\\s+(?:wait|delay|shortage)',
  // Absolute guarantee language
  'will (?:definitely|certainly|absolutely) (?:face|have|experience)',
];

// Safe fallback to write when LLM output is rejected
export const BRIEFING_FALLBACK_SUMMARY =
  'Signals present for this area. No verified news context available at this time.';

export const SNAPSHOT_FALLBACK_SUMMARY =
  'Supply signals are being monitored across India. No verified national context available at this time.';

// ── Prompt versioning ─────────────────────────────────────────────

export const CITY_BRIEFING_PROMPT_VERSION   = 'v1.0';
export const NATIONAL_SNAPSHOT_PROMPT_VERSION = 'v1.0';
export const NEWS_CLASSIFIER_PROMPT_VERSION = 'v1.0';

// ── LLM model config ──────────────────────────────────────────────

export const LLM_MODEL            = 'claude-haiku-4-5-20251001';
export const LLM_MAX_TOKENS       = 400;
export const LLM_TEMPERATURE      = 0;   // deterministic output
export const NEWS_BODY_MAX_CHARS  = 2000; // max chars of news body sent to LLM
export const MAX_NEWS_PER_BRIEFING = 5;   // max news items passed per city briefing

// ── Briefing TTL ──────────────────────────────────────────────────

// Briefings are considered valid for this many hours
export const CITY_BRIEFING_TTL_HOURS     = 8;
export const NATIONAL_SNAPSHOT_TTL_HOURS = 6;

// ── Signal type vocabulary ────────────────────────────────────────
// Closed vocabulary for LLM classification — prevents free-form hallucination

export const SIGNAL_TYPES = [
  'supply_disruption',
  'price_change',
  'import_news',
  'government_policy',
  'infrastructure',
  'demand_spike',
  'restoration',
  'unrelated',
] as const;

export type SignalType = typeof SIGNAL_TYPES[number];

export const SIGNAL_STRENGTH_LEVELS = ['high', 'moderate', 'low', 'none'] as const;
export type SignalStrength = typeof SIGNAL_STRENGTH_LEVELS[number];
