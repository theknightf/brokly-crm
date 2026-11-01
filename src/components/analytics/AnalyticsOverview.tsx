'use client';
import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Clock, PhoneCall } from 'lucide-react';
import { PanelError } from './StatusBadge';
import { nf } from './utils';
import type { Loadable, OverviewStats, Timeframe } from './types';

const FRAMES: { key: Timeframe; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'year', label: 'Year' },
];

const CARD = 'rounded-2xl border border-slate-800/80 bg-[#161B22] p-5';

const tooltipStyle = {
  background: '#0B0E14',
  border: '1px solid rgba(51,65,85,0.8)',
  borderRadius: 10,
  color: '#e2e8f0',
  fontSize: 12,
};

interface Slice {
  name: string;
  value: number;
  color: string;
}

function Donut({ title, total, slices, loading }: { title: string; total: number; slices: Slice[]; loading: boolean }) {
  const empty = !loading && total === 0;
  return (
    <section className={CARD} aria-label={title}>
      <h3 className="mb-4 text-sm font-semibold text-slate-200">{title}</h3>
      <div className="flex flex-col items-center gap-5 sm:flex-row">
        <div className="relative h-44 w-44 flex-shrink-0">
          {loading ? (
            <div className="h-full w-full animate-pulse rounded-full border-[18px] border-slate-800/60" aria-busy="true" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={empty ? [{ name: 'No data', value: 1, color: '#1e293b' }] : slices}
                    dataKey="value"
                    innerRadius={58}
                    outerRadius={82}
                    paddingAngle={empty ? 0 : 2}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {(empty ? [{ name: 'No data', value: 1, color: '#1e293b' }] : slices).map((s) => (
                      <Cell key={s.name} fill={s.color} />
                    ))}
                  </Pie>
                  {!empty && <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => nf(Number(v))} />}
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[11px] uppercase tracking-wide text-slate-500">Total</span>
                <span className="text-xl font-bold tabular-nums text-slate-100">{nf(total)}</span>
              </div>
            </>
          )}
        </div>
        <ul className="w-full space-y-2.5">
          {slices.map((s) => (
            <li key={s.name} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                {s.name}
              </span>
              <span className="tabular-nums text-slate-400">
                <span className="font-semibold text-slate-200">{loading ? '—' : nf(s.value)}</span>{' '}
                <span className="text-xs">({!loading && total ? Math.round((s.value / total) * 100) : 0}%)</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

interface Props {
  state: Loadable<OverviewStats>;
  frame: Timeframe;
  onFrameChange: (f: Timeframe) => void;
  onRetry: () => void;
}

export default function AnalyticsOverview({ state, frame, onFrameChange, onRetry }: Props) {
  const stats = state.data;
  const loading = state.loading && !stats;
  const total = stats?.totalCalls ?? 0;

  if (state.error && !stats) {
    return (
      <div className={CARD}>
        <PanelError message={state.error} onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div className={`space-y-5 ${state.loading && stats ? 'opacity-70 transition-opacity' : ''}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-lime-400/25 bg-[#161B22] p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <PhoneCall size={14} className="text-lime-400" aria-hidden="true" /> Total Calls
          </p>
          {loading ? (
            <div className="mt-3 h-10 w-40 animate-pulse rounded bg-slate-800/60" aria-busy="true" />
          ) : (
            <p className="mt-2 text-4xl font-extrabold tabular-nums text-lime-400">{nf(total)}</p>
          )}
        </div>
        <div className={CARD}>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <Clock size={14} className="text-[#00EBFF]" aria-hidden="true" /> Total Calls by Hour
          </p>
          {loading ? (
            <div className="mt-3 h-10 w-40 animate-pulse rounded bg-slate-800/60" aria-busy="true" />
          ) : (
            <p className="mt-2 text-4xl font-extrabold tabular-nums text-slate-100">{nf(stats?.callsByHour, 3)}</p>
          )}
          <p className="mt-1 text-[11px] text-slate-500">Average calls per active hour</p>
        </div>
      </div>

      <section className={CARD} aria-label="Calls over time">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-200">Calls over time</h3>
          <div role="group" aria-label="Timeframe" className="flex gap-1 rounded-full bg-slate-900/60 p-1">
            {FRAMES.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => onFrameChange(f.key)}
                aria-pressed={frame === f.key}
                className={`min-h-[36px] rounded-full px-4 text-xs font-semibold transition-colors ${
                  frame === f.key ? 'bg-lime-400 text-black' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="h-72 w-full">
          {loading ? (
            <div className="h-full w-full animate-pulse rounded-xl bg-slate-800/40" aria-busy="true" />
          ) : !stats || stats.timeline.every((p) => p.calls === 0) ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">No calls in this period</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.timeline} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="callsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00EBFF" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#00EBFF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(51,65,85,0.5)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [nf(Number(v)), 'Calls']} />
                <Area type="monotone" dataKey="calls" stroke="#00EBFF" strokeWidth={2} fill="url(#callsFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Donut
          title="Call outcome"
          total={total}
          loading={loading}
          slices={[
            { name: 'Answered', value: stats?.answered ?? 0, color: '#34d399' },
            { name: 'No Answer', value: stats?.noAnswer ?? 0, color: '#fbbf24' },
            { name: 'Closed', value: stats?.closed ?? 0, color: '#fb7185' },
          ]}
        />
        <Donut
          title="Dial type"
          total={total}
          loading={loading}
          slices={[
            { name: 'Incoming', value: stats?.incoming ?? 0, color: '#00EBFF' },
            { name: 'Outgoing', value: stats?.outgoing ?? 0, color: '#A3E635' },
          ]}
        />
      </div>
    </div>
  );
}
