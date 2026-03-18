'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import IndiaLPGHeatmap, { type MapHandle } from '@/components/IndiaLPGHeatmap';
import LiveNewsPanel from '@/components/LiveNewsPanel';
import CitySearchInput from '@/components/CitySearchInput';
import SignalMonitorPanel from '@/components/SignalMonitorPanel';
import NationalSnapshotBanner from '@/components/NationalSnapshotBanner';
import CityAIBriefing from '@/components/CityAIBriefing';
import ReportShortageForm from '@/components/ReportShortageForm';
import { supabase } from '@/lib/supabase';

function delayCategory(days: number) {
  if (days >= 10) return 'High';
  if (days >= 6)  return 'Delayed';
  if (days >= 3)  return 'Watch';
  return               'Stable';
}

function stressCategory(pct: number) {
  if (pct >= 25) return 'Severe';
  if (pct >= 15) return 'Elevated';
  if (pct >= 8)  return 'Moderate';
  return              'Low';
}

export default function Home() {
  const [selectedCity, setSelectedCity]   = useState<string>('');
  const [cityData, setCityData]           = useState<any>(null);
  const mapRef       = useRef<MapHandle>(null);

  const handleCitySelect = useCallback((city: string) => {
    setSelectedCity(city);
    if (city) mapRef.current?.flyToCity(city);
  }, []);

  const [liveStats, setLiveStats] = useState({
    citiesScanning: 0,
    avgWait: 0,
    biggestShortage: 0,
    lastUpdated: '—',
  });

  useEffect(() => {
    const fetchStats = async () => {
      const { data: summaryData } = await supabase
        .from('state_summary')
        .select('total_cities, avg_wait_days, shortage_pct, last_updated');

      if (summaryData && summaryData.length > 0) {
        const totalCities = summaryData.reduce((sum, row) => sum + (row.total_cities || 0), 0);
        const avgWait     = Math.round(summaryData.reduce((sum, row) => sum + (row.avg_wait_days || 0), 0) / summaryData.length);
        const avgShortage = Math.round(summaryData.reduce((sum, row) => sum + (row.shortage_pct || 0), 0) / summaryData.length);
        const latest = summaryData.map(r => r.last_updated).filter(Boolean).sort().at(-1);
        const diffH  = latest ? Math.round((Date.now() - new Date(latest).getTime()) / 3600000) : null;
        setLiveStats({
          citiesScanning: totalCities,
          avgWait,
          biggestShortage: avgShortage,
          lastUpdated: diffH != null ? (diffH < 1 ? 'just now' : `${diffH}h ago`) : '—',
        });
      }
    };
    fetchStats();
  }, []);

  useEffect(() => {
    if (!selectedCity) { setCityData(null); return; }
    supabase.from('city_data').select('*').eq('city', selectedCity).limit(1).single()
      .then(({ data }) => setCityData(data));
  }, [selectedCity]);

  return (
    <div className="h-screen overflow-hidden bg-zinc-950 text-white flex flex-col">
      {/* ── TOP SECTION ─────────────────────────────── */}
      <nav className="border-b border-zinc-900 bg-zinc-950 shrink-0">
        <div className="max-w-full mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-cyan-500 rounded flex items-center justify-center text-black font-black text-xs tracking-tighter">LPG</div>
            <h1 className="text-lg font-black tracking-tighter">COMMAND CENTER</h1>
          </div>
          <div className="text-[10px] uppercase tracking-[2px] text-cyan-400 flex items-center gap-2 font-bold">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            LAST VERIFIED UPDATE · {liveStats.lastUpdated}
          </div>
        </div>
      </nav>

      {/* ONE LINE STATS */}
      <div className="border-b border-zinc-900 bg-zinc-900/30 px-4 py-1.5 flex items-center gap-6 shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          Cities Monitored: <span className="text-zinc-200">{liveStats.citiesScanning}</span>
        </span>
        <div className="w-px h-3 bg-zinc-800" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          Refill Delay: <span className="text-zinc-200">{delayCategory(liveStats.avgWait)}</span>
        </span>
        <div className="w-px h-3 bg-zinc-800" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          Supply Stress: <span className="text-zinc-200">{stressCategory(liveStats.biggestShortage)}</span>
        </span>
      </div>

      {/* ── MAIN LAYOUT ───────────────────────────── */}
      <main className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        
        {/* LEFT: INTEL STACK (35% on desktop) */}
        <div className="w-full md:w-[35%] border-b md:border-b-0 md:border-r border-zinc-900 flex flex-col p-3 gap-3 min-h-0 overflow-y-auto bg-zinc-950/50 order-2 md:order-1">
          
          {/* 1. CITY SEARCH (Compact) */}
          <div className="shrink-0">
            <CitySearchInput
              selectedCity={selectedCity}
              onCityChange={handleCitySelect}
              minimal
            />
          </div>

          {/* 2. CITY SPOTLIGHT (Compact Block) */}
          {selectedCity && cityData && (
            <div className="shrink-0 bg-zinc-900/30 border border-zinc-800/50 rounded-lg px-2.5 py-2 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[11px] font-black uppercase tracking-tight text-zinc-200">{selectedCity}</span>
                <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest leading-none mt-0.5">Focus Area</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold text-cyan-400">{cityData.wait_days}d wait</span>
                  <span className="text-[9px] text-zinc-600 font-medium uppercase tracking-tighter leading-none mt-0.5">{delayCategory(cityData.wait_days)} Delay</span>
                </div>
                <div className="w-px h-6 bg-zinc-800" />
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold text-zinc-300">{stressCategory(cityData.shortage_pct)}</span>
                  <span className="text-[9px] text-zinc-600 font-medium uppercase tracking-tighter leading-none mt-0.5">Stress</span>
                </div>
              </div>
            </div>
          )}

          {/* 3. DECISION SIGNAL (Hero Line) */}
          <div className="shrink-0 py-1">
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-3 py-2.5 flex items-center gap-3 shadow-[0_0_20px_rgba(6,182,212,0.05)]">
              <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-cyan-100 leading-tight">
                  {selectedCity && cityData 
                    ? (cityData.wait_days > 7 ? `↑ Booking pressure rising in ${selectedCity}` : `→ Supply stable in ${selectedCity}`)
                    : "↑ National supply pressure mounting"}
                </p>
              </div>
            </div>
          </div>

          {/* 4 & 5. AI CONTEXT (Single Lines) */}
          <div className="shrink-0 space-y-1.5 px-0.5">
            <NationalSnapshotBanner ultraMinimal />
            {selectedCity && <CityAIBriefing city={selectedCity} ultraMinimal />}
          </div>

          {/* 6. LIVE SIGNALS (Compact List) */}
          <div className="flex-1 min-h-0 flex flex-col min-w-0">
            <h3 className="text-[9px] font-black uppercase tracking-[3px] text-zinc-600 mb-2 px-1">Live Signals</h3>
            <div className="flex-1 overflow-y-auto no-scrollbar">
              <SignalMonitorPanel minimal />
            </div>
          </div>

          {/* 7. CROWD PROOF (Inline Strip) */}
          <div className="shrink-0 mt-auto pt-2">
            <ReportShortageForm variant="inline-strip" />
          </div>

          {/* 8. NEWS STRIP (Internal) */}
          <div className="shrink-0 border-t border-zinc-900 mt-2 pt-2 h-6 overflow-hidden">
            <LiveNewsPanel variant="ticker" />
          </div>

        </div>

        {/* RIGHT: VISUAL (65% on desktop) */}
        <div className="w-full md:w-[65%] flex flex-col min-h-0 bg-zinc-950 order-1 md:order-2 h-[50vh] md:h-full">
          
          <div className="flex-1 p-2 relative min-h-0">
            <div className="absolute inset-2 border border-zinc-900 rounded-2xl md:rounded-3xl overflow-hidden bg-zinc-900/20">
              <IndiaLPGHeatmap
                ref={mapRef}
                onCityClick={handleCitySelect}
                selectedCity={selectedCity}
              />
              
              {/* COMPACT CITY CHIP OVERLAY (Instead of large popup) */}
              {selectedCity && cityData && (
                <div className="absolute top-4 left-4 z-[1000] pointer-events-none">
                  <div className="bg-black/80 backdrop-blur-md border border-zinc-800 rounded-full pl-1.5 pr-4 py-1.5 flex items-center gap-3 shadow-2xl">
                    <div className="w-6 h-6 rounded-full bg-cyan-500 flex items-center justify-center text-black font-black text-[10px]">
                      {cityData.wait_days}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black text-white leading-none uppercase">{selectedCity}</span>
                      <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-tighter mt-0.5">{stressCategory(cityData.shortage_pct)} Stress</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

      </main>

      {/* GLOBAL FOOTER NEWS (Optional, if we keep the one in left column) */}
      {/* <LiveNewsPanel variant="ticker" /> */}
    </div>

  );
}
