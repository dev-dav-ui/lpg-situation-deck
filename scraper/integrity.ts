/**
 * scraper/integrity.ts
 *
 * Signal Integrity Agent — Phase 1, deterministic only.
 *
 * Checks:
 *  - scraper freshness (how stale is the latest data?)
 *  - city coverage (are expected cities present?)
 *  - duplicate headlines in news_impact
 *  - anomaly flags from the last scraper run
 *  - source health per RSS feed
 *  - overall ingestion health
 *
 * Writes to:
 *  - system_health
 *  - job_runs
 *  - source_health
 *
 * This module is called from the main pipeline after scraping completes.
 * It never calls an LLM — all logic is rule-based.
 */

import { createClient } from '@supabase/supabase-js';
import {
  FRESHNESS_STALE_HOURS,
  FRESHNESS_DEGRADED_HOURS,
  MIN_EXPECTED_CITIES,
  CITY_COVERAGE_THRESHOLD,
  SCRAPER_LAG_WARN_HOURS,
  SCRAPER_LAG_FAIL_HOURS,
} from './config';

// ── Supabase client (service role) ────────────────────────────────

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || ''
  );
}

// ── Types ─────────────────────────────────────────────────────────

export type HealthStatus = 'healthy' | 'stale' | 'degraded' | 'corrupted';

export interface IntegrityReport {
  status: HealthStatus;
  freshness_ok: boolean;
  scraper_lag_hours: number;
  cities_present: number;
  cities_missing: string[];
  duplicate_headlines: number;
  anomaly_flags: Record<string, unknown>;
  notes: string;
}

// Known cities we expect data for — subset of CITY_COORDS from the map
const EXPECTED_CITIES = [
  'Delhi', 'Mumbai', 'Bengaluru', 'Chennai', 'Kolkata',
  'Hyderabad', 'Ahmedabad', 'Pune', 'Jaipur', 'Lucknow',
  'Chandigarh', 'Kochi', 'Bhopal', 'Patna', 'Guwahati',
  'Bhubaneswar', 'Indore', 'Coimbatore', 'Nagpur', 'Visakhapatnam',
];

// ── Core integrity check ──────────────────────────────────────────

export async function runIntegrityCheck(): Promise<IntegrityReport> {
  const supabase = getSupabase();
  const notes: string[] = [];

  // ── 1. Scraper freshness ──────────────────────────────────────
  let scraperLagHours = 999;
  let freshnessOk = false;

  const { data: latestRun } = await supabase
    .from('scraper_runs')
    .select('completed_at, status, anomalies_flagged')
    .order('completed_at', { ascending: false })
    .limit(1);

  let anomalyFlags: Record<string, unknown> = {};

  if (latestRun && latestRun.length > 0) {
    const run = latestRun[0];
    if (run.completed_at) {
      scraperLagHours = (Date.now() - new Date(run.completed_at).getTime()) / 3600000;
    }
    if (run.anomalies_flagged > 0) {
      anomalyFlags['last_run_anomalies'] = run.anomalies_flagged;
    }
    if (run.status === 'failed') {
      anomalyFlags['last_run_status'] = 'failed';
      notes.push('Last scraper run reported failure');
    }
  } else {
    notes.push('No scraper_runs records found');
    anomalyFlags['no_run_history'] = true;
  }

  freshnessOk = scraperLagHours < FRESHNESS_STALE_HOURS;
  if (scraperLagHours >= SCRAPER_LAG_WARN_HOURS) {
    notes.push(`Scraper lag ${scraperLagHours.toFixed(1)}h (warn threshold ${SCRAPER_LAG_WARN_HOURS}h)`);
  }

  // ── 2. City coverage ──────────────────────────────────────────
  const { data: cityRows } = await supabase
    .from('city_data')
    .select('city')
    .neq('state', 'Unknown');

  const presentCities = new Set(cityRows?.map((r: { city: string }) => r.city) ?? []);
  const citiesMissing = EXPECTED_CITIES.filter(c => !presentCities.has(c));
  const citiesPresent = presentCities.size;

  const coverageRatio = citiesPresent / MIN_EXPECTED_CITIES;
  if (coverageRatio < CITY_COVERAGE_THRESHOLD) {
    notes.push(
      `City coverage low: ${citiesPresent} present, ${citiesMissing.length} expected cities missing`
    );
    anomalyFlags['low_city_coverage'] = { present: citiesPresent, missing: citiesMissing.length };
  }

  // ── 3. Duplicate headlines in news_impact (last 24h) ─────────
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentNews } = await supabase
    .from('news_impact')
    .select('headline')
    .gte('created_at', yesterday);

  let duplicateHeadlines = 0;
  if (recentNews) {
    const headlineSet = new Set<string>();
    for (const row of recentNews) {
      const key = row.headline.toLowerCase().trim();
      if (headlineSet.has(key)) duplicateHeadlines++;
      headlineSet.add(key);
    }
    if (duplicateHeadlines > 0) {
      notes.push(`${duplicateHeadlines} duplicate headlines in last 24h news_impact`);
      anomalyFlags['duplicate_headlines'] = duplicateHeadlines;
    }
  }

  // ── 4. Check for NaN/null prices in recent city_data ─────────
  const { data: suspectRows } = await supabase
    .from('city_data')
    .select('city, state, cylinder_type, price_per_cylinder, wait_days')
    .or('price_per_cylinder.is.null,wait_days.is.null');

  if (suspectRows && suspectRows.length > 0) {
    notes.push(`${suspectRows.length} rows with null price or wait_days`);
    anomalyFlags['null_value_rows'] = suspectRows.length;
  }

  // ── 5. Determine overall status ───────────────────────────────
  let status: HealthStatus;

  if (scraperLagHours >= FRESHNESS_DEGRADED_HOURS) {
    status = 'degraded';
    notes.push(`Data degraded: scraper lag ${scraperLagHours.toFixed(1)}h exceeds ${FRESHNESS_DEGRADED_HOURS}h`);
  } else if (
    !freshnessOk ||
    coverageRatio < CITY_COVERAGE_THRESHOLD ||
    Object.keys(anomalyFlags).length > 0
  ) {
    status = 'stale';
  } else {
    status = 'healthy';
  }

  const report: IntegrityReport = {
    status,
    freshness_ok: freshnessOk,
    scraper_lag_hours: Math.round(scraperLagHours * 10) / 10,
    cities_present: citiesPresent,
    cities_missing: citiesMissing,
    duplicate_headlines: duplicateHeadlines,
    anomaly_flags: anomalyFlags,
    notes: notes.join(' | ') || 'All checks passed',
  };

  return report;
}

