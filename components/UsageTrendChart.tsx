'use client';

import { useEffect, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { supabase } from '@/lib/supabase';
import type { UsageTrendPoint } from '@/lib/types';

const fallbackData: UsageTrendPoint[] = [
  { month: 'Oct 25', domestic: 2350, commercial: 480 },
  { month: 'Nov 25', domestic: 2400, commercial: 510 },
  { month: 'Dec 25', domestic: 2500, commercial: 530 },
  { month: 'Jan 26', domestic: 2450, commercial: 490 },
  { month: 'Feb 26', domestic: 2380, commercial: 420 },
  { month: 'Mar 26', domestic: 2300, commercial: 350 },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-3 shadow-xl">
      <p className="text-xs text-zinc-400 mb-2">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.value.toLocaleString()} TMT
        </p>
      ))}
    </div>
  );
};

export default function UsageTrendChart() {
  const [data, setData] = useState<UsageTrendPoint[]>(fallbackData);

  useEffect(() => {
    const fetchTrend = async () => {
      const { data: rows, error } = await supabase
        .from('usage_trend')
        .select('*')
        .order('month', { ascending: true });
      if (rows && rows.length > 0) {
        const mapped = rows.map((r: any) => ({
          month: r.month.replace('20', ''),
          _raw: r.month as string,
          domestic: Number(r.domestic_mt),
          commercial: Number(r.commercial_mt),
        }));
        // Sort chronologically by the original month value from Supabase
        mapped.sort((a, b) => new Date(a._raw).getTime() - new Date(b._raw).getTime());
        setData(mapped.map(({ _raw: _, ...rest }) => rest));
      }
    };
    fetchTrend();
  }, []);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
      <h3 className="font-semibold mb-4 text-sm flex items-center gap-2">
        PPAC MONTHLY CONSUMPTION
        <span className="text-xs text-zinc-500 font-normal">(Thousand MT)</span>
      </h3>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradDomestic" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradCommercial" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: '11px', color: '#a1a1aa' }}
            />
            <Area
              type="monotone"
              dataKey="domestic"
              name="Domestic"
              stroke="#06b6d4"
              strokeWidth={2}
              fill="url(#gradDomestic)"
              dot={{ r: 3, fill: '#06b6d4' }}
            />
            <Area
              type="monotone"
              dataKey="commercial"
              name="Commercial"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#gradCommercial)"
              dot={{ r: 3, fill: '#ef4444' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
