'use client';

import { useEffect, useState } from 'react';
import StatsHeader from '@/components/StatsHeader';
import IndiaLPGHeatmap from '@/components/IndiaLPGHeatmap';
import LiveNewsPanel from '@/components/LiveNewsPanel';
import CityTable from '@/components/CityTable';
import UsageTrendChart from '@/components/UsageTrendChart';
import ReportShortageForm from '@/components/ReportShortageForm';

export default function Home() {
  const [liveStats, setLiveStats] = useState({
    citiesScanning: 248,
    avgWait: 14,
    biggestShortage: 32,
    watching: 42700,
    lastUpdated: '2h ago',
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveStats(prev => ({
        ...prev,
        watching: prev.watching + Math.floor(Math.random() * 300) + 100,
      }));
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md fixed w-full z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-cyan-500 rounded flex items-center justify-center text-black font-bold">LPG</div>
            <h1 className="text-2xl font-bold tracking-tighter">LPG SITUATION DECK</h1>
          </div>
          <div className="text-xs uppercase tracking-[3px] text-cyan-400 flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            SCANNING LIVE &bull; LAST UPDATED {liveStats.lastUpdated}
          </div>
        </div>
      </nav>

      {/* Data sync banner */}
      <div className="border-b border-yellow-500/20 bg-yellow-500/5 text-yellow-400 text-xs text-center py-2 px-4 mt-[57px]">
        Data updates every 6h via automated scraper &bull; Next sync: 6 AM IST &bull; Showing seed data until Supabase is connected
      </div>

      <div className="pt-4 pb-12 max-w-7xl mx-auto px-6">
        <StatsHeader stats={liveStats} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-8">
          <div className="lg:col-span-8 bg-zinc-900 rounded-3xl border border-zinc-800 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              \uD83C\uDDEE\uD83C\uDDF3 INDIA LPG AVAILABILITY HEATMAP
              <span className="text-xs bg-red-500/20 text-red-400 px-3 py-1 rounded-full">LIVE ALERT ZONES</span>
            </h2>
            <IndiaLPGHeatmap />
          </div>

          <div className="lg:col-span-4 space-y-6">
            <LiveNewsPanel />
            <UsageTrendChart />
          </div>
        </div>

        <div className="mt-8 bg-zinc-900 rounded-3xl border border-zinc-800 p-8">
          <CityTable />
        </div>

        <div className="mt-8">
          <ReportShortageForm />
        </div>
      </div>
    </div>
  );
}
