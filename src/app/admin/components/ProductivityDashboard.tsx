'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Trophy,
  Wifi,
  Clock,
  Phone,
  TrendingUp,
  RefreshCw,
  Loader2,
  Medal,
  Zap,
  FileSpreadsheet,
  FileText,
  CalendarRange,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { exportCSV, exportPDF, type PdfTable } from '@/lib/exportReport';
import { ExternalLink } from 'lucide-react';

type PeriodKey = 'day' | 'week' | 'month' | 'range';

interface PeriodStat {
  leads: number;
  calls: number;
  actions: number;
  activeSeconds: number;
}
interface UserRow {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  online: boolean;
  last_heartbeat_at: string | null;
  today: PeriodStat;
  week: PeriodStat;
  month: PeriodStat;
  range: PeriodStat;
  total: PeriodStat;
  score: number;
  rank: number;
}
interface AnalyticsData {
  period: PeriodKey;
  range: { start: string; end: string };
  users: UserRow[];
  online_count: number;
  not_setup: boolean;
}

interface ReportUser {
  user: { id: string; full_name: string; email: string; role: string };
  totalLeads: number;
  totalCalls: number;
  totalActions: number;
  totalActiveSeconds: number;
  totalActiveHours: string;
  daysWorked: number;
  totalDays: number;
  dailyAvgActions: number;
  dailyAvgActiveHours: number;
  score: number;
  grade: string;
  daily: { date: string; actions: number; activeSeconds: number }[];
}
interface ReportData {
  from: string;
  to: string;
  generated_at: string;
  users: ReportUser[];
  days: string[];
}

const MEDALS = ['text-amber-400', 'text-slate-400', 'text-amber-700'];

