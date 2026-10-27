'use client';
import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { BarChart3 } from 'lucide-react';

export default function ActivityPerHourChart({ date, teamId, agentId }: { date?: string; teamId?: string; agentId?: string }) {
  const [data, setData] = useState<{hour:number; label:string; count:number}[]>([]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (teamId) params.set('teamId', teamId);
    if (agentId) params.set('agentId', agentId);
    fetch(`/api/activity/hourly?${params}`, { cache: 'no-store' }).then(r=>r.json()).then(j=> setData(j.hours||[]));
  }, [date, teamId, agentId]);

  const total = data.reduce((sum, d) => sum + (d.count || 0), 0);

  return (
    <div className="dash-card p-4 h-full">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
          <span className="dash-icon-chip bg-lime-500/15 text-lime-600 dark:text-lime-400 !w-8 !h-8"><BarChart3 size={15} /></span>
          Activity Per Hour (9 AM - 6 PM)
        </h3>
        <span className="text-xs font-semibold text-muted-foreground tabular-nums">{total}</span>
      </div>
      <div className="h-[200px] text-muted-foreground">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.15} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: 'rgba(163,230,53,0.08)' }}
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12, color: 'var(--foreground)' }}
              labelStyle={{ color: 'var(--muted-foreground)' }}
            />
            <Bar dataKey="count" fill="#a3e635" radius={[6, 6, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
