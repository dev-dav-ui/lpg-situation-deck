import { TrendingUp, Users, Clock, AlertTriangle } from 'lucide-react';

interface StatsHeaderProps {
  stats: {
    citiesScanning: number;
    avgWait: number;
    biggestShortage: number;
    watching: number;
    lastUpdated: string;
  };
}

export default function StatsHeader({ stats }: StatsHeaderProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm text-zinc-400">CITIES SCANNING</p>
            <p className="text-4xl font-bold mt-2">{stats.citiesScanning}</p>
          </div>
          <AlertTriangle className="w-8 h-8 text-orange-400" />
        </div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm text-zinc-400">AVG WAIT DAYS</p>
            <p className="text-4xl font-bold mt-2">{stats.avgWait} <span className="text-xl text-red-400">\u2191</span></p>
          </div>
          <Clock className="w-8 h-8 text-red-400" />
        </div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm text-zinc-400">BIGGEST SHORTAGE</p>
            <p className="text-4xl font-bold mt-2">+{stats.biggestShortage}%</p>
          </div>
          <TrendingUp className="w-8 h-8 text-red-500" />
        </div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm text-zinc-400">WATCHING LIVE</p>
            <p className="text-4xl font-bold mt-2">{(stats.watching / 1000).toFixed(1)}k</p>
          </div>
          <Users className="w-8 h-8 text-cyan-400" />
        </div>
      </div>
    </div>
  );
}
