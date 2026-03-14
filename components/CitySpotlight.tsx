'use client';

import { useEffect, useState, useMemo } from 'react';
import { MapPin, Search, Clock, TrendingUp, TrendingDown, Minus, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatRelativeTime, getWaitColor } from '@/lib/utils';

interface CityRow {
  city: string;
  state: string;
  cylinder_type: string;
  price_per_cylinder: number;
  wait_days: number;
  shortage_pct: number;
  last_updated: string;
}

interface NationalAvg {
  avgWait: number;
  avgShortage: number;
}

function getStatus(waitDays: number, shortagePct: number) {
  if (waitDays > 15 || shortagePct > 20) return { label: 'High Stress', dot: 'bg-red-500',    text: 'text-red-400',    border: 'border-red-500/30',    bg: 'bg-red-500/10'    };
  if (waitDays > 8  || shortagePct > 10) return { label: 'Moderate',    dot: 'bg-orange-400', text: 'text-orange-400', border: 'border-orange-500/30', bg: 'bg-orange-500/10' };
  return                                         { label: 'Stable',      dot: 'bg-green-500',  text: 'text-green-400',  border: 'border-green-500/30',  bg: 'bg-green-500/10'  };
}

function shortageColor(pct: number): string {
  if (pct > 25) return 'text-red-400';
  if (pct >= 10) return 'text-amber-400';
  return 'text-green-400';
}

function diffLabel(delta: number, unit: string, worseName: string, betterName: string): { text: string; icon: React.ReactNode; color: string } {
  if (Math.abs(delta) < 1) {
    return { text: `On par with India average`, icon: <Minus size={13} />, color: 'text-zinc-400' };
  }
  if (delta > 0) {
    return {
      text: `${Math.abs(delta).toFixed(0)}${unit} ${worseName} than India average`,
      icon: <TrendingUp size={13} />,
      color: 'text-red-400',
    };
  }
  return {
    text: `${Math.abs(delta).toFixed(0)}${unit} ${betterName} than India average`,
    icon: <TrendingDown size={13} />,
    color: 'text-green-400',
  };
}

interface CitySpotlightProps {
  onCityChange?: (city: string) => void;
}

