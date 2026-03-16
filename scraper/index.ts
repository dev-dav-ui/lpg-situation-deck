/**
 * LPG Situation Deck — Hybrid Scraper
 *
 * Sources (from Perplexity March 2026 research):
 *   1. GoodReturns.in — all-India city table (domestic 14.2kg + commercial 19kg)
 *   2. IOCL.com — metro current + historical prices
 *      - 2A. Current metro 19kg:  /indane-cooking-gas-overview
 *      - 2B. Historical 19kg:    /Indane-19Kg-Previous-Price
 *      - 2C. Historical 14.2kg:  /indane-14Kg-nonsubsid-previous-price
 *   3. RSS feeds — ET + LiveMint for news impact scoring
 *
 * Anomaly validation (>20% price / >200% wait) via validate.ts
 * Pushes to: city_data, state_summary, news_impact
 * Runs every 6h via GitHub Actions.
 */

import { type Page } from 'playwright';
import { chromium as stealthChromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createClient } from '@supabase/supabase-js';
import { validateScrapedData, logScraperRun, type ScrapedCity } from './validate';

stealthChromium.use(StealthPlugin());

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

// ── City → State mapping (for GoodReturns which doesn't include state) ───

const CITY_STATE_MAP: Record<string, string> = {
  'Delhi': 'Delhi',
  'New Delhi': 'Delhi',
  'Mumbai': 'Maharashtra',
  'Kolkata': 'West Bengal',
  'Chennai': 'Tamil Nadu',
  'Bangalore': 'Karnataka',
  'Bengaluru': 'Karnataka',
  'Hyderabad': 'Telangana',
  'Ahmedabad': 'Gujarat',
  'Pune': 'Maharashtra',
  'Jaipur': 'Rajasthan',
  'Lucknow': 'Uttar Pradesh',
  'Kanpur': 'Uttar Pradesh',
  'Nagpur': 'Maharashtra',
  'Patna': 'Bihar',
  'Indore': 'Madhya Pradesh',
  'Bhopal': 'Madhya Pradesh',
  'Thane': 'Maharashtra',
  'Visakhapatnam': 'Andhra Pradesh',
  'Surat': 'Gujarat',
  'Vadodara': 'Gujarat',
  'Ludhiana': 'Punjab',
  'Chandigarh': 'Chandigarh',
  'Agra': 'Uttar Pradesh',
  'Varanasi': 'Uttar Pradesh',
  'Madurai': 'Tamil Nadu',
  'Coimbatore': 'Tamil Nadu',
  'Kochi': 'Kerala',
  'Thiruvananthapuram': 'Kerala',
  'Guwahati': 'Assam',
  'Bhubaneswar': 'Odisha',
  'Ranchi': 'Jharkhand',
  'Dehradun': 'Uttarakhand',
  'Raipur': 'Chhattisgarh',
  'Amritsar': 'Punjab',
  'Allahabad': 'Uttar Pradesh',
  'Prayagraj': 'Uttar Pradesh',
  'Gwalior': 'Madhya Pradesh',
  'Jabalpur': 'Madhya Pradesh',
  'Jodhpur': 'Rajasthan',
  'Udaipur': 'Rajasthan',
  'Kota': 'Rajasthan',
  'Vijayawada': 'Andhra Pradesh',
  'Mysuru': 'Karnataka',
  'Mysore': 'Karnataka',
  'Hubli': 'Karnataka',
  'Mangalore': 'Karnataka',
  'Mangaluru': 'Karnataka',
  'Salem': 'Tamil Nadu',
  'Tiruchirappalli': 'Tamil Nadu',
  'Trichy': 'Tamil Nadu',
  'Noida': 'Uttar Pradesh',
  'Gurgaon': 'Haryana',
  'Gurugram': 'Haryana',
  'Faridabad': 'Haryana',
  'Ghaziabad': 'Uttar Pradesh',
  'Meerut': 'Uttar Pradesh',
  'Nashik': 'Maharashtra',
  'Aurangabad': 'Maharashtra',
  'Rajkot': 'Gujarat',
  'Dhanbad': 'Jharkhand',
  'Jammu': 'Jammu & Kashmir',
  'Srinagar': 'Jammu & Kashmir',
  'Shimla': 'Himachal Pradesh',
  'Gangtok': 'Sikkim',
  'Imphal': 'Manipur',
  'Shillong': 'Meghalaya',
  'Aizawl': 'Mizoram',
  'Kohima': 'Nagaland',
  'Itanagar': 'Arunachal Pradesh',
  'Agartala': 'Tripura',
  'Panaji': 'Goa',
  'Silvassa': 'Dadra & Nagar Haveli',
  'Daman': 'Daman & Diu',
  'Port Blair': 'Andaman & Nicobar',
  'Puducherry': 'Puducherry',
  'Pondicherry': 'Puducherry',
};

