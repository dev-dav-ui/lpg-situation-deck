'use client';

import { useEffect, useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, Search, BarChart2, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatRelativeTime, getWaitColor, INDIAN_STATES } from '@/lib/utils';
import type { SortDirection, CityFilters } from '@/lib/types';

// ── Merged city row (one row per city, both prices shown) ─────────
interface MergedCity {
  key: string;           // city name used as React key
  city: string;
  state: string;
  domesticPrice: number | null;
  commercialPrice: number | null;
  waitDays: number;
  shortagePct: number;
  lastUpdated: string;
}

type MergedSortField = 'city' | 'state' | 'waitDays' | 'domesticPrice' | 'commercialPrice' | 'shortagePct';

// Stress ranking: waitDays desc → shortagePct desc → lastUpdated desc
function stressSort(a: MergedCity, b: MergedCity): number {
  if (b.waitDays !== a.waitDays)   return b.waitDays - a.waitDays;
  if (b.shortagePct !== a.shortagePct) return b.shortagePct - a.shortagePct;
  return b.lastUpdated > a.lastUpdated ? 1 : -1;
}

function sortMerged(rows: MergedCity[], field: MergedSortField, dir: SortDirection): MergedCity[] {
  return [...rows].sort((a, b) => {
    let av: number | string, bv: number | string;
    switch (field) {
      case 'city':            av = a.city;              bv = b.city;              break;
      case 'state':           av = a.state;             bv = b.state;             break;
      case 'waitDays':        av = a.waitDays;          bv = b.waitDays;          break;
      case 'shortagePct':     av = a.shortagePct;       bv = b.shortagePct;       break;
      case 'domesticPrice':   av = a.domesticPrice ?? 0; bv = b.domesticPrice ?? 0; break;
      case 'commercialPrice': av = a.commercialPrice ?? 0; bv = b.commercialPrice ?? 0; break;
      default:                av = 0; bv = 0;
    }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

const fallbackMerged: MergedCity[] = [
  { key: 'Delhi',     city: 'Delhi',     state: 'Delhi',         domesticPrice: 903,  commercialPrice: 1920, waitDays: 25, shortagePct: 35, lastUpdated: new Date().toISOString() },
  { key: 'Patna',     city: 'Patna',     state: 'Bihar',         domesticPrice: 912,  commercialPrice: 1870, waitDays: 23, shortagePct: 30, lastUpdated: new Date().toISOString() },
  { key: 'Mumbai',    city: 'Mumbai',    state: 'Maharashtra',   domesticPrice: 892,  commercialPrice: 1850, waitDays: 22, shortagePct: 28, lastUpdated: new Date().toISOString() },
  { key: 'Lucknow',   city: 'Lucknow',   state: 'Uttar Pradesh', domesticPrice: 906,  commercialPrice: 1860, waitDays: 21, shortagePct: 27, lastUpdated: new Date().toISOString() },
  { key: 'Ahmedabad', city: 'Ahmedabad', state: 'Gujarat',       domesticPrice: 878,  commercialPrice: 1830, waitDays: 20, shortagePct: 25, lastUpdated: new Date().toISOString() },
  { key: 'Bengaluru', city: 'Bengaluru', state: 'Karnataka',     domesticPrice: 868,  commercialPrice: 1780, waitDays: 18, shortagePct: 22, lastUpdated: new Date().toISOString() },
  { key: 'Kolkata',   city: 'Kolkata',   state: 'West Bengal',   domesticPrice: 883,  commercialPrice: 1800, waitDays: 15, shortagePct: 18, lastUpdated: new Date().toISOString() },
  { key: 'Chennai',   city: 'Chennai',   state: 'Tamil Nadu',    domesticPrice: 856,  commercialPrice: 1750, waitDays: 12, shortagePct: 14, lastUpdated: new Date().toISOString() },
];

const PAGE_SIZE = 10;

export default function CityTable({ onCityClick }: { onCityClick?: (city: string) => void }) {
  const [rawRows, setRawRows]   = useState<any[]>([]);
  const [isLive, setIsLive]     = useState(false);
  const [sortField, setSortField] = useState<MergedSortField>('shortagePct');
  const [sortDir, setSortDir]   = useState<SortDirection>('desc');
  const [page, setPage]         = useState(0);
  const [filters, setFilters]   = useState<CityFilters>({
    type: 'all',
    state: 'all',
    shortageOnly: false,
    search: '',
  });

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('city_data')
        .select('city, state, cylinder_type, price_per_cylinder, wait_days, shortage_pct, last_updated')
        .neq('state', 'Unknown');
      if (data && data.length > 0) {
        setRawRows(data);
        setIsLive(true);
      }
    };
    fetch();

    const channel = supabase
      .channel('city-table-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'city_data' }, fetch)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Merge raw DB rows: one MergedCity per city ───────────────────
  const mergedCities = useMemo<MergedCity[]>(() => {
    if (!isLive) return fallbackMerged;

    const map = new Map<string, MergedCity>();
    for (const row of rawRows) {
      const key = row.city;
      if (!map.has(key)) {
        map.set(key, {
          key,
          city:           row.city,
          state:          row.state,
          domesticPrice:  null,
          commercialPrice: null,
          waitDays:       Number(row.wait_days),
          shortagePct:    Number(row.shortage_pct),
          lastUpdated:    row.last_updated,
        });
      }
      const entry = map.get(key)!;
      if (row.cylinder_type === 'domestic')   entry.domesticPrice   = Number(row.price_per_cylinder);
      if (row.cylinder_type === 'commercial') entry.commercialPrice = Number(row.price_per_cylinder);
      // worst-case severity across types
      if (Number(row.wait_days)    > entry.waitDays)   entry.waitDays   = Number(row.wait_days);
      if (Number(row.shortage_pct) > entry.shortagePct) entry.shortagePct = Number(row.shortage_pct);
      if (row.last_updated > entry.lastUpdated)         entry.lastUpdated = row.last_updated;
    }
    return Array.from(map.values());
  }, [rawRows, isLive]);

  // ── Filter + sort ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = [...mergedCities];

    // type filter — keep city if it has a price for the selected type
    if (filters.type === 'domestic')   result = result.filter(c => c.domesticPrice   != null);
    if (filters.type === 'commercial') result = result.filter(c => c.commercialPrice != null);

    if (filters.state !== 'all') result = result.filter(c => c.state === filters.state);
    if (filters.shortageOnly)    result = result.filter(c => c.shortagePct > 10);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(c => c.city.toLowerCase().includes(q) || c.state.toLowerCase().includes(q));
    }

    // Default: stress ranking — shortagePct DESC → waitDays DESC → lastUpdated DESC
    if (sortField === 'shortagePct' && sortDir === 'desc') {
      return result.sort((a, b) => {
        if (b.shortagePct !== a.shortagePct) return b.shortagePct - a.shortagePct;
        if (b.waitDays    !== a.waitDays)    return b.waitDays    - a.waitDays;
        return b.lastUpdated > a.lastUpdated ? 1 : -1;
      });
    }
    return sortMerged(result, sortField, sortDir);
  }, [mergedCities, filters, sortField, sortDir]);

  // ── Top 3 stressed cities (unfiltered, same sort as default) ────
  const top3 = useMemo(() =>
    [...mergedCities]
      .sort((a, b) => {
        if (b.shortagePct !== a.shortagePct) return b.shortagePct - a.shortagePct;
        if (b.waitDays    !== a.waitDays)    return b.waitDays    - a.waitDays;
        return b.lastUpdated > a.lastUpdated ? 1 : -1;
      })
      .slice(0, 3),
  [mergedCities]);

  // ── Domestic price coverage check ───────────────────────────────
  const showDomestic = useMemo(() => {
    if (mergedCities.length === 0) return true; // fallback data always has domestic
    const withDomestic = mergedCities.filter(c => c.domesticPrice != null).length;
    return withDomestic / mergedCities.length >= 0.5;
  }, [mergedCities]);

  // ── Pagination ───────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages - 1);
  const pageRows   = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const handleSort = (field: MergedSortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(0);
  };

  const handleFilterChange = (patch: Partial<CityFilters>) => {
    setFilters(f => ({ ...f, ...patch }));
    setPage(0);
  };

  const SortIcon = ({ field }: { field: MergedSortField }) => {
    if (sortField !== field) return <ChevronDown size={13} className="text-zinc-700" />;
    return sortDir === 'asc'
      ? <ChevronUp size={13} className="text-cyan-400" />
      : <ChevronDown size={13} className="text-cyan-400" />;
  };

  // Returns header classes — cyan when this column is the active sort
  const thClass = (field: MergedSortField) =>
    `pb-2.5 pr-4 cursor-pointer transition-colors ${
      sortField === field ? 'text-cyan-400' : 'text-zinc-400 hover:text-white'
    }`;

  function shortageColor(pct: number): string {
    if (pct > 25) return 'text-red-400';
    if (pct >= 10) return 'text-amber-400';
    return 'text-green-400';
  }

  function rankBadge(rank: number) {
    if (rank === 1) return 'text-red-400 bg-red-500/15 border-red-500/30 font-bold';
    if (rank === 2) return 'text-orange-400 bg-orange-500/15 border-orange-500/30 font-bold';
    if (rank === 3) return 'text-amber-400 bg-amber-500/15 border-amber-500/30 font-bold';
    return 'text-zinc-500 bg-zinc-800/60 border-zinc-700 font-medium';
  }

  return (
    <div>
      {/* Top 3 highlight strip */}
      {top3.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] uppercase tracking-[2px] text-zinc-500 mb-2.5 font-semibold">
            Most Stressed Cities Right Now
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {top3.map((city, i) => {
              const rank = i + 1;
              const badgeCls = rank === 1
                ? 'text-red-400 bg-red-500/15 border-red-500/30'
                : rank === 2
                  ? 'text-orange-400 bg-orange-500/15 border-orange-500/30'
                  : 'text-amber-400 bg-amber-500/15 border-amber-500/30';
              return (
                <div key={city.key} className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3">
                  <span className={`flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-xl border text-sm font-bold ${badgeCls}`}>
                    #{rank}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{city.city}</p>
                    <p className="text-[11px] text-zinc-500 truncate">{city.state}</p>
                  </div>
                  <div className="ml-auto flex flex-col items-end gap-0.5">
                    <span className={`text-sm font-bold tabular-nums ${shortageColor(city.shortagePct)}`}>
                      +{city.shortagePct}%
                    </span>
                    <span className={`text-[11px] font-medium tabular-nums ${getWaitColor(city.waitDays)}`}>
                      {city.waitDays}d wait
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="flex flex-col md:flex-row gap-4 mb-5 items-start md:items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BarChart2 size={16} className="text-cyan-400" />
          CITY STRESS RANKINGS
          <span className="text-xs text-zinc-500 font-normal">{filtered.length} cities</span>
          {!isLive && (
            <span className="text-xs bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2 py-0.5 rounded-full">early supply signals</span>
          )}
        </h2>

        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search city…"
              value={filters.search}
              onChange={e => handleFilterChange({ search: e.target.value })}
              className="bg-zinc-950 border border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500 w-40"
            />
          </div>

          <select
            value={filters.type}
            onChange={e => handleFilterChange({ type: e.target.value as any })}
            className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Types</option>
            <option value="domestic">Domestic</option>
            <option value="commercial">Commercial</option>
          </select>

          <select
            value={filters.state}
            onChange={e => handleFilterChange({ state: e.target.value })}
            className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All States</option>
            {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <button
            onClick={() => handleFilterChange({ shortageOnly: !filters.shortageOnly })}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
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
          <thead className="overflow-visible">
            <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide">
              <th className="pb-2.5 pr-3 w-10 text-zinc-400">Rank</th>
              <th className={thClass('city')} onClick={() => handleSort('city')}>
                <span className="flex items-center gap-1">City <SortIcon field="city" /></span>
              </th>
              <th className={thClass('state')} onClick={() => handleSort('state')}>
                <span className="flex items-center gap-1">State <SortIcon field="state" /></span>
              </th>
              {showDomestic && (
                <th className={thClass('domesticPrice')} onClick={() => handleSort('domesticPrice')}>
                  <span className="flex items-center gap-1">Domestic <SortIcon field="domesticPrice" /></span>
                </th>
              )}
              <th className={thClass('commercialPrice')} onClick={() => handleSort('commercialPrice')}>
                <span className="flex items-center gap-1">Commercial <SortIcon field="commercialPrice" /></span>
              </th>
              <th className={thClass('waitDays')} onClick={() => handleSort('waitDays')}>
                <span className="flex items-center gap-1">Wait <SortIcon field="waitDays" /></span>
              </th>
              <th className={thClass('shortagePct')} onClick={() => handleSort('shortagePct')}>
                <span className="flex items-center gap-1">
                  Shortage
                  <SortIcon field="shortagePct" />
                  <span className="group relative inline-flex items-center" onClick={e => e.stopPropagation()}>
                    <Info size={11} className="text-zinc-600 group-hover:text-zinc-400 transition-colors ml-0.5" />
                    <span className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 w-52 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-xl px-3 py-2 leading-relaxed shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-50 normal-case tracking-normal font-normal text-center">
                      Shortage % compares local refill wait times to the national average.
                    </span>
                  </span>
                </span>
              </th>
              <th className="pb-2.5 text-zinc-500">Updated</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, idx) => {
              const rank = safePage * PAGE_SIZE + idx + 1;
              return (
              <tr
                key={row.key}
                className={`border-b border-zinc-800/40 transition-colors ${onCityClick ? 'cursor-pointer hover:bg-zinc-800/50' : 'hover:bg-zinc-800/25'}`}
                onClick={() => onCityClick?.(row.city)}
                title={onCityClick ? `View ${row.city} in spotlight` : undefined}
              >
                <td className="py-2.5 pr-3">
                  <span className={`inline-flex items-center justify-center w-8 h-6 rounded-md border text-[11px] tabular-nums ${rankBadge(rank)}`}>
                    #{rank}
                  </span>
                </td>
                <td className="py-2.5 pr-4 font-medium">{row.city}</td>
                <td className="py-2.5 pr-4 text-zinc-400">{row.state}</td>
                {showDomestic && (
                  <td className="py-2.5 pr-4 text-blue-300">
                    {row.domesticPrice != null
                      ? `₹${row.domesticPrice.toLocaleString('en-IN')}`
                      : <span className="text-zinc-600">—</span>}
                  </td>
                )}
                <td className="py-2.5 pr-4 text-purple-300">
                  {row.commercialPrice != null
                    ? `₹${row.commercialPrice.toLocaleString('en-IN')}`
                    : <span className="text-zinc-600">—</span>}
                </td>
                <td className={`py-2.5 pr-4 font-bold ${getWaitColor(row.waitDays)}`}>
                  {row.waitDays}d
                </td>
                <td className={`py-2.5 pr-4 font-semibold tabular-nums ${shortageColor(row.shortagePct)}`}>
                  +{row.shortagePct}%
                </td>
                <td className="py-2.5 text-zinc-600 text-xs">{formatRelativeTime(row.lastUpdated)}</td>
              </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={showDomestic ? 8 : 7} className="py-10 text-center text-zinc-500">No cities match your filters</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Domestic coverage note */}
      {!showDomestic && isLive && (
        <p className="text-xs text-zinc-600 mt-3 italic">
          Domestic LPG price coverage expanding — currently showing commercial market signals.
        </p>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-zinc-500 text-xs">
            Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} cities
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="p-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:border-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`w-7 h-7 rounded-lg text-xs border transition-colors ${
                  i === safePage
                    ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-400'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={safePage === totalPages - 1}
              className="p-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:border-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
