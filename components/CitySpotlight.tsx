'use client';

import { useEffect, useState } from 'react';
import { MapPin, Clock, AlertTriangle, Search } from 'lucide-react';
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

function getStatus(waitDays: number, shortagePct: number): { label: string; color: string } {
  if (waitDays > 15 || shortagePct > 20) return { label: 'High Stress', color: 'text-red-400 bg-red-500/10 border-red-500/30' };
  if (waitDays > 8 || shortagePct > 10) return { label: 'Moderate Stress', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' };
  return { label: 'Stable', color: 'text-green-400 bg-green-500/10 border-green-500/30' };
}

function formatRelativeTime(dateStr: string): string {
  const diffH = Math.round((Date.now() - new Date(dateStr).getTime()) / 3600000);
  if (diffH < 1) return 'just now';
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

export default function CitySpotlight() {
  const [allCities, setAllCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<CityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Load all available cities
  useEffect(() => {
    supabase
      .from('city_data')
      .select('city')
      .neq('state', 'Unknown')
      .order('city')
      .then(({ data }) => {
        if (data) {
          const unique = [...new Set(data.map((r: any) => r.city))];
          setAllCities(unique);
        }
        setLoading(false);
      });
  }, []);

  // Try geolocation on mount
  useEffect(() => {
    if (!navigator.geolocation) return;
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`
          );
          const json = await res.json();
          const city =
            json.address?.city ||
            json.address?.town ||
            json.address?.village ||
            json.address?.county ||
            '';
          if (city) setSelectedCity(city);
        } catch {
          // silently fall through to manual selector
        } finally {
          setDetecting(false);
        }
      },
      () => setDetecting(false),
      { timeout: 6000 }
    );
  }, []);

  // Fetch city data when selectedCity changes
  useEffect(() => {
    if (!selectedCity) { setRows([]); return; }
    supabase
      .from('city_data')
      .select('city, state, cylinder_type, price_per_cylinder, wait_days, shortage_pct, last_updated')
      .ilike('city', selectedCity)
      .then(({ data }) => setRows(data || []));
  }, [selectedCity]);

  const filteredCities = allCities.filter(c =>
    c.toLowerCase().includes(search.toLowerCase())
  );

  const domestic = rows.find(r => r.cylinder_type === 'domestic');
  const commercial = rows.find(r => r.cylinder_type === 'commercial');
  const representative = commercial || domestic;
  const status = representative ? getStatus(representative.wait_days, Number(representative.shortage_pct)) : null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MapPin size={18} className="text-cyan-400" />
          YOUR CITY STATUS
        </h2>
        {detecting && <span className="text-xs text-zinc-500 animate-pulse">Detecting location…</span>}
      </div>

      {/* City selector */}
      <div className="relative mb-5">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          placeholder="Search your city…"
          value={selectedCity ? (showDropdown ? search : selectedCity) : search}
          onFocus={() => { setShowDropdown(true); setSearch(''); }}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          onChange={e => { setSearch(e.target.value); setSelectedCity(''); }}
          className="w-full bg-zinc-950 border border-zinc-700 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500"
        />
        {showDropdown && filteredCities.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl max-h-48 overflow-y-auto">
            {filteredCities.map(city => (
              <button
                key={city}
                onMouseDown={() => { setSelectedCity(city); setSearch(''); setShowDropdown(false); }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-800 transition-colors"
              >
                {city}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      {!selectedCity && !detecting && (
        <div className="text-sm text-zinc-500 text-center py-6">
          Search or allow location access to see your city's LPG status
        </div>
      )}

      {selectedCity && rows.length === 0 && (
        <div className="text-sm text-zinc-500 text-center py-6">
          No data found for <span className="text-white">{selectedCity}</span>. Try another city.
        </div>
      )}

      {representative && status && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-bold">{representative.city}</p>
              <p className="text-sm text-zinc-400">{representative.state}</p>
            </div>
            <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${status.color}`}>
              {status.label}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {domestic && (
              <div className="bg-zinc-950 rounded-2xl p-4 border border-zinc-800">
                <p className="text-xs text-zinc-500 mb-1">DOMESTIC (14.2kg)</p>
                <p className="text-lg font-bold">₹{Number(domestic.price_per_cylinder).toLocaleString('en-IN')}</p>
              </div>
            )}
            {commercial && (
              <div className="bg-zinc-950 rounded-2xl p-4 border border-zinc-800">
                <p className="text-xs text-zinc-500 mb-1">COMMERCIAL (19kg)</p>
                <p className="text-lg font-bold">₹{Number(commercial.price_per_cylinder).toLocaleString('en-IN')}</p>
              </div>
            )}
            <div className="bg-zinc-950 rounded-2xl p-4 border border-zinc-800">
              <p className="text-xs text-zinc-500 mb-1 flex items-center gap-1"><Clock size={10} /> WAIT DAYS</p>
              <p className={`text-lg font-bold ${representative.wait_days > 15 ? 'text-red-400' : representative.wait_days > 8 ? 'text-orange-400' : 'text-green-400'}`}>
                {representative.wait_days}d
              </p>
            </div>
            <div className="bg-zinc-950 rounded-2xl p-4 border border-zinc-800">
              <p className="text-xs text-zinc-500 mb-1 flex items-center gap-1"><AlertTriangle size={10} /> SHORTAGE</p>
              <p className={`text-lg font-bold ${Number(representative.shortage_pct) > 20 ? 'text-red-400' : Number(representative.shortage_pct) > 10 ? 'text-orange-400' : 'text-green-400'}`}>
                +{Number(representative.shortage_pct).toFixed(0)}%
              </p>
            </div>
          </div>

          <p className="text-xs text-zinc-600 text-right">
            Updated {formatRelativeTime(representative.last_updated)}
          </p>
        </div>
      )}
    </div>
  );
}
