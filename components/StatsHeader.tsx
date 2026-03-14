import { TrendingUp, Clock, AlertTriangle, MapPin, Info } from 'lucide-react';

interface StatsHeaderProps {
  stats: {
    citiesScanning: number;
    avgWait: number;
    biggestShortage: number;
    lastUpdated: string;
    lastUpdatedISO?: string;
  };
}

interface InfoTipProps {
  text: string;
}

function InfoTip({ text }: InfoTipProps) {
  return (
    <span className="group relative inline-flex items-center ml-1 cursor-default">
      <Info size={12} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-xl px-3 py-2 leading-relaxed shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-50 text-center">
        {text}
      </span>
    </span>
  );
}

function formatIST(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      hour:     'numeric',
      minute:   '2-digit',
      hour12:   true,
      timeZone: 'Asia/Kolkata',
    }).format(new Date(iso)).toUpperCase() + ' IST';
  } catch {
    return '';
  }
}

export default function StatsHeader({ stats }: StatsHeaderProps) {
  const timeLabel = stats.lastUpdatedISO ? formatIST(stats.lastUpdatedISO) : '';

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm text-zinc-400 flex items-center">
              CITIES MONITORED
              <InfoTip text="Number of cities currently tracked by our monitoring system." />
            </p>
            <p className="text-4xl font-bold mt-2">{stats.citiesScanning || '—'}</p>
          </div>
          <MapPin className="w-8 h-8 text-cyan-400" />
        </div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm text-zinc-400 flex items-center">
              AVG WAIT (DAYS)
              <InfoTip text="Average waiting time users experience between booking an LPG refill and receiving delivery." />
            </p>
            <p className="text-4xl font-bold mt-2">{stats.avgWait || '—'}</p>
          </div>
          <Clock className="w-8 h-8 text-red-400" />
        </div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm text-zinc-400 flex items-center">
              AVG SHORTAGE %
              <InfoTip text="Estimated supply pressure based on delivery wait times and refill delays across monitored cities compared to normal refill cycles." />
            </p>
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
      <p className="text-xs text-zinc-400 text-right mt-2">
        {timeLabel ? `Last updated: ${timeLabel}` : 'Data updating…'}
      </p>
      <p className="text-xs text-zinc-500 text-center mt-1">
        Signals from IOCL, HPCL, BPCL distribution networks and community reports.
      </p>
    </div>
  );
}
