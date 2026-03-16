'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { MapPin, Search, Clock, TrendingUp, TrendingDown, Minus, Package, Share2, Download, Copy, Check, MessageCircle, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatRelativeTime } from '@/lib/utils';

interface CityRow {
  city: string;
  state: string;
  cylinder_type: string;
  price_per_cylinder: number;
  wait_days: number;
  shortage_pct: number;
  last_updated: string;
}

interface NationalAvg {
  avgWait: number;
  avgShortage: number;
}

function getStatus(waitDays: number, shortagePct: number) {
  if (waitDays > 15 || shortagePct > 20) return { label: 'High Stress', dot: 'bg-red-500',    text: 'text-red-400',    border: 'border-red-500/30',    bg: 'bg-red-500/10',    hex: '#f87171', hexBg: 'rgba(239,68,68,0.12)'   };
  if (waitDays > 8  || shortagePct > 10) return { label: 'Moderate',    dot: 'bg-orange-400', text: 'text-orange-400', border: 'border-orange-500/30', bg: 'bg-orange-500/10', hex: '#fb923c', hexBg: 'rgba(249,115,22,0.12)' };
  return                                         { label: 'Stable',      dot: 'bg-green-500',  text: 'text-green-400',  border: 'border-green-500/30',  bg: 'bg-green-500/10',  hex: '#4ade80', hexBg: 'rgba(34,197,94,0.12)'   };
}

function getCommercialRisk(waitDays: number, shortagePct: number) {
  if (waitDays > 12 || shortagePct > 25) return {
    level: 'High' as const,
    pill:  'text-red-400 bg-red-500/15 border-red-500/30',
    bar:   'bg-red-500',
    barW:  'w-full',
    desc:  'Restaurants and hotels face imminent refill delays. Secure backup supply now.',
  };
  if (waitDays >= 7 || shortagePct >= 10) return {
    level: 'Moderate' as const,
    pill:  'text-amber-400 bg-amber-500/15 border-amber-500/30',
    bar:   'bg-amber-400',
    barW:  'w-2/3',
    desc:  'Refill delays possible within the next few days. Monitor supply closely.',
  };
  return {
    level: 'Low' as const,
    pill:  'text-green-400 bg-green-500/15 border-green-500/30',
    bar:   'bg-green-500',
    barW:  'w-1/3',
    desc:  'Commercial supply is broadly stable. Normal operations expected.',
  };
}

function shortageHex(pct: number): string {
  if (pct > 25) return '#f87171';
  if (pct >= 10) return '#fbbf24';
  return '#4ade80';
}

function waitHex(days: number): string {
  if (days > 15) return '#f87171';
  if (days > 8)  return '#fb923c';
  return '#4ade80';
}

type DiffResult = { text: string; arrow: '↑' | '↓' | '—'; color: string };

function diffLabel(delta: number, unit: string, worseName: string, betterName: string): { text: string; icon: React.ReactNode; color: string } {
  if (Math.abs(delta) < 1) return { text: 'On par with India average',                                              icon: <Minus size={13} />,       color: 'text-zinc-400' };
  if (delta > 0)           return { text: `${Math.abs(delta).toFixed(0)}${unit} ${worseName} than India average`,   icon: <TrendingUp size={13} />,   color: 'text-red-400'  };
  return                          { text: `${Math.abs(delta).toFixed(0)}${unit} ${betterName} than India average`,  icon: <TrendingDown size={13} />, color: 'text-green-400' };
}

function diffCanvas(delta: number, unit: string, worseName: string, betterName: string): DiffResult {
  if (Math.abs(delta) < 1) return { text: 'On par with India average',                                            arrow: '—', color: '#71717a' };
  if (delta > 0)           return { text: `${Math.abs(delta).toFixed(0)}${unit} ${worseName} than India average`, arrow: '↑', color: '#f87171' };
  return                          { text: `${Math.abs(delta).toFixed(0)}${unit} ${betterName} than India average`, arrow: '↓', color: '#4ade80' };
}

