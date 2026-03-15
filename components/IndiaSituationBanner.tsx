'use client';

import { Activity } from 'lucide-react';

interface Props {
  avgWait: number;
  biggestShortage: number;
  lastUpdated: string;
  citiesScanning: number;
}

function statusLine(avgWait: number, biggestShortage: number): string {
  if (avgWait >= 10 || biggestShortage >= 25)
    return 'Delivery delays and booking instability observed across multiple cities';
  if (avgWait >= 6 || biggestShortage >= 15)
    return 'Elevated delivery delay signals observed in several monitored cities';
  if (avgWait >= 3 || biggestShortage >= 8)
    return 'Moderate supply delay signals detected. Situation under observation';
  if (avgWait > 0)
    return 'Supply signals broadly stable. Monitoring continues across all cities';
  return 'Awaiting verified signal data';
}

function activityLine(biggestShortage: number, citiesScanning: number): string {
  if (biggestShortage >= 25)
    return `Multiple cities showing severe supply stress · ${citiesScanning} cities in signal view`;
  if (biggestShortage >= 15)
    return `Several cities showing elevated supply stress · ${citiesScanning} cities in signal view`;
  if (biggestShortage >= 8)
    return `Moderate supply stress signals detected · ${citiesScanning} cities in signal view`;
  if (citiesScanning > 0)
    return `Supply stress signals within normal range · ${citiesScanning} cities in signal view`;
  return 'Signal collection in progress';
}

export default function IndiaSituationBanner({ avgWait, biggestShortage, lastUpdated, citiesScanning }: Props) {
  const hasData = avgWait > 0 || biggestShortage > 0;

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
              {hasData ? statusLine(avgWait, biggestShortage) : 'Awaiting verified signal data'}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-zinc-600 shrink-0 whitespace-nowrap">Signal activity</span>
            <span className="text-zinc-300">
              {hasData ? activityLine(biggestShortage, citiesScanning) : 'Signal collection in progress'}
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
