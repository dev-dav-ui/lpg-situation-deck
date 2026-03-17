'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatRelativeTime } from '@/lib/utils';

interface Snapshot {
  headline_summary: string;
  generated_at: string;
}

export default function NationalSnapshotBanner() {
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

  return (
    <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 relative overflow-hidden group">
      {/* Decorative gradient background */}
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