// ── Canvas share image ────────────────────────────────────────────
function buildShareCanvas(opts: {
  city: string;
  state: string;
  statusLabel: string;
  statusHex: string;
  statusBg: string;
  waitDays: number;
  shortagePct: number;
  domesticPrice: number | null;
  commercialPrice: number | null;
  waitCmp: DiffResult;
  shortageCmp: DiffResult;
  nationalAvgWait: number;
  nationalAvgShortage: number;
  cityCount: number;
}): HTMLCanvasElement {
  const W = 800, H = 440;
  const canvas = document.createElement('canvas');
  canvas.width  = W * 2;   // 2x for retina
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);

  // ── Background ──
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, W, H);

  // Subtle grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // Top accent bar
  ctx.fillStyle = '#06b6d4';
  ctx.fillRect(0, 0, W, 3);

  // ── Header: LPG badge + site name ──
  ctx.fillStyle = '#06b6d4';
  roundRect(ctx, 24, 20, 36, 24, 4);
  ctx.fillStyle = '#000';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('LPG', 42, 36);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('LPG SITUATION DECK', 68, 37);

  // Right: "City Spotlight"
  ctx.fillStyle = '#52525b';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('City Spotlight', W - 24, 37);

  // Divider
  ctx.strokeStyle = '#27272a';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(24, 56); ctx.lineTo(W - 24, 56); ctx.stroke();

  // ── Left panel: city identity ──
  const LEFT = 24, TOP = 72, CARD_W = 220, CARD_H = 280;
  ctx.fillStyle = opts.statusBg;
  roundRect(ctx, LEFT, TOP, CARD_W, CARD_H, 12);
  ctx.strokeStyle = opts.statusHex + '55';
  ctx.lineWidth = 1;
  roundRectStroke(ctx, LEFT, TOP, CARD_W, CARD_H, 12);

  // Status pill
  ctx.fillStyle = opts.statusHex + '33';
  roundRect(ctx, LEFT + 14, TOP + 14, 90, 20, 10);
  ctx.fillStyle = opts.statusHex;
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(opts.statusLabel.toUpperCase(), LEFT + 26, TOP + 27);

  // City name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.fillText(opts.city, LEFT + 14, TOP + 72);

  // State
  ctx.fillStyle = '#71717a';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(opts.state, LEFT + 14, TOP + 92);

  // Divider inside card
  ctx.strokeStyle = '#27272a';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(LEFT + 14, TOP + 108); ctx.lineTo(LEFT + CARD_W - 14, TOP + 108); ctx.stroke();

  // Prices
  if (opts.domesticPrice != null) {
    ctx.fillStyle = '#71717a';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('DOMESTIC', LEFT + 14, TOP + 130);
    ctx.fillStyle = '#93c5fd';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText('₹' + opts.domesticPrice.toLocaleString('en-IN'), LEFT + 14, TOP + 148);
  }
  if (opts.commercialPrice != null) {
    const colX = opts.domesticPrice != null ? LEFT + CARD_W / 2 : LEFT + 14;
    ctx.fillStyle = '#71717a';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('COMMERCIAL', colX, TOP + 130);
    ctx.fillStyle = '#c4b5fd';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText('₹' + opts.commercialPrice.toLocaleString('en-IN'), colX, TOP + 148);
  }

  // ── Middle: metric tiles (2x2) ──
  const MID = LEFT + CARD_W + 16;
  const TILE_W = 150, TILE_H = 128;
  const tiles = [
    { label: 'WAIT DAYS', value: opts.waitDays + 'd',  color: waitHex(opts.waitDays)          },
    { label: 'SHORTAGE',  value: '+' + opts.shortagePct.toFixed(0) + '%', color: shortageHex(opts.shortagePct) },
  ];
  tiles.forEach((tile, i) => {
    const tx = MID + i * (TILE_W + 12);
    ctx.fillStyle = '#18181b';
    roundRect(ctx, tx, TOP, TILE_W, TILE_H, 12);
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 1;
    roundRectStroke(ctx, tx, TOP, TILE_W, TILE_H, 12);

    ctx.fillStyle = '#52525b';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(tile.label, tx + 14, TOP + 22);

    ctx.fillStyle = tile.color;
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.fillText(tile.value, tx + 14, TOP + 74);
  });

  // ── Right: vs India avg ──
  const RIGHT_X = MID, RIGHT_Y = TOP + TILE_H + 14;
  const RIGHT_W = TILE_W * 2 + 12, RIGHT_H = CARD_H - TILE_H - 14;
  ctx.fillStyle = '#18181b';
  roundRect(ctx, RIGHT_X, RIGHT_Y, RIGHT_W, RIGHT_H, 12);
  ctx.strokeStyle = '#27272a';
  ctx.lineWidth = 1;
  roundRectStroke(ctx, RIGHT_X, RIGHT_Y, RIGHT_W, RIGHT_H, 12);

  ctx.fillStyle = '#52525b';
  ctx.font = 'bold 9px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('VS. INDIA AVERAGE', RIGHT_X + 14, RIGHT_Y + 20);

  ctx.fillStyle = '#3f3f46';
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText(`National avg: ${opts.nationalAvgWait.toFixed(0)}d wait · ${opts.nationalAvgShortage.toFixed(0)}% shortage`, RIGHT_X + 14, RIGHT_Y + 36);

  // Wait comparison
  ctx.fillStyle = opts.waitCmp.color;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(opts.waitCmp.arrow, RIGHT_X + 14, RIGHT_Y + 66);
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(opts.waitCmp.text, RIGHT_X + 30, RIGHT_Y + 66);

  // Shortage comparison
  ctx.fillStyle = opts.shortageCmp.color;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(opts.shortageCmp.arrow, RIGHT_X + 14, RIGHT_Y + 88);
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(opts.shortageCmp.text, RIGHT_X + 30, RIGHT_Y + 88);

  // ── Footer ──
  ctx.strokeStyle = '#27272a';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(24, H - 36); ctx.lineTo(W - 24, H - 36); ctx.stroke();

  ctx.fillStyle = '#52525b';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Source: LPG Supply Tracker  ·  ${opts.cityCount} cities monitored  ·  ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`, 24, H - 18);

  ctx.fillStyle = '#27272a';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('lpgsituationdeck.com', W - 24, H - 18);

  return canvas;
}

// Canvas helpers
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function roundRectStroke(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.stroke();
}

// ── Component ────────────────────────────────────────────────────
interface CitySpotlightProps {
  onCityChange?: (city: string) => void;
  /** Controlled city — set by parent when user clicks a map marker or table row. */
  selectedCityProp?: string;
  /** Compact mode: renders only city name + delay + supply stress. Used in the left rail. */
  compact?: boolean;
}

export default function CitySpotlight({ onCityChange, selectedCityProp, compact = false }: CitySpotlightProps) {
  const [allCities, setAllCities]       = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState('');
  const [search, setSearch]             = useState('');
  const [rows, setRows]                 = useState<CityRow[]>([]);
  const [allRows, setAllRows]           = useState<CityRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [detecting, setDetecting]       = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [shareOpen, setShareOpen]       = useState(false);
  const [copyState, setCopyState]       = useState<'idle' | 'copying' | 'copied'>('idle');

  useEffect(() => {
    supabase
      .from('city_data')
      .select('city, state, cylinder_type, price_per_cylinder, wait_days, shortage_pct, last_updated')
      .neq('state', 'Unknown')
      .then(({ data }) => {
        if (data) {
          setAllRows(data);
          setAllCities([...new Set(data.map((r: any) => r.city as string))].sort());
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    // Compact mode is fully controlled by selectedCityProp — skip geolocation
    if (compact) return;
    if (!navigator.geolocation) return;
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`);
          const json = await res.json();
          const city = json.address?.city || json.address?.town || json.address?.village || json.address?.county || '';
          if (city) { setSelectedCity(city); onCityChange?.(city); }
        } catch { /* ignore */ } finally { setDetecting(false); }
      },
      () => setDetecting(false),
      { timeout: 6000 }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { onCityChange?.(selectedCity); }, [selectedCity]);

  // Sync from parent-controlled prop (map marker / table row click).
  // No signal/callback needed — parent owns the value, this just mirrors it.
  useEffect(() => {
    if (!selectedCityProp) return;
    setSelectedCity(selectedCityProp);
    setSearch('');
    setShowDropdown(false);
    setShareOpen(false);
  }, [selectedCityProp]);

  useEffect(() => {
    if (!selectedCity) { setRows([]); return; }
    setRows(allRows.filter(r => r.city.toLowerCase() === selectedCity.toLowerCase()));
  }, [selectedCity, allRows]);

  const national: NationalAvg = useMemo(() => {
    if (allRows.length === 0) return { avgWait: 0, avgShortage: 0 };
    const perCity = new Map<string, { waitDays: number; shortagePct: number }>();
    for (const r of allRows) {
      const key = r.city.toLowerCase();
      const cur = perCity.get(key);
      if (!cur || r.wait_days > cur.waitDays)
        perCity.set(key, { waitDays: Number(r.wait_days), shortagePct: Number(r.shortage_pct) });
    }
    const vals = Array.from(perCity.values());
    return {
      avgWait:     vals.reduce((s, v) => s + v.waitDays,    0) / vals.length,
      avgShortage: vals.reduce((s, v) => s + v.shortagePct, 0) / vals.length,
    };
  }, [allRows]);

  const filteredCities = allCities.filter(c => c.toLowerCase().includes(search.toLowerCase())).slice(0, 30);
  const domestic       = rows.find(r => r.cylinder_type === 'domestic');
  const commercial     = rows.find(r => r.cylinder_type === 'commercial');
  const rep            = commercial || domestic;
  const status         = rep ? getStatus(rep.wait_days, Number(rep.shortage_pct)) : null;

  const waitDiff     = rep ? rep.wait_days           - national.avgWait     : 0;
  const shortageDiff = rep ? Number(rep.shortage_pct) - national.avgShortage : 0;
  const waitCmp      = diffLabel(waitDiff,     'd',  'longer wait',    'shorter wait');
  const shortageCmp  = diffLabel(shortageDiff, '%',  'higher shortage', 'lower shortage');

  const hasData = !!rep && !!status;

  // ── Share handlers ──────────────────────────────────────────────
  const getCanvas = useCallback((): HTMLCanvasElement | null => {
    if (!rep || !status) return null;
    const waitC     = diffCanvas(waitDiff,     'd',  'longer wait',    'shorter wait');
    const shortageC = diffCanvas(shortageDiff, '%',  'higher shortage', 'lower shortage');
    return buildShareCanvas({
      city:               rep.city,
      state:              rep.state,
      statusLabel:        status.label,
      statusHex:          status.hex,
      statusBg:           status.hexBg,
      waitDays:           rep.wait_days,
      shortagePct:        Number(rep.shortage_pct),
      domesticPrice:      domestic ? Number(domestic.price_per_cylinder) : null,
      commercialPrice:    commercial ? Number(commercial.price_per_cylinder) : null,
      waitCmp:            waitC,
      shortageCmp:        shortageC,
      nationalAvgWait:    national.avgWait,
      nationalAvgShortage: national.avgShortage,
      cityCount:          allCities.length,
    });
  }, [rep, status, domestic, commercial, waitDiff, shortageDiff, national, allCities.length]);

  const handleDownload = useCallback(() => {
    const canvas = getCanvas();
    if (!canvas || !rep) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `lpg-${rep.city.toLowerCase().replace(/\s+/g, '-')}-status.png`;
    a.click();
    setShareOpen(false);
  }, [getCanvas, rep]);

  const handleCopy = useCallback(async () => {
    const canvas = getCanvas();
    if (!canvas) return;
    setCopyState('copying');
    try {
      const blob = await new Promise<Blob>((res) => canvas.toBlob(b => res(b!), 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyState('copied');
      setTimeout(() => { setCopyState('idle'); setShareOpen(false); }, 2000);
    } catch {
      // Clipboard write failed (e.g. Firefox) — fall back to download
      handleDownload();
    }
  }, [getCanvas, handleDownload]);

  const handleWhatsApp = useCallback(() => {
    if (!rep) return;
    const price = commercial
      ? `₹${Number(commercial.price_per_cylinder).toLocaleString('en-IN')}`
      : 'N/A';
    const url = typeof window !== 'undefined' ? window.location.origin : 'https://lpgsituationdeck.com';
    const msg = [
      `🚨 ${rep.city} LPG Alert`,
      ``,
      `Delay status: ${rep.wait_days >= 10 ? 'High Delay Signal' : rep.wait_days >= 6 ? 'Moderate Delay' : rep.wait_days >= 3 ? 'Mild Delay' : 'Stable'}`,
      `Supply stress: ${Number(rep.shortage_pct) >= 25 ? 'High' : Number(rep.shortage_pct) >= 15 ? 'Elevated' : Number(rep.shortage_pct) >= 8 ? 'Moderate' : 'Low'}`,
      ``,
      `Check your city's LPG signal status:`,
      url,
    ].join('\n');
    // Use location.href as primary — most reliable on mobile (opens WhatsApp app directly)
    // and not subject to popup blockers that suppress window.open().
    const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
    setShareOpen(false);
  }, [rep, commercial]);

  // ── Compact render (left rail) ───────────────────────────────
  if (compact) {
    if (!hasData) return null;
    const d   = rep!.wait_days;
    const pct = Number(rep!.shortage_pct);
    const delayLabel = d >= 10 ? 'High Delay Signal' : d >= 6 ? 'Moderate Delay' : d >= 3 ? 'Mild Delay' : 'Stable';
    const delayColor = d >= 10 ? 'text-red-400' : d >= 6 ? 'text-amber-400' : d >= 3 ? 'text-yellow-400' : 'text-green-400';
    const stressLabel = pct >= 25 ? 'High' : pct >= 15 ? 'Elevated' : pct >= 8 ? 'Moderate' : 'Low';
    const stressColor = pct >= 25 ? 'text-red-400' : pct >= 15 ? 'text-amber-400' : pct >= 8 ? 'text-yellow-400' : 'text-green-400';

    return (
      <div className={`rounded-2xl border p-4 flex flex-col gap-3 ${status!.border} ${status!.bg}`}>
        {/* City identity */}
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${status!.dot} animate-pulse`} />
          <div className="min-w-0">
            <p className="font-bold text-sm truncate">{rep!.city}</p>
            <p className="text-[11px] text-zinc-500 truncate">{rep!.state}</p>
          </div>
          <span className={`ml-auto text-[10px] font-semibold uppercase tracking-wide shrink-0 ${status!.text}`}>
            {status!.label}
          </span>
        </div>

        {/* Delay + stress tiles */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-zinc-950/60 rounded-xl p-2.5 flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-widest text-zinc-600 font-semibold">Delay</span>
            <span className={`text-xs font-bold ${delayColor}`}>{delayLabel}</span>
          </div>
          <div className="bg-zinc-950/60 rounded-xl p-2.5 flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-widest text-zinc-600 font-semibold">Supply Stress</span>
            <span className={`text-xs font-bold ${stressColor}`}>{stressLabel}</span>
          </div>
        </div>

        <p className="text-[10px] text-zinc-600 flex items-center gap-1">
          <Clock size={10} />
          Updated {formatRelativeTime(rep!.last_updated)}
        </p>
      </div>
    );
  }

  // ── Full render (below-fold spotlight) ────────────────────────
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
      {/* Section header + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-5">
        <div className="flex items-center gap-2">
          <MapPin size={15} className="text-cyan-400 shrink-0" />
          <h2 className="text-lg font-semibold tracking-tight">YOUR CITY SPOTLIGHT</h2>
        </div>

        <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
          {/* Share button — only when data is loaded */}
          {hasData && (
            <div className="relative">
              <button
                onClick={() => setShareOpen(s => !s)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
              >
                <Share2 size={13} />
                Share City Status
              </button>

              {shareOpen && (
                <div className="absolute right-0 top-full mt-2 z-50 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-1 flex flex-col min-w-[160px]">
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 rounded-xl transition-colors"
                  >
                    <Download size={14} className="text-cyan-400" />
                    Download image
                  </button>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 rounded-xl transition-colors"
                  >
                    {copyState === 'copied'
                      ? <><Check size={14} className="text-green-400" /><span className="text-green-400">Copied!</span></>
                      : <><Copy size={14} className="text-cyan-400" />Copy to clipboard</>
                    }
                  </button>
                  <div className="my-1 mx-3 border-t border-zinc-800" />
                  <button
                    onClick={handleWhatsApp}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-green-400 hover:bg-zinc-800 rounded-xl transition-colors"
                  >
                    <MessageCircle size={14} />
                    Share to WhatsApp
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Search input — full mode only */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder={loading ? 'Loading cities…' : 'Search your city…'}
              value={selectedCity ? (showDropdown ? search : selectedCity) : search}
              onFocus={() => { setShowDropdown(true); setSearch(''); }}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              onChange={e => { setSearch(e.target.value); setSelectedCity(''); }}
              className="bg-zinc-950 border border-zinc-700 rounded-xl pl-8 pr-4 py-2 text-sm w-52 focus:outline-none focus:border-cyan-500 transition-colors"
            />
            {detecting && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 animate-pulse">detecting…</span>
            )}
            {showDropdown && filteredCities.length > 0 && (
              <div className="absolute z-50 top-full mt-1 left-0 w-52 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-h-56 overflow-y-auto">
                {filteredCities.map(city => (
                  <button
                    key={city}
                    onMouseDown={() => { setSelectedCity(city); setSearch(''); setShowDropdown(false); setShareOpen(false); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 transition-colors first:rounded-t-xl last:rounded-b-xl"
                  >
                    {city}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Close share dropdown on outside click */}
      {shareOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setShareOpen(false)} />
      )}

      {/* Empty / placeholder state */}
      {!selectedCity && !detecting && (
        <div className="border border-zinc-800 border-dashed rounded-2xl px-6 py-10 text-center">
          <MapPin size={22} className="text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">
            Search for your city to see LPG supply stress, wait times and pricing signals.
          </p>
        </div>
      )}

      {/* No data for selected city */}
      {selectedCity && rows.length === 0 && !loading && (
        <div className="border border-zinc-800 border-dashed rounded-2xl px-6 py-8 text-center">
          <p className="text-sm text-zinc-500">No data available for <span className="text-white font-medium">{selectedCity}</span>.</p>
          <p className="text-xs text-zinc-600 mt-1">Try searching for a nearby major city.</p>
        </div>
      )}

      {/* Spotlight card */}
      {hasData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Left: city identity + status */}
          <div className={`lg:col-span-1 rounded-2xl border p-5 flex flex-col gap-4 ${status!.border} ${status!.bg}`}>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2.5 h-2.5 rounded-full ${status!.dot} animate-pulse`} />
                <span className={`text-xs font-semibold uppercase tracking-wider ${status!.text}`}>{status!.label}</span>
              </div>
              <h3 className="text-2xl font-bold tracking-tight">{rep!.city}</h3>
              <p className="text-sm text-zinc-500 mt-0.5">{rep!.state}</p>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-zinc-600 mt-auto">
              <Clock size={11} />
              Updated {formatRelativeTime(rep!.last_updated)}
            </div>
          </div>

          {/* Middle: key metrics + WhatsApp button */}
          <div className="lg:col-span-1 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Delay Status</span>
                {(() => {
                  const d = rep!.wait_days;
                  const label = d >= 10 ? 'High Delay Signal' : d >= 6 ? 'Moderate Delay' : d >= 3 ? 'Mild Delay' : 'Stable';
                  const color = d >= 10 ? 'text-red-400' : d >= 6 ? 'text-amber-400' : d >= 3 ? 'text-yellow-400' : 'text-green-400';
                  return <span className={`text-xl font-bold ${color}`}>{label}</span>;
                })()}
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold flex items-center gap-1">
                  Supply Stress
                  <span className="group relative inline-flex items-center cursor-default">
                    <Info size={10} className="text-zinc-700 group-hover:text-zinc-500 transition-colors" />
                    <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-normal rounded-xl px-3 py-2 leading-relaxed shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-50 text-center normal-case tracking-normal whitespace-normal">
                      Supply stress signal derived from estimated delivery delay patterns. Not an official shortage figure.
                    </span>
                  </span>
                </span>
                {(() => {
                  const pct = Number(rep!.shortage_pct);
                  const label = pct >= 25 ? 'High' : pct >= 15 ? 'Elevated' : pct >= 8 ? 'Moderate' : 'Low';
                  const color = pct >= 25 ? 'text-red-400' : pct >= 15 ? 'text-amber-400' : pct >= 8 ? 'text-yellow-400' : 'text-green-400';
                  return <span className={`text-xl font-bold ${color}`}>{label}</span>;
                })()}
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-1 col-span-2">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Domestic Price</span>
                {domestic
                  ? <span className="text-lg font-bold text-blue-300 tabular-nums">₹{Number(domestic.price_per_cylinder).toLocaleString('en-IN')}</span>
                  : <span className="text-zinc-600 text-sm mt-1">—</span>
                }
              </div>
            </div>

            {/* WhatsApp share button */}
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                [
                  `🚨 ${rep!.city} LPG Alert`,
                  ``,
                  `Delay status: ${rep!.wait_days >= 10 ? 'High Delay Signal' : rep!.wait_days >= 6 ? 'Moderate Delay' : rep!.wait_days >= 3 ? 'Mild Delay' : 'Stable'}`,
                  `Supply stress: ${Number(rep!.shortage_pct) >= 25 ? 'High' : Number(rep!.shortage_pct) >= 15 ? 'Elevated' : Number(rep!.shortage_pct) >= 8 ? 'Moderate' : 'Low'}`,
                  ``,
                  `Check your city's LPG signal status:`,
                  typeof window !== 'undefined' ? window.location.origin : 'https://lpgsituationdeck.com',
                ].join('\n')
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-[#25D366]/10 border border-[#25D366]/30 hover:bg-[#25D366]/20 hover:border-[#25D366]/60 text-[#25D366] rounded-2xl px-4 py-3 text-sm font-semibold transition-colors"
            >
              <MessageCircle size={16} />
              Share on WhatsApp
            </a>
          </div>

          {/* Right: national comparison */}
          <div className="lg:col-span-1 bg-zinc-950 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4">
            <div>
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">vs. India Average</span>
              {national.avgWait > 0 && (
                <p className="text-xs text-zinc-600 mt-0.5">Relative to signals across monitored cities</p>
              )}
            </div>

            <div className="space-y-3">
              <div className={`flex items-start gap-2.5 ${waitCmp.color}`}>
                <span className="shrink-0 mt-0.5">{waitCmp.icon}</span>
                <span className="text-sm font-medium leading-snug">{waitCmp.text}</span>
              </div>
              <div className={`flex items-start gap-2.5 ${shortageCmp.color}`}>
                <span className="shrink-0 mt-0.5">{shortageCmp.icon}</span>
                <span className="text-sm font-medium leading-snug">{shortageCmp.text}</span>
              </div>
            </div>

            <div className="mt-auto pt-3 border-t border-zinc-800">
              <div className="flex items-center justify-between text-xs text-zinc-600">
                <span className="flex items-center gap-1"><Package size={11} /> National avg</span>
                <span>{allCities.length} cities in signal view</span>
              </div>
            </div>
          </div>

          {/* Full-width: Commercial LPG Risk Indicator */}
          {(() => {
            const risk = getCommercialRisk(rep!.wait_days, Number(rep!.shortage_pct));
            return (
              <div className="lg:col-span-3 bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Label + level */}
                <div className="shrink-0">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1.5">
                    Supply Risk Level
                  </p>
                  <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1 rounded-full border ${risk.pill}`}>
                    {risk.level}
                  </span>
                </div>

                {/* Divider */}
                <div className="hidden sm:block w-px self-stretch bg-zinc-800" />

                {/* Bar + description */}
                <div className="flex-1 min-w-0">
                  {/* Track */}
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full mb-2.5 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${risk.bar} ${risk.barW}`} />
                  </div>
                  <p className="text-sm text-zinc-400 leading-snug">{risk.desc}</p>
                </div>

                {/* Audience tag */}
                <div className="shrink-0 text-[10px] text-zinc-600 text-right hidden sm:block">
                  Restaurants &amp; Hotels
                </div>
              </div>
            );
          })()}

        </div>
      )}
    </div>
  );
}
