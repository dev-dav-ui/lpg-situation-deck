'use client';

import { useEffect, useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, Search, Filter } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { sortCities, formatPrice, formatRelativeTime, getWaitColor, getShortageBadge, INDIAN_STATES } from '@/lib/utils';
import type { CityData, SortField, SortDirection, CityFilters } from '@/lib/types';

const fallbackCities: CityData[] = [
  { id: '1', city: 'Mumbai', state: 'Maharashtra', type: 'commercial', waitDays: 22, pricePerCylinder: 1850, priceChange: 180, shortagePct: 28, lastUpdated: new Date().toISOString(), source: 'scraper' },
  { id: '2', city: 'Delhi', state: 'Delhi', type: 'commercial', waitDays: 25, pricePerCylinder: 1920, priceChange: 220, shortagePct: 35, lastUpdated: new Date().toISOString(), source: 'scraper' },
  { id: '3', city: 'Bengaluru', state: 'Karnataka', type: 'commercial', waitDays: 18, pricePerCylinder: 1780, priceChange: 150, shortagePct: 22, lastUpdated: new Date().toISOString(), source: 'scraper' },
  { id: '4', city: 'Chennai', state: 'Tamil Nadu', type: 'commercial', waitDays: 12, pricePerCylinder: 1750, priceChange: 100, shortagePct: 14, lastUpdated: new Date().toISOString(), source: 'scraper' },
  { id: '5', city: 'Kolkata', state: 'West Bengal', type: 'commercial', waitDays: 15, pricePerCylinder: 1800, priceChange: 130, shortagePct: 18, lastUpdated: new Date().toISOString(), source: 'scraper' },
  { id: '6', city: 'Patna', state: 'Bihar', type: 'commercial', waitDays: 23, pricePerCylinder: 1870, priceChange: 200, shortagePct: 30, lastUpdated: new Date().toISOString(), source: 'scraper' },
  { id: '7', city: 'Lucknow', state: 'Uttar Pradesh', type: 'commercial', waitDays: 21, pricePerCylinder: 1860, priceChange: 190, shortagePct: 27, lastUpdated: new Date().toISOString(), source: 'scraper' },
  { id: '8', city: 'Ahmedabad', state: 'Gujarat', type: 'commercial', waitDays: 20, pricePerCylinder: 1830, priceChange: 170, shortagePct: 25, lastUpdated: new Date().toISOString(), source: 'scraper' },
];

export default function CityTable() {
  const [cities, setCities] = useState<CityData[]>(fallbackCities);
  const [sortField, setSortField] = useState<SortField>('waitDays');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [filters, setFilters] = useState<CityFilters>({
    type: 'all',
    state: 'all',
    shortageOnly: false,
    search: '',
  });

  useEffect(() => {
    const fetchCities = async () => {
      const { data, error } = await supabase
        .from('city_data')
        .select('*')
        .order('wait_days', { ascending: false });
      if (data && data.length > 0) {
        setCities(data.map((d: any) => ({
          id: d.id,
          city: d.city,
          state: d.state,
          type: d.cylinder_type,
          waitDays: d.wait_days,
          pricePerCylinder: Number(d.price_per_cylinder),
          priceChange: Number(d.price_change),
          shortagePct: Number(d.shortage_pct),
          lastUpdated: d.last_updated,
          source: d.source,
        })));
      }
    };
    fetchCities();

    const channel = supabase
      .channel('city-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'city_data' }, () => {
        fetchCities();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const filteredAndSorted = useMemo(() => {
    let result = [...cities];

    // Apply filters
    if (filters.type !== 'all') {
      result = result.filter(c => c.type === filters.type);
    }
    if (filters.state !== 'all') {
      result = result.filter(c => c.state === filters.state);
    }
    if (filters.shortageOnly) {
      result = result.filter(c => c.shortagePct > 10);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(c =>
        c.city.toLowerCase().includes(q) || c.state.toLowerCase().includes(q)
      );
    }

    // Sort
    return sortCities(result, sortField, sortDir);
  }, [cities, filters, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDown size={14} className="text-zinc-600" />;
    return sortDir === 'asc'
      ? <ChevronUp size={14} className="text-cyan-400" />
      : <ChevronDown size={14} className="text-cyan-400" />;
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row gap-4 mb-6 items-start md:items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Filter size={18} className="text-cyan-400" />
          CITY-LEVEL DATA
          <span className="text-xs text-zinc-500 font-normal">{filteredAndSorted.length} results</span>
        </h2>

        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search city..."
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              className="bg-zinc-950 border border-zinc-700 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-cyan-500 w-48"
            />
          </div>

          {/* Type filter */}
          <select
            value={filters.type}
            onChange={e => setFilters(f => ({ ...f, type: e.target.value as any }))}
            className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Types</option>
            <option value="domestic">Domestic</option>
            <option value="commercial">Commercial</option>
          </select>

          {/* State filter */}
          <select
            value={filters.state}
            onChange={e => setFilters(f => ({ ...f, state: e.target.value }))}
            className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All States</option>
            {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Shortage filter */}
          <button
            onClick={() => setFilters(f => ({ ...f, shortageOnly: !f.shortageOnly }))}
            className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
              filters.shortageOnly
                ? 'bg-red-500/20 border-red-500/50 text-red-400'
                : 'bg-zinc-950 border-zinc-700 text-zinc-400 hover:border-zinc-500'
            }`}
          >
            10%+ Shortage
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400 text-left">
              <th className="pb-3 pr-4 cursor-pointer hover:text-white" onClick={() => handleSort('city')}>
                <span className="flex items-center gap-1">City <SortIcon field="city" /></span>
              </th>
              <th className="pb-3 pr-4 cursor-pointer hover:text-white" onClick={() => handleSort('state')}>
                <span className="flex items-center gap-1">State <SortIcon field="state" /></span>
              </th>
              <th className="pb-3 pr-4">Type</th>
              <th className="pb-3 pr-4 cursor-pointer hover:text-white" onClick={() => handleSort('waitDays')}>
                <span className="flex items-center gap-1">Wait Days <SortIcon field="waitDays" /></span>
              </th>
              <th className="pb-3 pr-4 cursor-pointer hover:text-white" onClick={() => handleSort('pricePerCylinder')}>
                <span className="flex items-center gap-1">Price <SortIcon field="pricePerCylinder" /></span>
              </th>
              <th className="pb-3 pr-4 cursor-pointer hover:text-white" onClick={() => handleSort('shortagePct')}>
                <span className="flex items-center gap-1">Shortage <SortIcon field="shortagePct" /></span>
              </th>
              <th className="pb-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.map((city) => (
              <tr key={city.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                <td className="py-3 pr-4 font-medium">{city.city}</td>
                <td className="py-3 pr-4 text-zinc-400">{city.state}</td>
                <td className="py-3 pr-4">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    city.type === 'commercial'
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {city.type}
                  </span>
                </td>
                <td className={`py-3 pr-4 font-bold ${getWaitColor(city.waitDays)}`}>
                  {city.waitDays}d
                </td>
                <td className="py-3 pr-4">
                  {formatPrice(city.pricePerCylinder)}
                  <span className={`ml-2 text-xs ${city.priceChange > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {city.priceChange > 0 ? '+' : ''}{formatPrice(city.priceChange)}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${getShortageBadge(city.shortagePct)}`}>
                    +{city.shortagePct}%
                  </span>
                </td>
                <td className="py-3 text-zinc-500 text-xs">{formatRelativeTime(city.lastUpdated)}</td>
              </tr>
            ))}
            {filteredAndSorted.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-zinc-500">No cities match your filters</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
