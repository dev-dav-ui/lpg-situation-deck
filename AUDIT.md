# LPG Situation Deck — Full Technical Audit

**Date:** 2026-03-13
**Repo:** github.com/dev-dav-ui/lpg-situation-deck
**Live URL:** https://lpg-steel.vercel.app

---

## 1. Repository Structure

| Path | Purpose |
|------|---------|
| `app/page.tsx` | Main dashboard. Renders all 6 components. `liveStats` values (248 cities, 42.7k watching) are hardcoded, never fetched from Supabase. |
| `app/layout.tsx` | Root layout with SEO metadata, Inter font, OG tags. `metadataBase` points to env var or fallback URL. |
| `app/globals.css` | Dark theme + Leaflet CSS import + custom tooltip + scrollbar styles. |
| `components/IndiaLPGHeatmap.tsx` | Leaflet map with SSR fix (dynamic imports + `mounted` guard). Reads `state_summary`. CartoDB dark tiles. |
| `components/StatsHeader.tsx` | 4 KPI cards. Receives props from `page.tsx`. All values are static props from hardcoded state. |
| `components/CityTable.tsx` | Sortable/filterable table. Reads `city_data`. Falls back to 8 hardcoded cities if Supabase empty. |
| `components/LiveNewsPanel.tsx` | News feed. Reads `news_impact` table (NOT the new `news` table). Has realtime subscription. |
| `components/UsageTrendChart.tsx` | Recharts area chart. Reads `usage_trend`. Falls back to hardcoded PPAC data. |
| `components/ReportShortageForm.tsx` | Crowdsource form. Inserts to `shortage_reports`. Uses anon key (correct). |
| `lib/supabase.ts` | Supabase client using `NEXT_PUBLIC_*` env vars. Has placeholder fallbacks for build-time safety. |
| `lib/types.ts` | TypeScript interfaces for all data models including `DbNewsRow` (mapped to `news_impact` schema). |
| `lib/utils.ts` | Color helpers, formatters, `INDIAN_STATES` list, sort utility. |
| `scraper/index.ts` | Playwright + stealth scraper. Scrapes GoodReturns + IOCL. Writes to `city_data`, `state_summary`, `news_impact`, `scraper_runs`. |
| `scraper/news.ts` | RSS-only scraper. Writes to `news` table (separate from `news_impact`). |
| `scraper/validate.ts` | Anomaly detection (price bounds, >20% spike, >200% wait). Logs to `scraper_runs`. |
| `schema.sql` | Defines 6 tables with RLS policies and seed data. Does NOT include `news` table (added via MCP migration). |
| `.github/workflows/scrape.yml` | Runs `scraper/index.ts` every 6h. Installs Playwright chromium. Has secrets. |
| `.github/workflows/news.yml` | Runs `scraper/news.ts` every 30 min. No Playwright needed. Has secrets. |
| **Root loose files** | `CityTable.tsx`, `page.tsx`, `IndiaLPGHeatmap.tsx`, `IndiaLPGHeatmap (1).tsx`, `page (1).tsx`, `StatsHeader.tsx`, `LiveNewsPanel.tsx`, `UsageTrendChart.tsx`, `supabase.ts`, `types.ts`, `utils.ts` — all stale duplicates in root, not used by the app, not in .gitignore. |

---

## 2. Data Flow Verification

### Pipeline A: `scraper/index.ts` → `city_data` / `state_summary` / `news_impact`

| Stage | File | Table | API Call | Failure Points |
|-------|------|-------|----------|----------------|
| Fetch prices | `scraper/index.ts` | — | Playwright → goodreturns.in | Bot blocking, DOM structure change, timeout |
| Validate | `scraper/validate.ts` | `city_data` (read) | `.from('city_data').select()` | Price bounds may reject legitimate outliers |
| Write cities | `scraper/index.ts` | `city_data` | `.upsert()` on `city,state,cylinder_type` | No write RLS for anon — service key required |
| Aggregate states | `scraper/index.ts` | `state_summary` | `.upsert()` on `state_name` | Depends on city_data being populated first |
| Write news | `scraper/index.ts` | `news_impact` | `.insert()` with headline dedup | Runs in same process as Playwright (slow) |
| Log run | `scraper/validate.ts` | `scraper_runs` | `.insert()` | Non-blocking, no retry |

### Pipeline B: `scraper/news.ts` → `news`

