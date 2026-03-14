'use client';

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import type { StateData } from '@/lib/types';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then(m => m.GeoJSON), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr: false });
const Tooltip = dynamic(() => import('react-leaflet').then(m => m.Tooltip), { ssr: false });

const INDIA_GEOJSON_URL = 'https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson';

// Static lat/lon for all cities in city_data (state != Unknown)
const CITY_COORDS: Record<string, [number, number]> = {
  'Ahmedabad':        [23.0225, 72.5714],
  'Bengaluru':        [12.9716, 77.5946],
  'Bhopal':           [23.2599, 77.4126],
  'Bhubaneswar':      [20.2961, 85.8245],
  'Chandigarh':       [30.7333, 76.7794],
  'Chennai':          [13.0827, 80.2707],
  'Coimbatore':       [11.0168, 76.9558],
  'Dehradun':         [30.3165, 78.0322],
  'Delhi':            [28.6139, 77.2090],
  'Goa':              [15.2993, 74.1240],
  'Guwahati':         [26.1445, 91.7362],
  'Hyderabad':        [17.3850, 78.4867],
  'Indore':           [22.7196, 75.8577],
  'Jaipur':           [26.9124, 75.7873],
  'Kochi':            [9.9312,  76.2673],
  'Kolkata':          [22.5726, 88.3639],
  'Lucknow':          [26.8467, 80.9462],
  'Mumbai':           [19.0760, 72.8777],
  'Nagpur':           [21.1458, 79.0882],
  'Patna':            [25.5941, 85.1376],
  'Pondicherry':      [11.9416, 79.8083],
  'Pune':             [18.5204, 73.8567],
  'Raipur':           [21.2514, 81.6296],
  'Ranchi':           [23.3441, 85.3096],
  'Shimla':           [31.1048, 77.1734],
  'Surat':            [21.1702, 72.8311],
  'Thiruvananthapuram': [8.5241, 76.9366],
  'Visakhapatnam':    [17.6868, 83.2185],
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
  if (waitDays > 8 || shortagePct > 10) return 'tight';
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

function formatRelativeTime(dateStr: string): string {
  const diffH = Math.round((Date.now() - new Date(dateStr).getTime()) / 3600000);
  if (diffH < 1) return 'just now';
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

interface Props {
  userCity?: string;
}

export default function IndiaLPGHeatmap({ userCity }: Props) {
  const [mounted, setMounted] = useState(false);
  const [geoData, setGeoData] = useState<any>(null);
  const [stateData, setStateData] = useState<StateSummaryData[]>([]);
  const [cityMarkers, setCityMarkers] = useState<CityMarkerData[]>([]);
  // pulse tick for animation
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    setMounted(true);

    // GeoJSON — cache in sessionStorage
    const cached = sessionStorage.getItem('india_geojson');
    if (cached) {
      setGeoData(JSON.parse(cached));
    } else {
      fetch(INDIA_GEOJSON_URL)
        .then(r => r.json())
        .then(d => { setGeoData(d); sessionStorage.setItem('india_geojson', JSON.stringify(d)); })
        .catch(err => console.error('GeoJSON fetch failed:', err));
    }

    // State summary
    const fetchStateData = async () => {
      const { data } = await supabase.from('state_summary').select('*');
      if (data && data.length > 0) {
        setStateData(data.map((d: any) => ({
          state: d.state_name,
          waitDays: Number(d.avg_wait_days),
          spike: Number(d.shortage_pct),
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
            city: row.city,
            state: row.state,
            domestic: null,
            commercial: null,
            waitDays: Number(row.wait_days),
            shortagePct: Number(row.shortage_pct),
            lastUpdated: row.last_updated,
          });
        }
        const entry = map.get(key)!;
        if (row.cylinder_type === 'domestic') entry.domestic = Number(row.price_per_cylinder);
        if (row.cylinder_type === 'commercial') entry.commercial = Number(row.price_per_cylinder);
        // use worst-case wait/shortage across types
        if (Number(row.wait_days) > entry.waitDays) entry.waitDays = Number(row.wait_days);
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

    // Pulse tick every 2s for tight/critical markers
    const pulseInterval = setInterval(() => setPulse(p => !p), 2000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pulseInterval);
    };
  }, []);

  const getStateColor = (wait: number) =>
    wait > 15 ? '#ef4444' : wait > 8 ? '#f59e0b' : '#22c55e';

  if (!mounted) {
    return (
      <div className="h-[520px] rounded-2xl border border-zinc-700 flex items-center justify-center bg-zinc-800 animate-pulse">
        <div className="text-zinc-500">Loading India map...</div>
      </div>
    );
  }

  if (!geoData) {
    return (
      <div className="h-[520px] rounded-2xl border border-zinc-700 flex items-center justify-center">
        <div className="text-zinc-500 animate-pulse">Loading India map...</div>
      </div>
    );
  }

  return (
    <div className="relative h-[520px] rounded-2xl overflow-hidden border border-zinc-700">
      <MapContainer
        center={[22, 83]}
        zoom={4.4}
        className="h-full w-full"
        style={{ background: '#18181b' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        />

        {/* State choropleth */}
        <GeoJSON
          data={geoData}
          style={(feature: any) => {
            const name = feature?.properties?.ST_NM || feature?.properties?.NAME_1;
            const s = stateData.find(d => d.state === name);
            const wait = s?.waitDays || 0;
            return {
              fillColor: s ? getStateColor(wait) : '#3f3f46',
              weight: 1,
              color: '#27272a',
              fillOpacity: s ? 0.45 : 0.15,
            };
          }}
          onEachFeature={(feature, layer) => {
            const name = feature?.properties?.ST_NM || feature?.properties?.NAME_1;
            const s = stateData.find(d => d.state === name);
            if (!s) {
              layer.bindTooltip(`<div style="font-family:system-ui;padding:4px"><b>${name}</b><br/><span style="color:#71717a">No data</span></div>`, { direction: 'auto', className: 'custom-tooltip' });
              return;
            }
            const sev = getSeverity(s.waitDays, s.spike);
            const col = SEVERITY_COLOR[sev];
            layer.bindTooltip(
              `<div style="font-family:system-ui;padding:4px;min-width:140px">
                <b style="font-size:13px">${name}</b>
                <span style="float:right;font-size:10px;color:${col};background:${col}22;padding:1px 6px;border-radius:999px;border:1px solid ${col}44">${SEVERITY_LABEL[sev]}</span>
                <br style="clear:both"/>
                <span style="color:#a1a1aa;font-size:11px">Avg wait:</span> <b>${s.waitDays}d</b><br/>
                <span style="color:#a1a1aa;font-size:11px">Shortage:</span> <b>+${s.spike}%</b><br/>
                <span style="color:#a1a1aa;font-size:11px">Cities:</span> <b>${s.totalCities}</b><br/>
                <span style="color:#52525b;font-size:10px">Updated ${formatRelativeTime(s.lastUpdated)}</span>
              </div>`,
              { direction: 'auto', className: 'custom-tooltip' }
            );
          }}
        />

        {/* City circle markers */}
        {cityMarkers.map((city) => {
          const coords = CITY_COORDS[city.city];
          if (!coords) return null;
          const sev = getSeverity(city.waitDays, city.shortagePct);
          const color = SEVERITY_COLOR[sev];
          const isUserCity = userCity && city.city.toLowerCase() === userCity.toLowerCase();
          const isStressed = sev !== 'stable';
          // pulse radius oscillates between 6 and 9 for stressed cities
          const radius = isUserCity ? 10 : (isStressed ? (pulse ? 8 : 6) : 5);

          return (
            <CircleMarker
              key={city.city}
              center={coords}
              radius={radius}
              pathOptions={{
                color: isUserCity ? '#06b6d4' : color,
                fillColor: isUserCity ? '#06b6d4' : color,
                fillOpacity: isUserCity ? 0.95 : (isStressed ? 0.85 : 0.7),
                weight: isUserCity ? 3 : 1.5,
              }}
            >
              <Tooltip direction="auto" className="custom-tooltip">
                <div style={{ fontFamily: 'system-ui', padding: '4px', minWidth: '150px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <b style={{ fontSize: '13px' }}>{city.city}</b>
                    <span style={{ fontSize: '10px', color, background: `${color}22`, padding: '1px 6px', borderRadius: '999px', border: `1px solid ${color}44` }}>
                      {SEVERITY_LABEL[sev]}
                    </span>
                  </div>
                  <span style={{ color: '#a1a1aa', fontSize: '11px' }}>{city.state}</span><br />
                  {city.domestic != null && (
                    <><span style={{ color: '#a1a1aa', fontSize: '11px' }}>Domestic:</span> <b>₹{city.domestic.toLocaleString('en-IN')}</b><br /></>
                  )}
                  {city.commercial != null && (
                    <><span style={{ color: '#a1a1aa', fontSize: '11px' }}>Commercial:</span> <b>₹{city.commercial.toLocaleString('en-IN')}</b><br /></>
                  )}
                  <span style={{ color: '#a1a1aa', fontSize: '11px' }}>Wait:</span> <b>{city.waitDays}d</b>
                  {' · '}
                  <span style={{ color: '#a1a1aa', fontSize: '11px' }}>Shortage:</span> <b>+{city.shortagePct.toFixed(0)}%</b><br />
                  <span style={{ color: '#52525b', fontSize: '10px' }}>Updated {formatRelativeTime(city.lastUpdated)}</span>
                  {isUserCity && <div style={{ color: '#06b6d4', fontSize: '10px', marginTop: '3px' }}>📍 Your city</div>}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Legend */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="absolute bottom-4 right-4 bg-zinc-900/90 border border-zinc-700 backdrop-blur p-3 rounded-xl text-xs z-[1000]"
      >
        <p className="text-zinc-500 mb-2 font-medium uppercase tracking-wider" style={{ fontSize: '10px' }}>Supply Status</p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: '#ef4444' }}></span>
            <span className="text-zinc-300">Critical <span className="text-zinc-500">(&gt;15d / &gt;20%)</span></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: '#f59e0b' }}></span>
            <span className="text-zinc-300">Tight Supply <span className="text-zinc-500">(8-15d)</span></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#22c55e' }}></span>
            <span className="text-zinc-300">Stable <span className="text-zinc-500">(&lt;8d)</span></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full border-2" style={{ background: '#06b6d4', borderColor: '#06b6d4' }}></span>
            <span className="text-cyan-400">Your City</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
