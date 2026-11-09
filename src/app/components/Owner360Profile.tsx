'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Award,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  Handshake,
  Loader2,
  Mail,
  Phone,
  PhoneCall,
  RefreshCw,
  Shirt,
  StickyNote,
  Target,
  Timer,
  TrendingUp,
  UserPlus,
} from 'lucide-react';

/* ───────────────────────────────────────────────────────────────────────────
   Agent profile (owner / admin 360°, or the agent's own page).
   Layout: identity + period → score → CRM numbers (same definitions as the leaderboards)
           → activity timeline (calls + written notes + attendance + evaluations) | side cards
             (pipeline, attendance, dress code, payroll).
   ─────────────────────────────────────────────────────────────────────────── */

interface Crm {
  calls: number;
  answered: number;
  answeredLeads: number;
  statusUpdates: number;
  actions: number;
  meetings: number;
  deals: number;
  leadsAdded: number;
  assignedLeads: number;
  overdueFollowUps: number;
}
interface Profile360 {
  employee: { id: string; full_name: string; email: string; role: string; phone: string; is_active: boolean };
  from: string;
  to: string;
  scores: { callScore: number; attendanceScore: number; dressScore: number; totalScore: number; grade: string; formula: string };
  summary: any;
  evaluations: any[];
  timeline: { at: string; type: string; label: string; detail?: string; leadId?: string | null; direction?: string | null }[];
  crm?: Crm;
  notes?: { id: string; at: string; leadId: string; leadName: string; leadStatus: string; text: string; callOutcome: string | null }[];
  pipeline?: { stage: string; count: number }[];
  deductions?: any[];
  notifications?: any[];
  payroll?: { baseSalary: number; totalDeductions: number; netPayout: number };
}

type Period = 'today' | 'week' | 'month' | 'custom';
type Feed = 'all' | 'call' | 'note' | 'attendance' | 'evaluation';

const cairoDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const fmtDayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const dayOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso).slice(0, 10) : cairoDay(d);
};
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || '?';

