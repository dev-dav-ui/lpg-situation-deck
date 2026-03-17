'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { shownNewsKeys, newsKey } from '@/lib/newsDedup';

interface Signal {
  headline: string;
  impactPct: number;
  source?: string;
  url?: string;
  createdAt?: string;
}

interface Props {
  variant?: 'default' | 'ticker';
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

export default function LiveNewsPanel({ variant = 'default' }: Props) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLive, setIsLive]   = useState(false);

  useEffect(() => {
    const fetchNews = async () => {
      const { data } = await supabase
        .from('news_impact')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (data && data.length > 0) {
        setIsLive(true);
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
            if (!item.url || !item.url.startsWith('https://')) return false;
            const key = (item.url || item.headline.toLowerCase().trim());
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        const final = deduped.slice(0, 10);
        shownNewsKeys.clear();
        final.forEach(item => shownNewsKeys.add(newsKey(item.url, item.headline)));
        setSignals(final);
      }
    };
    fetchNews();

    const channel = supabase
      .channel('news-updates-panel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'news_impact' }, fetchNews)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (signals.length === 0) return null;

  if (variant === 'ticker') {
    return (
      <div className="mt-auto border-t border-zinc-900 bg-black/40 py-2 overflow-hidden flex items-center gap-4 shrink-0">
        <div className="px-3 border-r border-zinc-800 flex items-center gap-2 shrink-0">
          <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 whitespace-nowrap">LIVE NEWS</span>
        </div>
        <div className="flex gap-12 animate-marquee whitespace-nowrap min-w-full">
          {signals.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" 
               className="text-[10px] font-bold text-zinc-500 hover:text-cyan-400 transition-colors flex items-center gap-2">
              <span className="text-zinc-700">/</span> {s.headline}
            </a>
          ))}
          {/* Duplicate for seamless loop if needed, but for simple ticker we just let it run */}
        </div>
        <style jsx>{`
          @keyframes marquee {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .animate-marquee {
            display: flex;
            animation: marquee 60s linear infinite;
          }
          .animate-marquee:hover {
            animation-play-state: paused;
          }
        `}</style>
      </div>
    );
  }

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

      <div className="space-y-2.5">
        {signals.slice(0, 5).map((item, i) => {
          const region = inferRegion(item.headline);
          return (
            <div key={i} className="bg-zinc-950 rounded-2xl p-3 border border-zinc-800 hover:border-zinc-700 transition-colors">
              {region && (
                <div className="mb-1.5">
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wider">{region}</span>
                </div>
              )}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs leading-relaxed text-zinc-200 hover:text-white hover:underline underline-offset-2 transition-colors block"
              >
                {item.headline}
              </a>
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
