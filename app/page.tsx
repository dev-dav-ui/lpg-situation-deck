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
      <main className="flex-1 flex min-h-0 overflow-hidden">
        
        {/* LEFT: INTEL STACK (40%) */}
        <div className="w-[40%] border-r border-zinc-900 flex flex-col p-4 gap-4 min-h-0 overflow-y-auto">
          
          {/* 1. CITY FOCUS */}
          <div className="space-y-3">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-3">
              <CitySearchInput
                selectedCity={selectedCity}
                onCityChange={handleCitySelect}
              />
              {selectedCity && cityData && (
                <div className="mt-2 text-xs font-bold flex items-center justify-between text-zinc-400">
                  <span>{selectedCity} — {stressCategory(cityData.shortage_pct)}</span>
                  <span className="text-cyan-400">{cityData.wait_days}d wait</span>
                </div>
              )}
            </div>
          </div>

          {/* 2 & 3. AI INSIGHT + CITY BRIEFING */}
          <div className="space-y-2">
            <NationalSnapshotBanner minimal />
            {selectedCity && <CityAIBriefing city={selectedCity} minimal />}
          </div>

          {/* 4. LIVE SIGNALS */}
          <SignalMonitorPanel minimal />

        </div>

        {/* RIGHT: VISUAL (60%) */}
        <div className="w-[60%] flex flex-col min-h-0 bg-zinc-950">
          
          {/* MAP (~70% height) */}
          <div className="flex-[7] p-2 relative">
            <div className="absolute inset-2 border border-zinc-900 rounded-3xl overflow-hidden bg-zinc-900/20">
              <IndiaLPGHeatmap
                ref={mapRef}
                onCityClick={handleCitySelect}
                selectedCity={selectedCity}
              />
            </div>
          </div>

          {/* CROWD WAIT TIMES (below map) */}
          <div className="flex-[3] px-4 pb-4 overflow-y-auto">
            <ReportShortageForm variant="display-only" />
          </div>

        </div>

      </main>

      {/* 5. NEWS Ticker */}
      <LiveNewsPanel variant="ticker" />
    </div>
  );
}
