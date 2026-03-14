// ── Core Data Types ──────────────────────────────────────────────

export interface StateData {
  state: string;
  waitDays: number;
  spike: number; // shortage percentage
}

export interface CityData {
  id: string;
  city: string;
  state: string;
  type: 'domestic' | 'commercial';
  waitDays: number;
  pricePerCylinder: number;
  priceChange: number; // +/- from last week
  shortagePct: number;
  lastUpdated: string;
  source: 'scraper' | 'crowdsource' | 'ppac';
}

export interface NewsItem {
  headline: string;
  impact: string; // e.g. "+25%"
  sentiment: 'positive' | 'negative' | 'neutral';
  source?: string;
  url?: string;
  createdAt?: string;
}

export interface UsageTrendPoint {
  month: string;
  domestic: number; // in thousand MT
  commercial: number;
}

export interface ShortageReport {
  id?: string;
  city: string;
  state: string;
  type: 'domestic' | 'commercial';
  waitDays: number;
  description?: string;
  reporterName?: string;
  createdAt?: string;
  verified: boolean;
}

// ── Supabase Row Types ───────────────────────────────────────────

export interface DbCityRow {
  id: string;
  city: string;
  state: string;
  cylinder_type: 'domestic' | 'commercial';
  wait_days: number;
  price_per_cylinder: number;
  price_change: number;
  shortage_pct: number;
  last_updated: string;
  source: 'scraper' | 'crowdsource' | 'ppac';
}

export interface DbStateSummaryRow {
  id: string;
  state_name: string;
  avg_wait_days: number;
  shortage_pct: number;
  total_cities: number;
  last_updated: string;
}

export interface DbNewsRow {
  id: string;
  headline: string;
  impact_pct: number;
  source: string;
  url: string;
  created_at: string;
}

export interface DbUsageRow {
  id: string;
  month: string;
  domestic_mt: number;
  commercial_mt: number;
}

export interface DbShortageReportRow {
  id: string;
  city: string;
  state: string;
  cylinder_type: 'domestic' | 'commercial';
  wait_days: number;
  description: string | null;
  reporter_name: string | null;
  created_at: string;
  verified: boolean;
}

export interface CommunityReport {
  id?: string;
  city: string;
  status: 'enough' | 'low' | 'urgent';
  daysLeft?: number | null;
  refillBooked: boolean;
  expectedDelivery?: string | null;
  note?: string | null;
  createdAt?: string;
}

export interface DbCommunityReportRow {
  id: string;
  city: string;
  status: 'enough' | 'low' | 'urgent';
  days_left: number | null;
  refill_booked: boolean;
  expected_delivery: string | null;
  note: string | null;
  created_at: string;
}

// ── Filter / Sort Types ──────────────────────────────────────────

export type SortField = 'city' | 'state' | 'waitDays' | 'pricePerCylinder' | 'shortagePct';
export type SortDirection = 'asc' | 'desc';

export interface CityFilters {
  type: 'all' | 'domestic' | 'commercial';
  state: string; // 'all' or state name
  shortageOnly: boolean; // >10% shortage
  search: string;
}
