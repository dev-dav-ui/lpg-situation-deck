'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import type { StateData } from '@/lib/types';

const MapContainer  = dynamic(() => import('react-leaflet').then(m => m.MapContainer),  { ssr: false });
const TileLayer     = dynamic(() => import('react-leaflet').then(m => m.TileLayer),     { ssr: false });
const GeoJSON       = dynamic(() => import('react-leaflet').then(m => m.GeoJSON),       { ssr: false });
const CircleMarker  = dynamic(() => import('react-leaflet').then(m => m.CircleMarker),  { ssr: false });
const Tooltip       = dynamic(() => import('react-leaflet').then(m => m.Tooltip),       { ssr: false });

const INDIA_GEOJSON_URL = '/india.geojson';

// Bounds that frame the entire Indian subcontinent with minimal ocean
// SW corner: near Thiruvananthapuram / SE tip of India
// NE corner: near Arunachal Pradesh / J&K
const INDIA_BOUNDS: [[number, number], [number, number]] = [
  [5.5, 66.0],   // SW — slightly south/west of Thiruvananthapuram
  [38.5, 98.5],  // NE — slightly beyond Arunachal / J&K
];

// Static lat/lon — with small deterministic jitter for dense clusters
// to prevent markers from stacking (Delhi / Lucknow / Chandigarh belt)
const CITY_COORDS: Record<string, [number, number]> = {
  'Ahmedabad':          [23.0225,  72.5714],
  'Bengaluru':          [12.9716,  77.5946],
  'Bhopal':             [23.2599,  77.4126],
  'Bhubaneswar':        [20.2961,  85.8245],
  'Chandigarh':         [30.9333,  76.9794],  // jittered N slightly from Lucknow belt
  'Chennai':            [13.0827,  80.2707],
  'Coimbatore':         [11.0168,  76.9558],
  'Dehradun':           [30.3165,  78.1322],  // jittered E
  'Delhi':              [28.7139,  77.1090],  // jittered NW
  'Goa':                [15.2993,  74.1240],
  'Guwahati':           [26.1445,  91.7362],
  'Hyderabad':          [17.3850,  78.4867],
  'Indore':             [22.7196,  75.7577],  // jittered W slightly from Bhopal
  'Jaipur':             [26.9124,  75.9873],  // jittered E
  'Kochi':              [9.9312,   76.2673],
  'Kolkata':            [22.5726,  88.3639],
  'Lucknow':            [26.7467,  80.9462],  // jittered S
  'Mumbai':             [19.0760,  72.7777],  // jittered W
  'Nagpur':             [21.1458,  79.1882],  // jittered E
  'Patna':              [25.6941,  85.2376],  // jittered NE
  'Pondicherry':        [11.9416,  79.8083],
  'Pune':               [18.4204,  73.8567],  // jittered S
  'Raipur':             [21.2514,  81.7296],
  'Ranchi':             [23.4441,  85.3096],  // jittered N
  'Shimla':             [31.1048,  77.2734],  // jittered E
  'Surat':              [21.2702,  72.8311],  // jittered N
  'Thiruvananthapuram': [8.5241,   76.9366],
  'Visakhapatnam':      [17.6868,  83.3185],
};

interface CityMarkerData {
  city: string;
  state: string;
  domestic: number | null;
  commercial: number | null;
  waitDays: number;
  shortagePct: number;
  lastUpdated: string;
}

interface StateSummaryData extends StateData {
  totalCities: number;
  lastUpdated: string;
}

function getSeverity(waitDays: number, shortagePct: number): 'critical' | 'tight' | 'stable' {
  if (waitDays > 15 || shortagePct > 20) return 'critical';
  if (waitDays > 8  || shortagePct > 10) return 'tight';
  return 'stable';
}

const SEVERITY_COLOR = {
  critical: '#ef4444',
  tight:    '#f59e0b',
  stable:   '#22c55e',
};

const SEVERITY_LABEL = {
  critical: 'Critical',
  tight:    'Tight Supply',
  stable:   'Stable',
};

// Marker radius by severity
const SEVERITY_RADIUS = {
  critical: 11,
  tight:    9,
  stable:   6,
};

