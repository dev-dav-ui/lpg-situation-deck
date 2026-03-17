'use client';

import { Activity } from 'lucide-react';

interface Props {
  citiesScanning: number;
}

export default function IndiaSituationBanner({ citiesScanning }: Props) {
  const hasSignals = citiesScanning > 0;

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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="flex gap-2">
            <span className="text-zinc-600 shrink-0">Status:</span>
            <span className="text-zinc-300">
              {hasSignals
                ? 'Analytical monitoring of delivery and supply signals across major hubs.'
                : 'Awaiting broader verified signal coverage.'}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-zinc-600 shrink-0 whitespace-nowrap">Signal activity:</span>
            <span className="text-zinc-300">
              {citiesScanning > 0
                ? `Monitoring ${citiesScanning} cities and verified news flow.`
                : 'Signal collection in progress.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
