'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList } from 'recharts';
import { BarChart3, RefreshCw } from 'lucide-react';

type Hour = { hour: number; label: string; count: number };

export default function ActivityPerHourChart({ date, teamId, agentId }: { date?: string; teamId?: string; agentId?: string }) {
  const [data, setData] = useState<Hour[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(() => {
    setState('loading');
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (teamId) params.set('teamId', teamId);
    if (agentId) params.set('agentId', agentId);
    fetch(`/api/activity/hourly?${params}`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error('failed');
        return r.json();
      })
      .then((j) => {
        setData(j.hours || []);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [date, teamId, agentId]);

  useEffect(() => {
    load();
  }, [load]);

  const total = data.reduce((sum, d) => sum + (d.count || 0), 0);
  const peak = data.reduce<Hour | undefined>((best, d) => (!best || d.count > best.count ? d : best), undefined);
  // Charts alone are not screen-reader friendly: state the key insight in words.
  const summary =
    total > 0 && peak
      ? `Activity per hour: ${total.toLocaleString()} actions in total, busiest at ${peak.label} with ${peak.count}.`
      : 'Activity per hour: no activity recorded yet.';

  return (
    <div className="dash-card p-4 h-full">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="font-bold text-sm text-foreground flex items-center gap-2">
          <span className="dash-icon-chip bg-lime-500/15 text-lime-600 dark:text-lime-400 !w-8 !h-8"><BarChart3 size={15} aria-hidden /></span>
          Activity Per Hour (9 AM - 6 PM)
        </h2>
        <span className="text-xs font-semibold text-muted-foreground tabular-nums">{total.toLocaleString()}</span>
      </div>

      <div className="h-[200px] text-muted-foreground">
        {state === 'loading' ? (
          <div className="h-full flex items-end gap-2 px-2 animate-pulse" aria-busy="true" aria-label="Loading activity chart">
            {[40, 65, 50, 85, 70, 95, 60, 75, 45].map((h, i) => (
              <div key={i} className="flex-1 rounded-t-md bg-muted" style={{ height: `${h}%` }} />
            ))}
          </div>
        ) : state === 'error' ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm">Couldn’t load activity.</p>
            <button onClick={load} className="btn-secondary text-sm min-h-[44px] inline-flex items-center gap-1.5">
              <RefreshCw size={14} aria-hidden /> Retry
            </button>
          </div>
        ) : total === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
            <span className="dash-icon-chip bg-muted"><BarChart3 size={16} aria-hidden /></span>
            <p className="text-sm">No activity recorded yet</p>
          </div>
        ) : (
          <div role="img" aria-label={summary} className="h-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 16, right: 4, left: -14, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.15} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(163,230,53,0.08)' }}
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12, color: 'var(--foreground)' }}
                  labelStyle={{ color: 'var(--muted-foreground)' }}
                />
                {/* --primary is the darker lime on the light theme and the neon lime on dark (>=3:1 vs the surface) */}
                <Bar dataKey="count" fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                  <LabelList dataKey="count" position="top" fontSize={11} fill="currentColor" formatter={(v: any) => (v ? String(v) : '')} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