export default function CitySpotlight({ onCityChange }: CitySpotlightProps) {
  const [allCities, setAllCities]       = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState('');
  const [search, setSearch]             = useState('');
  const [rows, setRows]                 = useState<CityRow[]>([]);
  const [allRows, setAllRows]           = useState<CityRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [detecting, setDetecting]       = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Load all city data once (for national avg + city list)
  useEffect(() => {
    supabase
      .from('city_data')
      .select('city, state, cylinder_type, price_per_cylinder, wait_days, shortage_pct, last_updated')
      .neq('state', 'Unknown')
      .then(({ data }) => {
        if (data) {
          setAllRows(data);
          setAllCities([...new Set(data.map((r: any) => r.city as string))].sort());
        }
        setLoading(false);
      });
  }, []);

  // Geolocation auto-detect
  useEffect(() => {
    if (!navigator.geolocation) return;
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`);
          const json = await res.json();
          const city = json.address?.city || json.address?.town || json.address?.village || json.address?.county || '';
          if (city) { setSelectedCity(city); onCityChange?.(city); }
        } catch { /* ignore */ } finally { setDetecting(false); }
      },
      () => setDetecting(false),
      { timeout: 6000 }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { onCityChange?.(selectedCity); }, [selectedCity]);

  // Filter rows for selected city from already-loaded allRows
  useEffect(() => {
    if (!selectedCity) { setRows([]); return; }
    const cityRows = allRows.filter(r => r.city.toLowerCase() === selectedCity.toLowerCase());
    setRows(cityRows);
  }, [selectedCity, allRows]);

  // National averages (one row per city — take max per city to avoid double-counting)
  const national: NationalAvg = useMemo(() => {
    if (allRows.length === 0) return { avgWait: 0, avgShortage: 0 };
    const perCity = new Map<string, { waitDays: number; shortagePct: number }>();
    for (const r of allRows) {
      const key = r.city.toLowerCase();
      const cur = perCity.get(key);
      if (!cur || r.wait_days > cur.waitDays) {
        perCity.set(key, { waitDays: Number(r.wait_days), shortagePct: Number(r.shortage_pct) });
      }
    }
    const vals = Array.from(perCity.values());
    const avgWait     = vals.reduce((s, v) => s + v.waitDays,     0) / vals.length;
    const avgShortage = vals.reduce((s, v) => s + v.shortagePct,  0) / vals.length;
    return { avgWait, avgShortage };
  }, [allRows]);

  const filteredCities = allCities.filter(c => c.toLowerCase().includes(search.toLowerCase())).slice(0, 30);
  const domestic       = rows.find(r => r.cylinder_type === 'domestic');
  const commercial     = rows.find(r => r.cylinder_type === 'commercial');
  const rep            = commercial || domestic;
  const status         = rep ? getStatus(rep.wait_days, Number(rep.shortage_pct)) : null;

  const waitDiff     = rep ? rep.wait_days       - national.avgWait     : 0;
  const shortageDiff = rep ? Number(rep.shortage_pct) - national.avgShortage : 0;
  const waitCmp      = diffLabel(waitDiff,     'd',  'longer wait', 'shorter wait');
  const shortageCmp  = diffLabel(shortageDiff, '%',  'higher shortage', 'lower shortage');

  const hasData = !!rep && !!status;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
      {/* Section header + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-5">
        <div className="flex items-center gap-2">
          <MapPin size={15} className="text-cyan-400 shrink-0" />
          <h2 className="text-lg font-semibold tracking-tight">YOUR CITY SPOTLIGHT</h2>
        </div>

        {/* Search input */}
        <div className="relative sm:ml-auto">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder={loading ? 'Loading cities…' : 'Search your city…'}
            value={selectedCity ? (showDropdown ? search : selectedCity) : search}
            onFocus={() => { setShowDropdown(true); setSearch(''); }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            onChange={e => { setSearch(e.target.value); setSelectedCity(''); }}
            className="bg-zinc-950 border border-zinc-700 rounded-xl pl-8 pr-4 py-2 text-sm w-52 focus:outline-none focus:border-cyan-500 transition-colors"
          />
          {detecting && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 animate-pulse">detecting…</span>
          )}
          {showDropdown && filteredCities.length > 0 && (
            <div className="absolute z-50 top-full mt-1 left-0 w-52 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-h-56 overflow-y-auto">
              {filteredCities.map(city => (
                <button
                  key={city}
                  onMouseDown={() => { setSelectedCity(city); setSearch(''); setShowDropdown(false); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 transition-colors first:rounded-t-xl last:rounded-b-xl"
                >
                  {city}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Empty / placeholder state */}
      {!selectedCity && !detecting && (
        <div className="border border-zinc-800 border-dashed rounded-2xl px-6 py-10 text-center">
          <MapPin size={22} className="text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">
            Search for your city to see LPG supply stress, wait times and pricing signals.
          </p>
        </div>
      )}

      {/* No data for selected city */}
      {selectedCity && rows.length === 0 && !loading && (
        <div className="border border-zinc-800 border-dashed rounded-2xl px-6 py-8 text-center">
          <p className="text-sm text-zinc-500">No data available for <span className="text-white font-medium">{selectedCity}</span>.</p>
          <p className="text-xs text-zinc-600 mt-1">Try searching for a nearby major city.</p>
        </div>
      )}

      {/* Spotlight card */}
      {hasData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Left: city identity + status */}
          <div className={`lg:col-span-1 rounded-2xl border p-5 flex flex-col gap-4 ${status.border} ${status.bg}`}>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2.5 h-2.5 rounded-full ${status.dot} animate-pulse`} />
                <span className={`text-xs font-semibold uppercase tracking-wider ${status.text}`}>{status.label}</span>
              </div>
              <h3 className="text-2xl font-bold tracking-tight">{rep.city}</h3>
              <p className="text-sm text-zinc-500 mt-0.5">{rep.state}</p>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-zinc-600 mt-auto">
              <Clock size={11} />
              Updated {formatRelativeTime(rep.last_updated)}
            </div>
          </div>

          {/* Middle: key metrics */}
          <div className="lg:col-span-1 grid grid-cols-2 gap-3">
            {/* Wait days */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Wait Days</span>
              <span className={`text-2xl font-bold tabular-nums ${getWaitColor(rep.wait_days)}`}>{rep.wait_days}<span className="text-sm font-medium ml-0.5">d</span></span>
            </div>

            {/* Shortage % */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Shortage</span>
              <span className={`text-2xl font-bold tabular-nums ${shortageColor(Number(rep.shortage_pct))}`}>+{Number(rep.shortage_pct).toFixed(0)}<span className="text-sm font-medium ml-0.5">%</span></span>
            </div>

            {/* Domestic price */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Domestic</span>
              {domestic
                ? <span className="text-lg font-bold text-blue-300 tabular-nums">₹{Number(domestic.price_per_cylinder).toLocaleString('en-IN')}</span>
                : <span className="text-zinc-600 text-sm mt-1">—</span>
              }
            </div>

            {/* Commercial price */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Commercial</span>
              {commercial
                ? <span className="text-lg font-bold text-purple-300 tabular-nums">₹{Number(commercial.price_per_cylinder).toLocaleString('en-IN')}</span>
                : <span className="text-zinc-600 text-sm mt-1">—</span>
              }
            </div>
          </div>

          {/* Right: national comparison */}
          <div className="lg:col-span-1 bg-zinc-950 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4">
            <div>
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">vs. India Average</span>
              {national.avgWait > 0 && (
                <p className="text-xs text-zinc-600 mt-0.5">
                  Avg wait {national.avgWait.toFixed(0)}d · Avg shortage {national.avgShortage.toFixed(0)}%
                </p>
              )}
            </div>

            <div className="space-y-3">
              {/* Wait days comparison */}
              <div className={`flex items-start gap-2.5 ${waitCmp.color}`}>
                <span className="shrink-0 mt-0.5">{waitCmp.icon}</span>
                <span className="text-sm font-medium leading-snug">{waitCmp.text}</span>
              </div>

              {/* Shortage comparison */}
              <div className={`flex items-start gap-2.5 ${shortageCmp.color}`}>
                <span className="shrink-0 mt-0.5">{shortageCmp.icon}</span>
                <span className="text-sm font-medium leading-snug">{shortageCmp.text}</span>
              </div>
            </div>

            <div className="mt-auto pt-3 border-t border-zinc-800">
              <div className="flex items-center justify-between text-xs text-zinc-600">
                <span className="flex items-center gap-1"><Package size={11} /> National avg</span>
                <span>{allCities.length} cities monitored</span>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