function resolveState(city: string): string {
  if (CITY_STATE_MAP[city]) return CITY_STATE_MAP[city];
  const normalized = Object.keys(CITY_STATE_MAP).find(
    k => k.toLowerCase() === city.toLowerCase()
  );
  return normalized ? CITY_STATE_MAP[normalized] : 'Unknown';
}

// ── 1. GoodReturns.in — Primary all-India source ────────────────
//
// Table: "Today's LPG Price in Indian Metro Cities & State Capitals"
// Columns: City | Domestic 14.2 kg | Commercial 19 kg
// Values like: "Rs.913.00 ( +60.00 )" — strip delta in parens

const GOODRETURNS_URL = 'https://www.goodreturns.in/lpg-price.html';

async function scrapeGoodReturns(page: Page): Promise<ScrapedCity[]> {
  const results: ScrapedCity[] = [];

  try {
    await page.goto(GOODRETURNS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Find any table with city price data — GoodReturns may load dynamically
    await page.waitForSelector('table', { timeout: 20000 });
    // Pick the largest table (most rows = city price table)
    const tables = page.locator('table');
    const tableCount = await tables.count();
    let bestTable = tables.first();
    let maxRows = 0;
    for (let t = 0; t < tableCount; t++) {
      const rowCount = await tables.nth(t).locator('tr').count();
      if (rowCount > maxRows) { maxRows = rowCount; bestTable = tables.nth(t); }
    }
    const cityRows = bestTable.locator('tr');
    const count = await cityRows.count();
    console.log(`  GoodReturns: found ${count} table rows`);

    for (let i = 1; i < count; i++) { // skip header
      const row = cityRows.nth(i);
      const cells = await row.locator('td').allInnerTexts();
      if (cells.length < 3) continue;
      const city = cells[0].trim();
      const domesticRaw = cells[1].trim();
      const commercialRaw = cells[2].trim();

      // Extract numeric part before '(' — e.g. "Rs.913.00 ( +60.00 )" → 913.00
      const domesticPrice = parseFloat(domesticRaw.split('(')[0].trim().replace(/[^\d.]/g, ''));
      const commercialPrice = parseFloat(commercialRaw.split('(')[0].trim().replace(/[^\d.]/g, ''));

      if (!city || city.toLowerCase() === 'city') continue; // Skip header row

      const state = resolveState(city);

      if (domesticPrice > 0) {
        results.push({
          city,
          state,
          cylinderType: 'domestic',
          waitDays: 0,
          price: domesticPrice,
        });
      }

      if (commercialPrice > 0) {
        results.push({
          city,
          state,
          cylinderType: 'commercial',
          waitDays: 0,
          price: commercialPrice,
        });
      }
    }

    console.log(`  GoodReturns: parsed ${results.length} price entries`);
  } catch (err) {
    console.error('  GoodReturns scrape failed:', err);
  }

  return results;
}

// ── 2. IOCL — Metro current + historical prices ─────────────────
//
// Structure (from Perplexity March 2026 analysis):
//   - 2A. Current 19kg overview: table under "Prices of Indane in Metros (Rs./19 kg cylinder)"
//         Columns: City | Current Price
//         + effective date text: "Applicable from March 7, 2026"
//   - 2B/2C. Historical tables: Date | Delhi | Kolkata | Mumbai | Chennai
//         records[0] = latest, records[1] = previous

const IOCL_URLS = {
  current19kg: 'https://iocl.com/indane-cooking-gas-overview',
  historical19kg: 'https://iocl.com/Indane-19Kg-Previous-Price',
  historical14kg: 'https://iocl.com/indane-14Kg-nonsubsid-previous-price',
};

interface IOCLCurrentRow {
  city: string;
  state: string;
  price: number;
  effectiveDate: string;
}

interface IOCLHistoricalRecord {
  date: string;
  delhi: number;
  kolkata: number;
  mumbai: number;
  chennai: number;
}

/** 2A. Current metro 19kg prices from IOCL overview page */
async function scrapeIOCLCurrent19kg(page: Page): Promise<IOCLCurrentRow[]> {
  const results: IOCLCurrentRow[] = [];

  try {
    await page.goto(IOCL_URLS.current19kg, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Two tables match — first is 19kg commercial, second is 14.2kg domestic
    const table = page.locator(
      'table:near(:text("Prices of Indane in Metros (Rs./19 kg cylinder)"), 200)'
    ).first();
    await table.waitFor({ timeout: 15000 });

    const rows = table.locator('tbody tr');
    const count = await rows.count();

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const city = (await row.locator('td:nth-child(1)').innerText()).trim();
      const currentPrice = (await row.locator('td:nth-child(2)').innerText()).trim();
      const price = parseFloat(currentPrice.replace(/[^\d.]/g, ''));

      if (city && price > 0) {
        results.push({
          city,
          state: resolveState(city),
          price,
          effectiveDate: '',
        });
      }
    }

    // Grab the effective date text
    try {
      const effectiveDateText = await page
        .locator('text=/Applicable from/i')
        .first()
        .innerText();
      for (const r of results) r.effectiveDate = effectiveDateText;
      console.log(`  IOCL current-19kg: ${results.length} metros, ${effectiveDateText}`);
    } catch {
      console.log(`  IOCL current-19kg: ${results.length} metros (no effective date found)`);
    }
  } catch (err) {
    console.error('  IOCL current-19kg scrape failed:', err);
  }

  return results;
}

/** 2B/2C. Historical table: Date | Delhi | Kolkata | Mumbai | Chennai */
async function scrapeIOCLHistorical(
  page: Page,
  url: string,
  label: string
): Promise<IOCLHistoricalRecord[]> {
  const records: IOCLHistoricalRecord[] = [];

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const table = page.locator('table').first();
    await table.waitFor({ timeout: 15000 });

    const rows = table.locator('tr');
    const count = await rows.count();

    for (let i = 1; i < count; i++) { // skip header row
      const row = rows.nth(i);
      const cells = await row.locator('td').allInnerTexts();
      if (cells.length < 5) continue;
      const dateStr = cells[0].trim();
      const delhi = parseFloat(cells[1].replace(/[^\d.]/g, ''));
      const kolkata = parseFloat(cells[2].replace(/[^\d.]/g, ''));
      const mumbai = parseFloat(cells[3].replace(/[^\d.]/g, ''));
      const chennai = parseFloat(cells[4].replace(/[^\d.]/g, ''));

      if (dateStr && delhi > 0) {
        records.push({ date: dateStr, delhi, kolkata, mumbai, chennai });
      }
    }

    // records[0] = latest, records[1] = previous
    console.log(`  IOCL ${label}: ${records.length} rows (latest: ${records[0]?.date || 'N/A'})`);
  } catch (err) {
    console.error(`  IOCL ${label} scrape failed:`, err);
  }

  return records;
}

