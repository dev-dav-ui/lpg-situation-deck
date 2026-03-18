'use client';

import { useEffect, useState, useMemo } from 'react';
import { MapPin, Users, AlertTriangle, Clock, ChevronDown, ChevronUp, ArrowUp, ArrowDown, MoveRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { INDIAN_STATES } from '@/lib/utils';

interface CrowdData {
  city: string;
  avgWait: number;
  count: number;
  trend: 'rising' | 'stable' | 'easing' | 'uncertain';
}

interface Props {
  variant?: 'default' | 'display-only' | 'inline-strip';
}

export default function ReportShortageForm({ variant = 'default' }: Props) {
  // ── Crowd Data Aggregation ────────────────────────────────────────
  const [crowdStats, setCrowdStats] = useState<CrowdData[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // ── Form State ────────────────────────────────────────────────────
  const [cities, setCities]         = useState<string[]>([]);
  const [city, setCity]             = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [showDrop, setShowDrop]     = useState(false);
  const [state, setState]           = useState('');
  const [cylType, setCylType]       = useState<'domestic' | 'commercial'>('domestic');
  const [waitDays, setWaitDays]     = useState(3);
  const [stillWaiting, setStillWaiting] = useState(true);

  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg]       = useState('');

  // ── Load Data ─────────────────────────────────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      const { data: cityList } = await supabase.from('city_data').select('city').neq('state', 'Unknown').order('city');
      if (cityList) setCities([...new Set(cityList.map((r: any) => r.city))]);

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      
      const { data: reports } = await supabase
        .from('shortage_reports')
        .select('city, wait_days, created_at')
        .gt('created_at', sevenDaysAgo);

      if (reports && reports.length > 0) {
        const cityMap = new Map<string, { recentTotal: number; recentCount: number; oldTotal: number; oldCount: number }>();
        reports.forEach(r => {
          if (r.wait_days > 30) return;
          const isRecent = new Date(r.created_at) >= new Date(threeDaysAgo);
          const cur = cityMap.get(r.city) || { recentTotal: 0, recentCount: 0, oldTotal: 0, oldCount: 0 };
          if (isRecent) { cur.recentTotal += r.wait_days; cur.recentCount += 1; }
          else { cur.oldTotal += r.wait_days; cur.oldCount += 1; }
          cityMap.set(r.city, cur);
        });

        const stats: CrowdData[] = Array.from(cityMap.entries())
          .map(([city, data]) => {
            const recentAvg = data.recentCount > 0 ? data.recentTotal / data.recentCount : 0;
            const oldAvg    = data.oldCount > 0 ? data.oldTotal / data.oldCount : 0;
            const totalCount = data.recentCount + data.oldCount;
            const avgWait = data.recentCount > 0 ? recentAvg : oldAvg;
            let trend: CrowdData['trend'] = 'stable';
            if (totalCount < 3) trend = 'uncertain';
            else if (recentAvg > oldAvg + 1 && recentAvg > 6) trend = 'rising';
            else if (recentAvg < oldAvg - 1) trend = 'easing';
            else trend = 'stable';
            return { city, avgWait: Number(avgWait.toFixed(1)), count: totalCount, trend };
          })
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
        setCrowdStats(stats);
      }
      setLoadingStats(false);
    };
    fetchData();
  }, []);

  const bookingAdvice = useMemo(() => {
    if (crowdStats.length === 0) return null;
    const topCity = crowdStats[0];
    if (topCity.trend === 'uncertain') return { text: "Low data — booking window uncertain", icon: <MoveRight size={10} />, color: "text-zinc-600" };
    if (topCity.trend === 'rising') return { text: `Booking pressure rising in ${topCity.city}`, icon: <ArrowUp size={10} />, color: "text-zinc-500" };
    if (topCity.trend === 'easing') return { text: `Delays easing in ${topCity.city}`, icon: <ArrowDown size={10} />, color: "text-zinc-500" };
    return { text: "No urgency — wait times stable", icon: <MoveRight size={10} />, color: "text-zinc-600" };
  }, [crowdStats]);

  const confidenceLine = useMemo(() => {
    if (crowdStats.length === 0) return null;
    const totalReports = crowdStats.reduce((sum, s) => sum + s.count, 0);
    if (totalReports > 15) return { text: "Aligned with regional supply signals", color: "text-cyan-500" };
    return { text: "Limited data — low confidence", color: "text-zinc-600" };
  }, [crowdStats]);

  const filteredCities = cities.filter(c => c.toLowerCase().includes(citySearch.toLowerCase()));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!city.trim() || !state) { setErrorMsg('City and state are required.'); return; }
    setSubmitState('submitting');
    setErrorMsg('');
    const { error } = await supabase.from('shortage_reports').insert({
      city:           city.trim(),
      state,
      cylinder_type:  cylType,
      wait_days:      waitDays,
      description:    stillWaiting ? 'Currently waiting' : 'Refill received',
      verified:       false,
    });
    if (error) { setSubmitState('error'); setErrorMsg('Submission failed.'); } 
    else { setSubmitState('success'); }
  };

  // ── PART 1: Display Only Variant ──
  if (variant === 'inline-strip') {
    if (crowdStats.length === 0) return null;
    return (
      <div className="flex items-center gap-4 overflow-hidden border-t border-zinc-900 pt-2">
        <div className="flex items-center gap-1.5 shrink-0">
          <Users size={10} className="text-zinc-600" />
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">CROWD:</span>
        </div>
        <div className="flex items-center gap-4 whitespace-nowrap overflow-x-auto scrollbar-hide">
          {crowdStats.map((s, i) => (
            <div key={s.city} className="flex items-center gap-1.5 text-[10px] font-bold">
              <span className="text-zinc-500 uppercase tracking-tighter text-[9px]">{s.city}</span>
              <span className="text-cyan-400">{s.avgWait}d</span>
              <span className="text-zinc-700 text-[8px]">
                {s.trend === 'rising' ? '↑' : s.trend === 'easing' ? '↓' : '→'}
              </span>
              {i < crowdStats.length - 1 && <span className="text-zinc-800 ml-1">•</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'display-only') {
    if (crowdStats.length === 0) return null;
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-[9px] font-black uppercase tracking-[2px] text-zinc-600 flex items-center gap-2">
          <Users size={10} /> Real Wait Times (Crowd)
        </h3>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {crowdStats.map(s => (
            <div key={s.city} className="flex items-center gap-2 text-[11px] font-bold">
              <span className="text-zinc-500 uppercase tracking-tighter text-[10px]">{s.city}</span>
              <span className="text-cyan-300 font-black drop-shadow-[0_0_8px_rgba(103,232,249,0.3)]">— {s.avgWait}d</span>
              <span className="text-zinc-700">
                {s.trend === 'rising' ? '↑' : s.trend === 'easing' ? '↓' : '→'}
              </span>
              <span className="text-[9px] text-zinc-800">({s.count})</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── PART 2: Default Variant ──
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold flex items-center gap-2 text-zinc-400 uppercase tracking-widest">
            <Clock size={14} className="text-cyan-500" />
            Real Wait Times (Crowd)
          </h2>
          {crowdStats.length === 0 && !loadingStats && (
            <span className="text-[10px] text-zinc-600 uppercase font-medium">Be the first to report</span>
          )}
        </div>
        {crowdStats.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {crowdStats.map((stat) => (
              <div key={stat.city} className="bg-zinc-950/50 border border-zinc-800/50 rounded-xl px-3 py-2 flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-300 truncate max-w-[100px]">{stat.city}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-cyan-400">{stat.avgWait}d</span>
                  <span className="text-[9px] text-zinc-600 font-medium">({stat.count})</span>
                </div>
              </div>
            ))}
          </div>
        ) : !loadingStats && (
          <p className="text-xs text-zinc-600 italic">No recent crowd signals for your area.</p>
        )}
        {bookingAdvice && (
          <div className={`mt-3 flex items-center gap-2 text-[10px] font-medium ${bookingAdvice.color} tracking-tight`}>
            <span className="opacity-70">{bookingAdvice.icon}</span>
            <span>{bookingAdvice.text}</span>
          </div>
        )}
        {confidenceLine && (
          <div className={`mt-1.5 text-[9px] uppercase tracking-widest font-bold ${confidenceLine.color} flex items-center gap-1.5 opacity-80`}>
            <span className="w-1 h-1 rounded-full bg-current opacity-40" />
            {confidenceLine.text}
          </div>
        )}
      </div>
      <div className="border-t border-zinc-800/50 pt-4">
        {submitState === 'success' ? (
          <div className="py-4 text-center">
            <p className="text-green-400 text-xs font-bold">✓ Report submitted.</p>
            <button onClick={() => setSubmitState('idle')} className="text-[10px] text-zinc-600 underline mt-2">New report</button>
          </div>
        ) : (
          <>
            <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors">
              {showForm ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showForm ? 'Hide form' : 'Report your wait time'}
            </button>
            {showForm && (
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="relative">
                    <label className="block text-[9px] uppercase tracking-widest text-zinc-600 mb-1 font-bold">City *</label>
                    <input type="text" placeholder="Search…" value={city ? (showDrop ? citySearch : city) : citySearch} onFocus={() => { setShowDrop(true); setCitySearch(''); }} onBlur={() => setTimeout(() => setShowDrop(false), 150)} onChange={e => { setCitySearch(e.target.value); setCity(''); }} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500/50 transition-colors" />
                    {showDrop && filteredCities.length > 0 && (
                      <div className="absolute z-50 top-full mt-1 left-0 w-full bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                        {filteredCities.map(c => (
                          <button key={c} type="button" onMouseDown={() => { setCity(c); setCitySearch(''); setShowDrop(false); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 transition-colors" >{c}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-[9px] uppercase tracking-widest text-zinc-600 mb-1 font-bold">State *</label>
                    <select value={state} onChange={e => setState(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none h-[32px]" required >
                      <option value="">Select</option>
                      {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <div className="flex gap-2">
                    {(['domestic', 'commercial'] as const).map(t => (
                      <button key={t} type="button" onClick={() => setCylType(t)} className={`flex-1 py-1.5 rounded-lg border text-[9px] uppercase tracking-tighter font-bold transition-colors ${cylType === t ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400' : 'bg-zinc-950 border-zinc-800 text-zinc-600'}`} >{t}</button>
                    ))}
                  </div>
                  <div>
                    <label className="flex justify-between text-[9px] uppercase tracking-widest text-zinc-600 mb-1 font-bold"> Wait: <span className="text-cyan-500">{waitDays}d</span> </label>
                    <input type="range" min={1} max={30} value={waitDays} onChange={e => setWaitDays(Number(e.target.value))} className="w-full accent-cyan-500 h-4" />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <div onClick={() => setStillWaiting(!stillWaiting)} className={`w-7 h-4 rounded-full transition-colors relative ${stillWaiting ? 'bg-cyan-500/50' : 'bg-zinc-800'}`} >
                      <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${stillWaiting ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-[10px] text-zinc-500 font-medium">Still waiting?</span>
                  </label>
                  <button type="submit" disabled={submitState === 'submitting'} className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-800 text-black text-[10px] font-black uppercase tracking-widest px-6 py-2 rounded-lg transition-colors" > Submit </button>
                </div>
                {errorMsg && <p className="text-[9px] text-red-500 uppercase text-center">{errorMsg}</p>}
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
