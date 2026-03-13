'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import type { StateData } from '@/lib/types';

// Dynamically import all Leaflet components (disable SSR — Leaflet uses browser APIs)
const MapContainer = dynamic(
  () => import('react-leaflet').then(mod => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then(mod => mod.TileLayer),
  { ssr: false }
);
const GeoJSON = dynamic(
  () => import('react-leaflet').then(mod => mod.GeoJSON),
  { ssr: false }
);

const INDIA_GEOJSON_URL = 'https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson';

export default function IndiaLPGHeatmap() {
  const [mounted, setMounted] = useState(false);
  const [geoData, setGeoData] = useState<any>(null);
  const [stateData, setStateData] = useState<StateData[]>([]);

  useEffect(() => {
    setMounted(true);
    // Fetch GeoJSON
    fetch(INDIA_GEOJSON_URL)
      .then(res => res.json())
      .then(data => setGeoData(data))
      .catch(err => console.error('GeoJSON fetch failed:', err));

    // Fetch live state data from Supabase
    const fetchStateData = async () => {
      const { data, error } = await supabase
        .from('state_summary')
        .select('*');
      if (data && data.length > 0) {
        setStateData(data.map((d: any) => ({
          state: d.state_name,
          waitDays: d.avg_wait_days,
          spike: d.shortage_pct,
        })));
      }
    };
    fetchStateData();

    // Realtime subscription
    const channel = supabase
      .channel('state-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'state_summary' }, () => {
        fetchStateData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const getColor = (wait: number) => wait > 15 ? '#ef4444' : wait > 8 ? '#f59e0b' : '#22c55e';

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
        center={[22.5, 78.5]}
        zoom={5}
        className="h-full w-full"
        style={{ background: '#18181b' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        />
        <GeoJSON
          data={geoData}
          style={(feature: any) => {
            const stateName = feature?.properties?.ST_NM || feature?.properties?.NAME_1;
            const data = stateData.find(d => d.state === stateName);
            const wait = data?.waitDays || 5;
            return {
              fillColor: getColor(wait),
              weight: 1.5,
              color: '#27272a',
              fillOpacity: 0.7,
            };
          }}
          onEachFeature={(feature, layer) => {
            const stateName = feature?.properties?.ST_NM || feature?.properties?.NAME_1;
            const data = stateData.find(d => d.state === stateName);
            const wait = data?.waitDays || 5;
            const spike = data?.spike || 0;
            layer.bindTooltip(
              `<div style="font-family:system-ui;padding:4px">
                <b>${stateName}</b><br/>
                Wait: <span style="color:${getColor(wait)}">${wait} days</span><br/>
                Spike: +${spike}%
              </div>`,
              { direction: 'auto', className: 'custom-tooltip' }
            );
          }}
        />
      </MapContainer>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="absolute bottom-6 right-6 bg-zinc-900/90 border border-red-500/30 backdrop-blur p-4 rounded-xl text-xs z-[1000]"
      >
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
            High Alert (&gt;15 days)
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 bg-orange-500 rounded-full"></span>
            Medium (8-15)
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 bg-green-500 rounded-full"></span>
            Low (&lt;8)
          </div>
        </div>
      </motion.div>
    </div>
  );
}
