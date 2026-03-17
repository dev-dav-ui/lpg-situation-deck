'use client';

import { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface SignalLine {
  scope: string;
  text: string;
}

interface Props {
  minimal?: boolean;
}

// Safe dynamic status based on actual signals
function getDynamicStatus(waitDays: number, shortagePct: number): string {
  if (waitDays >= 10 || shortagePct >= 25) return 'High delay';
  if (waitDays >= 5 || shortagePct >= 15) return 'Moderate pressure';
  return 'Normal';
}

export default function SignalMonitorPanel({ minimal = false }: Props) {
  const [lines, setLines] = useState<SignalLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const build = async () => {
      const result: SignalLine[] = [];

      // Fetch recently-updated cities
      const { data: cities } = await supabase
        .from('city_data')
        .select('city, last_updated, wait_days, shortage_pct')
        .neq('state', 'Unknown')
        .order('last_updated', { ascending: false })
        .limit(20);

      if (cities && cities.length > 0) {
        const seen = new Set<string>();
        const unique: any[] = [];
        for (const row of cities) {
          if (!seen.has(row.city)) {
            seen.add(row.city);
            unique.push(row);
          }
          if (unique.length === 5) break;
        }

        unique.forEach((row) => {
          result.push({
            scope: row.city,
            text:  getDynamicStatus(Number(row.wait_days), Number(row.shortage_pct)),
          });
        });
      }

      // National context
      if (result.length < 5) {
        const { data: news } = await supabase
          .from('news_impact')
          .select('headline')
          .order('created_at', { ascending: false })
          .limit(1);

        if (news && news.length > 0) {
          result.push({
            scope: 'National',
            text:  news[0].headline,
          });
        }
      }

      if (result.length > 0) setLines(result.slice(0, 5));
      setReady(true);
    };

    build();
  }, []);

  if (!ready || lines.length === 0) return null;

  if (minimal) {
    return (
      <div className="space-y-1.5 px-1">
        {lines.map((line, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px] min-w-0">
            <span className="w-1 h-1 rounded-full shrink-0 bg-zinc-700" />
            <span className="text-zinc-500 font-bold truncate shrink-0">{line.scope}</span>
            <span className="text-zinc-800 shrink-0">—</span>
            <span className="font-medium text-zinc-600 truncate">{line.text}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Radio size={13} className="text-cyan-400" />
        <h3 className="text-xs font-bold uppercase tracking-[2px] text-zinc-300">
          Live Signal Monitor
        </h3>
        <span className="ml-auto text-[10px] text-zinc-600 uppercase tracking-wider">Interpreted signals</span>
      </div>

      <div className="space-y-3">
        {lines.map((line, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-zinc-700" />
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-zinc-400 text-xs font-bold truncate">{line.scope}</span>
              <span className="text-zinc-600 text-xs">—</span>
              <span className="text-xs font-medium text-zinc-500 truncate">{line.text}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-zinc-700 mt-4 pt-3 border-t border-zinc-800">
        System-interpreted signals. Field verification may be limited.
      </p>
    </div>
  );
}
