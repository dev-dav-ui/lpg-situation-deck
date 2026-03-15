import { ShieldCheck } from 'lucide-react';

export default function SystemMethodologyStrip() {
  return (
    <div className="mt-8 border border-zinc-800 rounded-2xl px-6 py-5 bg-zinc-900/40">
      <div className="flex items-start gap-3">
        <ShieldCheck size={15} className="text-zinc-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Signals aggregated from verified news coverage, public LPG pricing updates, and city-level
            system observations. This system interprets supply signals and avoids false precision where
            official data coverage is limited.
          </p>
          <p className="text-xs text-zinc-600 mt-2 leading-relaxed">
            Domestic cylinder prices sourced from distributor networks and updated every 6 hours.
            Delay and stress levels are categorical interpretations — not measured field data.
            Always verify with your local distributor before making supply decisions.
          </p>
        </div>
      </div>
    </div>
  );
}
