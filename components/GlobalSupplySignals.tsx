'use client';

import { useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { shownNewsKeys, newsKey } from '@/lib/newsDedup';

interface Signal {
  headline: string;
  source?: string;
  createdAt?: string;
}

function formatRelativeTime(dateStr: string): string {
  const diffH = Math.round((Date.now() - new Date(dateStr).getTime()) / 3_600_000);
  if (diffH < 1) return 'just now';
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

// Keywords that indicate a global/macro supply signal
const GLOBAL_KEYWORDS = [
  'hormuz', 'red sea', 'saudi', 'opec', 'iran', 'kuwait', 'qatar',
  'tanker', 'shipping', 'freight', 'cargo', 'vessel', 'lng', 'naphtha',
  'refinery', 'maintenance', 'import', 'export', 'propane', 'butane',
  'global', 'international', 'suez', 'oman', 'uae', 'abu dhabi',
];

function isGlobal(headline: string): boolean {
  const lower = headline.toLowerCase();
  return GLOBAL_KEYWORDS.some(kw => lower.includes(kw));
}

// No hardcoded fallback — show empty state when DB is unavailable
const FALLBACK: Signal[] = [];

export default function GlobalSupplySignals() {
  const [signals, setSignals] = useState<Signal[]>(() =>
    FALLBACK.filter(s => !shownNewsKeys.has(newsKey(undefined, s.headline)))
  );
  const [isLive, setIsLive]   = useState(false);

  useEffect(() => {
    const fetchGlobal = async () => {
      const { data } = await supabase
        .from('news_impact')
        .select('headline, impact_pct, source, created_at')
        .order('created_at', { ascending: false })
        .limit(50); // fetch more so we have enough after filtering

      if (!data || data.length === 0) return;

      const seen = new Set<string>();
      const global = data
        .filter((d: any) => isGlobal(d.headline))
        .map((d: any) => ({
          headline:  d.headline,
          source:    d.source,
          url:       d.url,
          createdAt: d.created_at,
        }))
        .filter((item: Signal) => {
          // Requirement: Only show news with valid external HTTPS URLs
          if (!item.url || !item.url.startsWith('https://')) return false;

          const key = newsKey(undefined, item.headline);
          // Skip if already shown in LiveNewsPanel
          if (shownNewsKeys.has(key)) return false;
          // Skip within-panel duplicates
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 5);

      if (global.length > 0) {
        setSignals(global);
        setIsLive(true);
      }
    };

    fetchGlobal();

    const channel = supabase
      .channel('global-signals')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'news_impact' }, fetchGlobal)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (signals.length === 0) return null;

  return (
    <div className="mt-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Globe size={14} className="text-cyan-400" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Global Supply Signals
        </h3>
        {!isLive && (
          <span className="text-[10px] bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2 py-0.5 rounded-full">
            early supply signals
          </span>
        )}
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {signals.map((item, i) => {

          return (
            <div
              key={i}
              className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-3 transition-colors flex flex-col gap-1.5"
            >
              {/* Headline */}
              <p className="text-xs leading-relaxed text-zinc-200 line-clamp-2">{item.headline}</p>

              {/* Source / time */}
              {(item.source || item.createdAt) && (
                <div className="flex items-center gap-2 mt-auto pt-0.5">
                  {item.source && (
                    <span className="text-[10px] text-zinc-600 truncate">{item.source}</span>
                  )}
                  {item.createdAt && (
                    <span className="text-[10px] text-zinc-700 ml-auto shrink-0">
                      {formatRelativeTime(item.createdAt)}
                    </span>
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
