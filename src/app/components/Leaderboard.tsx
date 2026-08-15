'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Trophy, Medal, Circle, Loader2, RefreshCw, Zap } from 'lucide-react';

type Period = 'day' | 'week' | 'month' | 'total';

interface Row {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  online: boolean;
  score: number;
  rank: number;
  today: { leads: number; calls: number; actions: number; activeSeconds: number };
  week: { leads: number; calls: number; actions: number; activeSeconds: number };
  month: { leads: number; calls: number; actions: number; activeSeconds: number };
  total: { leads: number; calls: number; actions: number; activeSeconds: number };
}

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'total', label: 'All Time' },
];

const ROLE_LABEL: Record<string, string> = {
  agent: 'Agent',
  senior_agent: 'Senior Agent',
  telecaller: 'Telesales',
  broker: 'Broker',
  branch_manager: 'Branch Mgr',
  admin: 'Admin',
  owner: 'Owner',
};

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function statOf(row: Row, period: Period) {
  const key = period === 'day' ? 'today' : period;
  return row[key] || { leads: 0, calls: 0, actions: 0, activeSeconds: 0 };
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <div className="w-8 h-8 rounded-full bg-amber-400 text-amber-950 flex items-center justify-center font-bold text-sm shadow">
        1
      </div>
    );
  if (rank === 2)
    return (
      <div className="w-8 h-8 rounded-full bg-slate-300 text-slate-800 flex items-center justify-center font-bold text-sm shadow">
        2
      </div>
    );
  if (rank === 3)
    return (
      <div className="w-8 h-8 rounded-full bg-orange-400 text-orange-950 flex items-center justify-center font-bold text-sm shadow">
        3
      </div>
    );
  return <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground">{rank}</div>;
}

export default function Leaderboard() {
  const [period, setPeriod] = useState<Period>('week');
  const [rows, setRows] = useState<Row[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/admin/analytics?period=${period}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setRows(json.users || []);
      setOnlineCount(json.online_count || 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Trophy size={18} className="text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              Team Leaderboard
            </h2>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Circle size={8} className="text-emerald-500 fill-emerald-500" /> {onlineCount} online now
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                period === p.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={26} className="animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="text-center py-10">
          <p className="text-sm text-muted-foreground mb-3">Couldn’t load the leaderboard.</p>
          <button onClick={load} className="btn-secondary text-sm inline-flex items-center gap-1.5">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">No team activity yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const s = statOf(row, period);
            const top = row.rank <= 3;
            return (
              <li
                key={row.user_id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                  top ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/30'
                }`}
              >
                <RankBadge rank={row.rank} />
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-primary">{initials(row.full_name || row.email)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{row.full_name || row.email}</p>
                    {row.online && <Circle size={7} className="text-emerald-500 fill-emerald-500 flex-shrink-0" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {ROLE_LABEL[row.role] || row.role}
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-3 text-center">
                  <Metric label="Leads" value={s.leads} />
                  <Metric label="Calls" value={s.calls} />
                  <Metric label="Actions" value={s.actions} />
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Zap size={14} className="text-primary" />
                  <span className="text-lg font-bold text-foreground tabular-nums">{row.score}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="w-14">
      <p className="text-sm font-semibold text-foreground tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
    </div>
  );
}
