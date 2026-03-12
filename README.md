# LPG Situation Deck

**Real-time India LPG shortage dashboard** — track city-level wait times, price changes, news impact scoring, and crowdsourced reports during the 2026 crisis.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FVisionaryV%2Flpg-situation-deck&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY&envDescription=Supabase%20project%20credentials%20(get%20from%20Supabase%20Dashboard%20%3E%20Settings%20%3E%20API)&envLink=https%3A%2F%2Fsupabase.com%2Fdashboard&project-name=lpg-situation-deck&repository-name=lpg-situation-deck)

---

## Features

- **India Heatmap** — color-coded state-level shortage severity (Leaflet + dark tiles)
- **City Table** — sortable by 5 fields, filterable by type/state/shortage/search
- **Usage Trend Chart** — PPAC monthly domestic vs commercial consumption (Recharts)
- **Live News Panel** — real-time headlines with impact scoring (+25% / -8%), clickable source links
- **Report Shortage Form** — crowdsource data moat, anonymous submissions
- **Scraper** — Playwright-based IOCL price scraper + RSS news scorer, runs every 6h via GitHub Actions
- **Anomaly Detection** — flags >20% price spikes or >200% wait time changes
- **SEO + OG Tags** — Twitter cards, WhatsApp share, full meta

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15, React 19, Tailwind CSS |
| Map | Leaflet + react-leaflet (dark tiles) |
| Charts | Recharts |
| Database | Supabase (Postgres + Realtime) |
| Scraper | Playwright + tsx |
| CI/CD | GitHub Actions (every 6h cron) |
| Hosting | Vercel (free Hobby tier) |

## Quick Setup

### 1. Clone & Install

```bash
git clone https://github.com/VisionaryV/lpg-situation-deck.git
cd lpg-situation-deck
npm install
```

### 2. Create Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Create a new project (select **Mumbai / ap-south-1** region)
3. Open **SQL Editor** and paste the contents of `supabase/schema.sql`
4. Click **Run** — this creates all 6 tables, indexes, RLS policies, and seed data

### 3. Set Environment Variables

```bash
cp .env.example .env.local
```

Fill in your Supabase credentials:

```env
# From: Supabase Dashboard > Project Settings > API
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...

# Service key (scraper only — never expose to frontend)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOi...
```

### 4. Run Locally

```bash
npm run dev
# Open http://localhost:3000
```

### 5. Test Scraper

```bash
# Install Playwright browsers first
npx playwright install chromium

# Run scraper
npm run scrape
```

### 6. Deploy to Vercel

Either click the **Deploy to Vercel** button above, or:

```bash
npm i -g vercel
vercel
# Set env vars when prompted:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### 7. Enable GitHub Actions Scraper

Add these secrets in your GitHub repo (**Settings > Secrets > Actions**):

| Secret | Value |
|--------|-------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Your Supabase service_role key |

The scraper runs automatically every 6 hours. You can also trigger it manually from the **Actions** tab.

## Project Structure

```
lpg-situation-deck/
├── app/
│   ├── page.tsx              # Main dashboard
│   ├── about/page.tsx        # About + WhatsApp/Twitter share
│   ├── layout.tsx            # SEO, OG tags, fonts
│   └── globals.css           # Dark theme overrides
├── components/
│   ├── IndiaLPGHeatmap.tsx   # Leaflet heatmap
│   ├── StatsHeader.tsx       # Top-level stats cards
│   ├── CityTable.tsx         # Sortable/filterable city table
│   ├── UsageTrendChart.tsx   # Recharts area chart
│   ├── LiveNewsPanel.tsx     # Realtime news feed
│   └── ReportShortageForm.tsx # Crowdsource form
├── lib/
│   ├── types.ts              # TypeScript interfaces
│   ├── supabase.ts           # Supabase client
│   └── utils.ts              # Helpers, formatters, state list
├── scraper/
│   ├── index.ts              # Main scraper (IOCL + RSS + state summary)
│   └── validate.ts           # Anomaly detection
├── supabase/
│   └── schema.sql            # Full schema + seed data
└── .github/workflows/
    └── scrape.yml            # GitHub Actions cron (every 6h)
```

## Data Sources

- **IOCL Indane** — domestic & commercial LPG cylinder prices
- **PPAC** — monthly consumption statistics
- **NewsData.io / ET RSS** — news headlines with AI impact scoring
- **Crowdsource** — user-submitted shortage reports

## Contributing

This is a public interest project built during India's 2026 LPG crisis. PRs welcome.

## License

MIT
