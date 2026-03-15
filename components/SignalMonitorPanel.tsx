'use client';

import { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface SignalLine {
  scope: string;
  text: string;
  level: 'severe' | 'elevated' | 'moderate' | 'stable' | 'news';
}

function delayText(waitDays: number): string {
  if (waitDays >= 10) return 'severe delivery delay signals observed';
  if (waitDays >= 6)  return 'delivery delay signals increasing';
  if (waitDays >= 3)  return 'mild delay signals detected';
  return 'supply signals stable';
}

function stressLevel(shortagePct: number): SignalLine['level'] {
  if (shortagePct >= 25) return 'severe';
  if (shortagePct >= 15) return 'elevated';
  if (shortagePct >= 8)  return 'moderate';
  return 'stable';
}

const LEVEL_COLOR: Record<SignalLine['level'], string> = {
  severe:   'text-red-400',
  elevated: 'text-amber-400',
  moderate: 'text-yellow-400',
  stable:   'text-green-400',
  news:     'text-zinc-400',
};

const LEVEL_DOT: Record<SignalLine['level'], string> = {
  severe:   'bg-red-500',
  elevated: 'bg-amber-400',
  moderate: 'bg-yellow-400',
  stable:   'bg-green-500',
  news:     'bg-zinc-500',
};

export default function SignalMonitorPanel() {
  const [lines, setLines]   = useState<SignalLine[]>([]);
  const [ready, setReady]   = useState(false);

  useEffect(() => {
    const build = async () => {
      const result: SignalLine[] = [];

      // Top 4 most-stressed cities from city_data
      const { data: cities } = await supabase
        .from('city_data')
        .select('city, wait_days, shortage_pct')
        .neq('state', 'Unknown')
        .order('shortage_pct', { ascending: false })
        .limit(40); // fetch enough to dedupe by city

      if (cities && cities.length > 0) {
        // One row per city — take worst shortage_pct
        const perCity = new Map<string, { waitDays: number; shortagePct: number }>();
        for (const row of cities) {
          const key = row.city as string;
          const existing = perCity.get(key);
          if (!existing || Number(row.shortage_pct) > existing.shortagePct) {
            perCity.set(key, { waitDays: Number(row.wait_days), shortagePct: Number(row.shortage_pct) });
          }
        }

        const sorted = Array.from(perCity.entries())
          .sort((a, b) => b[1].shortagePct - a[1].shortagePct)
          .slice(0, 4);

        for (const [city, { waitDays, shortagePct }] of sorted) {
          result.push({
            scope: city,
            text:  delayText(waitDays),
            level: stressLevel(shortagePct),
          });
        }
      }

      // Latest news headline as national signal context
      const { data: news } = await supabase
        .from('news_impact')
        .select('headline')
        .order('created_at', { ascending: false })
        .limit(1);

      if (news && news.length > 0) {
        result.push({
          scope: 'National',
          text:  news[0].headline,
          level: 'news',
        });
      }

      if (result.length > 0) {
        setLines(result);
      }
      setReady(true);
    };

    build();
  }, []);

  if (!ready) return null;
  if (lines.length === 0) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Radio size={13} className="text-cyan-400" />
        <h3 className="text-xs font-bold uppercase tracking-[2px] text-zinc-300">
          Live Signal Monitor
        </h3>
        <span className="ml-auto text-[10px] text-zinc-600 uppercase tracking-wider">Interpreted signals</span>
      </div>

      {/* Signal lines */}
      <div className="space-y-3">
        {lines.map((line, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${LEVEL_DOT[line.level]}`} />
            <div className="min-w-0">
              <span className="text-zinc-500 text-xs font-medium mr-1.5">{line.scope}</span>
              <span className={`text-xs leading-relaxed ${LEVEL_COLOR[line.level]}`}>{line.text}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-zinc-700 mt-4 pt-3 border-t border-zinc-800">
        Interpretations based on system-observed delay and stress signals. Not verified field reports.
      </p>
    </div>
  );
}
