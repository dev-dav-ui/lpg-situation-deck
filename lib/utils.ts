import type { CityData, DbCityRow, SortField, SortDirection } from './types';

// ── Color helpers ────────────────────────────────────────────────

export function getWaitColor(wait: number): string {
  if (wait > 15) return 'text-red-400';
  if (wait > 8) return 'text-orange-400';
  return 'text-green-400';
}

export function getWaitBg(wait: number): string {
  if (wait > 15) return 'bg-red-500/20';
  if (wait > 8) return 'bg-orange-500/20';
  return 'bg-green-500/20';
}

export function getShortageBadge(pct: number): string {
  if (pct > 20) return 'bg-red-500/20 text-red-400';
  if (pct > 10) return 'bg-orange-500/20 text-orange-400';
  return 'bg-green-500/20 text-green-400';
}

// ── Data transformers ────────────────────────────────────────────

export function dbRowToCity(row: DbCityRow): CityData {
  return {
    id: row.id,
    city: row.city,
    state: row.state,
    type: row.cylinder_type,
    waitDays: row.wait_days,
    pricePerCylinder: row.price_per_cylinder,
    priceChange: row.price_change,
    shortagePct: row.shortage_pct,
    lastUpdated: row.last_updated,
    source: row.source,
  };
}

// ── Sort helper ──────────────────────────────────────────────────

export function sortCities(
  cities: CityData[],
  field: SortField,
  direction: SortDirection
): CityData[] {
  return [...cities].sort((a, b) => {
    const valA = a[field];
    const valB = b[field];
    if (typeof valA === 'string' && typeof valB === 'string') {
      return direction === 'asc'
        ? valA.localeCompare(valB)
        : valB.localeCompare(valA);
    }
    if (typeof valA === 'number' && typeof valB === 'number') {
      return direction === 'asc' ? valA - valB : valB - valA;
    }
    return 0;
  });
}

// ── Format helpers ───────────────────────────────────────────────

export function formatPrice(price: number): string {
  // Returns e.g. "₹1,885" — the ₹ symbol comes from the formatter;
  // do NOT prepend ₹ manually at the call site or it will double.
  if (!price && price !== 0) return '—';
  return '₹' + Math.round(price).toLocaleString('en-IN');
}

export function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return 'just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

// ── Indian states list ───────────────────────────────────────────

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal',
];
