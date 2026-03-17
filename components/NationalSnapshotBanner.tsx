'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatRelativeTime } from '@/lib/utils';

interface Snapshot {
  headline_summary: string;
  generated_at: string;
}

interface Props {
  minimal?: boolean;
}

export default function NationalSnapshotBanner({ minimal = false }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSnapshot = async () => {
      const { data, error } = await supabase
        .from('national_snapshot')
        .select('headline_summary, generated_at')
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();

      if (!error && data) {
        setSnapshot(data);
      }
      setLoading(false);
    };

    fetchSnapshot();
  }, []);

  if (loading || !snapshot) return null;

  if (minimal) {
    return (
      <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl px-3 py-2 flex items-center gap-3">
        <Sparkles size={12} className="text-cyan-400 shrink-0" />
        <p className="text-[11px] font-bold text-cyan-100/90 leading-tight truncate">
          AI: {snapshot.headline_summary}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-transparent pointer-events-none" />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-cyan-400" />
          <h3 className="text-xs font-bold uppercase tracking-[3px] text-zinc-400">
            India LPG Situation
          </h3>
        </div>
        <p className="text-lg md:text-xl font-medium text-zinc-200 leading-relaxed mb-4">
          {snapshot.headline_summary}
        </p>
        <div className="flex items-center justify-between pt-4 border-t border-zinc-800/50">
          <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">
            AI-Generated Insight
          </span>
          <span className="text-[10px] text-zinc-500">
            Generated {formatRelativeTime(snapshot.generated_at)}
          </span>
        </div>
      </div>
    </div>
  );
}