function fmtDur(sec: number): string {
  if (sec <= 0) return '0m';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtHours(hours: number): string {
  if (hours <= 0) return '0h';
  return `${hours.toFixed(1)}h`;
}

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const from = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const to = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(last)}`;
  return { from, to };
}

export default function ProductivityDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [period, setPeriod] = useState<PeriodKey>('day');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [rtStatus, setRtStatus] = useState<'live' | 'polling'>('polling');

  const effectiveRange = from && to ? { from, to } : monthRange();

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (period === 'range' && from && to) {
        params.set('from', from);
        params.set('to', to);
      }
      const res = await fetch(`/api/admin/analytics?${params.toString()}`);
      const json = await res.json();
      setData(json);
    } catch {
      setData((p) =>
        p
          ? p
          : {
              period,
              range: { start: effectiveRange.from, end: effectiveRange.to },
              users: [],
              online_count: 0,
              not_setup: true,
            }
      );
    } finally {
      setLoading(false);
    }
  }, [period, from, to]);

  const fetchReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const { from: f, to: t } = effectiveRange;
      const res = await fetch(`/api/admin/reports?from=${f}&to=${t}`);
      const json = await res.json();
      if (!json.error) setReport(json);
    } catch {
      // keep previous report on failure
    } finally {
      setReportLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics, refreshKey]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport, refreshKey]);

  // Real-time: subscribe to activity_log inserts; polling remains the fallback.
  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    try {
      channel = createClient()
        .channel('prod-dash')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'activity_log' },
          () => {
            setRtStatus('live');
            setRefreshKey((k) => k + 1);
          }
        )
        .subscribe();
    } catch {
      // realtime unavailable — polling covers updates
    }
    const poll = setInterval(() => {
      setRefreshKey((k) => k + 1);
      setRtStatus('polling');
    }, 30000);
    return () => {
      if (channel) channel.unsubscribe();
      clearInterval(poll);
    };
  }, []);

  const users = data?.users || [];
  const PERIOD_LABEL: Record<PeriodKey, string> = {
    day: 'Today',
    week: 'This Week',
    month: 'This Month',
    range: 'Custom Range',
  };

  const statOf = (u: UserRow): PeriodStat => u[period === 'day' ? 'today' : period];
  const sumOf = (key: keyof PeriodStat) =>
    users.reduce((s, u) => s + (statOf(u)[key] as number), 0);
  const totalOnline = data?.online_count ?? users.filter((u) => u.online).length;

  // ─── Exports ───────────────────────────────────────────────────────────────
  const exportLeaderboardCSV = () => {
    exportCSV(
      `leaderboard-${period}-${new Date().toISOString().slice(0, 10)}`,
      ['Rank', 'User', 'Email', 'Role', 'Online', 'Leads', 'Calls', 'Actions', 'Active'],
      users.map((u) => [
        u.rank,
        u.full_name,
        u.email,
        u.role,
        u.online ? 'Online' : 'Offline',
        statOf(u).leads,
        statOf(u).calls,
        statOf(u).actions,
        fmtDur(statOf(u).activeSeconds),
      ])
    );
  };

  const exportLeaderboardPDF = () => {
    const table: PdfTable = {
      caption: `Leaderboard — ${PERIOD_LABEL[period]}`,
      headers: ['Rank', 'User', 'Role', 'Online', 'Leads', 'Calls', 'Actions', 'Active'],
      rows: users.map((u) => [
        String(u.rank),
        u.full_name,
        u.role,
        u.online ? 'Online' : 'Offline',
        String(statOf(u).leads),
        String(statOf(u).calls),
        String(statOf(u).actions),
        fmtDur(statOf(u).activeSeconds),
      ]),
    };
    exportPDF(
      'Productivity Leaderboard',
      `${PERIOD_LABEL[period]} — ${users.length} user(s)`,
      [
        { label: 'Online Now', value: String(totalOnline) },
        { label: 'Actions', value: sumOf('actions').toLocaleString() },
        { label: 'Calls', value: String(sumOf('calls')) },
        { label: 'Active', value: fmtDur(sumOf('activeSeconds')) },
      ],
      [table]
    );
  };

  const reportUsers = report?.users || [];
  const exportReportCSV = () => {
    exportCSV(
      `monthly-report-${report?.from || 'range'}-to-${report?.to || 'range'}`,
      [
        'User',
        'Role',
        'Total Actions',
        'Total Calls',
        'Total Leads',
        'Active Hours',
        'Days Worked',
        'Avg Actions/Day',
        'Avg Active Hrs/Day',
        'Score',
        'Grade',
      ],
      reportUsers.map((u) => [
        u.user.full_name,
        u.user.role,
        u.totalActions,
        u.totalCalls,
        u.totalLeads,
        u.totalActiveHours,
        u.daysWorked,
        u.dailyAvgActions.toFixed(1),
        fmtHours(u.dailyAvgActiveHours),
        u.score,
        u.grade,
      ])
    );
  };

  const exportReportPDF = () => {
    const table: PdfTable = {
      caption: `User Report — ${report?.from} to ${report?.to}`,
      headers: [
        'User',
        'Role',
        'Actions',
        'Calls',
        'Leads',
        'Active Hrs',
        'Days Worked',
        'Avg Actions/Day',
        'Avg Hrs/Day',
        'Score',
        'Grade',
      ],
      rows: reportUsers.map((u) => [
        u.user.full_name,
        u.user.role,
        String(u.totalActions),
        String(u.totalCalls),
        String(u.totalLeads),
        u.totalActiveHours,
        String(u.daysWorked),
        u.dailyAvgActions.toFixed(1),
        fmtHours(u.dailyAvgActiveHours),
        String(u.score),
        u.grade,
      ]),
      footer: `Generated for ${reportUsers.length} user(s) over ${report?.days?.length ?? 0} days`,
    };
    const totalActions = reportUsers.reduce((s, u) => s + u.totalActions, 0);
    const totalHours = reportUsers.reduce((s, u) => s + u.totalActiveSeconds, 0);
    exportPDF(
      'Monthly Productivity Report',
      `${report?.from} to ${report?.to}`,
      [
        { label: 'Total Actions', value: totalActions.toLocaleString() },
        { label: 'Total Active', value: fmtDur(totalHours) },
        { label: 'Users', value: String(reportUsers.length) },
      ],
      [table]
    );
  };

  const quickRanges: { key: PeriodKey; label: string }[] = [
    { key: 'day', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'range', label: 'Custom' },
  ];

  return (
    <div className="space-y-6">
      {data?.not_setup && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          Productivity analytics need the activity-tracking tables. Run the 20260805 migrations in
          the Supabase SQL Editor to enable call logs, active-time aggregation, and rankings.
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Trophy size={20} className="text-amber-500" />
            Productivity & Leaderboard
          </h2>
          <p className="text-sm text-muted-foreground">
            Every click, call, lead and active minute — ranked per user.{' '}
            {rtStatus === 'live' ? (
              <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> live
              </span>
            ) : (
              <span className="text-muted-foreground/60">auto-refresh every 30s</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-muted rounded-lg p-0.5">
            {quickRanges.map((q) => (
              <button
                key={q.key}
                onClick={() => setPeriod(q.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${period === q.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {q.label}
              </button>
            ))}
          </div>
          {period === 'range' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="input-base px-2 py-1.5 text-xs"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="input-base px-2 py-1.5 text-xs"
              />
            </div>
          )}
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}{' '}
            Refresh
          </button>
          <button
            onClick={exportLeaderboardCSV}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <FileSpreadsheet size={14} className="text-emerald-600" /> Export Excel
          </button>
          <button
            onClick={exportLeaderboardPDF}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <FileText size={14} className="text-red-600" /> Export PDF
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Wifi size={16} className="text-emerald-500" />}
          label="Online Now"
          value={String(totalOnline)}
          tone="text-emerald-600"
        />
        <StatCard
          icon={<Zap size={16} className="text-primary" />}
          label={`Actions ${PERIOD_LABEL[period]}`}
          value={sumOf('actions').toLocaleString()}
          tone="text-primary"
        />
        <StatCard
          icon={<Phone size={16} className="text-blue-500" />}
          label={`Calls ${PERIOD_LABEL[period]}`}
          value={String(sumOf('calls'))}
          tone="text-blue-600"
        />
        <StatCard
          icon={<Clock size={16} className="text-violet-500" />}
          label={`Active ${PERIOD_LABEL[period]}`}
          value={fmtDur(sumOf('activeSeconds'))}
          tone="text-violet-600"
        />
      </div>

      {/* Leaderboard */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Trophy size={15} className="text-amber-500" /> Leaderboard — {PERIOD_LABEL[period]}
            {period === 'range' && from && to && (
              <span className="text-xs font-normal text-muted-foreground">
                {from} → {to}
              </span>
            )}
          </h3>
        </div>
        <div className="hidden md:flex items-center gap-6 px-5 py-3 border-b border-border bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <span className="w-28">Rank</span>
          <span className="flex-1">User</span>
          <span className="w-16 text-right">Score</span>
          <span className="w-20 text-right">Leads</span>
          <span className="w-16 text-right">Calls</span>
          <span className="w-24 text-right">Actions</span>
          <span className="w-24 text-right">Active</span>
        </div>
        <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
          {users.map((u) => (
            <div
              key={u.user_id}
              className="flex flex-wrap md:flex-nowrap items-center gap-3 md:gap-6 px-5 py-3 hover:bg-muted/30 transition-colors"
            >
              <div className={`w-28 flex items-center gap-2 ${u.rank <= 3 ? '' : 'opacity-70'}`}>
                <Medal
                  size={18}
                  className={u.rank <= 3 ? MEDALS[u.rank - 1] : 'text-muted-foreground/50'}
                />
                <span
                  className={`text-sm font-bold ${u.rank <= 3 ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  #{u.rank}
                </span>
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{u.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {u.email} · {u.role.replace('_', ' ')}
                  </p>
                </div>
                <span
                  className={`ml-auto inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${u.online ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground'}`}
                >
                  {u.online ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Online
                    </>
                  ) : (
                    'Offline'
                  )}
                </span>
              </div>
              <div className="w-24 text-right">
                <span className="inline-flex items-center gap-1 text-sm font-bold text-amber-600">
                  <TrendingUp className="hidden" size={13} />
                  {u.score.toLocaleString()}
                </span>
                <p className="text-[10px] text-muted-foreground">pts</p>
              </div>
              <span className="w-20 text-right text-sm text-foreground">{statOf(u).leads}</span>
              <span className="w-16 text-right text-sm text-foreground">{statOf(u).calls}</span>
              <span className="w-24 text-right text-sm text-foreground">
                {statOf(u).actions.toLocaleString()}
              </span>
              <span className="w-24 text-right text-sm text-blue-600 font-medium">
                {fmtDur(statOf(u).activeSeconds)}
              </span>
            </div>
          ))}
          {users.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              No users found for {PERIOD_LABEL[period]}.
            </div>
          )}
        </div>
      </div>

      {/* Today / Week / Month / Range / Total matrix */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Clock size={15} className="text-primary" /> Per-User Breakdown
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-mobile">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                  User
                </th>
                {(['today', 'week', 'month', 'range', 'total'] as const).map((k) => (
                  <th
                    key={k}
                    colSpan={3}
                    className="text-center px-2 py-2.5 text-xs font-semibold text-muted-foreground uppercase border-l border-border"
                  >
                    {k === 'today'
                      ? 'Today'
                      : k === 'week'
                        ? 'This Week'
                        : k === 'month'
                          ? 'This Month'
                          : k === 'range'
                            ? 'Range'
                            : 'Total'}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-border bg-muted/10">
                <th></th>
                {(['today', 'week', 'month', 'range', 'total'] as const).map((k) => (
                  <React.Fragment key={k}>
                    <th className="text-right px-2 py-1.5 text-[10px] text-muted-foreground border-l border-border">
                      Leads
                    </th>
                    <th className="text-right px-2 py-1.5 text-[10px] text-muted-foreground">
                      Calls
                    </th>
                    <th className="text-right px-2 py-1.5 text-[10px] text-muted-foreground">
                      Active Hrs
                    </th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.user_id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{u.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {u.role.replace('_', ' ')}
                      </p>
                    </div>
                  </td>
                  {[u.today, u.week, u.month, u.range, u.total].map((s, i) => (
                    <React.Fragment key={i}>
                      <td className="text-right px-2 py-3 text-sm text-foreground border-l border-border">
                        {s.leads}
                      </td>
                      <td className="text-right px-2 py-3 text-sm text-foreground">{s.calls}</td>
                      <td className="text-right px-2 py-3 text-sm text-blue-600 font-medium">
                        {fmtDur(s.activeSeconds)}
                      </td>
                    </React.Fragment>
                  ))}
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={16} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No data available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly report */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CalendarRange size={15} className="text-primary" /> Monthly Report — per user
          </h3>
          <span className="text-xs text-muted-foreground">
            {report?.from} → {report?.to}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {reportLoading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
            <button
              onClick={exportReportCSV}
              className="btn-secondary flex items-center gap-1.5 text-xs"
            >
              <FileSpreadsheet size={13} className="text-emerald-600" /> Export Excel
            </button>
            <button
              onClick={exportReportPDF}
              className="btn-secondary flex items-center gap-1.5 text-xs"
            >
              <FileText size={13} className="text-red-600" /> Export PDF
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-mobile">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-xs font-semibold text-muted-foreground uppercase">
                <th className="text-left px-4 py-2.5">User</th>
                <th className="text-right px-3 py-2.5">Actions</th>
                <th className="text-right px-3 py-2.5">Calls</th>
                <th className="text-right px-3 py-2.5">Leads</th>
                <th className="text-right px-3 py-2.5">Active</th>
                <th className="text-right px-3 py-2.5">Days Worked</th>
                <th className="text-right px-3 py-2.5">Avg Actions/Day</th>
                <th className="text-right px-3 py-2.5">Avg Hrs/Day</th>
                <th className="text-right px-3 py-2.5">Score</th>
                <th className="text-right px-3 py-2.5">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reportUsers.map((u) => (
                <tr key={u.user.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{u.user.full_name}</p>
                      <a
                        href={`/admin/employees/${u.user.id}`}
                        className="text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
                        title="View detailed report"
                        aria-label={`Open report for ${u.user.full_name}`}
                      >
                        <ExternalLink size={13} />
                      </a>
                    </div>
                    <p className="text-xs text-muted-foreground">{u.user.role.replace('_', ' ')}</p>
                  </td>
                  <td className="text-right px-3 py-2.5 text-sm text-foreground">
                    {u.totalActions.toLocaleString()}
                  </td>
                  <td className="text-right px-3 py-2.5 text-sm text-foreground">{u.totalCalls}</td>
                  <td className="text-right px-3 py-2.5 text-sm text-foreground">{u.totalLeads}</td>
                  <td className="text-right px-3 py-2.5 text-sm text-blue-600 font-medium">
                    {u.totalActiveHours}
                  </td>
                  <td className="text-right px-3 py-2.5 text-sm text-foreground">
                    {u.daysWorked}/{u.totalDays}
                  </td>
                  <td className="text-right px-3 py-2.5 text-sm text-foreground">
                    {u.dailyAvgActions.toFixed(1)}
                  </td>
                  <td className="text-right px-3 py-2.5 text-sm text-foreground">
                    {fmtHours(u.dailyAvgActiveHours)}
                  </td>
                  <td className="text-right px-3 py-2.5 text-sm font-bold text-amber-600">
                    {u.score.toLocaleString()}
                  </td>
                  <td className="text-right px-3 py-2.5">
                    <span
                      className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        u.grade === 'Excellent'
                          ? 'bg-emerald-50 text-emerald-700'
                          : u.grade === 'Good'
                            ? 'bg-blue-50 text-blue-700'
                            : u.grade === 'Average'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {u.grade}
                    </span>
                  </td>
                </tr>
              ))}
              {reportUsers.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No report data for this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}
