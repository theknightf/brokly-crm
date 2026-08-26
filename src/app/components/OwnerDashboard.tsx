'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users,
  CalendarCheck2,
  Clock,
  Timer,
  TrendingUp,
  TrendingDown,
  Receipt,
  AlertCircle,
  Activity,
  Building2,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import Leaderboard from './Leaderboard';

interface DashboardData {
  generated_at: string;
  range: string;
  period: { from: string; to: string };
  summary: {
    totalEmployees: number;
    presentToday: number;
    absentToday: number;
    lateToday: number;
    avgHours: number;
    totalHours: number;
    overtimeMinutes: number;
    attendanceRate: number;
    absenceRate: number;
    lateRate: number;
    expensesThisMonth: number;
    expensesPrevMonth: number;
    expensesChangePct: number;
  };
  attendanceOverview: { present: number; absent: number; late: number; leave: number };
  attentionNeeded: { id: string; text: string; type: string }[];
  performance: {
    id: string;
    name: string;
    role: string;
    email: string;
    attendanceRate: number;
    avgHours: number;
    activity: number;
    lateDays: number;
    status: string;
    isActive: boolean;
  }[];
  bestEmployee: { id: string; name: string; attendanceRate: number; avgHours: number } | null;
  needsAttention: { id: string; name: string; attendanceRate: number; lateDays: number }[];
  mostActive: { id: string; name: string; activity: number } | null;
  expenses: {
    totalThis: number;
    totalPrev: number;
    changePct: number;
    categories: { name: string; amount: number }[];
    largestCategory: { name: string; amount: number } | null;
  };
  monthlySummary: {
    attendanceRate: number;
    absenceRate: number;
    lateRate: number;
    avgHours: number;
    totalHours: number;
  };
  leadSummary: {
    total: number;
    byStage: { stage: string; count: number }[];
  };
  timeline: {
    id: string;
    employee: string;
    action: string;
    detail: string;
    entityType: string;
    entityId?: string;
    createdAt: string;
  }[];
}

const fmtCurrency = (n: number) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M ج.م`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K ج.م`;
  return `${n.toLocaleString()} ج.م`;
};