/** Convert IOCL historical records → ScrapedCity entries for the latest row */
function ioclHistoricalToCities(
  records: IOCLHistoricalRecord[],
  cylinderType: 'domestic' | 'commercial'
): ScrapedCity[] {
  if (records.length === 0) return [];

  const latest = records[0];
  const metroData: [string, number][] = [
    ['Delhi', latest.delhi],
    ['Kolkata', latest.kolkata],
    ['Mumbai', latest.mumbai],
    ['Chennai', latest.chennai],
  ];

  return metroData
    .filter(([, price]) => price > 0)
    .map(([city, price]) => ({
      city,
      state: resolveState(city),
      cylinderType,
      waitDays: 0,
      price,
    }));
}

// ── 3. News Scraper (RSS + impact scoring) ───────────────────────

const NEWS_RSS_URLS = [
  'https://economictimes.indiatimes.com/industry/energy/oil-gas/rssfeeds/13358359.cms',
  'https://www.livemint.com/rss/industry',
];

interface NewsEntry {
  headline: string;
  impactPct: number;
  source: string;
  url: string;
}

const IMPACT_KEYWORDS: Record<string, number> = {
  'shortage': 15,
  'delay': 12,
  'hormuz': 25,
  'strait of hormuz': 28,
  'crisis': 20,
  'price hike': 18,
  'price increase': 15,
  'rationing': 22,
  'import': 10,
  'supply disruption': 20,
  'black market': 18,
  'hoarding': 15,
  'panic buying': 16,
  'queue': 12,
  'waiting': 10,
  'indane': 8,
  'bharat gas': 8,
  'hp gas': 8,
  'relief': -10,
  'price cut': -15,
  'price reduction': -12,
  'emergency supply': -12,
  'imports arrive': -8,
  'restored': -10,
  'normalised': -15,
  'normalized': -15,
  'resumed': -8,
  'subsidy': -5,
};

