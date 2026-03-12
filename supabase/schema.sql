-- ══════════════════════════════════════════════════════════════════
-- LPG SITUATION DECK — Supabase Schema
-- Run this in Supabase SQL Editor to set up all tables
-- ══════════════════════════════════════════════════════════════════

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE city_data;
ALTER PUBLICATION supabase_realtime ADD TABLE state_summary;
ALTER PUBLICATION supabase_realtime ADD TABLE news_impact;

-- ── City-level LPG data ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS city_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  cylinder_type TEXT NOT NULL CHECK (cylinder_type IN ('domestic', 'commercial')),
  wait_days INTEGER NOT NULL DEFAULT 0,
  price_per_cylinder NUMERIC(10, 2) NOT NULL DEFAULT 0,
  price_change NUMERIC(10, 2) NOT NULL DEFAULT 0,
  shortage_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'scraper' CHECK (source IN ('scraper', 'crowdsource', 'ppac')),
  UNIQUE (city, state, cylinder_type)
);

-- ── State-level aggregated summary ───────────────────────────────
CREATE TABLE IF NOT EXISTS state_summary (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  state_name TEXT NOT NULL UNIQUE,
  avg_wait_days NUMERIC(5, 1) NOT NULL DEFAULT 0,
  shortage_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  total_cities INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- ── News with impact scoring ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS news_impact (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  headline TEXT NOT NULL,
  impact_pct NUMERIC(5, 1) NOT NULL DEFAULT 0,
  source TEXT,
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Monthly PPAC usage data ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_trend (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month TEXT NOT NULL UNIQUE, -- 'Jan 2026', 'Feb 2026'
  domestic_mt NUMERIC(10, 1) NOT NULL DEFAULT 0, -- thousand metric tonnes
  commercial_mt NUMERIC(10, 1) NOT NULL DEFAULT 0
);

-- ── Crowdsourced shortage reports ────────────────────────────────
CREATE TABLE IF NOT EXISTS shortage_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  cylinder_type TEXT NOT NULL CHECK (cylinder_type IN ('domestic', 'commercial')),
  wait_days INTEGER NOT NULL,
  description TEXT,
  reporter_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  verified BOOLEAN DEFAULT FALSE
);

-- ── Scraper run log (for anomaly tracking) ───────────────────────
CREATE TABLE IF NOT EXISTS scraper_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed', 'anomaly')),
  cities_scraped INTEGER DEFAULT 0,
  anomalies_flagged INTEGER DEFAULT 0,
  error_message TEXT
);

-- ── Indexes ──────────────────────────────────────────────────────
CREATE INDEX idx_city_data_state ON city_data(state);
CREATE INDEX idx_city_data_type ON city_data(cylinder_type);
CREATE INDEX idx_city_data_shortage ON city_data(shortage_pct DESC);
CREATE INDEX idx_news_created ON news_impact(created_at DESC);
CREATE INDEX idx_reports_created ON shortage_reports(created_at DESC);
CREATE INDEX idx_reports_verified ON shortage_reports(verified);

-- ── Row Level Security ───────────────────────────────────────────
-- Public read access for all tables (dashboard is public)
ALTER TABLE city_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE state_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_impact ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_trend ENABLE ROW LEVEL SECURITY;
ALTER TABLE shortage_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_runs ENABLE ROW LEVEL SECURITY;

-- Read-only for anon users
CREATE POLICY "Public read city_data" ON city_data FOR SELECT USING (true);
CREATE POLICY "Public read state_summary" ON state_summary FOR SELECT USING (true);
CREATE POLICY "Public read news_impact" ON news_impact FOR SELECT USING (true);
CREATE POLICY "Public read usage_trend" ON usage_trend FOR SELECT USING (true);
CREATE POLICY "Public read shortage_reports" ON shortage_reports FOR SELECT USING (true);
CREATE POLICY "Public read scraper_runs" ON scraper_runs FOR SELECT USING (true);

-- Allow anon to INSERT shortage reports (crowdsource)
CREATE POLICY "Public insert shortage_reports" ON shortage_reports FOR INSERT WITH CHECK (true);

-- Service role can do everything (scraper uses service key)
-- No explicit policy needed — service role bypasses RLS

