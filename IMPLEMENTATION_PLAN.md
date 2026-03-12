# LPG Situation Deck — Implementation Plan

**Project:** Real-time India LPG Shortage Dashboard
**Status:** Ready for Implementation
**Date:** March 12, 2026

---

## 🚨 Critical Fixes (Must Do!)

Before you start, note these 5 key updates to this plan:

1. **File Count:** 20 files total (not 13) — all components already built ✓
2. **Component Status:** `ReportShortageForm.tsx` + `LiveNewsPanel.tsx` are complete (not "to build")
3. **Leaflet SSR (CRITICAL):** See **Section 3.2** — must wrap map in `'use client'` + dynamic import, or map will be blank on Vercel
4. **GitHub Actions:** Make sure `.github/workflows/scrape.yml` includes `npx playwright install chromium` step
5. **Social Polish:** Add OG image (section 6.6) + optional live viewer counter for viral share potential

---

## 📋 Executive Summary

This is a full-stack Next.js dashboard tracking India's 2026 LPG crisis with real-time price/wait-time data, interactive maps, news impact scoring, and crowdsourced reports. The system combines automated scrapers, real-time Supabase updates, and rich visualizations into a public-interest platform.

**Core Components:**
- Frontend dashboard (5 React components)
- Supabase database (6 tables + RLS + realtime)
- Playwright price scraper + RSS news scorer
- GitHub Actions automation (every 6 hours)
- Vercel deployment

---

## 🏗️ Phase 1: Project Setup & Foundations

### 1.1 Repository & Git
**What:** Initialize GitHub repository with complete project structure
**Owner:** You
**Timeline:** < 30 min

- [ ] Create public GitHub repo: `lpg-situation-deck`
- [ ] Initialize git locally:
  ```bash
  cd lpg-situation-deck
  git init && git add . && git commit -m "Initial commit"
  git branch -M main
  gh repo create lpg-situation-deck --public --source=. --push
  ```
- [ ] Verify all files uploaded (13 files + folders)

### 1.2 Environment Setup
**What:** Configure local dev environment
**Owner:** You
**Timeline:** < 15 min

- [ ] Create `.env.local` file (copy from `.env.example` if it exists)
- [ ] Install dependencies: `npm install`
- [ ] Verify Node version: `node --version` (should be 18+)
- [ ] Test local build: `npm run dev` (should start on localhost:3000)

### 1.2 Git Push
**What:** Push complete project to GitHub
**Owner:** You
**Timeline:** < 5 min

- [ ] Verify all 20 files are in the repository:
  - App files: `page.tsx`, `layout.tsx`, `globals.css`
  - Components: `StatsHeader.tsx`, `IndiaLPGHeatmap.tsx`, `CityTable.tsx`, `LiveNewsPanel.tsx`, `UsageTrendChart.tsx`, `ReportShortageForm.tsx`
  - Lib: `types.ts`, `utils.ts`, `supabase.ts`
  - Scraper: `scraper/index.ts`, `scraper/validate.ts`
  - Database: `supabase/schema.sql`
  - Config: `package.json`, `.github/workflows/scrape.yml`
  - Docs: `README.md`, `readme 2.txt`

### 1.3 Dependencies Review
**Tech Stack Verification:**
- Next.js 15 ✓
- React 19 ✓
- Tailwind CSS ✓
- Supabase client ✓
- Leaflet + react-leaflet (maps) ✓
- Recharts (charts) ✓
- Playwright (scraper) ✓

---

## 🗄️ Phase 2: Backend Infrastructure (Supabase)

### 2.1 Supabase Project Creation
**What:** Set up the core database and authentication layer
**Owner:** You
**Timeline:** 5-10 min

