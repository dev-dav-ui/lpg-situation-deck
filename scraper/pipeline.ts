/**
 * scraper/pipeline.ts
 *
 * Phase 1 AI Signal Layer — pipeline runner.
 *
 * Runs after the main scraper (index.ts) has already populated city_data,
 * state_summary, and news_impact. This script orchestrates:
 *
 *   1. Signal Integrity Agent (deterministic)
 *   2. News Event Processor (deterministic + LLM classification)
 *   3. City Briefing Agent + National Snapshot (LLM prose, gated on freshness)
 *
 * Called from GitHub Actions as a separate job that depends on the scrape job.
 * Can also be run manually: npx tsx scraper/pipeline.ts
 *
 * Safety: if any stage fails, later stages are skipped rather than generating
 * misleading output from partial/corrupted data.
 */

import { runIntegrityPipeline } from './integrity';
import { runEventsPipeline } from './events';
import { runBriefingPipeline } from './briefing';

async function main() {
  console.log('=== LPG Signal Layer Pipeline ===');
  console.log(`Started: ${new Date().toISOString()}\n`);

  // ── Stage 1: Signal Integrity ──────────────────────────────────
  console.log('[pipeline] Stage 1/3: Signal Integrity');
  let systemStatus: string;
  try {
    const integrityReport = await runIntegrityPipeline();
    systemStatus = integrityReport.status;
    console.log(`[pipeline] Integrity complete — status: ${systemStatus}\n`);
  } catch (err) {
    console.error('[pipeline] Integrity stage crashed:', err);
    systemStatus = 'degraded';
  }

  // ── Stage 2: News Event Processing ────────────────────────────
  console.log('[pipeline] Stage 2/3: News Event Processing');
  try {
    await runEventsPipeline();
    console.log('[pipeline] Events stage complete\n');
  } catch (err) {
    // Non-fatal — briefing can still run with whatever events exist
    console.error('[pipeline] Events stage failed (non-fatal):', err);
  }

  // ── Stage 3: Briefing Generation ──────────────────────────────
  // Only runs if system is healthy or stale (not degraded/corrupted)
  console.log('[pipeline] Stage 3/3: Briefing Generation');
  try {
    await runBriefingPipeline(systemStatus);
    console.log('[pipeline] Briefing stage complete\n');
  } catch (err) {
    console.error('[pipeline] Briefing stage failed:', err);
  }

  console.log(`=== Pipeline complete: ${new Date().toISOString()} ===`);
}

main().catch(err => {
  console.error('[pipeline] Fatal error:', err);
  process.exit(1);
});
