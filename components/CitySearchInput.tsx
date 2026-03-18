'use client';

import { useEffect, useState } from 'react';
import { Search, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Props {
  selectedCity: string;
  onCityChange: (city: string) => void;
  minimal?: boolean;
}

export default function CitySearchInput({ selectedCity, onCityChange, minimal = false }: Props) {
  const [allCities, setAllCities]       = useState<string[]>([]);
  const [search, setSearch]             = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    supabase
      .from('city_data')
      .select('city')
      .neq('state', 'Unknown')
      .then(({ data }) => {
        if (data) {
          setAllCities([...new Set(data.map((r: any) => r.city as string))].sort());
        }
        setLoading(false);
      });
  }, []);

  const filtered = allCities
    .filter(c => c.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 30);

  const displayValue = selectedCity && !showDropdown ? selectedCity : search;

  if (minimal) {
    return (
      <div className="relative group">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none group-focus-within:text-cyan-500 transition-colors" />
        <input
          type="text"
          placeholder={loading ? '...' : 'Search city…'}
          value={displayValue}
          onFocus={() => { setShowDropdown(true); setSearch(''); }}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          onChange={e => { setSearch(e.target.value); }}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-7 pr-3 py-1.5 text-[11px] font-medium focus:outline-none focus:border-cyan-500/50 transition-colors placeholder:text-zinc-700"
        />

        {selectedCity && !showDropdown && (
          <button
            onClick={() => { onCityChange(''); setSearch(''); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-700 hover:text-zinc-500 text-[10px] transition-colors"
          >
            ✕
          </button>
        )}

        {showDropdown && filtered.length > 0 && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl max-h-40 overflow-y-auto">
            {filtered.map(city => (
              <button
                key={city}
                onMouseDown={() => {
                  onCityChange(city);
                  setSearch('');
                  setShowDropdown(false);
                }}
                className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-zinc-800 transition-colors"
              >
                {city}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <MapPin size={13} className="text-cyan-400 shrink-0" />
        <span className="text-xs font-bold uppercase tracking-[2px] text-zinc-300">
          City Search
        </span>
      </div>

      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
        <input
          type="text"
          placeholder={loading ? 'Loading cities…' : 'Search any city…'}
          value={displayValue}
          onFocus={() => { setShowDropdown(true); setSearch(''); }}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          onChange={e => { setSearch(e.target.value); }}
          className="w-full bg-zinc-950 border border-zinc-700 rounded-xl pl-8 pr-4 py-2 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
        />

        {selectedCity && !showDropdown && (
          <button
            onClick={() => { onCityChange(''); setSearch(''); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 text-xs transition-colors"
            aria-label="Clear city"
          >
            ✕
          </button>
        )}

        {showDropdown && filtered.length > 0 && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-h-56 overflow-y-auto">
            {filtered.map(city => (
              <button
                key={city}
                onMouseDown={() => {
                  onCityChange(city);
                  setSearch('');
                  setShowDropdown(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 transition-colors first:rounded-t-xl last:rounded-b-xl"
              >
                {city}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedCity && (
        <p className="text-[10px] text-zinc-600 mt-2">
          Showing signals for <span className="text-zinc-400">{selectedCity}</span>
        </p>
      )}
    </div>
  );
}
