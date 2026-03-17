'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import StatsHeader from '@/components/StatsHeader';
import IndiaLPGHeatmap, { type MapHandle } from '@/components/IndiaLPGHeatmap';
import LiveNewsPanel from '@/components/LiveNewsPanel';
import CityTable from '@/components/CityTable';
import ReportShortageForm from '@/components/ReportShortageForm';
import CitySpotlight from '@/components/CitySpotlight';
import CitySearchInput from '@/components/CitySearchInput';
import AlertSignup from '@/components/AlertSignup';
import GlobalSupplySignals from '@/components/GlobalSupplySignals';
import AboutFooter from '@/components/AboutFooter';
import IndiaSituationBanner from '@/components/IndiaSituationBanner';
import SignalMonitorPanel from '@/components/SignalMonitorPanel';
import SystemMethodologyStrip from '@/components/SystemMethodologyStrip';
import NationalSnapshotBanner from '@/components/NationalSnapshotBanner';
import CityAIBriefing from '@/components/CityAIBriefing';
import SystemHealthIndicator from '@/components/SystemHealthIndicator';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [userCity, setUserCity]           = useState<string>('');
  const [spotlightCity, setSpotlightCity] = useState<string>('');
  const [selectedCity, setSelectedCity]   = useState<string>('');
  const spotlightRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<MapHandle>(null);

  // Page-level city selection: updates overlay + rail spotlight + map highlight + zoom
  // Does NOT auto-scroll — user stays in the map console
  const handleCitySelect = useCallback((city: string) => {
    setSelectedCity(city);
    setUserCity(city);
    setSpotlightCity(city);
    if (city) mapRef.current?.flyToCity(city);
  }, []);

  // Map marker / table row click — same as city select, no auto-scroll
  const handleCityClick = useCallback((city: string) => {
    handleCitySelect(city);
  }, [handleCitySelect]);

  // Explicit scroll to below-fold spotlight — only triggered by "View full details"
  const scrollToSpotlight = useCallback(() => {
    spotlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const [liveStats, setLiveStats] = useState({
    citiesScanning: 0,
    avgWait: 0,
    biggestShortage: 0,
    lastUpdated: '—',
    lastUpdatedISO: '',
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
          lastUpdatedISO: latest ?? '',
        });
        return;
      }

      const { data: cityData } = await supabase
        .from('city_data')
        .select('city, wait_days, shortage_pct, last_updated')
        .neq('state', 'Unknown');

      if (cityData && cityData.length > 0) {
        const perCity = new Map<string, { wait: number; shortage: number; updated: string }>();
        for (const row of cityData) {
          const cur = perCity.get(row.city);
          if (!cur || row.wait_days > cur.wait) {
            perCity.set(row.city, { wait: Number(row.wait_days), shortage: Number(row.shortage_pct), updated: row.last_updated });
          }
        }
        const vals    = Array.from(perCity.values());
        const avgWait = Math.round(vals.reduce((s, v) => s + v.wait, 0) / vals.length);
        const avgShort = Math.round(vals.reduce((s, v) => s + v.shortage, 0) / vals.length);
        const latest  = vals.map(v => v.updated).filter(Boolean).sort().at(-1);
        const diffH   = latest ? Math.round((Date.now() - new Date(latest).getTime()) / 3600000) : null;
        setLiveStats({
          citiesScanning: perCity.size,
          avgWait,
          biggestShortage: avgShort,
          lastUpdated: diffH != null ? (diffH < 1 ? 'just now' : `${diffH}h ago`) : '—',
          lastUpdatedISO: latest ?? '',
        });
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">

      {/* ── FULL-WIDTH HEADER ZONE ─────────────────────────────── */}
      <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 w-full z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-cyan-500 rounded flex items-center justify-center text-black font-bold">LPG</div>
            <h1 className="text-2xl font-bold tracking-tighter">LPG SITUATION DECK</h1>
          </div>
          <div className="text-xs uppercase tracking-[3px] text-cyan-400 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${liveStats.lastUpdated === '—' ? 'bg-zinc-600' : 'bg-green-500 animate-pulse'}`} />
            {liveStats.lastUpdated === '—'
              ? 'AWAITING SIGNAL UPDATE'
              : `LAST VERIFIED UPDATE · ${liveStats.lastUpdated}`}
          </div>
        </div>
      </nav>

      <IndiaSituationBanner
        lastUpdated={liveStats.lastUpdated}
        citiesScanning={liveStats.citiesScanning}
      />

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

        {/* Stats strip — temporary: full 4-card header until compact variant built in Pass 2 */}
        <StatsHeader stats={liveStats} />

        {/* National Snapshot — AI Situational Summary */}
        <NationalSnapshotBanner />

        {/* ── CONSOLE ZONE: two-column ───────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-8 items-start">

          {/* RIGHT: main map surface — first in DOM so mobile shows map first */}
          <div className="order-1 lg:order-2 lg:col-span-8 space-y-4">
            <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6 shadow-2xl">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                🇮🇳 INDIA LPG SIGNAL INTENSITY MAP
                <span className="text-xs bg-zinc-700/60 text-zinc-400 px-3 py-1 rounded-full">SIGNAL VIEW</span>
              </h2>
              <p className="text-xs text-zinc-600 mb-3">
                Markers represent aggregated LPG supply signals from monitored cities. Updated every 6 hours.
              </p>

              <IndiaLPGHeatmap
                ref={mapRef}
                userCity={userCity}
                onCityClick={handleCityClick}
                selectedCity={selectedCity}
                onOverlayViewDetails={scrollToSpotlight}
                onOverlayDismiss={() => handleCitySelect('')}
              />
            </div>
          </div>

          {/* LEFT: intelligence rail — second in DOM so mobile shows it after map */}
          <div className="order-2 lg:order-1 lg:col-span-4 space-y-4">
            {/* National signal summary */}
            <SignalMonitorPanel />

            {/* Breaking / live signals */}
            <LiveNewsPanel />

            {/* City search — controls rail spotlight + map highlight */}
            <CitySearchInput
              selectedCity={selectedCity}
              onCityChange={handleCitySelect}
            />

            {/* Compact spotlight — only renders when a city is selected */}
            {selectedCity && (
              <>
                <CitySpotlight
                  compact
                  selectedCityProp={selectedCity}
                />
                <CityAIBriefing city={selectedCity} />
              </>
            )}

            {/* Methodology strip anchors the bottom of the rail */}
            <SystemMethodologyStrip />
          </div>

        </div>

        {/* ── BELOW CONSOLE: full-width bridge ──────────────────── */}
        <div className="mt-8">
          <GlobalSupplySignals />
        </div>

        {/* ── FULL-WIDTH UTILITY SECTIONS ───────────────────────── */}
        <div ref={spotlightRef} className="mt-8">
          <CitySpotlight
            onCityChange={setUserCity}
            selectedCityProp={spotlightCity}
          />
          {spotlightCity && <CityAIBriefing city={spotlightCity} />}
        </div>

        <div className="mt-8 bg-zinc-900 rounded-3xl border border-zinc-800 p-8">
          <CityTable onCityClick={handleCityClick} />
        </div>

        <div className="mt-8">
          <ReportShortageForm />
        </div>

        <div className="mt-8">
          <AlertSignup />
        </div>

        <SystemHealthIndicator />

        <AboutFooter />

      </div>
    </div>
  );
}