const fmtDuration = (sec: number) => {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

function activityLevel(n: number): string {
  if (n >= 10) return 'High';
  if (n >= 4) return 'Medium';
  if (n === 0) return 'None';
  return 'Low';
}

function StatCard({
  label,
  value,
  icon,
  tone = 'default',
  sub,
  href,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone?: 'default' | 'green' | 'red' | 'amber' | 'primary';
  sub?: string;
  href?: string;
}) {
  const tones: Record<string, string> = {
    default: 'text-foreground',
    green: 'text-teal',
    red: 'text-clay',
    amber: 'text-gold-dark',
    primary: 'text-primary',
  };
  const card = (
    <div
      className={`bg-card border border-border rounded-2xl px-4 py-4 ${href ? 'transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md cursor-pointer' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-2xl font-bold ${tones[tone]}`}>{value}</p>
          {sub ? <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p> : null}
        </div>
        <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
          {icon}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-1.5">{label}</p>
    </div>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

export default function OwnerDashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [range, setRange] = useState<'week' | 'month'>('week');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/owner/dashboard?range=${range}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setData(json);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonBlock />
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted/60 rounded-2xl animate-pulse" />
          ))}
        </div>
        <SkeletonBlock />
        <SkeletonBlock />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-card border border-border rounded-2xl py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <AlertCircle size={20} className="text-clay" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">Unable to load dashboard data.</p>
        <p className="text-xs text-muted-foreground mb-4">Please try again.</p>
        <button
          onClick={load}
          className="btn-primary h-9 px-4 text-sm flex items-center gap-1.5 mx-auto"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  const s = data.summary;
  const expChange = s.expensesChangePct;
  const attentionTypes: Record<string, string> = {
    today: 'bg-gold-soft text-gold-dark',
    'low-hours': 'bg-teal-soft text-teal',
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Company Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track your team, monitor every action, and see who’s performing.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {(['week', 'month'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                range === r
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {r === 'week' ? 'This Week' : 'This Month'}
            </button>
          ))}
        </div>
      </div>

      {/* Leads pipeline summary */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Leads Pipeline
          </h2>
          <Link
            href="/leads-management"
            className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
          >
            View leads <ArrowRight size={13} />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Total Leads"
            value={data.leadSummary.total}
            icon={<Users size={18} />}
            tone="primary"
            href="/leads-management"
          />
          {data.leadSummary.byStage.slice(0, 3).map((item) => (
            <StatCard
              key={item.stage}
              label={item.stage}
              value={item.count}
              icon={<Activity size={18} />}
              href={`/leads-management?status=${encodeURIComponent(item.stage)}`}
            />
          ))}
        </div>
        {data.leadSummary.byStage.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4 mt-3 space-y-3">
            {data.leadSummary.byStage.map((item) => {
              const width = data.leadSummary.total
                ? Math.max(3, Math.round((item.count / data.leadSummary.total) * 100))
                : 0;
              return (
                <Link
                  key={item.stage}
                  href={`/leads-management?status=${encodeURIComponent(item.stage)}`}
                  className="flex items-center gap-3 text-sm rounded-lg px-2 py-1.5 -mx-2 hover:bg-muted/60 transition-colors"
                >
                  <span className="w-32 shrink-0 truncate text-muted-foreground">{item.stage}</span>
                  <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-semibold text-foreground">{item.count}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Compact team leaderboard */}
      <Leaderboard />

      {/* Executive summary */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Employees
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Total Employees"
            value={s.totalEmployees}
            icon={<Users size={18} />}
            href="/admin"
          />
          <StatCard
            label="Present Today"
            value={s.presentToday}
            icon={<CalendarCheck2 size={18} />}
            tone="green"
            href="/attendance"
          />
          <StatCard
            label="Absent Today"
            value={s.absentToday}
            icon={<Users size={18} />}
            tone="red"
            href="/attendance"
          />
          <StatCard
            label="Late Today"
            value={s.lateToday}
            icon={<Clock size={18} />}
            tone="amber"
            href="/attendance"
          />
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Working Hours
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            label="Average Working Hours"
            value={`${s.avgHours}h`}
            icon={<Clock size={18} />}
            href="/attendance"
          />
          <StatCard
            label="Total Working Hours"
            value={`${s.totalHours}h`}
            icon={<Timer size={18} />}
            href="/attendance"
          />
          <StatCard
            label="Overtime"
            value={fmtDuration(s.overtimeMinutes * 60)}
            icon={<Timer size={18} />}
            tone="green"
            href="/attendance"
          />
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Attendance
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            label="Attendance Rate"
            value={`${s.attendanceRate}%`}
            icon={<CalendarCheck2 size={18} />}
            tone="primary"
            href="/attendance"
          />
          <StatCard
            label="Absence Rate"
            value={`${s.absenceRate}%`}
            icon={<Users size={18} />}
            tone="red"
            href="/attendance"
          />
          <StatCard
            label="Late Rate"
            value={`${s.lateRate}%`}
            icon={<Clock size={18} />}
            tone="amber"
            href="/attendance"
          />
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Expenses
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            label="Operating Expenses This Month"
            value={fmtCurrency(s.expensesThisMonth)}
            icon={<Receipt size={18} />}
            tone="primary"
            href="/expenses"
            sub={
              s.expensesPrevMonth > 0
                ? `vs ${fmtCurrency(s.expensesPrevMonth)} last month`
                : undefined
            }
          />
          <StatCard
            label="Previous Month"
            value={fmtCurrency(s.expensesPrevMonth)}
            icon={<Receipt size={18} />}
            href="/expenses"
          />
          <StatCard
            label="Change"
            value={`${expChange >= 0 ? '+' : ''}${expChange}%`}
            icon={expChange > 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            tone={expChange > 0 ? 'amber' : 'green'}
            sub={
              expChange > 0
                ? 'Spending increased'
                : expChange < 0
                  ? 'Spending decreased'
                  : 'No change'
            }
            href="/expenses"
          />
        </div>
      </div>

      {/* Attendance overview + attention needed */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <CalendarCheck2 size={16} className="text-primary" /> Attendance Overview
            </h2>
            <Link
              href="/attendance"
              className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
            >
              View attendance <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-4 gap-3 text-center">
            {[
              { label: 'Present', value: data.attendanceOverview.present, color: 'text-teal' },
              { label: 'Absent', value: data.attendanceOverview.absent, color: 'text-clay' },
              { label: 'Late', value: data.attendanceOverview.late, color: 'text-gold-dark' },
              { label: 'Leave', value: data.attendanceOverview.leave, color: 'text-dusk' },
            ].map((x) => (
              <Link
                href={`/attendance?status=${x.label.toLowerCase()}`}
                key={x.label}
                className="bg-muted/50 rounded-xl py-4 hover:bg-muted transition-colors"
              >
                <p className={`text-xl font-bold ${x.color}`}>{x.value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{x.label}</p>
              </Link>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Period: {data.period.from} → {data.period.to}
            </span>
            <span className="capitalize">{range}</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
            <AlertCircle size={16} className="text-gold-dark" /> Attention Needed
          </h2>
          {data.attentionNeeded.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              All clear — nothing needs attention today.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.attentionNeeded.slice(0, 8).map((a, i) => (
                <li key={i}>
                  <Link
                    href={a.id ? `/admin/employees/${a.id}` : '/attendance'}
                    className="flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 -mx-2 hover:bg-muted/60 transition-colors"
                  >
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${attentionTypes[a.type] || 'bg-muted'}`}
                    />
                    <span className="text-foreground">{a.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Employee performance */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Activity size={16} className="text-primary" /> Employee Performance
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Employee
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Attendance %
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Avg Working Hours
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Activity
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Performance
                </th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.performance.slice(0, 12).map((p) => (
                <tr
                  key={p.id}
                  className="hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => router.push(`/admin/employees/${p.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ')
                      router.push(`/admin/employees/${p.id}`);
                  }}
                  tabIndex={0}
                  role="link"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/employees/${p.id}`}
                      className="flex items-center gap-3 group"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-primary">
                          {p.name
                            .split(' ')
                            .map((x) => x[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground group-hover:text-primary truncate transition-colors">
                          {p.name}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {p.role?.replace('_', ' ')}
                        </p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-sm text-foreground">{p.attendanceRate}%</td>
                  <td className="px-5 py-3 text-sm text-foreground">{p.avgHours}h</td>
                  <td className="px-5 py-3 text-sm">{activityLevel(p.activity)}</td>
                  <td className="px-5 py-3 text-sm">{p.status}</td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/admin/employees/${p.id}`}
                      className="btn-ghost p-1.5 inline-flex"
                      title="View employee report"
                    >
                      <ArrowRight size={14} className="text-muted-foreground" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.performance.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-10">
            No employee data available yet.
          </p>
        )}
      </div>

      {/* Expenses + Monthly summary + Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Receipt size={16} className="text-primary" /> Operating Expenses
            </h2>
            <Link
              href="/expenses"
              className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
            >
              View all expenses <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Link
              href="/expenses"
              className="bg-muted/50 rounded-xl p-4 hover:bg-muted transition-colors"
            >
              <p className="text-2xl font-bold text-foreground">
                {fmtCurrency(data.expenses.totalThis)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">This month</p>
            </Link>
            <Link
              href="/expenses"
              className="bg-muted/50 rounded-xl p-4 hover:bg-muted transition-colors"
            >
              <p className="text-2xl font-bold text-foreground">
                {fmtCurrency(data.expenses.totalPrev)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Previous month</p>
            </Link>
          </div>
          {data.expenses.categories.length > 0 ? (
            <>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                By category
              </p>
              <ul className="space-y-2">
                {data.expenses.categories.slice(0, 6).map((c) => {
                  const pct = data.expenses.totalThis
                    ? (c.amount / data.expenses.totalThis) * 100
                    : 0;
                  return (
                    <li key={c.name}>
                      <Link
                        href={`/expenses?category=${encodeURIComponent(c.name)}`}
                        className="block rounded-lg px-2 py-1 -mx-2 hover:bg-muted/60 transition-colors"
                      >
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-foreground">{c.name}</span>
                          <span className="text-muted-foreground">{fmtCurrency(c.amount)}</span>
                        </div>
                      </Link>
                      <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              No expenses recorded this month.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
              <Building2 size={16} className="text-primary" /> Monthly Summary
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Attendance Rate', value: `${data.monthlySummary.attendanceRate}%` },
                { label: 'Absence Rate', value: `${data.monthlySummary.absenceRate}%` },
                { label: 'Late Rate', value: `${data.monthlySummary.lateRate}%` },
                { label: 'Avg Working Hours', value: `${data.monthlySummary.avgHours}h` },
                { label: 'Total Hours', value: `${data.monthlySummary.totalHours}h` },
              ].map((x) => (
                <Link
                  key={x.label}
                  href="/attendance"
                  className="bg-muted/50 rounded-xl p-3 hover:bg-muted transition-colors"
                >
                  <p className="text-lg font-bold text-foreground">{x.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{x.label}</p>
                </Link>
              ))}
            </div>
            {data.bestEmployee && (
              <Link
                href={`/admin/employees/${data.bestEmployee.id}`}
                className="mt-4 bg-teal-soft rounded-xl p-3 flex items-center justify-between hover:brightness-95 transition-all"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">Best performing employee</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {data.bestEmployee.name} · {data.bestEmployee.attendanceRate}% attendance ·{' '}
                    {data.bestEmployee.avgHours}h
                  </p>
                </div>
                <Link
                  href={`/admin/employees/${data.bestEmployee.id}`}
                  className="text-teal font-medium text-xs hover:underline flex-shrink-0"
                >
                  View profile
                </Link>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
          <Activity size={16} className="text-primary" /> Recent Actions
        </h2>
        {data.timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No recent activity yet.</p>
        ) : (
          <ol className="relative border-l border-border ml-2 space-y-4">
            {data.timeline.slice(0, 15).map((ev) => (
              <li key={ev.id} className="ml-4">
                <Link
                  href={
                    ev.entityType === 'lead'
                      ? '/leads-management'
                      : ev.entityType === 'user' && ev.entityId
                        ? `/admin/employees/${ev.entityId}`
                        : '/admin'
                  }
                  className="block rounded-lg px-2 py-1 -mx-2 hover:bg-muted/60 transition-colors"
                >
                  <div className="absolute -left-[7px] mt-1.5 w-3.5 h-3.5 rounded-full bg-primary/30 border-2 border-primary flex-shrink-0" />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="text-sm font-medium text-foreground">{ev.employee}</p>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground capitalize">
                      {ev.action.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(ev.createdAt).toLocaleString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </div>
                  {ev.detail ? (
                    <p className="text-xs text-muted-foreground mt-0.5">{ev.detail}</p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function SkeletonBlock() {
  return <div className="h-24 bg-muted/60 rounded-2xl animate-pulse" />;
}
