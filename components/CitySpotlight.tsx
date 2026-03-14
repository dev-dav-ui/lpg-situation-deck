'use client';

import { useEffect, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface CityRow {
  city: string;
  state: string;
  cylinder_type: string;
  price_per_cylinder: number;
  wait_days: number;
  shortage_pct: number;
  last_updated: string;
}

function getStatus(waitDays: number, shortagePct: number) {
  if (waitDays > 15 || shortagePct > 20) return { label: 'High Stress', dot: 'bg-red-500', text: 'text-red-400' };
  if (waitDays > 8  || shortagePct > 10) return { label: 'Moderate',    dot: 'bg-orange-400', text: 'text-orange-400' };
  return                                         { label: 'Stable',      dot: 'bg-green-500',  text: 'text-green-400' };
}

function formatRelativeTime(dateStr: string): string {
  const diffH = Math.round((Date.now() - new Date(dateStr).getTime()) / 3600000);
  if (diffH < 1) return 'just now';
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

interface CitySpotlightProps {
  onCityChange?: (city: string) => void;
}

export default function CitySpotlight({ onCityChange }: CitySpotlightProps) {
  const [allCities, setAllCities]       = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState('');
  const [search, setSearch]             = useState('');
  const [rows, setRows]                 = useState<CityRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [detecting, setDetecting]       = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    supabase.from('city_data').select('city').neq('state', 'Unknown').order('city')
      .then(({ data }) => {
        if (data) setAllCities([...new Set(data.map((r: any) => r.city))]);
        setLoading(false);
      });
  }, []);

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
        } catch { /* fall through */ } finally { setDetecting(false); }
      },
      () => setDetecting(false),
      { timeout: 6000 }
    );
  }, []);

  useEffect(() => { onCityChange?.(selectedCity); }, [selectedCity]);

  useEffect(() => {
    if (!selectedCity) { setRows([]); return; }
    supabase.from('city_data')
      .select('city, state, cylinder_type, price_per_cylinder, wait_days, shortage_pct, last_updated')
      .ilike('city', selectedCity)
      .then(({ data }) => setRows(data || []));
  }, [selectedCity]);

  const filteredCities = allCities.filter(c => c.toLowerCase().includes(search.toLowerCase()));
  const domestic       = rows.find(r => r.cylinder_type === 'domestic');
  const commercial     = rows.find(r => r.cylinder_type === 'commercial');
  const rep            = commercial || domestic;
  const status         = rep ? getStatus(rep.wait_days, Number(rep.shortage_pct)) : null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3">

      {/* Label */}
      <div className="flex items-center gap-1.5 text-xs text-zinc-400 shrink-0">
        <MapPin size={13} className="text-cyan-400" />
        <span className="uppercase tracking-wider font-medium">Your City</span>
        {detecting && <span className="text-zinc-600 animate-pulse">detecting…</span>}
      </div>

      {/* Search input */}
      <div className="relative shrink-0">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          placeholder={loading ? 'Loading…' : 'Search city…'}
          value={selectedCity ? (showDropdown ? search : selectedCity) : search}
          onFocus={() => { setShowDropdown(true); setSearch(''); }}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          onChange={e => { setSearch(e.target.value); setSelectedCity(''); }}
          className="bg-zinc-950 border border-zinc-700 rounded-lg pl-7 pr-3 py-1.5 text-xs w-36 focus:outline-none focus:border-cyan-500"
        />
        {showDropdown && filteredCities.length > 0 && (
          <div className="absolute z-50 top-full mt-1 left-0 w-48 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl max-h-48 overflow-y-auto">
            {filteredCities.map(city => (
              <button key={city} onMouseDown={() => { setSelectedCity(city); setSearch(''); setShowDropdown(false); }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 transition-colors">
                {city}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* No data state */}
      {selectedCity && rows.length === 0 && (
        <span className="text-xs text-zinc-500">No data for <span className="text-white">{selectedCity}</span></span>
      )}

      {/* Results strip */}
      {rep && status && (
        <>
          {/* Divider */}
          <div className="hidden sm:block w-px h-4 bg-zinc-700" />

          {/* City + status */}
          <div className="flex items-center gap-2 shrink-0">
            <span className={`w-2 h-2 rounded-full ${status.dot} animate-pulse`} />
            <span className="text-sm font-semibold">{rep.city}</span>
            <span className={`text-xs font-medium ${status.text}`}>{status.label}</span>
          </div>

          <div className="hidden sm:block w-px h-4 bg-zinc-700" />

          {/* Metrics */}
          <div className="flex items-center gap-4 text-xs flex-wrap">
            {domestic && (
              <span><span className="text-zinc-500">Dom </span><span className="font-semibold">₹{Number(domestic.price_per_cylinder).toLocaleString('en-IN')}</span></span>
            )}
            {commercial && (
              <span><span className="text-zinc-500">Com </span><span className="font-semibold">₹{Number(commercial.price_per_cylinder).toLocaleString('en-IN')}</span></span>
            )}
            <span><span className="text-zinc-500">Wait </span><span className={`font-semibold ${rep.wait_days > 15 ? 'text-red-400' : rep.wait_days > 8 ? 'text-orange-400' : 'text-green-400'}`}>{rep.wait_days}d</span></span>
            <span><span className="text-zinc-500">Shortage </span><span className={`font-semibold ${Number(rep.shortage_pct) > 20 ? 'text-red-400' : Number(rep.shortage_pct) > 10 ? 'text-orange-400' : 'text-green-400'}`}>+{Number(rep.shortage_pct).toFixed(0)}%</span></span>
            <span className="text-zinc-600">{formatRelativeTime(rep.last_updated)}</span>
          </div>
        </>
      )}

      {/* Empty state */}
      {!selectedCity && !detecting && (
        <span className="text-xs text-zinc-600">Allow location or search a city</span>
      )}
    </div>
  );
}