function scoreHeadline(headline: string): number {
  const lower = headline.toLowerCase();
  let score = 0;
  for (const [keyword, impact] of Object.entries(IMPACT_KEYWORDS)) {
    if (lower.includes(keyword)) score += impact;
  }
  return Math.max(-30, Math.min(30, score));
}

async function scrapeNews(): Promise<NewsEntry[]> {
  const entries: NewsEntry[] = [];

  for (const rssUrl of NEWS_RSS_URLS) {
    try {
      const res = await fetch(rssUrl, { signal: AbortSignal.timeout(10000) });
      const text = await res.text();
      const items = text.match(/<item>[\s\S]*?<\/item>/g) || [];
      const source = rssUrl.includes('economictimes') ? 'Economic Times' : 'LiveMint';

      for (const item of items.slice(0, 10)) {
        const titleMatch = item.match(/<title><!\[CDATA\[(.+?)\]\]><\/title>/) ||
                           item.match(/<title>(.+?)<\/title>/);

        // Extract link — may be plain text or CDATA-wrapped; strip wrapper either way
        const rawLink = item.match(/<link><!\[CDATA\[(.+?)\]\]><\/link>/)?.[1]
                     || item.match(/<link>([^<]+)<\/link>/)?.[1]
                     || item.match(/<guid[^>]*>([^<]+)<\/guid>/)?.[1]
                     || null;
        // Strip any residual CDATA wrapper that wasn't caught by the regex
        const cleanLink = rawLink
          ? rawLink.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim()
          : null;

        if (titleMatch) {
          const headline = titleMatch[1].trim();
          const lower = headline.toLowerCase();
          if (
            lower.includes('lpg') || lower.includes('gas cylinder') ||
            lower.includes('cooking gas') || lower.includes('petroleum') ||
            lower.includes('hormuz') || lower.includes('oil price') ||
            lower.includes('indane') || lower.includes('bharat gas') ||
            lower.includes('hp gas')
          ) {
            entries.push({
              headline,
              impactPct: scoreHeadline(headline),
              source,
              url: cleanLink || rssUrl,
            });
          }
        }
      }
    } catch (err) {
      console.error(`  RSS fetch failed for ${rssUrl}:`, err);
    }
  }

  return entries;
}

