'use client';

import { useEffect, useState, useMemo } from 'react';
import { MapPin, Users, AlertTriangle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { INDIAN_STATES } from '@/lib/utils';

interface CrowdData {
  city: string;
  avgWait: number;
  count: number;
}

export default function ReportShortageForm() {
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
      // 1. Load City List for typeahead
      const { data: cityList } = await supabase.from('city_data').select('city').neq('state', 'Unknown').order('city');
      if (cityList) setCities([...new Set(cityList.map((r: any) => r.city))]);

      // 2. Aggregate Recent Reports (Last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: reports } = await supabase
        .from('shortage_reports')
        .select('city, wait_days')
        .gt('created_at', sevenDaysAgo);

      if (reports && reports.length > 0) {
        const cityMap = new Map<string, { total: number; count: number }>();
        reports.forEach(r => {
          // Outlier removal: ignore reports > 30 days for averaging
          if (r.wait_days > 30) return;
          
          const cur = cityMap.get(r.city) || { total: 0, count: 0 };
          cityMap.set(r.city, {
            total: cur.total + r.wait_days,
            count: cur.count + 1
          });
        });

        const stats: CrowdData[] = Array.from(cityMap.entries())
          .map(([city, data]) => ({
            city,
            avgWait: Number((data.total / data.count).toFixed(1)),
            count: data.count
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        setCrowdStats(stats);
      }
      setLoadingStats(false);
    };

    fetchData();
  }, []);

  const confidenceLine = useMemo(() => {
    if (crowdStats.length === 0) return null;
    const totalReports = crowdStats.reduce((sum, s) => sum + s.count, 0);
    if (totalReports > 15) return { text: "Aligned with regional supply signals", color: "text-cyan-500" };
    return { text: "Limited data — low confidence", color: "text-zinc-600" };
  }, [crowdStats]);

  const filteredCities = cities.filter(c =>
    c.toLowerCase().includes(citySearch.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!city.trim() || !state) {
      setErrorMsg('City and state are required.');
      return;
    }

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

    if (error) {
      setSubmitState('error');
      setErrorMsg('Submission failed.');
    } else {
      setSubmitState('success');
      // Refresh stats would be good but keeping it simple
    }
  };

  return (
    <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-5">
      {/* ── PART 1: Real Wait Times Display ── */}
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
                  <span className="text-[9px] text-zinc-600 font-medium">({stat.count} reports)</span>
                </div>
              </div>
            ))}
          </div>
        ) : !loadingStats && (
          <p className="text-xs text-zinc-600 italic">No recent crowd signals for your area.</p>
        )}

        {/* ── PART 2: Confidence Signal ── */}
        {confidenceLine && (
          <div className={`mt-3 text-[9px] uppercase tracking-widest font-bold ${confidenceLine.color} flex items-center gap-1.5`}>
            <span className="w-1 h-1 rounded-full bg-current opacity-50" />
            {confidenceLine.text}
          </div>
        )}
      </div>

      {/* ── PART 3: Compressed Form ── */}
      <div className="border-t border-zinc-800/50 pt-4">
        {submitState === 'success' ? (
          <div className="py-4 text-center">
            <p className="text-green-400 text-xs font-bold">✓ Report submitted. Thank you for the signal.</p>
            <button onClick={() => setSubmitState('idle')} className="text-[10px] text-zinc-600 underline mt-2">New report</button>
          </div>
        ) : (
          <>
            <button 
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showForm ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showForm ? 'Hide form' : 'Report your wait time'}
            </button>

            {showForm && (
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* City */}
                  <div className="relative">
                    <label className="block text-[9px] uppercase tracking-widest text-zinc-600 mb-1 font-bold">City *</label>
                    <input
                      type="text"
                      placeholder="Search…"
                      value={city ? (showDrop ? citySearch : city) : citySearch}
                      onFocus={() => { setShowDrop(true); setCitySearch(''); }}
                      onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                      onChange={e => { setCitySearch(e.target.value); setCity(''); }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500/50 transition-colors"
                    />
                    {showDrop && filteredCities.length > 0 && (
                      <div className="absolute z-50 top-full mt-1 left-0 w-full bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                        {filteredCities.map(c => (
                          <button key={c} type="button"
                            onMouseDown={() => { setCity(c); setCitySearch(''); setShowDrop(false); }}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 transition-colors"
                          >{c}</button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* State */}
                  <div>
                    <label className="block text-[9px] uppercase tracking-widest text-zinc-600 mb-1 font-bold">State *</label>
                    <select
                      value={state}
                      onChange={e => setState(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none h-[32px]"
                      required
                    >
                      <option value="">Select</option>
                      {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  {/* Type */}
                  <div>
                    <div className="flex gap-2">
                      {(['domestic', 'commercial'] as const).map(t => (
                        <button key={t} type="button" onClick={() => setCylType(t)}
                          className={`flex-1 py-1.5 rounded-lg border text-[9px] uppercase tracking-tighter font-bold transition-colors ${
                            cylType === t ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400' : 'bg-zinc-950 border-zinc-800 text-zinc-600'
                          }`}
                        >{t}</button>
                      ))}
                    </div>
                  </div>

                  {/* Wait Days */}
                  <div>
                    <label className="flex justify-between text-[9px] uppercase tracking-widest text-zinc-600 mb-1 font-bold">
                      Wait: <span className="text-cyan-500">{waitDays}d</span>
                    </label>
                    <input
                      type="range" min={1} max={30} value={waitDays}
                      onChange={e => setWaitDays(Number(e.target.value))}
                      className="w-full accent-cyan-500 h-4"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <div 
                      onClick={() => setStillWaiting(!stillWaiting)}
                      className={`w-7 h-4 rounded-full transition-colors relative ${stillWaiting ? 'bg-cyan-500/50' : 'bg-zinc-800'}`}
                    >
                      <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${stillWaiting ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-[10px] text-zinc-500 font-medium">Still waiting for refill?</span>
                  </label>

                  <button
                    type="submit"
                    disabled={submitState === 'submitting'}
                    className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-800 text-black text-[10px] font-black uppercase tracking-widest px-6 py-2 rounded-lg transition-colors"
                  >
                    Submit
                  </button>
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