-- ── Seed data (top 30 cities) ────────────────────────────────────
INSERT INTO city_data (city, state, cylinder_type, wait_days, price_per_cylinder, price_change, shortage_pct, source) VALUES
  ('Mumbai', 'Maharashtra', 'commercial', 22, 1850, 180, 28, 'scraper'),
  ('Mumbai', 'Maharashtra', 'domestic', 8, 903, 50, 10, 'scraper'),
  ('Delhi', 'Delhi', 'commercial', 25, 1920, 220, 35, 'scraper'),
  ('Delhi', 'Delhi', 'domestic', 10, 903, 50, 15, 'scraper'),
  ('Bengaluru', 'Karnataka', 'commercial', 18, 1780, 150, 22, 'scraper'),
  ('Chennai', 'Tamil Nadu', 'commercial', 12, 1750, 100, 14, 'scraper'),
  ('Chennai', 'Tamil Nadu', 'domestic', 5, 903, 50, 6, 'scraper'),
  ('Kolkata', 'West Bengal', 'commercial', 15, 1800, 130, 18, 'scraper'),
  ('Hyderabad', 'Telangana', 'commercial', 16, 1790, 140, 20, 'scraper'),
  ('Ahmedabad', 'Gujarat', 'commercial', 20, 1830, 170, 25, 'scraper'),
  ('Pune', 'Maharashtra', 'commercial', 19, 1820, 160, 24, 'scraper'),
  ('Jaipur', 'Rajasthan', 'commercial', 17, 1800, 145, 21, 'scraper'),
  ('Lucknow', 'Uttar Pradesh', 'commercial', 21, 1860, 190, 27, 'scraper'),
  ('Chandigarh', 'Punjab', 'commercial', 13, 1770, 110, 16, 'scraper'),
  ('Kochi', 'Kerala', 'commercial', 9, 1740, 80, 10, 'scraper'),
  ('Bhopal', 'Madhya Pradesh', 'commercial', 14, 1780, 120, 17, 'scraper'),
  ('Patna', 'Bihar', 'commercial', 23, 1870, 200, 30, 'scraper'),
  ('Guwahati', 'Assam', 'commercial', 19, 1840, 165, 24, 'scraper'),
  ('Bhubaneswar', 'Odisha', 'commercial', 16, 1790, 135, 20, 'scraper'),
  ('Indore', 'Madhya Pradesh', 'commercial', 15, 1780, 125, 19, 'scraper'),
  ('Coimbatore', 'Tamil Nadu', 'commercial', 10, 1750, 90, 12, 'scraper'),
  ('Nagpur', 'Maharashtra', 'commercial', 17, 1810, 150, 22, 'scraper'),
  ('Visakhapatnam', 'Andhra Pradesh', 'commercial', 14, 1770, 115, 17, 'scraper'),
  ('Surat', 'Gujarat', 'commercial', 18, 1820, 155, 23, 'scraper'),
  ('Raipur', 'Chhattisgarh', 'commercial', 16, 1790, 140, 20, 'scraper'),
  ('Dehradun', 'Uttarakhand', 'commercial', 12, 1760, 100, 14, 'scraper'),
  ('Ranchi', 'Jharkhand', 'commercial', 20, 1840, 175, 26, 'scraper'),
  ('Thiruvananthapuram', 'Kerala', 'commercial', 8, 1730, 70, 9, 'scraper'),
  ('Goa', 'Goa', 'commercial', 7, 1720, 60, 8, 'scraper'),
  ('Shimla', 'Himachal Pradesh', 'commercial', 11, 1760, 95, 13, 'scraper')
ON CONFLICT (city, state, cylinder_type) DO NOTHING;

-- Seed state summary
INSERT INTO state_summary (state_name, avg_wait_days, shortage_pct, total_cities) VALUES
  ('Maharashtra', 19, 25, 3),
  ('Delhi', 18, 35, 1),
  ('Karnataka', 14, 22, 1),
  ('Tamil Nadu', 9, 12, 2),
  ('West Bengal', 11, 18, 1),
  ('Telangana', 16, 20, 1),
  ('Gujarat', 19, 24, 2),
  ('Rajasthan', 17, 21, 1),
  ('Uttar Pradesh', 21, 27, 1),
  ('Punjab', 13, 16, 1),
  ('Kerala', 8, 9, 2),
  ('Madhya Pradesh', 15, 18, 2),
  ('Bihar', 23, 30, 1),
  ('Assam', 19, 24, 1),
  ('Odisha', 16, 20, 1),
  ('Andhra Pradesh', 14, 17, 1),
  ('Chhattisgarh', 16, 20, 1),
  ('Uttarakhand', 12, 14, 1),
  ('Jharkhand', 20, 26, 1),
  ('Goa', 7, 8, 1),
  ('Himachal Pradesh', 11, 13, 1)
ON CONFLICT (state_name) DO NOTHING;

-- Seed usage trend (PPAC monthly data)
INSERT INTO usage_trend (month, domestic_mt, commercial_mt) VALUES
  ('Oct 2025', 2350, 480),
  ('Nov 2025', 2400, 510),
  ('Dec 2025', 2500, 530),
  ('Jan 2026', 2450, 490),
  ('Feb 2026', 2380, 420),
  ('Mar 2026', 2300, 350)
ON CONFLICT (month) DO NOTHING;

-- Seed news
INSERT INTO news_impact (headline, impact_pct, source, url) VALUES
  ('Hormuz tensions escalate — commercial LPG imports delayed', 25, 'Reuters', 'https://reuters.com'),
  ('PPAC reports 18% drop in commercial cylinder refills', 12, 'PPAC', 'https://ppac.gov.in'),
  ('Delhi govt prioritises domestic over hotels', -8, 'Economic Times', 'https://economictimes.com'),
  ('IOC announces emergency LPG shipment from Saudi Arabia', -15, 'Business Standard', 'https://business-standard.com'),
  ('Restaurant associations demand commercial LPG quota increase', 5, 'NDTV', 'https://ndtv.com');