// ── Write system_health record ────────────────────────────────────

export async function writeSystemHealth(report: IntegrityReport): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase.from('system_health').insert({
    checked_at:          new Date().toISOString(),
    status:              report.status,
    freshness_ok:        report.freshness_ok,
    cities_present:      report.cities_present,
    cities_missing:      report.cities_missing,
    duplicate_headlines: report.duplicate_headlines,
    anomaly_flags:       report.anomaly_flags,
    scraper_lag_hours:   report.scraper_lag_hours,
    notes:               report.notes,
  });

  if (error) {
    console.error('[integrity] Failed to write system_health:', error.message);
  }
}

// ── Write/update source_health records ───────────────────────────

const RSS_SOURCES = [
  { source_name: 'Economic Times RSS', url: 'https://economictimes.indiatimes.com' },
  { source_name: 'Livemint RSS',        url: 'https://livemint.com' },
  { source_name: 'GoodReturns',         url: 'https://goodreturns.in' },
  { source_name: 'IOCL',               url: 'https://iocl.com' },
];

export async function updateSourceHealth(
  sourceName: string,
  ok: boolean,
  notes?: string
): Promise<void> {
  const supabase = getSupabase();

  await supabase.from('source_health').upsert(
    {
      source_name:            sourceName,
      last_successful_scrape: ok ? new Date().toISOString() : undefined,
      status:                 ok ? 'healthy' : 'failed',
      notes:                  notes || null,
    },
    { onConflict: 'source_name', ignoreDuplicates: false }
  );
}

// ── Write job_runs record ─────────────────────────────────────────

export type JobStatus = 'success' | 'fail' | 'skipped';

export async function writeJobRun(
  jobName: string,
  startedAt: Date,
  status: JobStatus,
  meta: Record<string, unknown> = {},
  errorMessage?: string
): Promise<void> {
  const supabase = getSupabase();
  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  const { error } = await supabase.from('job_runs').insert({
    job_name:      jobName,
    started_at:    startedAt.toISOString(),
    finished_at:   finishedAt.toISOString(),
    status,
    duration_ms:   durationMs,
    error_message: errorMessage || null,
    meta,
  });

  if (error) {
    console.error(`[integrity] Failed to write job_run for ${jobName}:`, error.message);
  }
}

// ── Main entry point ──────────────────────────────────────────────

export async function runIntegrityPipeline(): Promise<IntegrityReport> {
  const startedAt = new Date();
  console.log('[integrity] Starting signal integrity check...');

  let report: IntegrityReport;
  let jobStatus: JobStatus = 'success';
  let jobError: string | undefined;

  try {
    report = await runIntegrityCheck();
    await writeSystemHealth(report);

    console.log(`[integrity] Status: ${report.status}`);
    console.log(`[integrity] Scraper lag: ${report.scraper_lag_hours}h`);
    console.log(`[integrity] Cities present: ${report.cities_present}`);
    if (report.cities_missing.length > 0) {
      console.log(`[integrity] Missing cities: ${report.cities_missing.join(', ')}`);
    }
    console.log(`[integrity] Notes: ${report.notes}`);

    if (report.status === 'degraded' || report.status === 'corrupted') {
      jobStatus = 'fail';
    }
  } catch (err) {
    const msg = String(err);
    console.error('[integrity] Integrity check failed:', msg);
    jobStatus = 'fail';
    jobError = msg;

    // Write a minimal degraded health record so we have a trace
    report = {
      status: 'degraded',
      freshness_ok: false,
      scraper_lag_hours: 999,
      cities_present: 0,
      cities_missing: [],
      duplicate_headlines: 0,
      anomaly_flags: { integrity_check_crashed: true },
      notes: `Integrity check crashed: ${msg}`,
    };
    await writeSystemHealth(report).catch(() => {});
  }

  await writeJobRun('integrity', startedAt, jobStatus, {
    health_status: report!.status,
    cities_present: report!.cities_present,
  }, jobError);

  return report!;
}
