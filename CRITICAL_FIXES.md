# Critical Fixes — Copy/Paste Ready

## 1️⃣ Leaflet SSR Fix (MUST DO FIRST)

**File:** `components/IndiaLPGHeatmap.tsx`
**Problem:** Map renders blank on Vercel without this
**Time:** 2 minutes

Replace the imports and component wrapper with:

```tsx
'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// Dynamically import all Leaflet components (disable SSR)
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
const CircleMarker = dynamic(
  () => import('react-leaflet').then(mod => mod.CircleMarker),
  { ssr: false }
);

export default function IndiaLPGHeatmap() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="h-96 bg-zinc-800 rounded animate-pulse" />;

  // ... rest of your component code stays the same
  return (
    <MapContainer center={[20.5937, 78.9629]} zoom={5} style={{ height: '400px', borderRadius: '12px' }}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap'
      />
      {/* ... your GeoJSON markers */}
    </MapContainer>
  );
}
```

**Why:** Leaflet uses browser APIs (`window`, DOM) that don't exist on server. `dynamic` with `ssr: false` moves rendering to client-only.

---

## 2️⃣ GitHub Actions Playwright Setup

**File:** `.github/workflows/scrape.yml`
**Problem:** First Action run fails if Playwright browsers aren't installed
**Time:** Add 2 lines

Make sure your workflow includes this step BEFORE the scraper runs:

```yaml
jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm ci

      # ← ADD THIS STEP
      - name: Install Playwright Browsers
        run: npx playwright install chromium

      - name: Run Scraper
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
        run: npx tsx scraper/index.ts
```

If you see `Error: Chromium is not installed` on first run, add this step and retry.

---

## 3️⃣ OG Image for Social Sharing

**File:** `app/layout.tsx`
**Problem:** Links shared on Twitter/WhatsApp don't show a preview
**Time:** 2 minutes

1. After deploying to Vercel, take a screenshot of your dashboard
2. Crop to 1200×630px (standard OG size)
3. Save to `public/og-image.png`
4. Add to your meta tags in `layout.tsx`:

```tsx
<meta property="og:image" content="/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="/og-image.png" />
```

5. Commit and push
6. Test by sharing on Twitter/WhatsApp — should show dashboard preview

---

## 4️⃣ Live Viewer Counter (Optional but Cool)

**File:** `components/StatsHeader.tsx`
**Current:** Mock viewer count that increments randomly
**Better:** Real concurrent users

### Simple Option (no code changes):
Just label it honestly:
```tsx
<div className="text-2xl font-bold">{liveStats.watching}</div>
<p className="text-xs text-zinc-400">LIVE SUBSCRIBERS</p>
```

### Advanced Option (track real users):

Create a `viewers` table in Supabase:
```sql
CREATE TABLE viewers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT UNIQUE,
  last_heartbeat TIMESTAMPTZ DEFAULT NOW()
);
```

In `StatsHeader.tsx`:
```tsx
useEffect(() => {
  const sessionId = crypto.randomUUID();
  const channel = supabase
    .channel(`viewer:${sessionId}`)
    .on('presence', { event: 'sync' }, () => {
      // Count active viewers
    })
    .subscribe();

  return () => channel.unsubscribe();
}, []);
```

This shows actual concurrent viewers — much more impressive for social sharing.

---

## 5️⃣ File Structure Verification

Confirm all 20 files are present:

```
lpg-situation-deck/
├── app/
│   ├── page.tsx ✓
│   └── layout.tsx ✓
├── components/
│   ├── StatsHeader.tsx ✓
│   ├── IndiaLPGHeatmap.tsx ✓ (FIX #1)
│   ├── CityTable.tsx ✓
│   ├── LiveNewsPanel.tsx ✓
│   ├── UsageTrendChart.tsx ✓
│   └── ReportShortageForm.tsx ✓
├── lib/
│   ├── types.ts ✓
│   ├── supabase.ts ✓
│   └── utils.ts ✓
├── scraper/
│   ├── index.ts ✓
│   └── validate.ts ✓
├── supabase/
│   └── schema.sql ✓
├── .github/workflows/
│   └── scrape.yml ✓ (FIX #2)
├── package.json ✓
├── README.md ✓
├── IMPLEMENTATION_PLAN.md ✓
└── public/
    └── og-image.png (ADD in FIX #3)
```

---

## 🎯 Do These First (In Order)

1. **Apply Leaflet SSR fix** to `IndiaLPGHeatmap.tsx`
2. **Test locally:** `npm run dev` → map should render
3. **Verify GitHub Actions** has Playwright install step
4. **Push to GitHub** → all 20 files
5. **Create Supabase project** + run schema
6. **Deploy to Vercel**
7. **Add OG image** after deployment
8. (Optional) Add real viewer tracking

---

## Testing Checklist

- [ ] Leaflet map renders locally (not blank)
- [ ] Map renders on Vercel (not blank)
- [ ] GitHub Actions completes without "Chromium not found" error
- [ ] OG image shows in Twitter/WhatsApp share preview
- [ ] All 20 files visible in GitHub repo

---

**Questions?** See `IMPLEMENTATION_PLAN.md` for full details, or refer to `README.md` for setup steps.
