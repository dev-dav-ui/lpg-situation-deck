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

    // 1. Insert into shortage_reports (quantitative pipeline)
    const shortageInsert = supabase.from('shortage_reports').insert({
      city:           city.trim(),
      state,
      cylinder_type:  cylType,
      wait_days:      waitDays,
      description:    note.trim() || null,
      reporter_name:  reporterName.trim() || null,
      verified:       false,
    });

    // 2. Insert into community_reports via rate-limited API (qualitative pipeline)
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

    // Community rate-limit (429) is soft — don't block success
    const communityJson = await communityRes.json().catch(() => ({}));
    const communityBlocked = communityRes.status === 429;

    if (shortageResult.error) {
      setSubmitState('error');
      setErrorMsg('Submission failed. Please try again.');
      return;
    }

    if (communityBlocked) {
      // Still success overall; mention the rate limit
      setErrorMsg('Report saved. Community signal skipped (too many recent submissions).');
    }

    setSubmitState('success');
  };

  return (
    <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-8">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          REPORT LPG DELAY IN YOUR CITY
          <span className="text-xs bg-cyan-500/20 text-cyan-400 px-3 py-1 rounded-full">CROWDSOURCE</span>
        </h2>
      </div>
      <p className="text-sm text-zinc-400 mb-6">
        Anonymous · helps track the national LPG situation · takes 30 seconds
      </p>

      {submitState === 'success' ? (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center text-3xl">✓</div>
          <p className="text-green-400 font-semibold text-lg">Report received!</p>
          <p className="text-zinc-400 text-sm">Your report helps others track delays in your area.</p>
          {errorMsg && <p className="text-amber-400 text-xs max-w-sm">{errorMsg}</p>}
          <button onClick={reset} className="mt-2 text-sm text-cyan-400 hover:text-cyan-300 underline">
            Submit another report
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ── Community summary strip ── */}
          <div className="flex flex-row lg:flex-col gap-3">
            {summary.total === 0 ? (
              <div className="flex-1 bg-zinc-950 rounded-2xl border border-zinc-800 p-4 flex items-center justify-center text-center">
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Be the first to report LPG delays in your city.
                </p>
              </div>
            ) : (
              <>
                <div className="flex-1 bg-zinc-950 rounded-2xl border border-zinc-800 p-4">
                  <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1">
                    <Users size={12} /> Community Reports
                  </div>
                  <div className="text-2xl font-bold">{summary.total}</div>
                </div>
                <div className="flex-1 bg-zinc-950 rounded-2xl border border-zinc-800 p-4">
                  <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1">
                    <AlertTriangle size={12} className="text-red-400" /> Urgent
                  </div>
                  <div className="text-2xl font-bold text-red-400">{summary.urgent}</div>
                </div>
                <div className="flex-1 bg-zinc-950 rounded-2xl border border-zinc-800 p-4">
                  <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1">
                    <MapPin size={12} className="text-cyan-400" /> Latest
                  </div>
                  <div className="text-sm font-semibold truncate">{summary.recentCity}</div>
                  {recentTime && (
                    <div className="text-[10px] text-zinc-600 mt-0.5">{formatRelativeTime(recentTime)}</div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Form ── */}
          <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-5">

            {/* Row 1: City + State */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* City typeahead */}
              <div className="relative">
                <label className="block text-sm text-zinc-400 mb-2">City *</label>
                <input
                  type="text"
                  placeholder="Search city…"
                  value={city ? (showDrop ? citySearch : city) : citySearch}
                  onFocus={() => { setShowDrop(true); setCitySearch(''); }}
                  onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                  onChange={e => { setCitySearch(e.target.value); setCity(''); }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
                {showDrop && filteredCities.length > 0 && (
                  <div className="absolute z-50 top-full mt-1 left-0 w-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                    {filteredCities.map(c => (
                      <button key={c} type="button"
                        onMouseDown={() => { setCity(c); setCitySearch(''); setShowDrop(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-800 transition-colors"
                      >{c}</button>
                    ))}
                  </div>
                )}
              </div>

              {/* State */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2">State *</label>
                <select
                  value={state}
                  onChange={e => setState(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  required
                >
                  <option value="">Select state</option>
                  {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Row 2: Cylinder type + Wait days */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Cylinder Type *</label>
                <div className="flex gap-3">
                  {(['domestic', 'commercial'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setCylType(t)}
                      className={`flex-1 py-3 rounded-xl border text-sm font-medium capitalize transition-colors ${
                        cylType === t
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                      }`}
                    >{t}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">
                  Wait Days *: <span className="text-white font-semibold">{waitDays}</span>
                </label>
                <input
                  type="range" min={1} max={60} value={waitDays}
                  onChange={e => setWaitDays(Number(e.target.value))}
                  className="w-full accent-cyan-500"
                />
                <div className="flex justify-between text-xs text-zinc-500 mt-1">
                  <span>1 day</span><span>60 days</span>
                </div>
              </div>
            </div>

            {/* Row 3: Optional — status + days left */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">
                  Current Status <span className="text-zinc-600 text-xs">(optional)</span>
                </label>
                <div className="flex gap-2">
                  {(['enough', 'low', 'urgent'] as CylStatus[]).map(s => (
                    <button key={s} type="button" onClick={() => setCylStatus(prev => prev === s ? null : s)}
                      className={`flex-1 py-2.5 rounded-xl border text-xs font-semibold capitalize transition-colors ${
                        cylStatus === s
                          ? STATUS_CONFIG[s].style
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                      }`}
                    >{STATUS_CONFIG[s].label}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">
                  Days of Gas Left <span className="text-zinc-600 text-xs">(optional)</span>
                </label>
                <input
                  type="number" min={0} max={365} placeholder="e.g. 5"
                  value={daysLeft} onChange={e => setDaysLeft(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
            </div>

            {/* Row 4: Refill booked + note + name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 cursor-pointer select-none pt-1">
                <div
                  onClick={() => setRefillBooked(v => !v)}
                  className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${refillBooked ? 'bg-cyan-500' : 'bg-zinc-700'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${refillBooked ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-sm text-zinc-300">Refill already booked</span>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">
                  Your Name <span className="text-zinc-600 text-xs">(optional)</span>
                </label>
                <input
                  type="text" placeholder="Anonymous"
                  value={reporterName} onChange={e => setReporterName(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="block text-sm text-zinc-400 mb-2">
                Short Note <span className="text-zinc-600 text-xs">(optional · {note.length}/280)</span>
              </label>
              <textarea
                value={note} onChange={e => setNote(e.target.value)}
                maxLength={280} rows={2}
                placeholder="e.g. Distributor said 10-day delay this month…"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors resize-none"
              />
            </div>

            {/* Submit */}
            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={submitState === 'submitting'}
                className="bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-black font-semibold px-8 py-3 rounded-xl transition-colors"
              >
                {submitState === 'submitting' ? 'Submitting…' : 'Submit Report'}
              </button>
              {errorMsg && (
                <span className="text-red-400 text-sm">{errorMsg}</span>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
