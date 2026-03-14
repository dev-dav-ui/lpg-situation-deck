'use client';

import { useEffect, useState } from 'react';
import StatsHeader from '@/components/StatsHeader';
import IndiaLPGHeatmap from '@/components/IndiaLPGHeatmap';
import LiveNewsPanel from '@/components/LiveNewsPanel';
import CityTable from '@/components/CityTable';
import UsageTrendChart from '@/components/UsageTrendChart';
import ReportShortageForm from '@/components/ReportShortageForm';
import CommunitySignals from '@/components/CommunitySignals';
import CitySpotlight from '@/components/CitySpotlight';
import AlertSignup from '@/components/AlertSignup';
import AboutFooter from '@/components/AboutFooter';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [userCity, setUserCity] = useState<string>('');
  const [liveStats, setLiveStats] = useState({
    citiesScanning: 0,
    avgWait: 0,
    biggestShortage: 0,
    lastUpdated: '—',
  });

  useEffect(() => {
    const fetchStats = async () => {
      const { data, error } = await supabase
        .from('state_summary')
        .select('total_cities, avg_wait_days, shortage_pct, last_updated');

      if (data && data.length > 0) {
        const totalCities = data.reduce((sum, row) => sum + (row.total_cities || 0), 0);
        const avgWait = Math.round(data.reduce((sum, row) => sum + (row.avg_wait_days || 0), 0) / data.length);
        const avgShortage = Math.round(data.reduce((sum, row) => sum + (row.shortage_pct || 0), 0) / data.length);
        const latest = data
          .map(r => r.last_updated)
          .filter(Boolean)
          .sort()
          .at(-1);

        const diffH = latest
          ? Math.round((Date.now() - new Date(latest).getTime()) / 3600000)
          : null;

        setLiveStats(prev => ({
          ...prev,
          citiesScanning: totalCities,
          avgWait,
          biggestShortage: avgShortage,
          lastUpdated: diffH != null ? (diffH < 1 ? 'just now' : `${diffH}h ago`) : '—',
        }));
      }
    };

    fetchStats();

    return () => {};
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 w-full z-50">
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
      <div className="border-b border-yellow-500/20 bg-yellow-500/5 text-yellow-400 text-xs text-center py-2 px-4">
        Data updates every 6h via automated scraper &bull; Next sync: 6 AM IST
        {liveStats.lastUpdated !== '—' && (
          <span className="ml-3 text-zinc-500">
            &bull; Last data refresh: <span className="text-zinc-400">{liveStats.lastUpdated}</span>
          </span>
        )}
      </div>

      <div className="pt-4 pb-12 max-w-7xl mx-auto px-6">
        <StatsHeader stats={liveStats} />

        <div className="mt-8">
          <CitySpotlight onCityChange={setUserCity} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-8">
          <div className="lg:col-span-8 bg-zinc-900 rounded-3xl border border-zinc-800 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              🇮🇳 INDIA LPG AVAILABILITY HEATMAP
              <span className="text-xs bg-red-500/20 text-red-400 px-3 py-1 rounded-full">LIVE ALERT ZONES</span>
            </h2>
            <IndiaLPGHeatmap userCity={userCity} />
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

        <div className="mt-8">
          <CommunitySignals />
        </div>

        <div className="mt-8">
          <AlertSignup />
        </div>

        <AboutFooter />
      </div>
    </div>
  );
}
