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

function delayCategory(days: number): { label: string; color: string } {
  if (days >= 10) return { label: 'Severe',   color: 'text-red-400' };
  if (days >= 6)  return { label: 'Delayed',  color: 'text-amber-400' };
  if (days >= 3)  return { label: 'Watch',    color: 'text-yellow-400' };
  return               { label: 'Stable',   color: 'text-green-400' };
}

function stressCategory(pct: number): { label: string; color: string } {
  if (pct >= 25) return { label: 'Severe',   color: 'text-red-400' };
  if (pct >= 15) return { label: 'Elevated', color: 'text-amber-400' };
  if (pct >= 8)  return { label: 'Moderate', color: 'text-yellow-400' };
  return              { label: 'Low',      color: 'text-green-400' };
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
  const timeLabel  = stats.lastUpdatedISO ? formatIST(stats.lastUpdatedISO) : '';
  const delayCat   = stats.avgWait       ? delayCategory(stats.avgWait)       : null;
  const stressCat  = stats.biggestShortage ? stressCategory(stats.biggestShortage) : null;

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm text-zinc-400 flex items-center">
              CITIES IN SIGNAL VIEW
              <InfoTip text="Number of cities included in the current LPG signal monitoring scope." />
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
              REFILL DELAY SIGNAL
              <InfoTip text="Estimated delivery delay level based on monitored city signals. Not an exact measured figure." />
            </p>
            <p className={`text-4xl font-bold mt-2 ${delayCat?.color ?? ''}`}>
              {delayCat ? delayCat.label : '—'}
            </p>
          </div>
          <Clock className="w-8 h-8 text-red-400" />
        </div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm text-zinc-400 flex items-center">
              SUPPLY STRESS SIGNAL
              <InfoTip text="Estimated supply pressure level derived from delay patterns. Not an official shortage figure." />
            </p>
            <p className={`text-4xl font-bold mt-2 ${stressCat?.color ?? ''}`}>
              {stressCat ? stressCat.label : '—'}
            </p>
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
        Monitoring LPG signals across major Indian cities · Sourced from distributor networks and community reports.
      </p>
    </div>
  );
}
