'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { supabase } from '@/lib/supabase';

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

const fallbackSignals: Signal[] = [
  { headline: 'Hormuz tensions escalate — commercial LPG imports delayed', impactPct: 25 },
  { headline: 'PPAC reports 18% drop in commercial cylinder refills this week', impactPct: 12 },
  { headline: 'Delhi govt prioritises domestic over hotels', impactPct: -8 },
  { headline: 'IOC announces emergency LPG shipment from Saudi Arabia', impactPct: -15 },
  { headline: 'Restaurant associations demand commercial LPG quota increase', impactPct: 5 },
];

export default function LiveNewsPanel() {
  const [signals, setSignals] = useState<Signal[]>(fallbackSignals);
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
        setSignals(deduped.slice(0, 5));
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

      <div className="space-y-2.5">
        {signals.slice(0, 5).map((item, i) => {
          const impact    = getImpact(item.impactPct);
          const direction = getDirection(item.impactPct);
          const region    = inferRegion(item.headline);

          return (
            <div key={i} className="bg-zinc-950 rounded-2xl p-3 border border-zinc-800 hover:border-zinc-700 transition-colors">
              {/* Top row: impact badge + direction */}
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${impact.style}`}>
                  {impact.label}
                </span>
                <span className={`flex items-center gap-0.5 text-[10px] font-medium ${direction.color}`}>
                  {direction.icon}
                  {direction.label}
                </span>
                {region && (
                  <span className="ml-auto text-[10px] text-zinc-600 truncate max-w-[80px]">{region}</span>
                )}
              </div>

              {/* Headline */}
              <p className="text-xs leading-relaxed text-zinc-200">{item.headline}</p>

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