function formatRelativeTime(dateStr: string): string {
  const diffH = Math.round((Date.now() - new Date(dateStr).getTime()) / 3600000);
  if (diffH < 1) return 'just now';
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

// ── FitBounds: uses useMap() — safe only inside MapContainer ─────
// Defined as a separate component file via inline dynamic so the
// react-leaflet hook is never imported at module scope (SSR-safe).
const FitBounds = dynamic(
  async () => {
    const { useMap } = await import('react-leaflet');
    const { default: L } = await import('leaflet');
    function FitBoundsInner() {
      const map = useMap();
      useEffect(() => {
        map.fitBounds(
          L.latLngBounds(INDIA_BOUNDS[0], INDIA_BOUNDS[1]),
          { padding: [24, 24] }
        );
      // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }
    return FitBoundsInner;
  },
  { ssr: false }
);


interface Props {
  userCity?: string;
  onCityClick?: (city: string) => void;
}

// Version token — bump this when the local geojson changes to bust stale caches
const GEOJSON_CACHE_KEY = 'india_geojson_v2';

export default function IndiaLPGHeatmap({ userCity, onCityClick }: Props) {
  const [mounted, setMounted]         = useState(false);
  const [geoData, setGeoData]         = useState<any>(null);
  const [geoReady, setGeoReady]       = useState(false); // true once load attempt settles
  const [stateData, setStateData]     = useState<StateSummaryData[]>([]);
  const [cityMarkers, setCityMarkers] = useState<CityMarkerData[]>([]);
  const [pulse, setPulse]             = useState(false);

  useEffect(() => {
    setMounted(true);

    // Evict old large-file cache entries (pre-simplification, key 'india_geojson')
    sessionStorage.removeItem('india_geojson');

    // GeoJSON — versioned cache key so stale entries are bypassed
    const cached = sessionStorage.getItem(GEOJSON_CACHE_KEY);
    if (cached) {
      try {
        setGeoData(JSON.parse(cached));
      } catch {
        sessionStorage.removeItem(GEOJSON_CACHE_KEY);
      }
      setGeoReady(true);
    } else {
      fetch(INDIA_GEOJSON_URL)
        .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
        .then(d => {
          setGeoData(d);
          try { sessionStorage.setItem(GEOJSON_CACHE_KEY, JSON.stringify(d)); } catch { /* quota */ }
        })
        .catch(err => console.error('GeoJSON fetch failed:', err))
        .finally(() => setGeoReady(true));
    }

    // State summary
    const fetchStateData = async () => {
      const { data } = await supabase.from('state_summary').select('*');
      if (data && data.length > 0) {
        setStateData(data.map((d: any) => ({
          state:       d.state_name,
          waitDays:    Number(d.avg_wait_days),
          spike:       Number(d.shortage_pct),
          totalCities: d.total_cities,
          lastUpdated: d.last_updated,
        })));
      }
    };
    fetchStateData();

    // City markers
    const fetchCityData = async () => {
      const { data } = await supabase
        .from('city_data')
        .select('city, state, cylinder_type, price_per_cylinder, wait_days, shortage_pct, last_updated')
        .neq('state', 'Unknown');
      if (!data) return;

      const map = new Map<string, CityMarkerData>();
      for (const row of data) {
        const key = row.city;
        if (!map.has(key)) {
          map.set(key, {
            city: row.city, state: row.state,
            domestic: null, commercial: null,
            waitDays: Number(row.wait_days),
            shortagePct: Number(row.shortage_pct),
            lastUpdated: row.last_updated,
          });
        }
        const entry = map.get(key)!;
        if (row.cylinder_type === 'domestic')   entry.domestic   = Number(row.price_per_cylinder);
        if (row.cylinder_type === 'commercial') entry.commercial = Number(row.price_per_cylinder);
        if (Number(row.wait_days)    > entry.waitDays)    entry.waitDays    = Number(row.wait_days);
        if (Number(row.shortage_pct) > entry.shortagePct) entry.shortagePct = Number(row.shortage_pct);
      }
      setCityMarkers(Array.from(map.values()).filter(c => CITY_COORDS[c.city]));
    };
    fetchCityData();

    // Realtime
    const channel = supabase
      .channel('state-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'state_summary' }, fetchStateData)
      .subscribe();

    // Pulse every 1.5s — only critical markers use this
    const pulseInterval = setInterval(() => setPulse(p => !p), 1500);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pulseInterval);
    };
  }, []);

  const getStateColor = (wait: number) =>
    wait > 15 ? '#ef4444' : wait > 8 ? '#f59e0b' : '#22c55e';

  // Block render only until client has mounted — prevents SSR/hydration mismatch.
  // Once mounted, render the map shell immediately; GeoJSON/markers layer in when ready.
  if (!mounted || !geoReady) {
    return (
      <div className="h-[580px] rounded-2xl border border-zinc-700 flex items-center justify-center bg-zinc-800 animate-pulse">
        <div className="text-zinc-500">Loading India map…</div>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-zinc-700">
      {/* Glow keyframe + tooltip styling injected once */}
      <style>{`
        .marker-critical { filter: drop-shadow(0 0 6px #ef444488); cursor: pointer; }
        .marker-tight    { filter: drop-shadow(0 0 4px #f59e0b66); cursor: pointer; }
        .marker-stable   { filter: drop-shadow(0 0 2px #22c55e44); cursor: pointer; }
        .marker-user     { filter: drop-shadow(0 0 8px #06b6d4aa); cursor: pointer; }
        .leaflet-tooltip.map-tooltip {
          background: #18181b;
          border: 1px solid #3f3f46;
          border-radius: 12px;
          padding: 10px 12px;
          color: #e4e4e7;
          font-family: system-ui, sans-serif;
          font-size: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.6);
          min-width: 160px;
        }
        .leaflet-tooltip.map-tooltip::before { display: none; }
      `}</style>

      <MapContainer
        center={[22, 82]}
        zoom={4}
        className="h-[580px] w-full"
        style={{ background: '#0f0f11' }}
        scrollWheelZoom={false}
        zoomControl={false}
      >
        <FitBounds />

        {/* Dark ocean tile — no labels on ocean/neighbours */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          opacity={0.7}
        />

        {/* India label layer on top so state names still show */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
          opacity={0.5}
        />

        {/* State choropleth — only when GeoJSON loaded successfully */}
        {geoData && <GeoJSON
          data={geoData}
          style={(feature: any) => {
            const name = feature?.properties?.ST_NM || feature?.properties?.NAME_1;
            const s = stateData.find(d => d.state === name);
            const wait = s?.waitDays || 0;
            return {
              fillColor:   s ? getStateColor(wait) : '#27272a',
              weight:      s ? 1.5 : 0.5,
              color:       s ? '#52525b' : '#18181b',
              fillOpacity: s ? 0.35 : 0.08,
            };
          }}
          onEachFeature={(feature, layer) => {
            const name = feature?.properties?.ST_NM || feature?.properties?.NAME_1;
            const s = stateData.find(d => d.state === name);
            if (!s) {
              layer.bindTooltip(
                `<div><b>${name}</b><br/><span style="color:#71717a;font-size:10px">No data yet</span></div>`,
                { direction: 'auto', className: 'map-tooltip' }
              );
              return;
            }
            const sev = getSeverity(s.waitDays, s.spike);
            const col = SEVERITY_COLOR[sev];
            layer.bindTooltip(
              `<div style="min-width:150px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                  <b style="font-size:13px">${name}</b>
                  <span style="font-size:10px;color:${col};background:${col}18;padding:2px 7px;border-radius:999px;border:1px solid ${col}40">${SEVERITY_LABEL[sev]}</span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px">
                  <span style="color:#71717a">Delay signal</span><b style="color:${s.waitDays >= 10 ? '#ef4444' : s.waitDays >= 6 ? '#f59e0b' : s.waitDays >= 3 ? '#facc15' : '#22c55e'}">${s.waitDays >= 10 ? 'High Delay Signal' : s.waitDays >= 6 ? 'Delayed' : s.waitDays >= 3 ? 'Watch' : 'Stable'}</b>
                  <span style="color:#71717a">Supply stress</span><b style="color:${col}">${s.spike >= 25 ? 'High' : s.spike >= 15 ? 'Elevated' : s.spike >= 8 ? 'Moderate' : 'Low'}</b>
                  <span style="color:#71717a">Cities</span><b>${s.totalCities}</b>
                </div>
                <div style="color:#52525b;font-size:10px;margin-top:6px">Updated ${formatRelativeTime(s.lastUpdated)}</div>
              </div>`,
              { direction: 'auto', className: 'map-tooltip' }
            );
          }}
        />}

        {/* City circle markers */}
        {cityMarkers.map((city) => {
          const coords    = CITY_COORDS[city.city];
          if (!coords) return null;

          const sev        = getSeverity(city.waitDays, city.shortagePct);
          const color      = SEVERITY_COLOR[sev];
          const isUserCity = !!(userCity && city.city.toLowerCase() === userCity.toLowerCase());
          const baseRadius = isUserCity ? 12 : SEVERITY_RADIUS[sev];
          // Only critical cities pulse; tight/stable are static
          const radius     = (!isUserCity && sev === 'critical') ? (pulse ? baseRadius + 2 : baseRadius) : baseRadius;
          const markerClass = isUserCity ? 'marker-user' : `marker-${sev}`;

          return (
            <CircleMarker
              key={city.city}
              center={coords}
              radius={radius}
              pathOptions={{
                color:       isUserCity ? '#06b6d4' : color,
                fillColor:   isUserCity ? '#06b6d4' : color,
                fillOpacity: isUserCity ? 1 : (sev === 'critical' ? 0.92 : sev === 'tight' ? 0.82 : 0.65),
                weight:      isUserCity ? 3 : (sev === 'critical' ? 2 : 1.5),
                className:   markerClass,
              }}
              eventHandlers={onCityClick ? { click: () => onCityClick(city.city) } : undefined}
            >
              <Tooltip direction="auto" className="map-tooltip" sticky={false}>
                <div style={{ minWidth: '160px' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '13px' }}>{city.city}</div>
                      <div style={{ color: '#71717a', fontSize: '10px' }}>{city.state}</div>
                    </div>
                    <span style={{
                      fontSize: '10px', color: isUserCity ? '#06b6d4' : color,
                      background: `${isUserCity ? '#06b6d4' : color}18`,
                      padding: '2px 7px', borderRadius: '999px',
                      border: `1px solid ${isUserCity ? '#06b6d4' : color}40`,
                    }}>
                      {isUserCity ? '📍 Your City' : SEVERITY_LABEL[sev]}
                    </span>
                  </div>

                  {/* Price grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px', fontSize: '11px', marginBottom: '6px' }}>
                    <span style={{ color: '#71717a' }}>Domestic</span>
                    <b>{city.domestic != null ? `₹${city.domestic.toLocaleString('en-IN')}` : '—'}</b>
                    <span style={{ color: '#71717a' }}>Commercial</span>
                    <b>{city.commercial != null ? `₹${city.commercial.toLocaleString('en-IN')}` : '—'}</b>
                    <span style={{ color: '#71717a' }}>Delay</span>
                    <b style={{ color: city.waitDays >= 10 ? '#ef4444' : city.waitDays >= 6 ? '#f59e0b' : city.waitDays >= 3 ? '#facc15' : '#22c55e' }}>
                      {city.waitDays >= 10 ? 'High Delay Signal' : city.waitDays >= 6 ? 'Moderate' : city.waitDays >= 3 ? 'Mild' : 'Stable'}
                    </b>
                    <span style={{ color: '#71717a' }}>Supply Stress</span>
                    <b style={{ color }}>{city.shortagePct >= 25 ? 'High' : city.shortagePct >= 15 ? 'Elevated' : city.shortagePct >= 8 ? 'Moderate' : 'Low'}</b>
                  </div>

                  <div style={{ color: '#52525b', fontSize: '10px' }}>
                    Updated {formatRelativeTime(city.lastUpdated)}
                  </div>
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Legend — top-right */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="absolute top-4 right-4 bg-zinc-900/95 border border-zinc-700 backdrop-blur-sm p-3 rounded-xl text-xs z-[1000] shadow-xl"
      >
        <p className="text-zinc-500 mb-2 font-semibold uppercase tracking-widest" style={{ fontSize: '9px' }}>
          Supply Status
        </p>
        <div className="space-y-2">
          {[
            { color: '#ef4444', label: 'High Signal', sub: '', pulse: true,  r: 11 },
            { color: '#f59e0b', label: 'Elevated',  sub: '', pulse: false, r: 9  },
            { color: '#22c55e', label: 'Stable',    sub: '', pulse: false, r: 6  },
            { color: '#06b6d4', label: 'Your City', sub: '', pulse: false, r: 12 },
          ].map(({ color, label, sub, pulse: doPulse, r }) => (
            <div key={label} className="flex items-center gap-2">
              <svg width="16" height="16" className="shrink-0">
                <circle
                  cx="8" cy="8" r={Math.min(r * 0.65, 7)}
                  fill={color}
                  fillOpacity={0.85}
                  stroke={color}
                  strokeWidth="1.5"
                  className={doPulse ? 'animate-pulse' : ''}
                />
              </svg>
              <span className="text-zinc-300">
                {label}
                {sub && <span className="text-zinc-600 ml-1 text-[10px]">({sub})</span>}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