- [ ] Go to [supabase.com/dashboard](https://supabase.com/dashboard)
- [ ] Click **New Project**
- [ ] Configure:
  - **Name:** `lpg-situation-deck`
  - **Region:** `South Asia (Mumbai)` (ap-south-1)
  - **DB Password:** Generate and save securely
- [ ] Wait for provisioning (~2 minutes)
- [ ] Note the project URL for later

### 2.2 Database Schema Deployment
**What:** Create all 6 tables with proper relationships, indexes, and RLS policies
**Owner:** You
**Timeline:** < 5 min

**Tables to create:**
1. `city_data` — City-level LPG info (wait times, prices, shortage %)
2. `state_summary` — Aggregated state-level metrics
3. `news_impact` — News headlines with impact scoring
4. `usage_trend` — Monthly PPAC consumption data
5. `shortage_reports` — Crowdsourced user submissions
6. (Implicit) Realtime subscriptions

**Process:**
- [ ] Open Supabase SQL Editor
- [ ] Copy entire `schema.sql` file
- [ ] Paste into SQL Editor
- [ ] Execute (creates all tables, indexes, RLS, seed data)
- [ ] Verify 6 tables appear in left sidebar
- [ ] Check seed data: 30 cities + sample news records

### 2.3 Enable Realtime
**What:** Enable row-level realtime subscriptions for live updates
**Owner:** System (automatic with schema)
**Timeline:** Included in 2.2

- [ ] Verify in schema: Realtime enabled for `city_data`, `state_summary`, `news_impact`
- [ ] Test connectivity after frontend is running

### 2.4 API Keys & Environment Variables
**What:** Extract credentials for frontend + backend use
**Owner:** You
**Timeline:** < 5 min

From Supabase Dashboard → **Settings** → **API**:

```
NEXT_PUBLIC_SUPABASE_URL = https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (for scraper only)
```

- [ ] Add `NEXT_PUBLIC_*` keys to `.env.local` (frontend)
- [ ] Add all 3 to Vercel later (deployment step)
- [ ] Add `SUPABASE_*` to GitHub Secrets (for Actions scraper)

---

## 🎨 Phase 3: Frontend Components & Dashboard

### 3.1 Component Architecture
**What:** Build the 5 interactive UI components
**Owner:** Code (pre-built files)
**Timeline:** Components exist, verification needed

**Components:**

| Component | Purpose | Tech | Status |
|-----------|---------|------|--------|
| `StatsHeader.tsx` | Top KPIs: cities, avg wait, shortage, live viewers | React state | ✓ Complete |
| `IndiaLPGHeatmap.tsx` | Leaflet map with state-level color coding | Leaflet + dark tiles | ✓ Complete* |
| `CityTable.tsx` | Sortable/filterable table (5 fields, 30+ cities) | React hooks, array sort | ✓ Complete |
| `LiveNewsPanel.tsx` | Real-time news feed with impact scores | Supabase realtime | ✓ Complete |
| `UsageTrendChart.tsx` | Area chart: domestic vs commercial consumption | Recharts | ✓ Complete |
| `ReportShortageForm.tsx` | Crowdsourced data submission form | React forms, Supabase insert | ✓ Complete |

*See 3.2 for critical Leaflet SSR fix

### 3.2 Critical Fix: Leaflet Server-Side Rendering (SSR)
**⚠️ MUST DO BEFORE TESTING** — This is a common Next.js + Leaflet gotcha
**Owner:** You
**Timeline:** 2 min
**Impact:** Map will be blank on Vercel without this

Leaflet doesn't work with server-side rendering. You must:

1. Open `components/IndiaLPGHeatmap.tsx`
2. Add `'use client'` at the very top:
   ```tsx
   'use client';

   import dynamic from 'next/dynamic';
   import { useEffect, useState } from 'react';

   // Dynamically import Leaflet components (disables SSR)
   const MapContainer = dynamic(
     () => import('react-leaflet').then(mod => mod.MapContainer),
     { ssr: false }
   );
   const TileLayer = dynamic(
     () => import('react-leaflet').then(mod => mod.TileLayer),
     { ssr: false }
   );
   const GeoJSON = dynamic(
     () => import('react-leaflet').then(mod => mod.GeoJSON),
     { ssr: false }
   );
   ```
3. Replace all `<MapContainer>`, `<TileLayer>`, `<GeoJSON>` with the dynamic versions
4. Test locally: `npm run dev` → map should render (not blank)

**Why:** Leaflet uses `window` object which doesn't exist on server. Dynamic imports with `ssr: false` move rendering to client-only.

### 3.3 Main Dashboard (page.tsx)
**What:** Orchestrate all components into a cohesive layout
**Owner:** Code (pre-built)
**Timeline:** Already implemented

**Layout:**
- Header: Navigation + live status badge
- Grid (2 columns on desktop):
  - Left (8 cols): Heatmap
  - Right (4 cols): News panel + trend chart
- Full-width: City table
- Full-width: Report form

**Steps:**
- [ ] Review `page.tsx` structure
- [ ] Verify Supabase client initialization
- [ ] Test with `npm run dev` → expect heatmap + table
- [ ] Check console for any connection errors

### 3.4 Component Integration Points
**What:** Ensure data flows properly from Supabase → Components
**Owner:** Verification task
**Timeline:** 30 min

- [ ] `StatsHeader`: Fetch `state_summary` table, calculate totals
- [ ] `IndiaLPGHeatmap`: Query `state_summary`, color states by shortage %
- [ ] `CityTable`: Subscribe to `city_data` realtime, implement sort/filter
- [ ] `LiveNewsPanel`: Subscribe to `news_impact` realtime, sort by date desc
- [ ] `UsageTrendChart`: Fetch `usage_trend` table (static data)
- [ ] `ReportShortageForm`: Insert to `shortage_reports` + validate

### 3.5 Styling & Dark Theme
**What:** Ensure consistent dark theme across all components
**Owner:** Code (pre-built with Tailwind)
**Timeline:** Already done

- [ ] Verify Tailwind config includes dark theme
- [ ] Check all components use `bg-zinc-900`, `text-white`, `border-zinc-800`
- [ ] Review `globals.css` for theme overrides
- [ ] Test responsiveness: desktop (1920px) + tablet (768px) + mobile (375px)

---

## 🤖 Phase 4: Data Scraper & Pipeline

### 4.1 Scraper Architecture
**What:** Build automated data collection system
**Owner:** TypeScript (pre-built files)
**Timeline:** Verification + integration

**Data Sources:**
1. **IOCL Indane** → Playwright scrape (every 6h)
2. **PPAC Stats** → Monthly consumption (static + manual updates)
3. **NewsData.io / ET RSS** → Headlines + sentiment scoring
4. **Crowdsource** → User-submitted reports (real-time)

**Files:**
- `scraper/index.ts` — Main orchestrator
- `scraper/validate.ts` — Anomaly detection (price spikes > 20%, wait time > 200%)

### 4.2 Scraper Setup
**What:** Prepare scraper for local & CI/CD execution
**Owner:** You
**Timeline:** < 15 min

- [ ] Install Playwright browsers:
  ```bash
  npx playwright install chromium
  ```
- [ ] Create scraper env file (if separate from main)
- [ ] Test locally:
  ```bash
  SUPABASE_URL=https://xxxxx.supabase.co \
  SUPABASE_SERVICE_KEY=your-service-role-key \
  npx tsx scraper/index.ts
  ```
- [ ] Verify output:
  - [ ] Prices updated in `city_data` table
  - [ ] News records inserted in `news_impact` table
  - [ ] No errors in console

### 4.3 Anomaly Detection & Validation
**What:** Flag suspicious data spikes to prevent bad data
**Owner:** validate.ts
**Timeline:** Integrated in scraper

- [ ] Price spike alert: > 20% change flagged (email/notification)
- [ ] Wait time anomaly: > 200% change flagged
- [ ] Crowdsource validation: Manual review before publishing
- [ ] Data quality check: No NaN, null, or negative values

### 4.4 Historical Data Seeding
**What:** Load 12 months of historical usage trends (PPAC)
**Owner:** Manual task
**Timeline:** < 10 min

**Seed data for `usage_trend` table:**
```sql
INSERT INTO usage_trend (month, domestic_mt, commercial_mt) VALUES
('Jan 2025', 850.3, 240.5),
('Feb 2025', 845.1, 238.2),
-- ... etc through Mar 2026
```

- [ ] Insert PPAC historical data into `usage_trend` table
- [ ] Verify chart shows 12-month trend

---

## 🚀 Phase 5: CI/CD & Deployment

### 5.1 Vercel Deployment
**What:** Deploy to Vercel with environment variables
**Owner:** You
**Timeline:** < 10 min

**Option A: One-Click (Recommended)**
- [ ] Go to GitHub repo on github.com
- [ ] Click blue **"Deploy to Vercel"** button (from README)
- [ ] Authorize Vercel + GitHub
- [ ] Add env vars when prompted:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Wait for deployment (~2 min)
- [ ] Copy production URL

**Option B: CLI**
```bash
npm i -g vercel
cd lpg-situation-deck
vercel
# Set env vars when prompted
```

### 5.2 Environment Variables in Vercel
**What:** Configure secrets for production
**Owner:** You
**Timeline:** < 5 min

In Vercel Dashboard → Project → **Settings** → **Environment Variables**:

| Key | Value | Type |
|-----|-------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` | Production |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGci...` | Production |

- [ ] Add variables
- [ ] Redeploy for changes to take effect

### 5.3 GitHub Actions Scraper Automation
**What:** Set up 6-hour automated scraping
**Owner:** GitHub Actions (`.github/workflows/scrape.yml`)
**Timeline:** < 10 min

**Setup Steps:**
- [ ] Go to GitHub repo → **Settings** → **Secrets and variables** → **Actions**
- [ ] Add secrets:
  - `SUPABASE_URL`: Your Supabase project URL
  - `SUPABASE_SERVICE_KEY`: Your service role key (from Supabase Settings → API)
- [ ] Verify `.github/workflows/scrape.yml` includes Playwright browser installation:
  ```yaml
  - name: Install Playwright Browsers
    run: npx playwright install chromium
  ```
  *(If first Action run fails, add this step. Playwright needs browsers.)*
- [ ] Commit `.github/workflows/scrape.yml` (should be in repo)
- [ ] Scraper runs automatically every 6 hours
- [ ] Manually trigger from **Actions** tab to test

**Cron Schedule:**
```yaml
schedule:
  - cron: '0 */6 * * *'  # 12 AM, 6 AM, 12 PM, 6 PM UTC
```

**Common Issue:** If first Action fails with "Playwright browser not found", add the install step above and retry.

### 5.4 Monitoring & Logs
**What:** Monitor deployment health
**Owner:** Vercel + GitHub
**Timeline:** Ongoing

- [ ] Enable Vercel Analytics
- [ ] Monitor function performance (if using Next.js API routes)
- [ ] Review GitHub Actions logs after each 6-hour scrape
- [ ] Set up alerts for failed deployments/scraper runs

---

## ✅ Phase 6: Testing & Optimization

### 6.1 Functional Testing
**What:** Verify all features work end-to-end
**Owner:** QA (You)
**Timeline:** 30 min

**Dashboard Tests:**
- [ ] Heatmap loads with 28 states colored by shortage %
- [ ] Clicking state shows tooltip with avg wait days
- [ ] Stats header updates (cities, avg wait, biggest shortage, viewer count)
- [ ] City table displays 30+ cities with sortable columns
- [ ] Filters work: by type (domestic/commercial), state, shortage only, search
- [ ] News panel shows ≥3 latest headlines with impact scores
- [ ] Trend chart renders monthly data (domestic vs commercial)
- [ ] Report form submits without error (checks Supabase)
- [ ] Mobile responsiveness: test on 375px viewport

**Backend Tests:**
- [ ] Scraper runs successfully (IOCL prices + news)
- [ ] Data appears in dashboard within 2 minutes
- [ ] Crowdsourced reports appear immediately (realtime)
- [ ] Price spike anomalies are flagged
- [ ] Historical trends load from PPAC table

### 6.2 Performance Optimization
**What:** Ensure fast load times & smooth interactions
**Owner:** Code optimization
**Timeline:** 20 min

- [ ] Lighthouse score: aim for ≥85 on Performance
- [ ] First Contentful Paint (FCP): < 2s
- [ ] Largest Contentful Paint (LCP): < 2.5s
- [ ] Cumulative Layout Shift (CLS): < 0.1
- [ ] Bundle size: < 500KB (gzipped)

**Optimizations:**
- [ ] Lazy-load Leaflet map on viewport
- [ ] Debounce table filters (avoid rapid queries)
- [ ] Memoize expensive React components (IndiaLPGHeatmap)
- [ ] Compress images (state flag icons if used)
- [ ] Enable Vercel image optimization

### 6.3 SEO & Social Sharing
**What:** Ensure discoverability and viral potential
**Owner:** Layout + metadata
**Timeline:** 10 min

- [ ] Meta title: "LPG Situation Deck — Real-time India Shortage Tracker"
- [ ] Meta description: "Track LPG wait times, prices, and shortages across India. Live updates every 6 hours."
- [ ] OG image: Create 1200×630px social card (crisis theme)
- [ ] Twitter card: Enable summary_large_image
- [ ] WhatsApp share: Test link preview in WhatsApp

**Files to verify:**
- [ ] `layout.tsx` has proper meta tags
- [ ] `about/page.tsx` has share buttons (Twitter, WhatsApp, LinkedIn)

### 6.4 Error Handling & Edge Cases
**What:** Graceful failures and boundary conditions
**Owner:** Code review
**Timeline:** 15 min

- [ ] No data available: Show empty state (not error page)
- [ ] Scraper fails: Display last-known data with "stale" badge
- [ ] Network offline: Cache previous queries
- [ ] Supabase down: Show error message with retry button
- [ ] Invalid filters: Reset to defaults
- [ ] Missing images/icons: Fallback to text or emoji

### 6.5 Accessibility & Compliance
**What:** Ensure inclusive design
**Owner:** Code review
**Timeline:** 15 min

- [ ] WCAG 2.1 AA compliance
- [ ] All images have alt text
- [ ] Links have visible focus states
- [ ] Color contrast ≥ 4.5:1 for text
- [ ] Keyboard navigation works (Tab, Enter, Arrow keys)
- [ ] Screen reader compatible (test with VoiceOver on Mac)

### 6.6 Quick Wins (Polish & Pro Features)
**What:** Final touches for viral potential
**Owner:** You
**Timeline:** 30 min

**OG Image (for social sharing)**
- [ ] Deploy to Vercel
- [ ] Take screenshot of live dashboard (1200×630px ideal)
- [ ] Save as `public/og-image.png`
- [ ] Update `layout.tsx`:
  ```tsx
  <meta property="og:image" content="/og-image.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  ```
- [ ] Test: Share link on Twitter/WhatsApp → should show dashboard preview

**Live Viewer Counter Heartbeat (Optional but cool)**
- [ ] Currently `StatsHeader.tsx` mocks "Watching: 42,700" and increments randomly
- [ ] Optional Phase 6.4: Replace with real data
- [ ] Create `viewers` table in Supabase:
  ```sql
  CREATE TABLE viewers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id TEXT,
    last_heartbeat TIMESTAMPTZ DEFAULT NOW()
  );
  ```
- [ ] On component mount: Insert viewer session
- [ ] Every 30s: Update `last_heartbeat` (heartbeat)
- [ ] Query count of sessions updated in last 5 minutes
- [ ] This shows actual concurrent users (way cooler than mock)
- [ ] Alternative (simpler): Keep mock but label as "Live Alert Subscribers"

---

## 📊 Deployment Checklist

### Pre-Launch
- [ ] All components render locally (`npm run dev`)
- [ ] Supabase schema loaded with seed data
- [ ] Scraper runs without errors
- [ ] GitHub Actions secrets configured
- [ ] Vercel environment variables set
- [ ] All 6 functional tests passed
- [ ] Lighthouse score ≥85
- [ ] SEO meta tags verified

### Launch (Go Live)
- [ ] Deploy to Vercel
- [ ] Test Vercel URL in incognito browser
- [ ] Trigger scraper manually (verify data updates)
- [ ] Monitor error logs (first 6 hours)
- [ ] Share on Twitter/LinkedIn/HN
- [ ] Monitor viewer count spike

### Post-Launch (First Week)
- [ ] Monitor GitHub Actions logs (every 6h scrape)
- [ ] Review user-submitted reports (moderate)
- [ ] Fix any reported bugs
- [ ] Monitor Vercel analytics
- [ ] Iterate on UX based on user feedback

---

## 🔧 Commands Reference

### Local Development
```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Start scraper
SUPABASE_URL=xxx SUPABASE_SERVICE_KEY=xxx npx tsx scraper/index.ts

# Install Playwright browsers
npx playwright install chromium

# Run tests (if added)
npm test
```

### Deployment
```bash
# Deploy via Vercel CLI
vercel

# Set production environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
```

---

## 📅 Timeline Estimate

| Phase | Effort | Duration |
|-------|--------|----------|
| 1. Setup | Low | 1 hour |
| 2. Backend | Low | 30 min |
| 3. Frontend | Minimal (pre-built) | 30 min |
| 4. Scraper | Medium | 1 hour |
| 5. Deployment | Low | 30 min |
| 6. Testing | Medium | 2 hours |
| **Total** | | **~5.5 hours** |

---

## ⚠️ Known Issues & Considerations

1. **Data Freshness:** Scraper runs every 6 hours; some data may be stale
2. **Rate Limiting:** IOCL site may have anti-scrape measures; consider proxies if blocked
3. **Crowdsourced Quality:** Manual moderation needed for user reports
4. **PPAC Data:** Historical data is static; monthly updates required
5. **Spam Prevention:** Add CAPTCHA to report form if needed later
6. **Privacy:** Ensure crowdsource reports don't expose PII (IP, location)

---

## 🎯 Next Steps (In Order)

1. ✅ Push to GitHub
2. ✅ Create Supabase project + load schema
3. ✅ Extract API keys to `.env.local`
4. ✅ Test local dashboard (`npm run dev`)
5. ✅ Deploy to Vercel
6. ✅ Configure GitHub Actions + secrets
7. ✅ Test scraper (manual trigger)
8. ✅ Monitor live dashboard
9. ✅ Share publicly + gather feedback
10. ✅ Iterate based on user reports

---

**Questions?** Refer to README.md or reach out for clarification on any phase.