const GRADE_TONE: Record<string, { ring: string; text: string; bg: string }> = {
  Excellent: { ring: 'stroke-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
  Good: { ring: 'stroke-sky-500', text: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-500/10' },
  Average: { ring: 'stroke-amber-500', text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
};
const toneFor = (g: string) => GRADE_TONE[g] || { ring: 'stroke-red-500', text: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10' };

function ScoreRing({ value, grade }: { value: number; grade: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const t = toneFor(grade);
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} className="fill-none stroke-muted" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r={r}
          className={`fill-none ${t.ring} transition-all`}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (Math.max(0, Math.min(100, value)) / 100) * c}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold tabular-nums text-foreground">{value}</span>
        <span className="text-[10px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

function Bar({ label, value, weight, icon }: { label: string; value: number; weight: string; icon: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          {label} <span className="opacity-60">· {weight}</span>
        </span>
        <span className="font-bold tabular-nums text-foreground">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub, tone = 'text-foreground' }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Card({ title, icon, children, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function Owner360Profile({ employeeId, initialFrom, initialTo }: { employeeId: string; initialFrom?: string; initialTo?: string }) {
  const [period, setPeriod] = useState<Period>(initialFrom ? 'custom' : 'month');
  const [from, setFrom] = useState(initialFrom || addDays(cairoDay(), -6));
  const [to, setTo] = useState(initialTo || cairoDay());
  const [data, setData] = useState<Profile360 | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [feed, setFeed] = useState<Feed>('all');
  const [feedLimit, setFeedLimit] = useState(60);

  const range = useMemo(() => {
    const today = cairoDay();
    if (period === 'today') return { from: today, to: today };
    if (period === 'week') return { from: addDays(today, -6), to: today };
    if (period === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
    return { from: from || today, to: to || today };
  }, [period, from, to]);

  const loadedOnce = React.useRef(false);
  const load = useCallback(async () => {
    setError('');
    // First load shows the loader; changing the period keeps the page and shows "updating…".
    if (loadedOnce.current) setRefreshing(true);
    else setLoading(true);
    try {
      // Owner endpoint adds payroll & deductions; the plain profile is the fallback (self view, admins).
      let res = await fetch(`/api/owner/employee-360/${employeeId}?from=${range.from}&to=${range.to}`, { cache: 'no-store' });
      if (!res.ok) res = await fetch(`/api/employees/${employeeId}/profile-360?from=${range.from}&to=${range.to}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not load the profile');
      setData(j);
      loadedOnce.current = true;
      setFeedLimit(60);
    } catch (e: any) {
      setError(e?.message || 'Could not load the profile');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [employeeId, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  // Timeline grouped by Cairo day.
  const grouped = useMemo(() => {
    const items = (data?.timeline || []).filter((t) => feed === 'all' || t.type === feed).slice(0, feedLimit);
    const map = new Map<string, typeof items>();
    for (const t of items) {
      const k = dayOf(t.at);
      map.set(k, [...(map.get(k) || []), t]);
    }
    return Array.from(map.entries());
  }, [data, feed, feedLimit]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button type="button" onClick={() => void load()} className="btn-secondary mt-3 text-sm">
          Try again
        </button>
      </div>
    );
  }
  if (!data) return null;

  const { employee, scores, summary, evaluations } = data;
  const crm = data.crm;
  const tone = toneFor(scores.grade);
  const answeredPct = crm && crm.calls > 0 ? Math.round((crm.answered / crm.calls) * 100) : 0;
  const pipelineTotal = (data.pipeline || []).reduce((s, p) => s + p.count, 0);
  const feedCounts = (data.timeline || []).reduce<Record<string, number>>((m, t) => ((m[t.type] = (m[t.type] || 0) + 1), m), {});

  const periodBtn = (p: Period, label: string) => (
    <button
      key={p}
      type="button"
      aria-pressed={period === p}
      onClick={() => setPeriod(p)}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
        period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Identity + period */}
      <header className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/admin" className="hidden rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground sm:block" aria-label="Back">
              <ArrowLeft size={18} />
            </Link>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-lime-400 to-lime-600 text-lg font-bold text-zinc-950">
              {initials(employee.full_name)}
            </div>
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-2 text-lg font-bold text-foreground">
                <span className="truncate">{employee.full_name}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
                  {String(employee.role || '').replace(/_/g, ' ')}
                </span>
                {!employee.is_active && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-600">Inactive</span>}
              </h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {employee.email && (
                  <a href={`mailto:${employee.email}`} className="inline-flex items-center gap-1 hover:text-primary">
                    <Mail size={12} /> {employee.email}
                  </a>
                )}
                {employee.phone && (
                  <a href={`tel:${employee.phone}`} className="inline-flex items-center gap-1 hover:text-primary">
                    <Phone size={12} /> {employee.phone}
                  </a>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Period">
              {periodBtn('today', 'Today')}
              {periodBtn('week', '7 days')}
              {periodBtn('month', 'This month')}
              {periodBtn('custom', 'Custom')}
            </div>
            {period === 'custom' && (
              <>
                <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="input-base !w-auto text-sm" aria-label="From" />
                <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="input-base !w-auto text-sm" aria-label="To" />
              </>
            )}
            <button
              type="button"
              onClick={() => void load()}
              disabled={refreshing}
              aria-label="Refresh"
              className="btn-secondary flex h-9 w-9 items-center justify-center !p-0 disabled:opacity-60"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          {data.from === data.to ? fmtDayLabel(data.from) : `${fmtDayLabel(data.from)} → ${fmtDayLabel(data.to)}`}
          {refreshing && ' · updating…'}
        </p>
      </header>

      {/* Score */}
      <section className="grid grid-cols-1 gap-4 rounded-2xl border border-border bg-card p-4 md:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-4">
          <ScoreRing value={scores.totalScore} grade={scores.grade} />
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Performance score</p>
            <p className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${tone.bg} ${tone.text}`}>
              <Award size={14} /> {scores.grade}
            </p>
          </div>
        </div>
        <div className="flex flex-col justify-center gap-3">
          <Bar label="Calls" weight="40%" value={scores.callScore} icon={<PhoneCall size={12} />} />
          <Bar label="Attendance" weight="30%" value={scores.attendanceScore} icon={<Clock size={12} />} />
          <Bar label="Dress code" weight="30%" value={scores.dressScore} icon={<Shirt size={12} />} />
          <p className="text-[11px] text-muted-foreground">
            {scores.totalScore} = {scores.callScore} × 0.4 + {scores.attendanceScore} × 0.3 + {scores.dressScore} × 0.3
          </p>
        </div>
      </section>

      {/* CRM numbers (same definitions as the leaderboards) */}
      {crm && (
        <section aria-label="CRM activity" className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          <Stat icon={<PhoneCall size={12} />} label="Calls" value={crm.calls} sub={`${crm.answeredLeads} leads reached`} />
          <Stat icon={<CheckCircle2 size={12} />} label="Answered" value={crm.answered} sub={`${answeredPct}% of calls`} tone="text-emerald-600 dark:text-emerald-400" />
          <Stat icon={<StickyNote size={12} />} label="Actions" value={crm.actions} sub="notes written" tone="text-primary" />
          <Stat icon={<TrendingUp size={12} />} label="Stage updates" value={crm.statusUpdates} />
          <Stat icon={<CalendarClock size={12} />} label="Meetings" value={crm.meetings} />
          <Stat icon={<Handshake size={12} />} label="Deals" value={crm.deals} tone="text-lime-600 dark:text-lime-400" />
          <Stat icon={<UserPlus size={12} />} label="New leads" value={crm.leadsAdded} sub={`${crm.assignedLeads} assigned in total`} />
          <Stat
            icon={<Target size={12} />}
            label="Overdue F/U"
            value={crm.overdueFollowUps}
            sub="follow-ups past due"
            tone={crm.overdueFollowUps ? 'text-red-600 dark:text-red-400' : 'text-foreground'}
          />
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Activity timeline */}
        <Card
          title="Activity"
          icon={<FileText size={14} className="text-primary" />}
          action={
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filter activity">
              {(
                [
                  ['all', 'All'],
                  ['call', 'Calls'],
                  ['note', 'Notes'],
                  ['attendance', 'Attendance'],
                  ['evaluation', 'Dress'],
                ] as [Feed, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={feed === k}
                  onClick={() => {
                    setFeed(k);
                    setFeedLimit(60);
                  }}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    feed === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                  {k !== 'all' && feedCounts[k] ? ` ${feedCounts[k]}` : ''}
                </button>
              ))}
            </div>
          }
        >
          {grouped.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No activity in this period.</p>
          ) : (
            <div className="space-y-4">
              {grouped.map(([day, items]) => (
                <div key={day}>
                  <p className="sticky top-0 z-[1] mb-1.5 bg-card py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {fmtDayLabel(day)} <span className="font-normal">· {items.length}</span>
                  </p>
                  <ol className="space-y-1.5 border-s border-border ps-4">
                    {items.map((t, i) => {
                      const icon =
                        t.type === 'call' ? (
                          t.direction === 'incoming' ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />
                        ) : t.type === 'note' ? (
                          <StickyNote size={12} />
                        ) : t.type === 'evaluation' ? (
                          <Shirt size={12} />
                        ) : (
                          <Calendar size={12} />
                        );
                      const color =
                        t.type === 'call'
                          ? 'bg-sky-500/15 text-sky-600'
                          : t.type === 'note'
                            ? 'bg-primary/15 text-primary'
                            : t.type === 'evaluation'
                              ? 'bg-lime-500/15 text-lime-700'
                              : 'bg-muted text-muted-foreground';
                      return (
                        <li key={`${day}-${i}`} className="relative">
                          <span className={`absolute -start-[1.6rem] top-1.5 flex h-5 w-5 items-center justify-center rounded-full ${color}`}>{icon}</span>
                          <div className="rounded-lg px-2 py-1.5 hover:bg-muted/50">
                            <div className="flex flex-wrap items-baseline gap-x-2">
                              <span className="text-[11px] tabular-nums text-muted-foreground">{fmtTime(t.at)}</span>
                              {t.type === 'note' && t.leadId ? (
                                <Link href={`/leads-management?lead=${t.leadId}`} className="text-sm font-semibold text-foreground hover:text-primary hover:underline">
                                  {t.label}
                                </Link>
                              ) : (
                                <span className="text-sm font-medium text-foreground">{t.label}</span>
                              )}
                              {t.type === 'call' && t.detail && (
                                t.leadId ? (
                                  <Link href={`/leads-management?lead=${t.leadId}`} className="text-xs text-muted-foreground hover:text-primary hover:underline">
                                    {t.detail}
                                  </Link>
                                ) : (
                                  <span className="text-xs text-muted-foreground">{t.detail}</span>
                                )
                              )}
                              {t.type !== 'call' && t.type !== 'note' && t.detail && <span className="text-xs text-muted-foreground">{t.detail}</span>}
                            </div>
                            {t.type === 'note' && t.detail && (
                              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground/90" dir="auto">
                                {t.detail}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
              {(data.timeline || []).filter((t) => feed === 'all' || t.type === feed).length > feedLimit && (
                <button type="button" onClick={() => setFeedLimit((n) => n + 60)} className="w-full rounded-lg border border-border py-2 text-sm font-semibold text-primary hover:bg-muted/50">
                  Show more
                </button>
              )}
            </div>
          )}
        </Card>

        {/* Side cards */}
        <div className="space-y-4">
          {data.pipeline && data.pipeline.length > 0 && (
            <Card title={`Pipeline (${pipelineTotal})`} icon={<Target size={14} className="text-primary" />}>
              <ul className="space-y-2">
                {data.pipeline.slice(0, 10).map((p) => (
                  <li key={p.stage}>
                    <Link href={`/leads-management?stage=${encodeURIComponent(p.stage)}&agent=${encodeURIComponent(employee.full_name)}`} className="group block">
                      <div className="mb-0.5 flex items-center justify-between text-xs">
                        <span className="truncate text-muted-foreground group-hover:text-foreground">{p.stage}</span>
                        <span className="font-semibold tabular-nums text-foreground">{p.count}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${pipelineTotal ? (p.count / pipelineTotal) * 100 : 0}%` }} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Attendance" icon={<Clock size={14} className="text-primary" />}>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[11px] text-muted-foreground">Days worked</dt>
                <dd className="font-bold tabular-nums">
                  {summary.days_worked}/{summary.total_days}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">Late days</dt>
                <dd className={`font-bold tabular-nums ${summary.late_days ? 'text-amber-600' : ''}`}>{summary.late_days}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Timer size={11} /> Work hours
                </dt>
                <dd className="font-bold tabular-nums">{summary.work_hours_label}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">Active in app</dt>
                <dd className="font-bold tabular-nums">{summary.active_hours_label}</dd>
              </div>
            </dl>
          </Card>

          <Card title={`Dress code (${evaluations.length})`} icon={<Shirt size={14} className="text-primary" />}>
            {evaluations.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">No evaluations in this period.</p>
            ) : (
              <ul className="max-h-56 space-y-1.5 overflow-auto">
                {evaluations.map((e: any) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium">
                        {e.date}
                        {e.evaluator?.full_name ? <span className="text-muted-foreground"> · {e.evaluator.full_name}</span> : null}
                      </p>
                      {(e.notes || (e.behavioral_flags || []).length > 0) && (
                        <p className="truncate text-[11px] text-muted-foreground">{e.notes || (e.behavioral_flags || []).join(', ')}</p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        e.dress_code_rating >= 4 ? 'bg-emerald-500/15 text-emerald-600' : e.dress_code_rating >= 3 ? 'bg-amber-500/15 text-amber-600' : 'bg-red-500/15 text-red-600'
                      }`}
                    >
                      {e.dress_code_rating}/5
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {summary.avg_dress_rating != null && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Average {summary.avg_dress_rating}/5 · {summary.dress_pass_rate}% pass
              </p>
            )}
          </Card>

          {data.payroll && (
            <Card title="Payroll & deductions" icon={<FileText size={14} className="text-primary" />}>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <dt className="text-[11px] text-muted-foreground">Base</dt>
                  <dd className="text-sm font-bold tabular-nums">{Number(data.payroll.baseSalary || 0).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Deductions</dt>
                  <dd className="text-sm font-bold tabular-nums text-red-600">{Number(data.payroll.totalDeductions || 0).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Net</dt>
                  <dd className="text-sm font-bold tabular-nums text-emerald-600">{Number(data.payroll.netPayout || 0).toLocaleString()}</dd>
                </div>
              </dl>
              {(data.deductions || []).length > 0 && (
                <ul className="mt-3 max-h-40 space-y-1 overflow-auto">
                  {(data.deductions || []).map((d: any) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-red-500/5 px-2.5 py-1.5 text-xs">
                      <span className="min-w-0 truncate text-foreground">{d.reason}</span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {d.amount} · {d.month_year}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
