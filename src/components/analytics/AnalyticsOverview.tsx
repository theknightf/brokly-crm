'use client';
import React, { useMemo, useState } from 'react';
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
import { timeline } from './mockData';
import { nf } from './utils';
import type { OverviewStats, Timeframe } from './types';

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

function Donut({ title, total, slices }: { title: string; total: number; slices: Slice[] }) {
  return (
    <section className={CARD} aria-label={title}>
      <h3 className="mb-4 text-sm font-semibold text-slate-200">{title}</h3>
      <div className="flex flex-col items-center gap-5 sm:flex-row">
        <div className="relative h-44 w-44 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                innerRadius={58}
                outerRadius={82}
                paddingAngle={2}
                stroke="none"
              >
                {slices.map((s) => (
                  <Cell key={s.name} fill={s.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => nf(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">Total</span>
            <span className="text-xl font-bold tabular-nums text-slate-100">{nf(total)}</span>
          </div>
        </div>
        <ul className="w-full space-y-2.5">
          {slices.map((s) => (
            <li key={s.name} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                {s.name}
              </span>
              <span className="tabular-nums text-slate-400">
                <span className="font-semibold text-slate-200">{nf(s.value)}</span>{' '}
                <span className="text-xs">({total ? Math.round((s.value / total) * 100) : 0}%)</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function AnalyticsOverview({ stats }: { stats: OverviewStats }) {
  const [frame, setFrame] = useState<Timeframe>('weekly');
  const data = useMemo(() => timeline(frame), [frame]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-lime-400/25 bg-[#161B22] p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <PhoneCall size={14} className="text-lime-400" aria-hidden="true" /> Total Calls
          </p>
          <p className="mt-2 text-4xl font-extrabold tabular-nums text-lime-400">{nf(stats.totalCalls)}</p>
        </div>
        <div className={CARD}>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <Clock size={14} className="text-[#00EBFF]" aria-hidden="true" /> Total Calls by Hour
          </p>
          <p className="mt-2 text-4xl font-extrabold tabular-nums text-slate-100">{nf(stats.totalCallsByHour, 3)}</p>
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
                onClick={() => setFrame(f.key)}
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
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="callsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00EBFF" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#00EBFF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(51,65,85,0.5)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [nf(Number(v)), 'Calls']} />
              <Area type="monotone" dataKey="calls" stroke="#00EBFF" strokeWidth={2} fill="url(#callsFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Donut
          title="Call outcome"
          total={stats.totalCalls}
          slices={[
            { name: 'Answered', value: stats.outcome.answered, color: '#34d399' },
            { name: 'No Answer', value: stats.outcome.noAnswer, color: '#fbbf24' },
            { name: 'Closed', value: stats.outcome.closed, color: '#fb7185' },
          ]}
        />
        <Donut
          title="Dial type"
          total={stats.totalCalls}
          slices={[
            { name: 'Incoming', value: stats.dial.incoming, color: '#00EBFF' },
            { name: 'Outgoing', value: stats.dial.outgoing, color: '#A3E635' },
          ]}
        />
      </div>
    </div>
  );
}
