'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Loader2,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  RefreshCw,
  Users,
  Activity,
  Trophy,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isAnsweredCall } from '@/lib/callOutcome';

type Range = 'today' | '7d' | '30d';

interface MemberRow {
  user_id: string;
  full_name: string;
  role: string;
  is_self: boolean;
  calls: number;
  answered_calls: number;
  answered_leads: number;
  status_updates: number;
  meetings: number;
  deals: number;
  notes: number;
  total_actions: number;
  last_call_at: string | null;
}

interface CallRow {
  id: string;
  user_id: string;
  lead_id: string | null;
  entity_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  channel: string | null;
  direction: string | null;
  duration_seconds: number | null;
  outcome: string | null;
  source: string | null;
  created_at: string;
}

const RANGES: { key: Range; label: string; days: number }[] = [
  { key: 'today', label: 'Today / اليوم', days: 0 },
  { key: '7d', label: '7 days / 7 أيام', days: 6 },
  { key: '30d', label: '30 days / 30 يوم', days: 29 },
];

// Calendar days are Cairo days, the same boundaries the database uses for the leaderboard.
const cairoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
function shiftDay(day: string, back: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - back));
  return t.toISOString().slice(0, 10);
}

const n = (v: unknown) => Number(v) || 0;
const fmtDuration = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);