// ── Supabase Upserts ─────────────────────────────────────────────

async function upsertCityData(cities: ScrapedCity[]) {
  let updated = 0;

  for (const city of cities) {
    const { data: existing } = await supabase
      .from('city_data')
      .select('price_per_cylinder, wait_days')
      .eq('city', city.city)
      .eq('state', city.state)
      .eq('cylinder_type', city.cylinderType)
      .single();

    const priceChange = existing
      ? city.price - Number(existing.price_per_cylinder)
      : 0;

    const waitDays = city.waitDays > 0
      ? city.waitDays
      : (existing?.wait_days || 0);

    const { error } = await supabase.from('city_data').upsert(
      {
        city: city.city,
        state: city.state,
        cylinder_type: city.cylinderType,
        wait_days: waitDays,
        price_per_cylinder: city.price,
        price_change: priceChange,
        shortage_pct: waitDays > 15
          ? Math.min(40, waitDays * 1.5)
          : Math.max(0, waitDays * 0.8),
        last_updated: new Date().toISOString(),
        source: 'scraper',
      },
      { onConflict: 'city,state,cylinder_type' }
    );

    if (!error) updated++;
  }

  console.log(`  Upserted ${updated}/${cities.length} city records`);
}

async function upsertNews(entries: NewsEntry[]) {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentNews } = await supabase
    .from('news_impact')
    .select('headline')
    .gte('created_at', yesterday);

  const existingHeadlines = new Set(
    recentNews?.map(n => n.headline.toLowerCase()) || []
  );

  const newEntries = entries.filter(
    e => !existingHeadlines.has(e.headline.toLowerCase())
  );

  if (newEntries.length > 0) {
    await supabase.from('news_impact').insert(
      newEntries.map(e => ({
        headline: e.headline,
        impact_pct: e.impactPct,
        source: e.source,
        url: e.url,
      }))
    );
  }

  console.log(`  News: ${newEntries.length} new, ${entries.length - newEntries.length} dupes skipped`);
}

async function updateStateSummary() {
  const { data: cities } = await supabase.from('city_data').select('*');
  if (!cities) return;

  const stateMap = new Map<
    string,
    { totalWait: number; totalShortage: number; count: number }
  >();

  for (const city of cities) {
    const state = city.state;
    const entry = stateMap.get(state) || { totalWait: 0, totalShortage: 0, count: 0 };
    entry.totalWait += city.wait_days;
    entry.totalShortage += Number(city.shortage_pct);
    entry.count += 1;
    stateMap.set(state, entry);
  }

  for (const [state, data] of stateMap) {
    await supabase.from('state_summary').upsert(
      {
        state_name: state,
        avg_wait_days: Math.round((data.totalWait / data.count) * 10) / 10,
        shortage_pct: Math.round((data.totalShortage / data.count) * 10) / 10,
        total_cities: data.count,
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'state_name' }
    );
  }
}

// ── Main Pipeline ────────────────────────────────────────────────