| Stage | File | Table | API Call | Failure Points |
|-------|------|-------|----------|----------------|
| Fetch RSS | `scraper/news.ts` | — | `fetch()` with 15s timeout | ET/Livemint may return 403; CORS issues on some envs |
| Filter | `scraper/news.ts` | — | In-memory keyword filter | Too broad — "subsidy" matches non-LPG stories |
| Write | `scraper/news.ts` | `news` | `.upsert()` on `url` | **`news` table is never read by any frontend component** |

---

## 3. Supabase Integration

**Frontend client** (`lib/supabase.ts`): Uses `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` — correct, anon key only, browser-safe.

### Tables used by frontend

| Table | Used By | Read Method |
|-------|---------|-------------|
| `city_data` | `CityTable.tsx` | `.select('*').order('wait_days', desc)` |
| `state_summary` | `IndiaLPGHeatmap.tsx` | `.select('*')` + realtime |
| `news_impact` | `LiveNewsPanel.tsx` | `.select('*').order('created_at', desc).limit(8)` + realtime |
| `usage_trend` | `UsageTrendChart.tsx` | `.select('*').order('month', asc)` |
| `shortage_reports` | `ReportShortageForm.tsx` | INSERT only |

### Tables that exist but are NOT read by frontend

| Table | Status |
|-------|--------|
| `scraper_runs` | Exists, populated by scraper, never displayed |
| `news` | Exists (created via MCP), populated by `scraper/news.ts`, never read by any component |

### RLS policy check

- All 6 original tables have `FOR SELECT USING (true)` — anon reads work correctly
- `shortage_reports` has `FOR INSERT WITH CHECK (true)` — anon inserts work correctly
- `news` table has `FOR SELECT USING (true)` — correct, but unused
- No write policies on `city_data`, `state_summary`, `news_impact` — scraper must use service key (it does)

### Service key exposure check

- `SUPABASE_SERVICE_KEY` is in `.env.local` which is in `.gitignore` — not committed
- `scraper/index.ts` and `scraper/validate.ts` use `process.env.SUPABASE_SERVICE_KEY` — server-only, never shipped to browser
- `lib/supabase.ts` uses only `NEXT_PUBLIC_SUPABASE_ANON_KEY` — correct
- **No service key exposure in frontend**

---

## 4. Frontend Data Usage

| Component | Data Source | Status |
|-----------|-------------|--------|
| `StatsHeader` | Hardcoded in `page.tsx` state. "Watching" counter increments by random ±300 every 8s. Never fetches Supabase. | STATIC |
| `IndiaLPGHeatmap` | Reads `state_summary`. Falls back to 10 hardcoded states. SSR fix applied. CartoDB tiles. | LIVE |
| `LiveNewsPanel` | Reads `news_impact`. Falls back to 5 hardcoded items. Realtime subscription active. | LIVE |
| `CityTable` | Reads `city_data`. Falls back to 8 hardcoded cities. Realtime subscription active. | LIVE |
| `UsageTrendChart` | Reads `usage_trend`. Falls back to 6 hardcoded months. No realtime. Data is seed only, never scraped. | PARTIAL |
| `ReportShortageForm` | Inserts to `shortage_reports`. No read. Basic city+state validation. | LIVE |
| Nav banner "Last updated" | Hardcoded string `"2h ago"` in `page.tsx:41`. Never updates. | STATIC |

---

## 5. Scraper System

### `scraper/index.ts` — ACTIVE (every 6h via `scrape.yml`)

- Playwright + stealth plugin. Sources: GoodReturns.in + IOCL historical pages.
- Writes to: `city_data`, `state_summary`, `news_impact`, `scraper_runs`
- Also contains its own RSS news fetch (Step 5) writing to `news_impact`

### `scraper/news.ts` — ACTIVE but DEAD PIPELINE (every 30min via `news.yml`)

- Pure `fetch()`, no browser. Sources: ET + Livemint RSS.
- Writes to: `news` table
- **`news` table is not read by any frontend component**

### Workflow match

| Workflow | Schedule | Script | Secrets | Status |
|----------|----------|--------|---------|--------|
| `scrape.yml` | Every 6h | `scraper/index.ts` | Both set | ACTIVE |
| `news.yml` | Every 30min | `scraper/news.ts` | Both set | ACTIVE but data goes nowhere |

**Note:** `scraper/index.ts` also scrapes RSS (Step 5) and writes to `news_impact`. `scraper/news.ts` writes to `news`. Two parallel news pipelines targeting different tables — only `news_impact` is consumed by the frontend.

---

## 6. Database Structure Audit

