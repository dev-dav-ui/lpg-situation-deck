import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const RSS_FEEDS = [
  { url: 'https://economictimes.indiatimes.com/industry/energy/rssfeeds/13357927.cms', source: 'Economic Times' },
  { url: 'https://www.livemint.com/rss/industry', source: 'Livemint' },
];

const KEYWORDS = [
  'lpg', 'gas cylinder', 'cooking gas', 'oil marketing',
  'indane', 'bharatgas', 'hp gas', 'subsidy',
];

interface NewsItem {
  title: string;
  url: string;
  source: string;
  published_at: string | null;
  summary: string | null;
}

function extractTag(xml: string, tag: string): string {
  const cdataMatch = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[(.*?)\\]\\]></${tag}>`, 'is').exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();
  const match = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'is').exec(xml);
  if (!match) return '';
  // Strip HTML tags, then strip any residual CDATA wrapper
  return match[1]
    .replace(/<[^>]+>/g, '')
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/, '')
    .trim();
}

function parseItems(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, 'title');
    const url = extractTag(block, 'link') || extractTag(block, 'guid');
    const summary = extractTag(block, 'description');
    const pubDate = extractTag(block, 'pubDate');

    if (!title || !url) continue;

    items.push({
      title,
      url,
      source,
      published_at: pubDate ? new Date(pubDate).toISOString() : null,
      summary: summary || null,
    });
  }
  return items;
}

function isLPGRelated(item: NewsItem): boolean {
  const text = `${item.title} ${item.summary ?? ''}`.toLowerCase();
  return KEYWORDS.some(kw => text.includes(kw));
}

async function fetchFeed(feedUrl: string, source: string): Promise<NewsItem[]> {
  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LPGBot/1.0)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${feedUrl}`);
  const xml = await res.text();
  return parseItems(xml, source);
}

async function main() {
  let totalFetched = 0;
  let totalFiltered = 0;
  let totalInserted = 0;

  for (const feed of RSS_FEEDS) {
    let items: NewsItem[] = [];
    try {
      items = await fetchFeed(feed.url, feed.source);
      console.log(`[${feed.source}] Fetched ${items.length} items`);
      totalFetched += items.length;
    } catch (err) {
      console.error(`[${feed.source}] Failed to fetch: ${err}`);
      continue;
    }

    const filtered = items.filter(isLPGRelated);
    console.log(`[${feed.source}] Filtered ${filtered.length} LPG items`);
    totalFiltered += filtered.length;

    if (filtered.length === 0) continue;

    const { data, error } = await supabase
      .from('news')
      .upsert(filtered, { onConflict: 'url', ignoreDuplicates: true })
      .select('id');

    if (error) {
      console.error(`[${feed.source}] Insert error: ${error.message}`);
    } else {
      const inserted = data?.length ?? 0;
      console.log(`[${feed.source}] Inserted ${inserted} rows`);
      totalInserted += inserted;
    }
  }

  console.log(`\nSummary: Fetched ${totalFetched} items | Filtered ${totalFiltered} LPG items | Inserted ${totalInserted} rows`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
