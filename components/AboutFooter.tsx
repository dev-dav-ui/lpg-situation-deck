import { ExternalLink } from 'lucide-react';

export default function AboutFooter() {
  return (
    <footer className="mt-12 border-t border-zinc-800 pt-8 pb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-zinc-400">

        {/* About */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">About This Dashboard</h4>
          <p className="leading-relaxed text-zinc-400">
            An independent LPG supply monitoring tool tracking cylinder availability,
            price trends, and shortage signals across India in near real-time.
          </p>
          <p className="mt-2 text-zinc-600 text-xs">
            Not affiliated with or endorsed by MyLPG, IOCL, HPCL, BPCL, or any
            government portal.
          </p>
        </div>

        {/* Data Sources */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">Data Sources</h4>
          <ul className="space-y-1.5 text-zinc-400">
            <li className="flex items-start gap-1.5">
              <span className="w-1 h-1 rounded-full bg-cyan-500 mt-2 shrink-0" />
              Indian Oil Corporation (IOCL) LPG price pages
            </li>
            <li className="flex items-start gap-1.5">
              <span className="w-1 h-1 rounded-full bg-cyan-500 mt-2 shrink-0" />
              HPCL &amp; BPCL distributor pricing pages
            </li>
            <li className="flex items-start gap-1.5">
              <span className="w-1 h-1 rounded-full bg-cyan-500 mt-2 shrink-0" />
              Commodity pricing aggregators
            </li>
            <li className="flex items-start gap-1.5">
              <span className="w-1 h-1 rounded-full bg-cyan-500 mt-2 shrink-0" />
              News monitoring feeds (Economic Times, Livemint)
            </li>
            <li className="flex items-start gap-1.5">
              <span className="w-1 h-1 rounded-full bg-cyan-500 mt-2 shrink-0" />
              Community reports submitted by users
            </li>
            <li className="flex items-start gap-1.5">
              <span className="w-1 h-1 rounded-full bg-amber-400 mt-2 shrink-0" />
              <span>
                PPAC consumption reports{' '}
                <span className="text-zinc-600">(where available)</span>
              </span>
            </li>
          </ul>
        </div>

        {/* Disclaimer + update cadence */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">Disclaimer</h4>
          <p className="leading-relaxed text-zinc-400">
            Data is scraped and aggregated automatically every 6 hours. Prices and
            availability may differ from your local distributor. Always verify with
            your official LPG provider before making decisions.
          </p>
          <p className="mt-3 text-zinc-600 text-xs">
            © 2026 LPG Situation Deck &bull; Built for public awareness
          </p>
        </div>
      </div>
    </footer>
  );
}
