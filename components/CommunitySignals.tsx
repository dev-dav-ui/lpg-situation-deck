'use client';

import { useEffect, useState } from 'react';
import { MapPin, Users, AlertTriangle, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Status = 'enough' | 'low' | 'urgent';

const STATUS_CONFIG: Record<Status, { label: string; style: string; dot: string }> = {
  enough: { label: 'Enough',  style: 'bg-green-500/20 border-green-500/40 text-green-400',  dot: 'bg-green-500' },
  low:    { label: 'Low',     style: 'bg-amber-500/20 border-amber-500/40 text-amber-400',  dot: 'bg-amber-400' },
  urgent: { label: 'Urgent',  style: 'bg-red-500/20   border-red-500/40   text-red-400',    dot: 'bg-red-500'   },
};

interface Summary {
  total: number;
  urgent: number;
  recentCity: string;
}

function formatRelativeTime(dateStr: string): string {
  const diffM = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diffM < 1) return 'just now';
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

export default function CommunitySignals() {
  const [cities, setCities]   = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, urgent: 0, recentCity: '—' });
  const [recentTime, setRecentTime] = useState<string>('');

  // Form state
  const [city, setCity]                   = useState('');
  const [citySearch, setCitySearch]       = useState('');
  const [showDrop, setShowDrop]           = useState(false);
  const [status, setStatus]               = useState<Status>('low');
  const [daysLeft, setDaysLeft]           = useState('');
  const [refillBooked, setRefillBooked]   = useState(false);
  const [deliveryDate, setDeliveryDate]   = useState('');
  const [note, setNote]                   = useState('');
  const [submitState, setSubmitState]     = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg]           = useState('');

  // Load city list
  useEffect(() => {
    supabase.from('city_data').select('city').neq('state', 'Unknown').order('city')
      .then(({ data }) => {
        if (data) setCities([...new Set(data.map((r: any) => r.city))]);
      });
  }, []);

  // Load summary + realtime
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
          urgent:     data.filter(r => r.status === 'urgent').length,
          recentCity: data[0]?.city ?? '—',
        });
        if (data[0]?.created_at) setRecentTime(data[0].created_at);
      }
    };
    fetchSummary();

    const channel = supabase
      .channel('community-signals')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_reports' }, fetchSummary)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const filteredCities = cities.filter(c =>
    c.toLowerCase().includes(citySearch.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!city) { setErrorMsg('Please select a city.'); return; }
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

    const res = await fetch('/api/community-reports', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city,
        status,
        days_left:         daysNum,
        refill_booked:     refillBooked,
        expected_delivery: refillBooked && deliveryDate ? deliveryDate : null,
        note:              note.trim() || null,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setSubmitState('error');
      setErrorMsg(json.error ?? 'Submission failed. Please try again.');
    } else {
      setSubmitState('success');
    }
  };

  const reset = () => {
    setCity(''); setCitySearch(''); setStatus('low'); setDaysLeft('');
    setRefillBooked(false); setDeliveryDate(''); setNote('');
    setSubmitState('idle'); setErrorMsg('');
  };

  return (
    <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-lg font-semibold">COMMUNITY SIGNALS</h2>
        <span className="text-xs bg-cyan-500/20 text-cyan-400 px-3 py-1 rounded-full">CROWDSOURCE</span>
      </div>
      <p className="text-sm text-zinc-400 mb-6">
        Share your local LPG situation. Anonymous · helps your neighbours.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Summary strip ── */}
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
                  <Users size={12} />
                  Total Reports
                </div>
                <div className="text-2xl font-bold">{summary.total}</div>
              </div>
              <div className="flex-1 bg-zinc-950 rounded-2xl border border-zinc-800 p-4">
                <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1">
                  <AlertTriangle size={12} className="text-red-400" />
                  Urgent
                </div>
                <div className="text-2xl font-bold text-red-400">{summary.urgent}</div>
              </div>
              <div className="flex-1 bg-zinc-950 rounded-2xl border border-zinc-800 p-4">
                <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1">
                  <MapPin size={12} className="text-cyan-400" />
                  Latest
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
        <div className="lg:col-span-2">
          {submitState === 'success' ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center text-xl">✓</div>
              <p className="text-green-400 font-semibold">Signal received!</p>
              <p className="text-zinc-500 text-sm">Your report helps others nearby.</p>
              <button onClick={reset} className="mt-1 text-sm text-cyan-400 hover:text-cyan-300 underline">
                Submit another
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Row 1: city + status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* City */}
                <div className="relative">
                  <label className="block text-xs text-zinc-400 mb-1.5">City *</label>
                  <input
                    type="text"
                    placeholder="Search city…"
                    value={city ? (showDrop ? citySearch : city) : citySearch}
                    onFocus={() => { setShowDrop(true); setCitySearch(''); }}
                    onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                    onChange={e => { setCitySearch(e.target.value); setCity(''); }}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                  {showDrop && filteredCities.length > 0 && (
                    <div className="absolute z-50 top-full mt-1 left-0 w-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl max-h-44 overflow-y-auto">
                      {filteredCities.map(c => (
                        <button
                          key={c}
                          type="button"
                          onMouseDown={() => { setCity(c); setCitySearch(''); setShowDrop(false); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 transition-colors"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Cylinder Status *</label>
                  <div className="flex gap-2">
                    {(['enough', 'low', 'urgent'] as Status[]).map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className={`flex-1 py-2.5 rounded-xl border text-xs font-semibold capitalize transition-colors ${
                          status === s
                            ? STATUS_CONFIG[s].style
                            : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                        }`}
                      >
                        {STATUS_CONFIG[s].label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Row 2: days left + refill booked */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Days of gas left (optional)</label>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    placeholder="e.g. 5"
                    value={daysLeft}
                    onChange={e => setDaysLeft(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <div className="flex flex-col justify-center gap-3">
                  {/* Refill booked toggle */}
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <div
                      onClick={() => setRefillBooked(v => !v)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${refillBooked ? 'bg-cyan-500' : 'bg-zinc-700'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${refillBooked ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-sm text-zinc-300">Refill already booked</span>
                  </label>

                  {/* Expected delivery — conditional */}
                  {refillBooked && (
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Expected delivery (optional)</label>
                      <input
                        type="date"
                        value={deliveryDate}
                        onChange={e => setDeliveryDate(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Row 3: note */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">
                  Short note (optional)
                  <span className="ml-1 text-zinc-600">{note.length}/280</span>
                </label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  maxLength={280}
                  rows={2}
                  placeholder="e.g. Distributor said 10-day delay this month…"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors resize-none"
                />
              </div>

              {/* Submit */}
              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={submitState === 'submitting'}
                  className="bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-black font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
                >
                  {submitState === 'submitting' ? 'Sending…' : 'Share Signal'}
                </button>
                {errorMsg && (
                  <span className="text-red-400 text-xs">{errorMsg}</span>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
