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
}

export default function CityAIBriefing({ city }: CityAIBriefingProps) {
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

  return (
    <div className="mt-4 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 relative overflow-hidden">
      {/* Subtle top accent */}
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
