'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Globe } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { shownNewsKeys, newsKey } from '@/lib/newsDedup';

interface Signal {
  headline: string;
  impactPct: number;
  source?: string;
  createdAt?: string;
}

// ── Helpers (same logic as LiveNewsPanel) ─────────────────────────
function getImpact(pct: number): { label: string; badge: string; bar: string } {
  const abs = Math.abs(pct);
  if (abs >= 18) return { label: 'High',   badge: 'text-red-400 bg-red-500/10 border-red-500/30',     bar: 'bg-red-500' };
  if (abs >= 8)  return { label: 'Medium', badge: 'text-amber-400 bg-amber-500/10 border-amber-500/30', bar: 'bg-amber-400' };
  return              { label: 'Low',    badge: 'text-zinc-400 bg-zinc-700/30 border-zinc-600/30',    bar: 'bg-zinc-500' };
}

function getDirection(pct: number): { label: string; icon: React.ReactNode; color: string } {
  if (pct > 3)  return { label: 'Tightening', icon: <TrendingUp  size={11} />, color: 'text-red-400' };
  if (pct < -3) return { label: 'Easing',     icon: <TrendingDown size={11} />, color: 'text-green-400' };
  return              { label: 'Stable',      icon: <Minus        size={11} />, color: 'text-zinc-400' };
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

// Static fallback signals — covers all required example categories
const FALLBACK: Signal[] = [
  {
    headline:  'Strait of Hormuz traffic disruption reduces LPG tanker throughput by ~12%',
    impactPct: 22,
    source:    'Shipping Intelligence',
  },
  {
    headline:  'Saudi Aramco raises CP (Contract Price) for propane by $40/MT for Q2',
    impactPct: 18,
    source:    'ICIS Energy',
  },
  {
    headline:  'Reliance Jamnagar refinery scheduled maintenance — reduced LPG output expected for 3 weeks',
    impactPct: 14,
    source:    'Upstream Intelligence',
  },
  {
    headline:  'Red Sea diversions add 12–14 days to Europe-origin LPG cargo delivery times',
    impactPct: 16,
    source:    'Baltic Exchange',
  },
  {
    headline:  'VLGC freight rates ease 8% as Middle East export volumes normalise',
    impactPct: -9,
    source:    'Argus Media',
  },
];

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
          impactPct: Number(d.impact_pct),
          source:    d.source,
          createdAt: d.created_at,
        }))
        .filter((item: Signal) => {
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
          const impact    = getImpact(item.impactPct);
          const direction = getDirection(item.impactPct);

          return (
            <div
              key={i}
              className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-3 transition-colors flex flex-col gap-1.5"
            >
              {/* Badges row */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${impact.badge}`}>
                  {impact.label}
                </span>
                <span className={`flex items-center gap-0.5 text-[10px] font-medium ${direction.color}`}>
                  {direction.icon}
                  {direction.label}
                </span>
                {/* impact bar */}
                <div className="ml-auto flex items-center gap-0.5">
                  <div className="w-10 h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${impact.bar}`}
                      style={{ width: `${Math.min(100, Math.abs(item.impactPct) * 3)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-500 w-7 text-right">
                    {item.impactPct > 0 ? '+' : ''}{item.impactPct}%
                  </span>
                </div>
              </div>

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
