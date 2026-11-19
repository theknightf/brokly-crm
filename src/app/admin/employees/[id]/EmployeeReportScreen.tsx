'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Loader2,
  CalendarDays,
  PhoneCall,
  MessageCircle,
  MapPin,
  Bell,
  Wallet,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Download,
  User as UserIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import EmptyState from '@/components/ui/EmptyState';
import { exportCSV } from '@/lib/exportReport';
import { roleLabelOf, STATUS_COLORS } from '@/lib/ui';

interface Employee {
  id: string;
  full_name: string;
  email: string;
  role: string;
  phone?: string | null;
  is_active?: boolean;
}

interface Summary {
  days_worked: number;
  work_hours_label: string;
  work_hours_seconds: number;
  hours_worked: number;
  active_hours_label: string;
  actions: number;
  leads_created: number;
  leads_assigned: number;
  calls: number;
  whatsapp: number;
  emails: number;
  contact_messages: number;
  call_hours_label: string;
  followups: number;
  followups_completed: number;
  followups_overdue: number;
  followup_rate: number;
  overdue_leads: number;
  site_visits: number;
  site_visits_completed: number;
  site_visits_verified: number;
  expenses_total: number;
}

interface ReportData {
  employee: Employee;
  from: string;
  to: string;
  summary: Summary;
  score: number;
  grade: string;
  category_scores: Record<string, number>;
  lost_points: { reason: string; points: number }[];
  attendance: any[];
  leads: any[];
  calls: any[];
  followups: any[];
  visits: any[];
  expenses: any[];
  timeline: any[];
}

type PeriodKey = 'today' | 'week' | 'month' | 'custom';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function periodRange(key: PeriodKey, customFrom?: string, customTo?: string): { from: string; to: string } {
  if (key === 'custom') return { from: customFrom || '', to: customTo || '' };
  const now = new Date();
  if (key === 'today') {
    const s = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    return { from: s, to: s };
  }
  if (key === 'week') {
    const dow = (now.getDay() + 6) % 7;
    const a = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    const b = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow + 6);
    return { from: `${a.getFullYear()}-${pad(a.getMonth() + 1)}-${pad(a.getDate())}`, to: `${b.getFullYear()}-${pad(b.getMonth() + 1)}-${pad(b.getDate())}` };
  }
  return {
    from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`,
    to: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`,
  };
}

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
        {label}
      </div>
      <p className="text-2xl font-extrabold tabular-nums text-foreground mt-2">{value}</p>
      {sub ? <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p> : null}
    </div>
  );
}

