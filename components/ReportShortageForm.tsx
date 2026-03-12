'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { INDIAN_STATES } from '@/lib/utils';

interface FormState {
  city: string;
  state: string;
  type: 'domestic' | 'commercial';
  waitDays: number;
  description: string;
  reporterName: string;
}

const initialForm: FormState = {
  city: '',
  state: '',
  type: 'domestic',
  waitDays: 1,
  description: '',
  reporterName: '',
};

export default function ReportShortageForm() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.city.trim() || !form.state) {
      setErrorMsg('City and state are required.');
      return;
    }

    setStatus('submitting');
    setErrorMsg('');

    const { error } = await supabase.from('shortage_reports').insert({
      city: form.city.trim(),
      state: form.state,
      cylinder_type: form.type,
      wait_days: form.waitDays,
      description: form.description.trim() || null,
      reporter_name: form.reporterName.trim() || null,
      verified: false,
    });

    if (error) {
      setStatus('error');
      setErrorMsg('Failed to submit. Please try again.');
    } else {
      setStatus('success');
      setForm(initialForm);
    }
  };

  return (
    <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-8">
      <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
        Report a Shortage
        <span className="text-xs bg-cyan-500/20 text-cyan-400 px-3 py-1 rounded-full">CROWDSOURCE</span>
      </h2>
      <p className="text-sm text-zinc-400 mb-6">
        Help track the crisis. Your report is anonymous and helps others in your area.
      </p>

      {status === 'success' ? (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center text-3xl">
            ✓
          </div>
          <p className="text-green-400 font-semibold text-lg">Report submitted!</p>
          <p className="text-zinc-400 text-sm">Thank you for helping track the LPG situation.</p>
          <button
            onClick={() => setStatus('idle')}
            className="mt-2 text-sm text-cyan-400 hover:text-cyan-300 underline"
          >
            Submit another report
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-zinc-400 mb-2">City *</label>
            <input
              type="text"
              value={form.city}
              onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
              placeholder="e.g. Mumbai"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-2">State *</label>
            <select
              value={form.state}
              onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-colors"
              required
            >
              <option value="">Select state</option>
              {INDIAN_STATES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-2">Cylinder Type</label>
            <div className="flex gap-3">
              {(['domestic', 'commercial'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: t }))}
                  className={`flex-1 py-3 rounded-xl border text-sm font-medium capitalize transition-colors ${
                    form.type === t
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-2">
              Wait Days: <span className="text-white font-semibold">{form.waitDays}</span>
            </label>
            <input
              type="range"
              min={1}
              max={60}
              value={form.waitDays}
              onChange={e => setForm(f => ({ ...f, waitDays: Number(e.target.value) }))}
              className="w-full accent-cyan-500"
            />
            <div className="flex justify-between text-xs text-zinc-500 mt-1">
              <span>1 day</span>
              <span>60 days</span>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm text-zinc-400 mb-2">Description (optional)</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. My local distributor has been out of stock for 3 weeks..."
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-2">Your Name (optional)</label>
            <input
              type="text"
              value={form.reporterName}
              onChange={e => setForm(f => ({ ...f, reporterName: e.target.value }))}
              placeholder="Anonymous"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={status === 'submitting'}
              className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-black font-semibold py-3 rounded-xl transition-colors"
            >
              {status === 'submitting' ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>

          {errorMsg && (
            <div className="md:col-span-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              {errorMsg}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
