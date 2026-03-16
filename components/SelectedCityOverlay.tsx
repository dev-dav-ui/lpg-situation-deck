'use client';

import { useEffect, useState } from 'react';
import { MapPin, Clock, ChevronRight, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatRelativeTime } from '@/lib/utils';

interface CityRow {
  wait_days: number;
  shortage_pct: number;
  state: string;
  last_updated: string;
}

interface Props {
  city: string;
  onViewDetails: () => void;
  onDismiss: () => void;
}

export default function SelectedCityOverlay({ city, onViewDetails, onDismiss }: Props) {
  const [row, setRow] = useState<CityRow | null>(null);

  useEffect(() => {
    if (!city) { setRow(null); return; }
    supabase
      .from('city_data')
      .select('wait_days, shortage_pct, state, last_updated')
      .eq('city', city)
      .neq('state', 'Unknown')
      .order('wait_days', { ascending: false })
      .limit(1)
      .then(({ data }) => setRow(data?.[0] ?? null));
  }, [city]);

  if (!city) return null;

  const d   = row?.wait_days   ?? 0;
  const pct = row?.shortage_pct ? Number(row.shortage_pct) : 0;

  const delayLabel = d >= 10 ? 'High Delay Signal' : d >= 6 ? 'Moderate Delay' : d >= 3 ? 'Mild Delay' : 'Stable';
  const delayColor = d >= 10 ? 'text-red-400'      : d >= 6 ? 'text-amber-400' : d >= 3 ? 'text-yellow-400' : 'text-green-400';

  const stressLabel = pct >= 25 ? 'High'     : pct >= 15 ? 'Elevated' : pct >= 8 ? 'Moderate' : 'Low';
  const stressColor = pct >= 25 ? 'text-red-400' : pct >= 15 ? 'text-amber-400' : pct >= 8 ? 'text-yellow-400' : 'text-green-400';

  // Status border/bg for the card accent
  const isHigh     = d > 15 || pct > 20;
  const isMid      = d > 8  || pct > 10;
  const accentBorder = isHigh ? 'border-red-500/40'    : isMid ? 'border-amber-500/40'  : 'border-green-500/30';
  const accentBg    = isHigh ? 'bg-red-500/10'         : isMid ? 'bg-amber-500/10'       : 'bg-green-500/8';

  return (
    <div className={`absolute top-3 left-3 z-[900] w-52 rounded-2xl border backdrop-blur-sm shadow-2xl p-3 flex flex-col gap-2.5 ${accentBorder} ${accentBg} bg-zinc-900/90`}>

      {/* Header row */}
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin size={11} className="text-cyan-400 shrink-0" />
          <span className="font-bold text-sm truncate">{city}</span>
        </div>
        <button
          onClick={onDismiss}
          className="text-zinc-600 hover:text-zinc-400 transition-colors shrink-0 mt-0.5"
          aria-label="Dismiss"
        >
          <X size={12} />
        </button>
      </div>

      {/* State */}
      {row?.state && (
        <p className="text-[10px] text-zinc-500 -mt-1.5">{row.state}</p>
      )}

      {/* Signal tiles */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="bg-zinc-950/60 rounded-xl px-2.5 py-2 flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-widest text-zinc-600 font-semibold">Delay</span>
          <span className={`text-[11px] font-bold leading-tight ${delayColor}`}>{delayLabel}</span>
        </div>
        <div className="bg-zinc-950/60 rounded-xl px-2.5 py-2 flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-widest text-zinc-600 font-semibold">Stress</span>
          <span className={`text-[11px] font-bold leading-tight ${stressColor}`}>{stressLabel}</span>
        </div>
      </div>

      {/* Updated time */}
      {row?.last_updated && (
        <p className="text-[10px] text-zinc-600 flex items-center gap-1">
          <Clock size={9} />
          {formatRelativeTime(row.last_updated)}
        </p>
      )}

      {/* View full details */}
      <button
        onClick={onViewDetails}
        className="flex items-center justify-between w-full px-3 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 hover:border-zinc-600 text-xs font-medium text-zinc-300 hover:text-white transition-colors"
      >
        View full details
        <ChevronRight size={12} className="text-cyan-400" />
      </button>

    </div>
  );
}