export default function EmployeeReportScreen({ employeeId }: { employeeId: string }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [customFrom, setCustomFrom] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  });
  const [customTo, setCustomTo] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  });
  const [tab, setTab] = useState<'overview' | 'notes' | 'timeline' | 'attendance' | 'calls' | 'visits' | 'leads' | 'followups' | 'expenses'>('overview');

  const { from, to } = useMemo(() => periodRange(period, customFrom, customTo), [period, customFrom, customTo]);

  const load = useCallback(
    async (frm: string, too: string) => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/employees/${employeeId}/report?from=${encodeURIComponent(frm)}&to=${encodeURIComponent(too)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load report');
        setData(json);
      } catch (e: any) {
        setError(e?.message || 'Failed to load report');
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [employeeId]
  );

  useEffect(() => {
    if (from && to) load(from, to);
  }, [from, to, load]);

  const exportReport = () => {
    if (!data) return;
    const s = data.summary;
    const rows: unknown[][] = [
      ['Days worked', s.days_worked],
      ['Work hours', s.work_hours_label],
      ['Active hours', s.active_hours_label],
      ['Leads created', s.leads_created],
      ['Leads assigned', s.leads_assigned],
      ['Calls', s.calls],
      ['WhatsApp messages', s.whatsapp],
      ['Emails', s.emails],
      ['Call time', s.call_hours_label],
      ['Follow-ups', s.followups],
      ['Follow-ups completed', s.followups_completed],
      ['Overdue follow-ups', s.followups_overdue],
      ['Site visits', s.site_visits],
      ['Site visits completed', s.site_visits_completed],
      ['Verified site visits', s.site_visits_verified],
      ['Performance score', data.score],
      ['Grade', data.grade],
    ];
    exportCSV(`employee-report-${data.employee.full_name.replace(/\s+/g, '-')}-${from}-${to}`, ['Metric', 'Value'], rows);
  };

  const tabs = [
    { key: 'overview' as const, label: 'Overview' },
    { key: 'notes' as const, label: 'Notes' },
    { key: 'timeline' as const, label: 'Timeline' },
    { key: 'attendance' as const, label: 'Attendance' },
    { key: 'calls' as const, label: 'Calls & WhatsApp' },
    { key: 'visits' as const, label: 'Site Visits' },
    { key: 'leads' as const, label: 'Leads' },
    { key: 'followups' as const, label: 'Follow-ups' },
    { key: 'expenses' as const, label: 'Expenses' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}
            className="w-10 h-10 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:bg-muted active:scale-95 transition-transform flex-shrink-0"
            aria-label="Back"
          >
            <ArrowLeft size={17} className="rtl:rotate-180" />
          </button>
          <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-lg font-extrabold text-primary">
            {data?.employee?.full_name
              ? data.employee.full_name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
              : <UserIcon size={22} />}
          </span>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground truncate">
              {data?.employee?.full_name || 'Employee report'}
            </h1>
            {data ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-semibold text-primary">{roleLabelOf(data.employee.role)}</span>
                <span className={`rounded-full px-2.5 py-0.5 font-semibold ${data.employee.is_active === false ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
                  {data.employee.is_active === false ? 'Inactive' : 'Active'}
                </span>
                {data.employee.phone ? <a href={`tel:${data.employee.phone}`} className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-muted-foreground hover:text-foreground" dir="ltr">{data.employee.phone}</a> : null}
                <span className="text-muted-foreground">{from} → {to}</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mt-0.5">Loading…</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(['today', 'week', 'month', 'custom'] as PeriodKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setPeriod(k)}
              className={`h-9 px-3 rounded-lg text-sm font-medium transition-colors ${
                period === k
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {k === 'today' ? 'Today' : k === 'week' ? 'Week' : k === 'month' ? 'Month' : 'Custom'}
            </button>
          ))}
          <button
            onClick={exportReport}
            disabled={!data}
            className="btn-secondary flex items-center gap-1.5 text-sm h-9"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {period === 'custom' && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="input-base text-sm h-10"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="input-base text-sm h-10"
          />
          <button
            onClick={() => from && to && load(from, to)}
            className="btn-primary flex items-center gap-1.5 text-sm h-9"
          >
            <CalendarDays size={14} />
            Apply
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 flex items-start gap-2">
          <XCircle size={15} className="flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      ) : data ? (
        <>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="bg-card border border-border rounded-2xl p-5 flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Performance score</p>
                  <p className="text-4xl font-extrabold text-foreground mt-1">{data.score}<span className="text-lg font-semibold text-muted-foreground">/100</span></p>
                </div>
                <span
                  className={`text-sm font-bold px-3 py-1.5 rounded-full ${
                    data.score >= 75
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                      : data.score >= 60
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
                  }`}
                >
                  {data.grade}
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {Object.entries(data.category_scores).map(([label, pts]) => {
                  const maxVal = { 'Attendance & Work Hours': 25, Calls: 20, 'Site Visits': 15, 'Follow-up Rate': 15, 'Activity Level': 15, 'Client Contact': 10 }[label] || 15;
                  return (
                    <div key={label}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-semibold text-foreground">{pts}/{maxVal}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, (pts / maxVal) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {data.lost_points.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border space-y-1.5">
                  <p className="text-xs font-semibold text-red-600 dark:text-red-400">Deductions</p>
                  {data.lost_points.map((lp, i) => (
                    <p key={i} className="text-xs text-muted-foreground flex items-center justify-between">
                      <span>{lp.reason}</span>
                      <span className="font-semibold text-red-600 dark:text-red-400">-{lp.points}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-3 flex-[2]">
              <StatCard icon={<Users size={14} />} label="Attendance" value={data.summary.days_worked} sub={`${data.summary.work_hours_label} logged`} />
              <StatCard icon={<PhoneCall size={14} />} label="Calls" value={data.summary.calls} sub={data.summary.call_hours_label} />
              <StatCard icon={<MessageCircle size={14} />} label="WhatsApp" value={data.summary.whatsapp} />
              <StatCard icon={<MapPin size={14} />} label="Site Visits" value={data.summary.site_visits} sub={`${data.summary.site_visits_completed} completed`} />
              <StatCard icon={<Users size={14} />} label="Leads" value={data.summary.leads_created} sub={`${data.summary.leads_assigned} assigned`} />
              <StatCard icon={<Bell size={14} />} label="Follow-ups" value={data.summary.followups} sub={`${data.summary.followups_completed} done`} />
              <StatCard icon={<Clock size={14} />} label="Activity" value={data.summary.actions} />
              <StatCard icon={<Wallet size={14} />} label="Expenses" value={`${data.summary.expenses_total.toLocaleString()}`} />
              <StatCard
                icon={<CheckCircle2 size={14} />}
                label="Verified visits"
                value={`${data.summary.site_visits_verified}/${data.summary.site_visits_completed}`}
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                className={`h-9 px-3.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  tab === tb.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {tb.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Recent activity</h3>
              {data.timeline.length === 0 ? (
                <EmptyState icon={<CalendarDays size={22} className="text-muted-foreground" />} title="No activity" description="No logged activity for this period." />
              ) : (
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {data.timeline.slice(0, 30).map((ev, i) => (
                    <div key={`tl-${i}`} className="flex items-start gap-3">
                      <div className="mt-1.5 w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">{ev.label}</p>
                          <span className="text-[11px] text-muted-foreground flex-shrink-0">{fmtDateTime(ev.at)}</span>
                        </div>
                        {ev.detail ? <p className="text-xs text-muted-foreground truncate mt-0.5">{ev.detail}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'notes' && <NotesTabC employeeId={employeeId} from={from} to={to} />}
          {tab === 'timeline' && <TimelineTab items={data.timeline} />}
          {tab === 'attendance' && <AttendanceTabC rows={data.attendance} />}
          {tab === 'calls' && <CallsTabC rows={data.calls} />}
          {tab === 'visits' && <VisitsTabC rows={data.visits} />}
          {tab === 'leads' && <LeadsTabC rows={data.leads} />}
          {tab === 'followups' && <FollowupsTabC rows={data.followups} />}
          {tab === 'expenses' && <ExpensesTabC rows={data.expenses} />}
        </>
      ) : (
        <EmptyState
          icon={<UserIcon size={24} className="text-muted-foreground" />}
          title="Report unavailable"
          description="Could not load this employee report."
        />
      )}
    </div>
  );
}

function TimelineTab({ items }: { items: any[] }) {
  if (!items.length)
    return <EmptyState icon={<CalendarDays size={22} className="text-muted-foreground" />} title="No activity" description="Nothing logged for this period." />;
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="space-y-3">
        {items.map((ev, i) => (
          <div key={`tl-${i}`} className="flex items-start gap-3">
            <div className="mt-1.5 w-2 h-2 rounded-full bg-primary flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{ev.label}</p>
                <span className="text-[11px] text-muted-foreground flex-shrink-0">{fmtDateTime(ev.at)}</span>
              </div>
              {ev.detail ? <p className="text-xs text-muted-foreground truncate mt-0.5">{ev.detail}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AttendanceTabC({ rows }: { rows: any[] }) {
  if (!rows.length)
    return <EmptyState icon={<CalendarDays size={22} className="text-muted-foreground" />} title="No attendance" description="No check-ins logged for this period." />;
  return (
    <div className="bg-card border border-border rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Check-in</th>
            <th className="px-4 py-3 font-medium">Check-out</th>
            <th className="px-4 py-3 font-medium">Duration</th>
            <th className="px-4 py-3 font-medium">GPS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => {
            const secs =
              r.check_in_time && r.check_out_time
                ? Math.max(0, Math.round((new Date(r.check_out_time).getTime() - new Date(r.check_in_time).getTime()) / 1000))
                : 0;
            const h = Math.floor(secs / 3600);
            const m = Math.round((secs % 3600) / 60);
            return (
              <tr key={r.id || i} className="bg-card">
                <td className="px-4 py-3 font-medium text-foreground">{r.attendance_date}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmtTime(r.check_in_time)}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmtTime(r.check_out_time)}</td>
                <td className="px-4 py-3">{secs ? `${h}h ${m}m` : '—'}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {r.check_in_lat != null ? `${r.check_in_lat.toFixed(4)}, ${r.check_in_lng?.toFixed(4) ?? ''}` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CallsTabC({ rows }: { rows: any[] }) {
  if (!rows.length)
    return <EmptyState icon={<PhoneCall size={22} className="text-muted-foreground" />} title="No calls" description="No calls or WhatsApp logged for this period." />;
  return (
    <div className="bg-card border border-border rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">When</th>
            <th className="px-4 py-3 font-medium">Channel</th>
            <th className="px-4 py-3 font-medium">Contact</th>
            <th className="px-4 py-3 font-medium">Duration</th>
            <th className="px-4 py-3 font-medium">Outcome</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((c, i) => (
            <tr key={c.id || i} className="bg-card">
              <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(c.created_at)}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${c.channel === 'WhatsApp' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'}`}>
                  {c.channel === 'WhatsApp' ? <MessageCircle size={11} /> : <PhoneCall size={11} />}
                  {c.channel || 'Call'}
                </span>
              </td>
              <td className="px-4 py-3 text-foreground">{c.contact_name || c.contact_phone || '—'}</td>
              <td className="px-4 py-3 text-muted-foreground">{c.duration_seconds ? `${Math.round(Number(c.duration_seconds) / 60)} min` : '—'}</td>
              <td className="px-4 py-3 text-muted-foreground">{c.outcome || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VisitsTabC({ rows }: { rows: any[] }) {
  if (!rows.length)
    return <EmptyState icon={<MapPin size={22} className="text-muted-foreground" />} title="No site visits" description="No site visits recorded for this period." />;
  return (
    <div className="bg-card border border-border rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">When</th>
            <th className="px-4 py-3 font-medium">Project / Lead</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Duration</th>
            <th className="px-4 py-3 font-medium">Verified</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((v, i) => {
            const secs = v.check_in_at && v.check_out_at ? Math.max(0, Math.round((new Date(v.check_out_at).getTime() - new Date(v.check_in_at).getTime()) / 1000)) : 0;
            const h = Math.floor(secs / 3600);
            const m = Math.round((secs % 3600) / 60);
            return (
              <tr key={v.id || i} className="bg-card">
                <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(v.check_in_at)}</td>
                <td className="px-4 py-3 text-foreground">{v.project_name || v.lead_name || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${v.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : v.status === 'in_progress' ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' : 'bg-muted text-muted-foreground'}`}>
                    {v.status || 'in_progress'}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{secs ? `${h}h ${m}m` : '—'}</td>
                <td className="px-4 py-3">{v.verified || v.within_radius ? <CheckCircle2 size={15} className="text-emerald-600" /> : v.check_out_at ? <XCircle size={15} className="text-red-500" /> : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LeadsTabC({ rows }: { rows: any[] }) {
  if (!rows.length)
    return <EmptyState icon={<Users size={22} className="text-muted-foreground" />} title="No leads" description="No leads associated with this employee for the period." />;
  return (
    <div className="bg-card border border-border rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Created</th>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Phone</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((l, i) => (
            <tr key={l.id || i} className="bg-card">
              <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(l.created_at)}</td>
              <td className="px-4 py-3 font-medium text-foreground">{l.name || '—'}</td>
              <td className="px-4 py-3 text-muted-foreground">{l.phone || '—'}</td>
              <td className="px-4 py-3 text-muted-foreground">{l.crm_status || l.lead_status || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FollowupsTabC({ rows }: { rows: any[] }) {
  if (!rows.length)
    return <EmptyState icon={<Bell size={22} className="text-muted-foreground" />} title="No follow-ups" description="No follow-ups scheduled for this period." />;
  return (
    <div className="bg-card border border-border rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Due</th>
            <th className="px-4 py-3 font-medium">Title</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Completed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((f, i) => (
            <tr key={f.id || i} className="bg-card">
              <td className="px-4 py-3 text-muted-foreground">{f.due_date || '—'}</td>
              <td className="px-4 py-3 font-medium text-foreground">{f.title || '—'}</td>
              <td className="px-4 py-3 text-muted-foreground">{f.follow_up_type || '—'}</td>
              <td className="px-4 py-3">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{f.follow_up_status || '—'}</span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{f.completed_at ? fmtDateTime(f.completed_at) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpensesTabC({ rows }: { rows: any[] }) {
  const total = rows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  if (!rows.length)
    return <EmptyState icon={<Wallet size={22} className="text-muted-foreground" />} title="No expenses" description="No expenses recorded by this employee." />;
  return (
    <div className="bg-card border border-border rounded-2xl">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Expenses</h3>
        <span className="text-sm font-bold text-foreground">{total.toLocaleString()}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((e, i) => (
              <tr key={e.id || i} className="bg-card">
                <td className="px-4 py-3 text-muted-foreground">{e.expense_date || fmtDateTime(e.created_at)}</td>
                <td className="px-4 py-3 font-medium text-foreground">{e.title || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{e.category || 'Other'}</td>
                <td className="px-4 py-3 font-semibold text-foreground">{Number(e.amount || 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
/* ── Notes: what this employee wrote, the stage change that came with it, and the customer (tap to open the lead) ── */
interface EmployeeNote {
  id: string;
  leadId: string | null;
  leadName: string | null;
  body: string;
  createdAt: string;
  leadStatus: string | null;
  callOutcome?: string | null;
  stageChange?: { from: string | null; to: string | null } | null;
}

function StageChip({ s }: { s: string | null | undefined }) {
  if (!s) return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">—</span>;
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[s] || 'bg-muted text-muted-foreground'}`}>{s}</span>;
}

function NotesTabC({ employeeId, from, to }: { employeeId: string; from: string; to: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<EmployeeNote[] | null>(null);
  const [err, setErr] = useState('');
  const [onlyStage, setOnlyStage] = useState(false);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setErr('');
    fetch(`/api/employees/${employeeId}/notes?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Failed to load notes');
        if (alive) setRows(Array.isArray(j.notes) ? j.notes : []);
      })
      .catch((e) => alive && setErr(e?.message || 'Failed to load notes'));
    return () => {
      alive = false;
    };
  }, [employeeId, from, to]);

  if (err) return <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{err}</div>;
  if (!rows)
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );

  const shown = onlyStage ? rows.filter((r) => r.stageChange) : rows;
  const withStage = rows.filter((r) => r.stageChange).length;

  return (
    <div className="bg-card border border-border rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">
          Notes <span className="font-normal text-muted-foreground">· {rows.length} notes · {withStage} with a stage change</span>
        </h3>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={onlyStage} onChange={(e) => setOnlyStage(e.target.checked)} />
          Only notes that changed the stage
        </label>
      </div>
      {shown.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No notes in this period.</div>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                disabled={!n.leadId}
                onClick={() => n.leadId && router.push(`/leads/${n.leadId}`)}
                className="w-full text-start p-4 transition-colors hover:bg-muted/50 disabled:cursor-default focus:outline-none focus-visible:bg-muted/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-primary" dir="auto">{n.leadName || 'Lead'}</span>
                  <span className="text-[11px] text-muted-foreground">{fmtDateTime(n.createdAt)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {n.stageChange ? (
                    <>
                      <StageChip s={n.stageChange.from} />
                      <span className="text-xs text-muted-foreground rtl:rotate-180">→</span>
                      <StageChip s={n.stageChange.to} />
                    </>
                  ) : (
                    <>
                      <span className="text-[11px] text-muted-foreground">Stage now:</span>
                      <StageChip s={n.leadStatus} />
                    </>
                  )}
                  {n.callOutcome ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Call: {n.callOutcome}</span> : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground" dir="auto">{n.body}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
