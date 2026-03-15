'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { shownNewsKeys, newsKey } from '@/lib/newsDedup';

interface Signal {
  headline: string;
  impactPct: number;
  source?: string;
  url?: string;
  createdAt?: string;
}

// Derive impact level from numeric score
function getImpact(pct: number): { label: string; style: string; bar: string } {
  const abs = Math.abs(pct);
  if (abs >= 18) return { label: 'High',   style: 'text-red-400 bg-red-500/10 border-red-500/30',     bar: 'bg-red-500' };
  if (abs >= 8)  return { label: 'Medium', style: 'text-amber-400 bg-amber-500/10 border-amber-500/30', bar: 'bg-amber-400' };
  return              { label: 'Low',    style: 'text-zinc-400 bg-zinc-700/30 border-zinc-600/30',    bar: 'bg-zinc-500' };
}

// Derive supply direction from sign
function getDirection(pct: number): { label: string; icon: React.ReactNode; color: string } {
  if (pct > 3)  return { label: 'Tightening', icon: <TrendingUp  size={12} />, color: 'text-red-400' };
  if (pct < -3) return { label: 'Easing',     icon: <TrendingDown size={12} />, color: 'text-green-400' };
  return              { label: 'Stable',      icon: <Minus        size={12} />, color: 'text-zinc-400' };
}

// Infer region from headline keywords
const REGION_KEYWORDS: [string, string][] = [
  ['delhi',        'Delhi'],
  ['mumbai',       'Mumbai'],
  ['chennai',      'Chennai'],
  ['bengaluru',    'Bengaluru'],
  ['kolkata',      'Kolkata'],
  ['north india',  'North India'],
  ['south india',  'South India'],
  ['hormuz',       'Import Routes'],
  ['saudi',        'Import Routes'],
  ['iocl',         'All India'],
  ['ppac',         'All India'],
  ['indane',       'All India'],
  ['hp gas',       'All India'],
  ['bharat gas',   'All India'],
];

function inferRegion(headline: string): string | null {
  const lower = headline.toLowerCase();
  for (const [kw, region] of REGION_KEYWORDS) {
    if (lower.includes(kw)) return region;
  }
  return null;
}

function formatRelativeTime(dateStr: string): string {
  const diffH = Math.round((Date.now() - new Date(dateStr).getTime()) / 3600000);
  if (diffH < 1) return 'just now';
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

// No hardcoded fallback — show empty state when DB is unavailable
const fallbackSignals: Signal[] = [];

export default function LiveNewsPanel() {
  const [signals, setSignals] = useState<Signal[]>(() => {
    // Register fallback keys immediately so GlobalSupplySignals can filter on first render
    fallbackSignals.forEach(s => shownNewsKeys.add(newsKey(s.url, s.headline)));
    return fallbackSignals;
  });
  const [isLive, setIsLive]   = useState(false);

  useEffect(() => {
    const fetchNews = async () => {
      const { data } = await supabase
        .from('news_impact')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      if (data && data.length > 0) {
        setIsLive(true);
        // Deduplicate by headline (normalised) then by url
        const seen = new Set<string>();
        const deduped = data
          .map((d: any) => ({
            headline:  d.headline,
            impactPct: Number(d.impact_pct),
            source:    d.source,
            url:       d.url,
            createdAt: d.created_at,
          }))
          .filter((item: Signal) => {
            const key = (item.url || item.headline.toLowerCase().trim());
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        const final = deduped.slice(0, 5);
        // Register keys so GlobalSupplySignals can skip these
        shownNewsKeys.clear();
        final.forEach(item => shownNewsKeys.add(newsKey(item.url, item.headline)));
        setSignals(final);
      }
    };
    fetchNews();

    const channel = supabase
      .channel('news-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'news_impact' }, fetchNews)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
      <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm">
        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        BREAKING SUPPLY SIGNALS
        {!isLive && (
          <span className="text-xs bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2 py-0.5 rounded-full font-normal">
            early supply signals
          </span>
        )}
      </h3>

      {signals.length === 0 && (
        <p className="text-xs text-zinc-600 text-center py-6">No verified signals available right now</p>
      )}

      <div className="space-y-2.5">
        {signals.slice(0, 5).map((item, i) => {
          const region = inferRegion(item.headline);

          return (
            <div key={i} className="bg-zinc-950 rounded-2xl p-3 border border-zinc-800 hover:border-zinc-700 transition-colors">
              {/* Region tag */}
              {region && (
                <div className="mb-1.5">
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wider">{region}</span>
                </div>
              )}

              {/* Headline */}
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs leading-relaxed text-zinc-200 hover:text-white hover:underline underline-offset-2 transition-colors block"
                >
                  {item.headline}
                </a>
              ) : (
                <p className="text-xs leading-relaxed text-zinc-200">{item.headline}</p>
              )}

              {/* Bottom row: source + time */}
              {(item.source || item.createdAt) && (
                <div className="flex items-center gap-2 mt-1.5">
                  {item.source && <span className="text-[10px] text-zinc-600">{item.source}</span>}
                  {item.createdAt && (
                    <span className="text-[10px] text-zinc-700 ml-auto">{formatRelativeTime(item.createdAt)}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