function ago(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'now / الآن';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d` : new Date(iso).toLocaleDateString();
}

const PAGE = 25;

/**
 * Team leader dashboard: how the leader's team is doing (calls, answered, activity per member) and a live feed of
 * the team's calls. It renders nothing for people who do not lead a team (the database returns no members then).
 * Numbers come from the team_overview() function; the call feed reads call_logs, which row-level security already
 * limits to the leader's own team.
 */
export default function TeamOverview({ showEmpty = false }: { showEmpty?: boolean } = {}) {
  const supabase = useMemo(() => createClient(), []);
  const [range, setRange] = useState<Range>('today');
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [memberFilter, setMemberFilter] = useState('');
  const [answerFilter, setAnswerFilter] = useState<'all' | 'answered' | 'unanswered'>('all');
  const [shown, setShown] = useState(PAGE);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const days = RANGES.find((r) => r.key === range)!.days;
      const to = cairoToday();
      const from = shiftDay(to, days);

      const { data, error: rpcError } = await supabase.rpc('team_overview', { p_from: from, p_to: to });
      if (rpcError) throw rpcError;
      const rows = ((data as MemberRow[]) || []).map((r) => ({
        ...r,
        full_name: r.full_name || 'User',
        calls: n(r.calls),
        answered_calls: n(r.answered_calls),
        answered_leads: n(r.answered_leads),
        status_updates: n(r.status_updates),
        meetings: n(r.meetings),
        deals: n(r.deals),
        notes: n(r.notes),
        total_actions: n(r.total_actions),
      }));
      setMembers(rows);

      if (rows.length > 0) {
        const since = new Date(`${from}T00:00:00+02:00`).toISOString();
        const { data: callData, error: callError } = await supabase
          .from('call_logs')
          .select('id, user_id, lead_id, entity_id, contact_name, contact_phone, channel, direction, duration_seconds, outcome, source, created_at')
          .in('user_id', rows.map((r) => r.user_id))
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(300);
        if (callError) throw callError;
        setCalls((callData as CallRow[]) || []);
      } else {
        setCalls([]);
      }
      setShown(PAGE);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [supabase, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    (members || []).forEach((m) => map.set(m.user_id, m.full_name));
    return map;
  }, [members]);

  const totals = useMemo(() => {
    const rows = members || [];
    const sum = (k: keyof MemberRow) => rows.reduce((a, r) => a + n(r[k]), 0);
    const calls = sum('calls');
    const answered = sum('answered_calls');
    return {
      calls,
      answered,
      answeredLeads: sum('answered_leads'),
      pct: calls > 0 ? Math.round((answered / calls) * 100) : 0,
      actions: sum('total_actions'),
      updates: sum('status_updates'),
      meetings: sum('meetings'),
      deals: sum('deals'),
      active: rows.filter((r) => r.total_actions > 0 || r.calls > 0).length,
      size: rows.length,
    };
  }, [members]);

  const visibleCalls = useMemo(
    () =>
      calls.filter((c) => {
        if (memberFilter && c.user_id !== memberFilter) return false;
        const answered = isAnsweredCall(c);
        if (answerFilter === 'answered' && !answered) return false;
        if (answerFilter === 'unanswered' && answered) return false;
        return true;
      }),
    [calls, memberFilter, answerFilter]
  );

  const ranked = useMemo(
    () => [...(members || [])].sort((a, b) => b.total_actions + b.calls - (a.total_actions + a.calls)),
    [members]
  );
  const topScore = ranked.length ? Math.max(1, ranked[0].total_actions + ranked[0].calls) : 1;

  // Not a team leader (or no members): show nothing, unless the page asked for an explicit empty state.
  if (!loading && !error && (!members || members.length === 0)) {
    if (!showEmpty) return null;
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-black/10 px-6 py-14 text-center dark:border-white/10">
        <Users size={28} className="text-muted-foreground" aria-hidden />
        <p className="text-sm font-semibold text-foreground">No team members yet / لا يوجد أعضاء بعد</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          When an admin assigns agents to your team, their calls and activity will appear here.
        </p>
      </div>
    );
  }

  const chip = (active: boolean) =>
    `inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 ${
      active
        ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white'
        : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
    }`;

  const card = 'rounded-2xl border border-black/5 bg-white dark:border-white/5 dark:bg-zinc-900/60';

  const kpi = (label: string, value: string | number, sub: string, accent: string, Icon: typeof Users, bar?: number) => (
    <div className={`${card} flex flex-col gap-3 p-4`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent}`}>
          <Icon size={15} aria-hidden />
        </span>
      </div>
      <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
      {bar !== undefined ? (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, bar)}%` }} />
          </div>
          <span className="text-[11px] text-muted-foreground">{sub}</span>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      )}
    </div>
  );

  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase();

  return (
    <section aria-label="Team dashboard" className="flex flex-col gap-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Users size={18} aria-hidden /> My Team / فريقي
          </h2>
          {members && members.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              <span className="font-semibold text-emerald-500">{totals.active}</span> of {totals.size} members active in this period
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Period" className="flex rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.06]">
            {RANGES.map((r) => (
              <button key={r.key} type="button" onClick={() => setRange(r.key)} aria-pressed={range === r.key} className={chip(range === r.key)}>
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 text-zinc-600 hover:border-lime-500/40 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
          Couldn&apos;t load the team dashboard. Tap refresh to try again.
        </div>
      )}

      {loading && !members && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`${card} h-[122px] animate-pulse`} />
          ))}
        </div>
      )}

      {members && members.length > 0 && (
        <>
          {/* Headline KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpi('Calls / المكالمات', totals.calls, `${totals.answeredLeads} unique leads reached`, 'bg-blue-500/10 text-blue-500', PhoneCall)}
            {kpi('Answer rate / نسبة الرد', `${totals.pct}%`, `${totals.answered} answered`, 'bg-emerald-500/10 text-emerald-500', PhoneIncoming, totals.pct)}
            {kpi('Actions / الإجراءات', totals.actions, `${totals.updates} stage updates`, 'bg-lime-500/10 text-lime-600 dark:text-lime-400', Activity)}
            {kpi('Meetings & deals', `${totals.meetings} · ${totals.deals}`, 'meetings · deals closed', 'bg-amber-500/10 text-amber-500', Trophy)}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            {/* Member ranking */}
            <div className={`${card} xl:col-span-3`}>
              <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/5">
                <h3 className="text-sm font-semibold text-foreground">Members / الأعضاء</h3>
                <p className="text-[11px] text-muted-foreground">Tap a member to filter calls</p>
              </div>
              <ul className="divide-y divide-black/5 dark:divide-white/5">
                {ranked.map((m, i) => {
                  const pct = m.calls > 0 ? Math.round((m.answered_calls / m.calls) * 100) : 0;
                  const selected = memberFilter === m.user_id;
                  const score = ((m.total_actions + m.calls) / topScore) * 100;
                  const idle = m.calls === 0 && m.total_actions === 0;
                  return (
                    <li key={m.user_id}>
                      <button
                        type="button"
                        onClick={() => setMemberFilter(selected ? '' : m.user_id)}
                        aria-pressed={selected}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-black/[0.02] focus:outline-none focus-visible:bg-lime-400/10 dark:hover:bg-white/[0.03] ${
                          selected ? 'bg-lime-400/[0.08]' : ''
                        }`}
                      >
                        <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            idle ? 'bg-zinc-500/10 text-zinc-500' : 'bg-lime-400/15 text-lime-700 dark:text-lime-300'
                          }`}
                        >
                          {initials(m.full_name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium text-foreground">{m.full_name}</span>
                            {m.is_self && <span className="text-[10px] text-muted-foreground">(you)</span>}
                            {idle && (
                              <span className="rounded bg-red-500/10 px-1.5 text-[9px] font-bold uppercase text-red-500">idle</span>
                            )}
                          </div>
                          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                            <div className="h-full rounded-full bg-lime-500" style={{ width: `${score}%` }} />
                          </div>
                        </div>
                        <dl className="hidden shrink-0 grid-cols-4 gap-4 text-center sm:grid">
                          {[
                            ['Calls', m.calls, ''],
                            ['Rate', m.calls > 0 ? `${pct}%` : '—', 'text-emerald-500'],
                            ['Actions', m.total_actions, ''],
                            ['Deals', m.deals, 'text-lime-600 dark:text-lime-400'],
                          ].map(([label, value, tone]) => (
                            <div key={label as string} className="w-12">
                              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                              <dd className={`text-sm font-semibold tabular-nums ${tone || 'text-foreground'}`}>{value}</dd>
                            </div>
                          ))}
                        </dl>
                        <div className="w-14 shrink-0 text-end sm:hidden">
                          <p className="text-sm font-semibold tabular-nums text-foreground">{m.calls}</p>
                          <p className="text-[10px] text-muted-foreground">calls</p>
                        </div>
                        <span className="hidden w-12 shrink-0 text-end text-[11px] text-muted-foreground md:block" title="Last call">
                          {ago(m.last_call_at)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Calls feed */}
            <div className={`${card} flex flex-col xl:col-span-2 xl:max-h-[640px]`}>
              <div className="flex flex-col gap-2 border-b border-black/5 p-3 dark:border-white/5">
                <div className="flex items-center gap-2">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <PhoneCall size={14} aria-hidden /> Team calls / مكالمات الفريق
                  </h3>
                  <span className="rounded-full bg-black/5 px-2 text-[11px] font-semibold text-muted-foreground dark:bg-white/10">
                    {visibleCalls.length}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={memberFilter}
                    onChange={(e) => setMemberFilter(e.target.value)}
                    aria-label="Filter by member"
                    className="h-8 min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2 text-xs dark:border-white/10 dark:bg-zinc-900"
                  >
                    <option value="">All members</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                  <div role="group" aria-label="Answer filter" className="flex rounded-lg bg-black/[0.04] p-0.5 dark:bg-white/[0.06]">
                    {(['all', 'answered', 'unanswered'] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setAnswerFilter(k)}
                        aria-pressed={answerFilter === k}
                        className={`${chip(answerFilter === k)} h-7 px-2.5`}
                      >
                        {k === 'all' ? 'All' : k === 'answered' ? 'Answered' : 'No answer'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
                {visibleCalls.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {loading ? 'Loading…' : 'No calls in this period yet. Calls logged by your team (or synced from their phones) appear here.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-black/5 dark:divide-white/5">
                    {visibleCalls.slice(0, shown).map((c) => {
                      const answered = isAnsweredCall(c);
                      const missed = c.direction === 'missed';
                      const Icon = missed ? PhoneMissed : c.direction === 'incoming' ? PhoneIncoming : PhoneOutgoing;
                      const leadId = c.lead_id || c.entity_id;
                      return (
                        <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                              missed ? 'bg-red-500/10 text-red-500' : answered ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-500/10 text-zinc-500'
                            }`}
                          >
                            <Icon size={14} aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {c.contact_name || c.contact_phone || 'Lead'}
                              {c.source === 'device_sync' && (
                                <span className="ms-1.5 rounded border border-blue-500/30 bg-blue-500/10 px-1 text-[9px] font-bold text-blue-500">AUTO</span>
                              )}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {nameOf.get(c.user_id) || 'Agent'} · {c.outcome || '—'}
                              {n(c.duration_seconds) > 0 ? ` · ${fmtDuration(n(c.duration_seconds))}` : ''}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground" title={new Date(c.created_at).toLocaleString()}>
                            {ago(c.created_at)}
                          </span>
                          {leadId && /^[0-9a-f-]{36}$/i.test(leadId) && (
                            <Link
                              href={`/leads-management?lead=${leadId}`}
                              aria-label="Open lead"
                              className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-lime-500"
                            >
                              <ArrowUpRight size={14} />
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {visibleCalls.length > shown && (
                  <div className="border-t border-black/5 p-2 text-center dark:border-white/5">
                    <button
                      type="button"
                      onClick={() => setShown((s) => s + PAGE)}
                      className="text-xs font-semibold text-lime-600 hover:underline dark:text-lime-400"
                    >
                      Show more ({visibleCalls.length - shown})
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