| Table | Purpose | Frontend Usage | Populated | Schema Issues |
|-------|---------|---------------|-----------|---------------|
| `city_data` | City-level prices, wait days, shortage | Yes — CityTable | Yes (seed + scraper) | `wait_days` always 0 from scraper (no source for this data) |
| `state_summary` | Aggregated per-state averages | Yes — Heatmap | Yes (seed + scraper) | None |
| `news_impact` | Scored news headlines | Yes — LiveNewsPanel | Yes (seed + scraper) | No UNIQUE constraint on headline/url — potential duplicates |
| `usage_trend` | Monthly PPAC consumption | Yes — UsageTrendChart | Yes (seed only) | Never scraped; no auto-update mechanism |
| `shortage_reports` | Crowdsourced reports | Write-only (form) | Yes (user submissions) | Reports never displayed anywhere on the site |
| `scraper_runs` | Scraper audit log | No | Yes | `started_at` set on insert, not real start time |
| `news` | RSS news from news.ts | No | Yes (every 30min) | Orphaned — exists but no component reads it |

---

## 7. Security Audit

| Check | Finding | Risk |
|-------|---------|------|
| Service key in frontend | Not present. Only `NEXT_PUBLIC_ANON_KEY` in browser bundle. | LOW |
| Service key in git | `.env.local` is gitignored and not committed. | LOW |
| Service key in logs | Not logged anywhere in scraper code. | LOW |
| Anon key exposure | `NEXT_PUBLIC_SUPABASE_ANON_KEY` is intentionally public — correct Supabase pattern. | LOW |
| RLS on write paths | No INSERT policy for anon on `city_data`, `state_summary`, `news_impact` — scraper-only writes require service key. Correct. | LOW |
| `shortage_reports` INSERT | `WITH CHECK (true)` — anyone can insert. No rate limiting, no CAPTCHA, no length validation on `description`. | MEDIUM |
| Unsafe queries | No raw SQL in frontend — all `.from().select()` style. No SQL injection vectors. | LOW |
| Stale root files | 13 `.tsx`/`.ts` files in root are not gitignored, not used, and could cause confusion. | LOW |
| OG image | `layout.tsx` references `/og-image.png` — file does not exist in `public/`. Broken OG/Twitter card. | LOW |

---

## 8. Performance Risks

| Risk | Location | Details |
|------|---------|---------|
| N+1 upsert loop | `scraper/index.ts:439-478` | One SELECT + one UPSERT per city in a `for` loop. 70+ cities = 140+ sequential Supabase calls. Should be bulk upsert. |
| GeoJSON loaded every mount | `IndiaLPGHeatmap.tsx:46` | Fetches full India GeoJSON from GitHub raw on every page load. No caching. ~1.5MB network call. |
| Playwright install on every run | `scrape.yml` | `npx playwright install chromium --with-deps` runs every job — adds ~2-3 min per run. No caching. |
| `news.yml` cron wastage | `.github/workflows/news.yml` | Runs every 30 min but `news` table is never read — wasting GitHub Actions minutes. |
| No pagination in CityTable | `CityTable.tsx` | Fetches all rows with `.select('*')` — fine at ~70 rows, expensive at scale. |
| Low-value realtime subscription | `IndiaLPGHeatmap.tsx` | Realtime open WebSocket on `state_summary` — table only updates every 6h. |
| No dedup constraint on `news_impact` | `schema.sql` | No UNIQUE on `headline` or `url`. Scraper deduplicates in memory but back-to-back runs can insert duplicates. |

---

## 9. Deployment Audit

| Check | Finding |
|-------|---------|
| Vercel project | `prj_0fRvfb8RxNLIeuahHss3oQ64Zoli` under `teamadss-projects`. Deployed at `lpg-steel.vercel.app`. |
| Env vars on Vercel | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — all 4 set on Production. |
| GitHub ↔ Vercel link | Not connected. Deployments require manual `npx vercel --prod`. |
| Build process | `next build` — no API routes, purely static + client components. Build succeeds. |
| `NEXT_PUBLIC_SITE_URL` on Vercel | Not set as a Vercel env var — `metadataBase` falls back to `https://lpg-situation-deck.vercel.app` (wrong URL). |
| `/og-image.png` | Referenced in `layout.tsx`. File does not exist in `public/`. OG image broken. |
| `next.config.js` | Not present in repo. Acceptable for this setup. |
| `tailwind.config.ts` | Present in root. |

---

## 10. Final Truth Report