async function main() {
  console.log('=== LPG Situation Deck — Hybrid Scraper ===');
  console.log(`Started: ${new Date().toISOString()}\n`);

  let totalScraped = 0;
  let totalAnomalies = 0;
  const browser = await stealthChromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept-Language': 'en-IN,en;q=0.9',
    });

    // ── Step 1: GoodReturns (primary — all-India cities) ──
    console.log('[1/5] Scraping GoodReturns.in (all-India city prices)...');
    const goodReturnsData = await scrapeGoodReturns(page);

    // ── Step 2: IOCL current metro 19kg ──
    console.log('\n[2/5] Scraping IOCL current metro 19kg prices...');
    const ioclCurrent = await scrapeIOCLCurrent19kg(page);

    // ── Step 3: IOCL historical prices ──
    console.log('\n[3/5] Scraping IOCL historical prices...');
    const ioclHist19 = await scrapeIOCLHistorical(
      page,
      IOCL_URLS.historical19kg,
      'historical-19kg'
    );
    const ioclHist14 = await scrapeIOCLHistorical(
      page,
      IOCL_URLS.historical14kg,
      'historical-14kg'
    );
    console.log(
      `  Historical totals: ${ioclHist19.length} (19kg) + ${ioclHist14.length} (14.2kg)`
    );

    // ── Merge: GoodReturns primary, IOCL overrides for metros ──
    const mergedMap = new Map<string, ScrapedCity>();

    // Load all GoodReturns data first
    for (const entry of goodReturnsData) {
      const key = `${entry.city}|${entry.state}|${entry.cylinderType}`;
      mergedMap.set(key, entry);
    }

    // Overlay IOCL current 19kg for metro cities (more authoritative)
    for (const row of ioclCurrent) {
      const key = `${row.city}|${row.state}|commercial`;
      mergedMap.set(key, {
        city: row.city,
        state: row.state,
        cylinderType: 'commercial',
        waitDays: 0,
        price: row.price,
      });
    }

    // Overlay IOCL historical latest for metros (if GoodReturns missed them)
    const hist19cities = ioclHistoricalToCities(ioclHist19, 'commercial');
    const hist14cities = ioclHistoricalToCities(ioclHist14, 'domestic');

    for (const entry of [...hist19cities, ...hist14cities]) {
      const key = `${entry.city}|${entry.state}|${entry.cylinderType}`;
      if (!mergedMap.has(key)) {
        mergedMap.set(key, entry);
      }
    }

    const allCities = Array.from(mergedMap.values());
    console.log(`\n  Merged total: ${allCities.length} entries`);

    // ── Step 4: Validate ──
    console.log('\n[4/5] Validating scraped data...');
    let validCities: ScrapedCity[] = allCities;
    try {
      const { valid, anomalies } = await validateScrapedData(allCities);
      totalScraped = valid.length;
      totalAnomalies = anomalies.length;
      validCities = valid;

      if (anomalies.length > 0) {
        console.warn(`  ⚠ ${anomalies.length} anomalies:`);
        for (const a of anomalies) {
          console.warn(`    - ${a.city.city} (${a.city.state}): ${a.reason}`);
        }
      }
    } catch (err) {
      console.error('  Validation failed, proceeding with all scraped cities:', err);
      totalScraped = allCities.length;
      validCities = allCities;
    }

    // Drop rows where state resolved to Unknown — these are state-level
    // aggregates scraped from GoodReturns state pages, not real city rows.
    const knownCities = validCities.filter(c => c.state !== 'Unknown');
    const unknownCount = validCities.length - knownCities.length;
    if (unknownCount > 0) {
      console.log(`  Dropped ${unknownCount} rows with state=Unknown (state-level aggregates)`);
    }

    if (knownCities.length > 0) {
      await upsertCityData(knownCities);
    }

    await updateStateSummary();
    console.log('  State summaries updated');

    // ── Step 5: News ──
    console.log('\n[5/5] Scraping news...');
    const news = await scrapeNews();
    await upsertNews(news);

    await logScraperRun(
      totalAnomalies > 0 ? 'anomaly' : 'success',
      totalScraped,
      totalAnomalies
    );

    console.log(
      `\n=== Done. ${totalScraped} cities updated, ${totalAnomalies} anomalies ===`
    );
  } catch (err) {
    console.error('\nScraper failed:', err);
    await logScraperRun('failed', totalScraped, totalAnomalies, String(err));
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
