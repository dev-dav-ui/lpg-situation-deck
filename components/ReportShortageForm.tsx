'use client';

import { useEffect, useState } from 'react';
import { MapPin, Users, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { INDIAN_STATES } from '@/lib/utils';

type CylStatus = 'enough' | 'low' | 'urgent';

const STATUS_CONFIG: Record<CylStatus, { label: string; style: string }> = {
  enough: { label: 'Enough', style: 'bg-green-500/20 border-green-500/40 text-green-400' },
  low:    { label: 'Low',    style: 'bg-amber-500/20 border-amber-500/40 text-amber-400' },
  urgent: { label: 'Urgent', style: 'bg-red-500/20   border-red-500/40   text-red-400'   },
};

function formatRelativeTime(dateStr: string): string {
  const diffM = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diffM < 1) return 'just now';
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

interface Summary { total: number; urgent: number; recentCity: string; }

export default function ReportShortageForm() {
  // ── City typeahead ────────────────────────────────────────────────
  const [cities, setCities]         = useState<string[]>([]);
  const [city, setCity]             = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [showDrop, setShowDrop]     = useState(false);

  // ── Required fields ───────────────────────────────────────────────
  const [state, setState]           = useState('');
  const [cylType, setCylType]       = useState<'domestic' | 'commercial'>('domestic');
  const [waitDays, setWaitDays]     = useState(1);

  // ── Optional fields ───────────────────────────────────────────────
  const [cylStatus, setCylStatus]   = useState<CylStatus | null>(null);
  const [daysLeft, setDaysLeft]     = useState('');
  const [refillBooked, setRefillBooked] = useState(false);
  const [note, setNote]             = useState('');
  const [reporterName, setReporterName] = useState('');

  // ── Form state ────────────────────────────────────────────────────
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg]       = useState('');

  // ── Community summary ─────────────────────────────────────────────
  const [summary, setSummary]       = useState<Summary>({ total: 0, urgent: 0, recentCity: '—' });
  const [recentTime, setRecentTime] = useState('');

  // Load city list
  useEffect(() => {
    supabase.from('city_data').select('city').neq('state', 'Unknown').order('city')
      .then(({ data }) => {
        if (data) setCities([...new Set(data.map((r: any) => r.city))]);
      });
  }, []);

  // Community summary + realtime
  useEffect(() => {
    const fetchSummary = async () => {
      const { data } = await supabase
        .from('community_reports')
        .select('city, status, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (data) {
        setSummary({
          total:      data.length,
          urgent:     data.filter((r: any) => r.status === 'urgent').length,
          recentCity: data[0]?.city ?? '—',
        });
        if (data[0]?.created_at) setRecentTime(data[0].created_at);
      }
    };
    fetchSummary();
    const channel = supabase
      .channel('merged-report-summary')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_reports' }, fetchSummary)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filteredCities = cities.filter(c =>
    c.toLowerCase().includes(citySearch.toLowerCase())
  );

  const reset = () => {
    setCity(''); setCitySearch(''); setState('');
    setCylType('domestic'); setWaitDays(1);
    setCylStatus(null); setDaysLeft(''); setRefillBooked(false);
    setNote(''); setReporterName('');
    setSubmitState('idle'); setErrorMsg('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!city.trim() || !state) {
      setErrorMsg('City and state are required.');
      return;
    }
    const daysNum = daysLeft ? Number(daysLeft) : null;
    if (daysLeft && (isNaN(daysNum!) || daysNum! < 0 || daysNum! > 365)) {
      setErrorMsg('Days left must be between 0 and 365.');
      return;
    }
    if (note.trim().length > 280) {
      setErrorMsg('Note must be under 280 characters.');
      return;
    }

    setSubmitState('submitting');
    setErrorMsg('');

    const shortageInsert = supabase.from('shortage_reports').insert({
      city:           city.trim(),
      state,
      cylinder_type:  cylType,
      wait_days:      waitDays,
      description:    note.trim() || null,
      reporter_name:  reporterName.trim() || null,
      verified:       false,
    });

    const communityInsert = fetch('/api/community-reports', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city:              city.trim(),
        status:            cylStatus ?? 'low',
        days_left:         daysNum,
        refill_booked:     refillBooked,
        expected_delivery: null,
        note:              note.trim() || null,
      }),
    });

    const [shortageResult, communityRes] = await Promise.all([shortageInsert, communityInsert]);
    const communityBlocked = communityRes.status === 429;

    if (shortageResult.error) {
      setSubmitState('error');
      setErrorMsg('Submission failed. Please try again.');
      return;
    }

    if (communityBlocked) {
      setErrorMsg('Report saved. Community signal skipped (too many recent submissions).');
    }

    setSubmitState('success');
  };

  return (
    <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            REPORT LPG DELAY
            <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full uppercase tracking-widest">Crowdsource</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-1">Anonymous · helps track the national LPG situation</p>
        </div>

        {/* Community summary strip (Compact) */}
        {summary.total > 0 && (
          <div className="flex items-center gap-4 bg-zinc-950/50 rounded-xl px-4 py-2 border border-zinc-800/50">
            <div className="flex items-center gap-1.5 border-r border-zinc-800 pr-4">
              <Users size={12} className="text-zinc-500" />
              <span className="text-xs font-bold">{summary.total}</span>
              <span className="text-[10px] text-zinc-600 uppercase tracking-tighter">Reports</span>
            </div>
            <div className="flex items-center gap-1.5 border-r border-zinc-800 pr-4">
              <AlertTriangle size={12} className="text-red-500" />
              <span className="text-xs font-bold text-red-400">{summary.urgent}</span>
              <span className="text-[10px] text-zinc-600 uppercase tracking-tighter">Urgent</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin size={12} className="text-cyan-500" />
              <span className="text-xs font-bold truncate max-w-[80px]">{summary.recentCity}</span>
              <span className="text-[9px] text-zinc-700 whitespace-nowrap">{recentTime && formatRelativeTime(recentTime)}</span>
            </div>
          </div>
        )}
      </div>

      {submitState === 'success' ? (
        <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
          <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center text-2xl text-green-500">✓</div>
          <p className="text-green-400 font-semibold text-base">Report received!</p>
          <button onClick={reset} className="text-xs text-cyan-400 hover:text-cyan-300 underline">
            Submit another report
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* City */}
            <div className="relative">
              <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 font-bold">City *</label>
              <input
                type="text"
                placeholder="Search city…"
                value={city ? (showDrop ? citySearch : city) : citySearch}
                onFocus={() => { setShowDrop(true); setCitySearch(''); }}
                onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                onChange={e => { setCitySearch(e.target.value); setCity(''); }}
                className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
              {showDrop && filteredCities.length > 0 && (
                <div className="absolute z-50 top-full mt-1 left-0 w-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                  {filteredCities.map(c => (
                    <button key={c} type="button"
                      onMouseDown={() => { setCity(c); setCitySearch(''); setShowDrop(false); }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-800 transition-colors"
                    >{c}</button>
                  ))}
                </div>
              )}
            </div>

            {/* State */}
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 font-bold">State *</label>
              <select
                value={state}
                onChange={e => setState(e.target.value)}
                className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50 transition-colors h-[38px]"
                required
              >
                <option value="">Select state</option>
                {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Cylinder Type */}
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 font-bold">Type *</label>
              <div className="flex gap-2 h-[38px]">
                {(['domestic', 'commercial'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setCylType(t)}
                    className={`flex-1 rounded-xl border text-[10px] uppercase tracking-widest font-bold transition-colors ${
                      cylType === t
                        ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400'
                        : 'bg-zinc-800/30 border-zinc-700 text-zinc-500 hover:border-zinc-600'
                    }`}
                  >{t}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            {/* Wait Days */}
            <div className="sm:col-span-1">
              <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 font-bold">
                Wait Days: <span className="text-cyan-400">{waitDays}</span>
              </label>
              <input
                type="range" min={1} max={60} value={waitDays}
                onChange={e => setWaitDays(Number(e.target.value))}
                className="w-full accent-cyan-500 h-6"
              />
            </div>

            {/* Current Status */}
            <div className="sm:col-span-2">
              <div className="flex gap-2">
                {(['enough', 'low', 'urgent'] as CylStatus[]).map(s => (
                  <button key={s} type="button" onClick={() => setCylStatus(prev => prev === s ? null : s)}
                    className={`flex-1 py-2 rounded-xl border text-[10px] uppercase tracking-widest font-bold transition-colors ${
                      cylStatus === s
                        ? STATUS_CONFIG[s].style
                        : 'bg-zinc-800/30 border-zinc-700 text-zinc-500 hover:border-zinc-600'
                    }`}
                  >{STATUS_CONFIG[s].label}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Optional — note + name + submit */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2">
            <div className="sm:col-span-2">
              <input
                type="text"
                placeholder="Short note (optional)"
                value={note} onChange={e => setNote(e.target.value)}
                maxLength={280}
                className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>
            <div className="sm:col-span-1">
              <input
                type="text" placeholder="Your name (opt)"
                value={reporterName} onChange={e => setReporterName(e.target.value)}
                className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={submitState === 'submitting'}
              className="bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-black text-xs font-bold uppercase tracking-widest py-2 rounded-xl transition-colors"
            >
              {submitState === 'submitting' ? '...' : 'Submit'}
            </button>
          </div>
          {errorMsg && (
            <p className="text-[10px] text-red-400 uppercase tracking-widest text-center">{errorMsg}</p>
          )}
        </form>
      )}
    </div>
  );
}
