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
export default function TeamOverview() {
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

  // Not a team leader (or the data could not be loaded): show nothing rather than an empty box.
  if (!loading && !error && (!members || members.length === 0)) return null;

  const chip = (active: boolean) =>
    `inline-flex h-8 items-center rounded-lg border px-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 ${
      active
        ? 'border-lime-400/40 bg-lime-400/10 text-lime-600 dark:text-lime-300'
        : 'border-black/10 bg-white text-zinc-600 hover:border-lime-500/40 dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-300'
    }`;

  const stat = (label: string, value: string | number, sub?: string, tone = 'text-foreground') => (
    <div className="rounded-xl border border-black/5 bg-white p-3.5 dark:border-white/5 dark:bg-zinc-900/60">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );

  return (
    <section aria-label="Team dashboard" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 border-b border-black/5 pb-2 dark:border-white/5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Users size={16} aria-hidden /> My Team / فريقي
          </h2>
          {members && members.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {totals.active}/{totals.size} active
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((r) => (
            <button key={r.key} type="button" onClick={() => setRange(r.key)} aria-pressed={range === r.key} className={chip(range === r.key)}>
              {r.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 text-zinc-600 hover:border-lime-500/40 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
          Couldn&apos;t load the team dashboard. Tap refresh to try again.
        </div>
      )}

      {members && members.length > 0 && (
        <>
          {/* Team totals */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            {stat('Calls / المكالمات', totals.calls, `${totals.size} members`)}
            {stat('Answered / تم الرد', totals.answered, `${totals.pct}% of calls`, 'text-emerald-500')}
            {stat('Leads reached', totals.answeredLeads, 'unique leads that answered')}
            {stat('Actions / الإجراءات', totals.actions, 'notes written', 'text-lime-500')}
            {stat('Stage updates', totals.updates)}
            {stat('Meetings', totals.meetings)}
            {stat('Deals', totals.deals, undefined, 'text-lime-500')}
          </div>

          {/* Per-member table */}
          <div className="custom-scrollbar overflow-x-auto rounded-xl border border-black/5 bg-white dark:border-white/5 dark:bg-zinc-900/60">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-black/5 dark:border-white/5">
                  <th className="px-3 py-2.5 text-start font-semibold">Member</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Calls</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Answered</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Rate</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Actions</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Updates</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Meetings</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Deals</th>
                  <th className="px-3 py-2.5 text-end font-semibold">Last call</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const pct = m.calls > 0 ? Math.round((m.answered_calls / m.calls) * 100) : 0;
                  const selected = memberFilter === m.user_id;
                  return (
                    <tr
                      key={m.user_id}
                      onClick={() => setMemberFilter(selected ? '' : m.user_id)}
                      className={`cursor-pointer border-t border-black/5 transition-colors hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.03] ${
                        selected ? 'bg-lime-400/[0.07]' : ''
                      }`}
                      title="Show this member's calls"
                    >
                      <td className="px-3 py-2.5">
                        <span className="font-medium text-foreground">{m.full_name}</span>
                        {m.is_self && <span className="ms-1.5 text-[10px] text-muted-foreground">(you)</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums">{m.calls}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-emerald-500">{m.answered_calls}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">{m.calls > 0 ? `${pct}%` : '—'}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums font-semibold">{m.total_actions}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums">{m.status_updates}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums">{m.meetings}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums">{m.deals}</td>
                      <td className="px-3 py-2.5 text-end text-xs text-muted-foreground">{ago(m.last_call_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Calls feed */}
          <div className="rounded-xl border border-black/5 bg-white dark:border-white/5 dark:bg-zinc-900/60">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/5 p-3 dark:border-white/5">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <PhoneCall size={14} aria-hidden /> Team calls / مكالمات الفريق
                <span className="text-xs font-normal text-muted-foreground">({visibleCalls.length})</span>
              </h3>
              <div className="ms-auto flex flex-wrap items-center gap-2">
                <select
                  value={memberFilter}
                  onChange={(e) => setMemberFilter(e.target.value)}
                  aria-label="Filter by member"
                  className="h-8 rounded-lg border border-black/10 bg-white px-2 text-xs dark:border-white/10 dark:bg-zinc-900"
                >
                  <option value="">All members</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.full_name}
                    </option>
                  ))}
                </select>
                {(['all', 'answered', 'unanswered'] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setAnswerFilter(k)} aria-pressed={answerFilter === k} className={chip(answerFilter === k)}>
                    {k === 'all' ? 'All' : k === 'answered' ? 'Answered / تم الرد' : 'No answer'}
                  </button>
                ))}
              </div>
            </div>

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
                <button type="button" onClick={() => setShown((s) => s + PAGE)} className="text-xs font-semibold text-lime-600 hover:underline dark:text-lime-400">
                  Show more ({visibleCalls.length - shown})
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
