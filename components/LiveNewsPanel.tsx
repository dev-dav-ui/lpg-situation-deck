'use client';

import { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { NewsItem } from '@/lib/types';

const fallbackNews: NewsItem[] = [
  { headline: 'Hormuz tensions escalate \u2014 commercial LPG imports delayed', impact: '+25%', sentiment: 'negative' },
  { headline: 'PPAC reports 18% drop in commercial cylinder refills this week', impact: '+12%', sentiment: 'negative' },
  { headline: 'Delhi govt prioritises domestic over hotels', impact: '-8%', sentiment: 'positive' },
  { headline: 'IOC announces emergency LPG shipment from Saudi Arabia', impact: '-15%', sentiment: 'positive' },
  { headline: 'Restaurant associations demand commercial LPG quota increase', impact: '+5%', sentiment: 'negative' },
];

export default function LiveNewsPanel() {
  const [news, setNews] = useState<NewsItem[]>(fallbackNews);

  useEffect(() => {
    const fetchNews = async () => {
      const { data, error } = await supabase
        .from('news_impact')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(8);
      if (data && data.length > 0) {
        setNews(data.map((d: any) => ({
          headline: d.headline,
          impact: d.impact_pct > 0 ? `+${d.impact_pct}%` : `${d.impact_pct}%`,
          sentiment: d.impact_pct > 0 ? 'negative' : 'positive',
          source: d.source,
          url: d.url,
          createdAt: d.created_at,
        })));
      }
    };
    fetchNews();

    // Realtime
    const channel = supabase
      .channel('news-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'news_impact' }, () => {
        fetchNews();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
      <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm">
        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
        LIVE NEWS IMPACT
      </h3>
      <div className="space-y-3 max-h-[320px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
        {news.map((item, i) => (
          <div
            key={i}
            className={`flex gap-3 bg-zinc-950 p-4 rounded-2xl border-l-4 ${
              item.sentiment === 'negative' ? 'border-red-500' : 'border-green-500'
            } hover:bg-zinc-900 transition-colors cursor-pointer`}
          >
            <div className="flex-1 text-sm leading-relaxed">{item.headline}</div>
            <div className={`flex items-center gap-1 font-bold text-sm whitespace-nowrap ${
              item.sentiment === 'negative' ? 'text-red-400' : 'text-green-400'
            }`}>
              {item.impact}
              {item.sentiment === 'negative' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
