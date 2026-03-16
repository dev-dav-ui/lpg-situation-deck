-- ══════════════════════════════════════════════════════════════════
-- LPG SITUATION DECK — Phase 1 AI Signal Layer Schema
-- Run this in Supabase SQL Editor AFTER schema.sql
-- These tables are additive — they do NOT modify existing tables.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. System health snapshots ───────────────────────────────────
-- Written by the Signal Integrity Agent after each scraper run.
-- Tracks overall pipeline health — not exposed to frontend directly.
CREATE TABLE IF NOT EXISTS system_health (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  checked_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status              TEXT NOT NULL DEFAULT 'healthy'
                        CHECK (status IN ('healthy', 'stale', 'degraded', 'corrupted')),
  freshness_ok        BOOLEAN NOT NULL DEFAULT FALSE,
  cities_present      INTEGER NOT NULL DEFAULT 0,
  cities_missing      TEXT[] NOT NULL DEFAULT '{}',
  duplicate_headlines INTEGER NOT NULL DEFAULT 0,
  anomaly_flags       JSONB NOT NULL DEFAULT '{}',
  scraper_lag_hours   NUMERIC(6, 1) NOT NULL DEFAULT 0,
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_system_health_checked_at ON system_health(checked_at DESC);

-- ── 2. Job run log ───────────────────────────────────────────────
-- Written by each pipeline stage (scraper, integrity, events, briefing).
-- Enables per-job debugging and audit trail.
CREATE TABLE IF NOT EXISTS job_runs (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name      TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL,
  finished_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status        TEXT NOT NULL DEFAULT 'success'
                  CHECK (status IN ('success', 'fail', 'skipped')),
  duration_ms   INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  meta          JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_job_runs_job_name ON job_runs(job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_started_at ON job_runs(started_at DESC);

-- ── 3. Source health ─────────────────────────────────────────────
-- Tracks per-source scrape health (RSS feeds, IOCL, GoodReturns).
-- One row per source, upserted on each run.
CREATE TABLE IF NOT EXISTS source_health (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_name           TEXT NOT NULL UNIQUE,
  last_successful_scrape TIMESTAMPTZ,
  status                TEXT NOT NULL DEFAULT 'healthy'
                          CHECK (status IN ('healthy', 'stale', 'failed')),
  notes                 TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Raw news items ────────────────────────────────────────────
-- Stores every RSS item that passes the LPG keyword filter,
-- before LLM classification. Deduplication via dedup_key.
CREATE TABLE IF NOT EXISTS news_raw (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source       TEXT NOT NULL,
  url          TEXT,
  title        TEXT NOT NULL,
  body         TEXT,
  published_at TIMESTAMPTZ,
  ingested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dedup_key    TEXT NOT NULL UNIQUE,
  source_tier  INTEGER NOT NULL DEFAULT 3 CHECK (source_tier IN (1, 2, 3))
);

CREATE INDEX IF NOT EXISTS idx_news_raw_ingested_at ON news_raw(ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_raw_source_tier ON news_raw(source_tier, ingested_at DESC);

-- ── 5. Classified news events ────────────────────────────────────
-- LLM-classified news events, written after classifier validates output.
-- Frontend may query this for signal-level news context.
CREATE TABLE IF NOT EXISTS news_events (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  raw_id          UUID REFERENCES news_raw(id) ON DELETE SET NULL,
  headline        TEXT NOT NULL,
  summary         TEXT NOT NULL,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  country         TEXT NOT NULL DEFAULT 'India',
  state           TEXT,
  city            TEXT,
  signal_type     TEXT NOT NULL DEFAULT 'unrelated'
                    CHECK (signal_type IN (
                      'supply_disruption', 'price_change', 'import_news',
                      'government_policy', 'infrastructure', 'demand_spike',
                      'restoration', 'unrelated'
                    )),
  signal_strength TEXT NOT NULL DEFAULT 'none'
                    CHECK (signal_strength IN ('high', 'moderate', 'low', 'none')),
  is_confirmed    BOOLEAN NOT NULL DEFAULT FALSE,
  source_urls     TEXT[] NOT NULL DEFAULT '{}',
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_events_created_at ON news_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_events_signal_type ON news_events(signal_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_events_state_city ON news_events(state, city, created_at DESC);

-- ── 6. City briefings ────────────────────────────────────────────
-- LLM-generated prose briefings per city.
-- Frontend reads stored summaries only — never calls LLM directly.
CREATE TABLE IF NOT EXISTS city_briefings (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  city            TEXT NOT NULL,
  state           TEXT NOT NULL,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until     TIMESTAMPTZ NOT NULL,
  delay_signal    TEXT NOT NULL,
  stress_signal   TEXT NOT NULL,
  summary         TEXT NOT NULL,
  source_news     TEXT[] NOT NULL DEFAULT '{}',
  confidence      TEXT NOT NULL DEFAULT 'low'
                    CHECK (confidence IN ('high', 'medium', 'low')),
  model_version   TEXT NOT NULL,
  prompt_version  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_city_briefings_city ON city_briefings(city, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_city_briefings_valid_until ON city_briefings(valid_until DESC);

-- ── 7. National snapshot ─────────────────────────────────────────
-- LLM-generated national situation summary.
-- One record per generation cycle; old records retained for history.
CREATE TABLE IF NOT EXISTS national_snapshot (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until      TIMESTAMPTZ NOT NULL,
  cities_covered   INTEGER NOT NULL DEFAULT 0,
  headline_summary TEXT NOT NULL,
  situation_detail TEXT NOT NULL,
  key_states       TEXT[] NOT NULL DEFAULT '{}',
  confidence       TEXT NOT NULL DEFAULT 'low'
                     CHECK (confidence IN ('high', 'medium', 'low')),
  source_news      TEXT[] NOT NULL DEFAULT '{}',
  model_version    TEXT NOT NULL,
  prompt_version   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_national_snapshot_generated_at ON national_snapshot(generated_at DESC);

-- ── 8. Prompt versions ───────────────────────────────────────────
-- Stores prompt templates at a point in time for auditability.
CREATE TABLE IF NOT EXISTS prompt_versions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt_name TEXT NOT NULL,
  version     TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prompt_name, version)
);

-- ── Row Level Security ────────────────────────────────────────────
-- New tables follow the same pattern as existing schema:
--   - anon users get read access (frontend queries these)
--   - writes are service-role only (bypasses RLS)

ALTER TABLE system_health   ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_health   ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_raw        ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE city_briefings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE national_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;

-- Read-only for anon (frontend reads summaries)
CREATE POLICY "Public read system_health"    ON system_health    FOR SELECT USING (true);
CREATE POLICY "Public read job_runs"         ON job_runs         FOR SELECT USING (true);
CREATE POLICY "Public read source_health"    ON source_health    FOR SELECT USING (true);
CREATE POLICY "Public read news_raw"         ON news_raw         FOR SELECT USING (true);
CREATE POLICY "Public read news_events"      ON news_events      FOR SELECT USING (true);
CREATE POLICY "Public read city_briefings"   ON city_briefings   FOR SELECT USING (true);
CREATE POLICY "Public read national_snapshot" ON national_snapshot FOR SELECT USING (true);
CREATE POLICY "Public read prompt_versions"  ON prompt_versions  FOR SELECT USING (true);
-- Service role bypasses RLS for all writes — no explicit policy needed.