| Feature | Implementation Status | Data Source | Risk Level |
|---------|----------------------|-------------|------------|
| India heatmap | LIVE | `state_summary` (seed + scraper) | LOW |
| Live news panel | LIVE | `news_impact` (seed + scraper) | LOW |
| City table | LIVE | `city_data` (seed + scraper) | LOW |
| Usage trend chart | PARTIAL | `usage_trend` (seed only, never scraped) | LOW |
| Stats header (cities, wait, shortage) | STATIC | Hardcoded in `page.tsx` | MEDIUM |
| "Watching live" counter | STATIC | Random increment in `setInterval` | LOW |
| "Last updated" nav label | STATIC | Hardcoded string `"2h ago"` | LOW |
| Shortage report form | LIVE | Writes to `shortage_reports` | MEDIUM |
| Shortage reports display | BROKEN | Written but never read or displayed | LOW |
| GoodReturns price scraper | LIVE | GoodReturns.in via Playwright | HIGH |
| IOCL price scraper | PARTIAL | Historical page works; current page times out | MEDIUM |
| News scraper (`index.ts`) | LIVE | `news_impact` via RSS | LOW |
| News scraper (`news.ts`) | BROKEN | `news` table never read by frontend | MEDIUM |
| GitHub Actions scrape | LIVE | Runs every 6h | MEDIUM |
| GitHub Actions news | BROKEN | Runs every 30min but data goes nowhere | MEDIUM |
| OG image / social cards | BROKEN | `/og-image.png` missing | LOW |
| Vercel auto-deploy | BROKEN | GitHub not connected to Vercel | MEDIUM |
| `NEXT_PUBLIC_SITE_URL` on Vercel | BROKEN | Not set as Vercel env var | LOW |
| Scraper run logging | LIVE | `scraper_runs` table | LOW |
| Anomaly detection | LIVE | `validate.ts` price/wait bounds | LOW |

---

## 11. Critical Fixes (Top 10)

| # | Fix | File(s) | Impact |
|---|-----|---------|--------|
| 1 | **Connect `news` table to frontend** — update `LiveNewsPanel.tsx` to read from `news` instead of `news_impact`, or delete `scraper/news.ts` + `news.yml` to stop wasting Actions minutes | `components/LiveNewsPanel.tsx` or `scraper/news.ts` + `news.yml` | Eliminates dead pipeline |
| 2 | **Replace hardcoded StatsHeader stats** — fetch real aggregates from Supabase: `COUNT(DISTINCT city)` from `city_data`, `AVG(wait_days)`, `MAX(shortage_pct)` | `app/page.tsx`, `components/StatsHeader.tsx` | Turns STATIC → LIVE |
| 3 | **Set `NEXT_PUBLIC_SITE_URL` in Vercel env vars** — currently missing, causing `metadataBase` to resolve to the wrong URL | Vercel dashboard → Environment Variables | Fixes OG/Twitter card URLs |
| 4 | **Add `/public/og-image.png`** — `layout.tsx` references it but it doesn't exist | `public/og-image.png` | Fixes broken social media previews |
| 5 | **Fix N+1 upsert loop in scraper** — replace per-city SELECT+UPSERT loop with a single bulk upsert and one comparison pass | `scraper/index.ts:439-478` | Cuts scraper DB time by ~90% |
| 6 | **Cache GeoJSON in IndiaLPGHeatmap** — store in `sessionStorage` after first fetch, avoid re-fetching on every mount | `components/IndiaLPGHeatmap.tsx:46-49` | Saves 1.5MB on every page load |
| 7 | **Cache Playwright browser install in `scrape.yml`** — add `actions/cache` for Playwright binaries to avoid reinstalling on every run | `.github/workflows/scrape.yml` | Saves ~30 min/day of Actions time |
| 8 | **Add UNIQUE constraint on `news_impact(url)`** — prevent duplicate rows when scraper runs back-to-back | Migration on `news_impact` table | Data integrity |
| 9 | **Add `description` length limit to `shortage_reports`** — no validation on free-text field, open to abuse | `components/ReportShortageForm.tsx:157`, schema | Security hardening |
| 10 | **Delete 13 stale root-level duplicate files** — `CityTable.tsx`, `page.tsx`, `IndiaLPGHeatmap.tsx`, `IndiaLPGHeatmap (1).tsx`, `page (1).tsx`, `StatsHeader.tsx`, `LiveNewsPanel.tsx`, `UsageTrendChart.tsx`, `supabase.ts`, `types.ts`, `utils.ts`, `readme 2.txt` — none are used, all are misleading | Root directory | Repo hygiene |
