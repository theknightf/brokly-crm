'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarRange, Loader2, Phone, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { verifyCall } from '@/lib/callVerification';

interface CallLog {
  id: string;
  user_id: string;
  agent_name?: string;
  contact_name?: string;
  contact_phone?: string;
  channel?: string;
  direction?: string;
  duration_seconds?: number;
  outcome?: string;
  created_at?: string;
}

type Period = 'day' | 'week' | 'month' | 'range';

const OUTCOME_CLS: Record<string, string> = {
  Reached: 'bg-emerald-100 text-emerald-700',
  Interested: 'bg-sky-100 text-sky-700',
  'Site Visit': 'bg-violet-100 text-violet-700',
  'Won Deal': 'bg-yellow-100 text-yellow-700',
  'Not Interested': 'bg-red-100 text-red-700',
  'Call back later': 'bg-amber-100 text-amber-700',
  'No Answer': 'bg-muted text-muted-foreground',
  'Wrong Number': 'bg-rose-100 text-rose-700',
  Busy: 'bg-muted text-muted-foreground',
  Other: 'bg-muted text-muted-foreground',
};

const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function CallLogsReport() {
  const { loading: authLoading } = useAuth();
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<Period>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/call-log', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to load call logs');
        setLogs([]);
      } else {
        setLogs(json.calls || []);
      }
    } catch {
      setError('Failed to load call logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Compute the period's [from, to) window as JS timestamps.
  const [rangeStart, rangeEnd] = useMemo(() => {
    const now = new Date();
    if (period === 'range') {
      const f = customFrom ? new Date(customFrom + 'T00:00:00').getTime() : 0;
      const t = customTo ? new Date(customTo + 'T23:59:59.999').getTime() : now.getTime();
      return [f, t];
    }
    if (period === 'day') {
      return [new Date(now.toDateString()).getTime(), now.getTime()];
    }
    if (period === 'month') {
      return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), now.getTime()];
    }
    // week: start Monday
    const day = now.getDay();
    const diff = (day + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    monday.setHours(0, 0, 0, 0);
    return [monday.getTime(), now.getTime()];
  }, [period, customFrom, customTo]);

  const scoped = useMemo(
    () =>
      logs.filter((l) => {
        const ts = l.created_at ? new Date(l.created_at).getTime() : NaN;
        return Number.isFinite(ts) && ts >= rangeStart && ts <= rangeEnd;
      }),
    [logs, rangeStart, rangeEnd]
  );

  const byAgent = useMemo(() => {
    const map = new Map<string, CallLog[]>();
    for (const l of scoped) {
      const key = l.agent_name || 'Unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    return Array.from(map.entries())
      .map(([name, arr]) => ({
        name,
        total: arr.length,
        reached: arr.filter((l) => l.outcome === 'Reached').length,
        notInterested: arr.filter((l) => l.outcome === 'Not Interested').length,
        noAnswer: arr.filter((l) => l.outcome === 'No Answer').length,
        callbacks: arr.filter((l) => l.outcome === 'Call back later').length,
        incoming: arr.filter((l) => l.direction === 'incoming').length,
        shortCalls: arr.filter((l) => {
          const v = verifyCall(l);
          return v.category === 'Short Call';
        }).length,
        connected: arr.filter((l) => {
          const v = verifyCall(l);
          return v.category === 'Successful';
        }).length,
        other: arr.filter(
          (l) =>
            l.outcome &&
            !['Reached', 'Not Interested', 'No Answer', 'Call back later'].includes(l.outcome)
        ).length,
      }))
      .sort((a, b) => b.total - a.total);
  }, [scoped]);

  const outcomes = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of scoped) {
      const o = l.outcome || 'Other';
      map.set(o, (map.get(o) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [scoped]);

  // Daily bucketing (data labels for a compact trend).
  const daily = useMemo(() => {
    const by = new Map<string, number>();
    for (const l of scoped) {
      if (!l.created_at) continue;
      const d = new Date(l.created_at).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
      });
      by.set(d, (by.get(d) || 0) + 1);
    }
    const max = Math.max(1, ...Array.from(by.values()));
    return Array.from(by.entries()).map(([label, count]) => ({
      label,
      count,
      pct: (count / max) * 100,
    }));
  }, [scoped]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  // Data is scoped server-side by role/RLS: admins see everyone, team leaders
  // see their team, sales see only their own call logs.
  const total = scoped.length;
  const reached = scoped.filter((l) => l.outcome === 'Reached').length;
  const callbacks = scoped.filter((l) => l.outcome === 'Call back later').length;
  const noAnswer = scoped.filter((l) => l.outcome === 'No Answer').length;

  const quickRanges: { key: Period; label: string }[] = [
    { key: 'day', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'range', label: 'Custom' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarRange size={14} className="text-primary" />
          <p className="text-xs text-muted-foreground">
            Call activity you can see — who called, when, and the outcome.
          </p>
        </div>
        <button
          onClick={load}
          className="btn-ghost flex items-center gap-1.5 text-sm border border-border rounded-lg px-3 py-1.5"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Period switcher */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {quickRanges.map((r) => (
            <button
              key={r.key}
              onClick={() => setPeriod(r.key)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                period === r.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card hover:bg-muted text-muted-foreground'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {period === 'range' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="input-base h-9 text-sm"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="input-base h-9 text-sm"
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-40 text-center rounded-2xl border border-border bg-card">
          <Phone size={22} className="text-muted-foreground mb-2" />
          <p className="text-sm font-semibold text-foreground">{error}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground font-medium">Total calls</p>
              <p className="text-2xl font-bold mt-1">{total}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground font-medium">Reached</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{reached}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground font-medium">No answer</p>
              <p className="text-2xl font-bold text-muted-foreground mt-1">{noAnswer}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground font-medium">Call back</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{callbacks}</p>
            </div>
          </div>

          {daily.length > 1 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground font-medium mb-3">Calls per day</p>
              <div className="flex items-end gap-2 h-24">
                {daily.map((d) => (
                  <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-primary/80 rounded-t"
                      style={{ height: `${d.pct}%`, minHeight: 4 }}
                      title={`${d.count}`}
                    />
                    <span className="text-[10px] text-muted-foreground">{d.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-agent breakdown */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Per-agent performance</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Agent
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Calls
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-emerald-600 uppercase tracking-wide">
                      Connected
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide">
                      Short
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-sky-600 uppercase tracking-wide">
                      Incoming
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-emerald-600 uppercase tracking-wide">
                      Reached
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-red-500 uppercase tracking-wide">
                      Not int.
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      No ans.
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide">
                      Call back
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Reach %
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {byAgent.map((a) => (
                    <tr key={a.name} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-foreground">{a.name}</td>
                      <td className="px-4 py-2.5 text-center tabular-nums">{a.total}</td>
                      <td className="px-4 py-2.5 text-center tabular-nums text-emerald-600">
                        {a.connected}
                      </td>
                      <td className="px-4 py-2.5 text-center tabular-nums text-amber-600">
                        {a.shortCalls}
                      </td>
                      <td className="px-4 py-2.5 text-center tabular-nums text-sky-600">
                        {a.incoming}
                      </td>
                      <td className="px-4 py-2.5 text-center tabular-nums text-emerald-700">
                        {a.reached}
                      </td>
                      <td className="px-4 py-2.5 text-center tabular-nums text-red-500">
                        {a.notInterested}
                      </td>
                      <td className="px-4 py-2.5 text-center tabular-nums">{a.noAnswer}</td>
                      <td className="px-4 py-2.5 text-center tabular-nums text-amber-600">
                        {a.callbacks}
                      </td>
                      <td className="px-4 py-2.5 text-center tabular-nums">
                        {a.total ? Math.round((a.reached / a.total) * 100) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Outcome distribution */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Outcomes</h3>
            <div className="flex flex-wrap gap-2">
              {outcomes.map(([o, c]) => (
                <span
                  key={o}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${OUTCOME_CLS[o] || 'bg-muted text-muted-foreground'}`}
                >
                  {o} · {c}
                </span>
              ))}
              {outcomes.length === 0 && (
                <span className="text-xs text-muted-foreground">No calls in this period.</span>
              )}
            </div>
          </div>

          {/* Recent / all calls in period */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Call log</h3>
              <span className="text-xs text-muted-foreground">{scoped.length} entries</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-mobile">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Agent
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Contact
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Outcome
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {scoped.slice(0, 100).map((l) => (
                    <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {l.agent_name || 'Agent'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {l.contact_name || '—'}
                          </span>
                          {l.contact_phone && (
                            <span className="text-xs text-muted-foreground" dir="ltr">
                              {l.contact_phone}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${OUTCOME_CLS[l.outcome || ''] || 'bg-muted text-muted-foreground'}`}
                        >
                          {l.outcome || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDate(l.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
