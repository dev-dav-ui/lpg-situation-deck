import { TrendingUp, Clock, AlertTriangle, MapPin } from 'lucide-react';

interface StatsHeaderProps {
  stats: {
    citiesScanning: number;
    avgWait: number;
    biggestShortage: number;
    lastUpdated: string;
  };
}

export default function StatsHeader({ stats }: StatsHeaderProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm text-zinc-400">CITIES MONITORED</p>
            <p className="text-4xl font-bold mt-2">{stats.citiesScanning || '—'}</p>
          </div>
          <MapPin className="w-8 h-8 text-cyan-400" />
        </div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm text-zinc-400">AVG WAIT (DAYS)</p>
            <p className="text-4xl font-bold mt-2">{stats.avgWait || '—'}</p>
          </div>
          <Clock className="w-8 h-8 text-red-400" />
        </div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm text-zinc-400">AVG SHORTAGE %</p>
            <p className="text-4xl font-bold mt-2">{stats.biggestShortage ? `+${stats.biggestShortage}%` : '—'}</p>
          </div>
          <TrendingUp className="w-8 h-8 text-orange-400" />
        </div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm text-zinc-400">LAST UPDATED</p>
            <p className="text-2xl font-bold mt-2">{stats.lastUpdated}</p>
          </div>
          <AlertTriangle className="w-8 h-8 text-green-400" />
        </div>
      </div>
    </div>
  );
}
