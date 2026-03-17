'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatRelativeTime } from '@/lib/utils';

interface HealthInfo {
  status: 'healthy' | 'degraded';
  lastRun: string;
}

export default function SystemHealthIndicator() {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      // Get latest system health
      const { data: healthData } = await supabase
        .from('system_health')
        .select('status, checked_at')
        .order('checked_at', { ascending: false })
        .limit(1)
        .single();

      // Get latest job run to check for recent failures
      const { data: jobData } = await supabase
        .from('job_runs')
        .select('status, started_at')
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      if (healthData) {
        const isHealthy = healthData.status === 'healthy' && (!jobData || jobData.status !== 'fail');
        
        setHealth({
          status: isHealthy ? 'healthy' : 'degraded',
          lastRun: healthData.checked_at,
        });
      }
      setLoading(false);
    };

    fetchHealth();
  }, []);

  if (loading || !health) return null;

  return (
    <div className="mt-12 mb-8 flex flex-col items-center justify-center py-6 border-t border-zinc-900">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          {health.status === 'healthy' ? (
            <ShieldCheck size={14} className="text-green-500" />
          ) : (
            <ShieldAlert size={14} className="text-red-500" />
          )}
          <span className="text-[10px] uppercase tracking-[2px] text-zinc-500 font-bold">
            Signal System Health: 
            <span className={health.status === 'healthy' ? 'text-green-500 ml-1.5' : 'text-red-500 ml-1.5'}>
              {health.status === 'healthy' ? 'Healthy' : 'Degraded'}
            </span>
          </span>
        </div>

        <div className="w-px h-3 bg-zinc-800" />

        <div className="flex items-center gap-2 text-zinc-600">
          <Clock size={12} />
          <span className="text-[10px] uppercase tracking-wider">
            Last pipeline run: {formatRelativeTime(health.lastRun)}
          </span>
        </div>
      </div>
      
      <p className="mt-3 text-[9px] text-zinc-700 uppercase tracking-widest text-center">
        Phase 1 AI Signal Layer · Autonomous Monitoring Active
      </p>
    </div>
  );
}
