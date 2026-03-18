'use client';

import { useEffect, useState } from 'react';
import { Sparkles, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatRelativeTime } from '@/lib/utils';

interface Briefing {
  summary: string;
  generated_at: string;
}

interface CityAIBriefingProps {
  city: string;
  minimal?: boolean;
  ultraMinimal?: boolean;
}

export default function CityAIBriefing({ city, minimal = false, ultraMinimal = false }: CityAIBriefingProps) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!city) return;

    const fetchBriefing = async () => {
      const { data, error } = await supabase
        .from('city_briefings')
        .select('summary, generated_at')
        .eq('city', city)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();

      if (!error && data) {
        setBriefing(data);
      } else {
        setBriefing(null);
      }
      setLoading(false);
    };

    fetchBriefing();
  }, [city]);

  if (loading || !briefing || !city) return null;

  if (ultraMinimal) {
    return (
      <div className="flex items-center gap-2 text-[10px] min-w-0">
        <Sparkles size={10} className="text-cyan-500 shrink-0" />
        <span className="text-zinc-500 font-bold uppercase tracking-wider shrink-0">{city}:</span>
        <p className="text-zinc-400 font-medium truncate">{briefing.summary}</p>
      </div>
    );
  }

  if (minimal) {
    return (
      <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-xl px-3 py-2 flex items-center gap-3">
        <Sparkles size={12} className="text-cyan-500 shrink-0" />
        <p className="text-[11px] font-bold text-zinc-300 leading-tight truncate">
          {city}: {briefing.summary}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500/30 to-transparent" />
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={13} className="text-cyan-400" />
        <h3 className="text-[10px] font-bold uppercase tracking-[3px] text-zinc-400">
          AI Signal Briefing — {city}
        </h3>
        <span className="ml-auto text-[10px] text-zinc-600 flex items-center gap-1 uppercase tracking-wider">
          <Info size={10} />
          Interpreted signals
        </span>
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed font-medium line-clamp-3">
        {briefing.summary}
      </p>
      <div className="mt-4 flex items-center justify-between pt-3 border-t border-zinc-800/50">
        <span className="text-[9px] text-zinc-600 font-semibold uppercase tracking-widest">
          AI Signal Layer
        </span>
        <span className="text-[9px] text-zinc-500">
          Updated {formatRelativeTime(briefing.generated_at)}
        </span>
      </div>
    </div>
  );
}
