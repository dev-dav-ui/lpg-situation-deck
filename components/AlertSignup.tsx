'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AlertSignup() {
  const [email, setEmail]         = useState('');
  const [state, setState]         = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg]   = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setState('submitting');
    setErrorMsg('');

    const { error } = await supabase
      .from('alert_signups')
      .insert({ email: trimmed });

    if (error) {
      // Unique violation = already signed up
      if (error.code === '23505') {
        setState('success'); // treat as success — idempotent
      } else {
        setState('error');
        setErrorMsg('Could not save your email. Please try again.');
      }
    } else {
      setState('success');
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
      {/* Label */}
      <div className="flex items-center gap-2 shrink-0">
        <Bell size={16} className="text-cyan-400" />
        <div>
          <p className="text-sm font-semibold">LPG Supply Alerts</p>
          <p className="text-xs text-zinc-500">Get notified when supply tightens</p>
        </div>
      </div>

      <div className="sm:ml-auto">
        {state === 'success' ? (
          <div className="flex items-center gap-2 text-green-400 text-sm">
            <span className="w-5 h-5 bg-green-500/20 rounded-full flex items-center justify-center text-xs">✓</span>
            You're on the list!
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-wrap">
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setErrorMsg(''); }}
              disabled={state === 'submitting'}
              className="bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors w-52"
            />
            <button
              type="submit"
              disabled={state === 'submitting'}
              className="bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-black font-semibold px-4 py-2 rounded-xl text-sm transition-colors whitespace-nowrap"
            >
              {state === 'submitting' ? 'Saving…' : 'Notify Me'}
            </button>
            {errorMsg && <span className="text-red-400 text-xs w-full">{errorMsg}</span>}
          </form>
        )}
      </div>
    </div>
  );
}
