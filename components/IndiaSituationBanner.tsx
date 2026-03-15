'use client';

import { Activity } from 'lucide-react';

interface Props {
  lastUpdated: string;
  citiesScanning: number;
}

export default function IndiaSituationBanner({ lastUpdated, citiesScanning }: Props) {
  const hasSignals = citiesScanning > 0 && lastUpdated !== '—';

  return (
    <div className="border-b border-zinc-800 bg-zinc-900/60 px-6 py-4">
      <div className="max-w-7xl mx-auto">
        {/* Title row */}
        <div className="flex items-center gap-2.5 mb-3">
          <Activity size={14} className="text-cyan-400 shrink-0" />
          <h2 className="text-xs font-bold uppercase tracking-[3px] text-cyan-400">
            India LPG Situation — AI Signal Monitor
          </h2>
        </div>

        {/* Signal lines */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="flex gap-2">
            <span className="text-zinc-600 shrink-0">Status</span>
            <span className="text-zinc-300">
              {hasSignals
                ? 'Booking and delivery disruption signals observed'
                : 'Awaiting broader verified signal coverage'}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-zinc-600 shrink-0 whitespace-nowrap">Signal activity</span>
            <span className="text-zinc-300">
              {citiesScanning > 0
                ? `Monitoring ${citiesScanning} Indian cities and verified news flow`
                : 'Signal collection in progress'}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-zinc-600 shrink-0 whitespace-nowrap">Last verified update</span>
            <span className="text-zinc-400">
              {lastUpdated !== '—' ? lastUpdated : 'Pending'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
