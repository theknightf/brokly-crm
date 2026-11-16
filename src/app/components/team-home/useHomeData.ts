'use client';
/**
 * Data hooks for the team leader home. Each section fetches on its own (one slow query never blocks the page) and
 * re-fetches whenever the page-wide range or refresh token changes. No extra dependency (React Query/SWR): a small
 * useAsync with stale-response protection is enough here.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { followUpsService } from '@/lib/services/crmService';
import { useFollowUpSync } from '@/hooks/useFollowUpSync';
import { kpiTargetsService } from '@/lib/services/peopleOpsService';

export type Range = 'today' | '7d' | '30d';
export const RANGE_DAYS: Record<Range, number> = { today: 1, '7d': 7, '30d': 30 };

// ── Page-wide range + refresh token ─────────────────────────────────────────────────────────────
interface HomeCtx {
  range: Range;
  setRange: (r: Range) => void;
  token: number; // bump to invalidate every section
  refresh: () => void;
}
export const HomeContext = createContext<HomeCtx>({ range: 'today', setRange: () => {}, token: 0, refresh: () => {} });
export const useHome = () => useContext(HomeContext);

export function useHomeState(): HomeCtx {
  const [range, setRange] = useState<Range>('today');
  const [token, setToken] = useState(0);
  const refresh = useCallback(() => setToken((t) => t + 1), []);
  return useMemo(() => ({ range, setRange, token, refresh }), [range, token, refresh]);
}

// ── Cairo calendar days (same boundaries the SQL functions use) ─────────────────────────────────
export const cairoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
export function shiftDay(day: string, back: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10);
}
/** Current window and the equally long window right before it (for deltas). */
export function rangeWindows(range: Range) {
  const days = RANGE_DAYS[range];
  const to = cairoToday();
  const from = shiftDay(to, days - 1);
  return { from, to, prevFrom: shiftDay(from, days), prevTo: shiftDay(from, 1) };
}

// ── Generic async loader ────────────────────────────────────────────────────────────────────────
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const run = useCallback(() => {
    const id = ++seq.current;
    setLoading(true);
    setError(false);
    fn()
      .then((d) => {
        if (id === seq.current) setData(d);
      })
      .catch(() => {
        if (id === seq.current) setError(true);
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { data, error, loading, reload: run };
}

// ── Team stats: ONE source for KPIs, the team table and the calls feed member list ───────────────
export interface MemberStats {
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
export interface TeamTotals {
  calls: number;
  answered: number;
  answerRate: number;
  leadsReached: number;
  meetings: number;
  deals: number;
}
export interface TeamStats {
  members: MemberStats[];
  totals: TeamTotals;
  prev: TeamTotals;
}

const num = (v: unknown) => Number(v) || 0;

function normalize(rows: unknown): MemberStats[] {
  return ((rows as MemberStats[]) || []).map((r) => ({
    ...r,
    full_name: r.full_name || 'User',
    calls: num(r.calls),
    answered_calls: num(r.answered_calls),
    answered_leads: num(r.answered_leads),
    status_updates: num(r.status_updates),
    meetings: num(r.meetings),
    deals: num(r.deals),
    notes: num(r.notes),
    total_actions: num(r.total_actions),
  }));
}

export function totalsOf(members: MemberStats[]): TeamTotals {
  const sum = (k: keyof MemberStats) => members.reduce((a, m) => a + num(m[k]), 0);
  const calls = sum('calls');
  const answered = sum('answered_calls');
  return {
    calls,
    answered,
    answerRate: calls > 0 ? Math.round((answered / calls) * 100) : 0,
    leadsReached: sum('answered_leads'),
    meetings: sum('meetings'),
    deals: sum('deals'),
  };
}

/**
 * Team numbers for the selected range from team_overview() (rows only for the caller's team, plus the caller),
 * and the previous equal-length window for deltas. Every team widget reads this one result, so the KPI cards and
 * the member table can never disagree.
 */
export function useTeamStats(range: Range, token = 0) {
  const supabase = useMemo(() => createClient(), []);
  return useAsync<TeamStats>(async () => {
    const w = rangeWindows(range);
    const [cur, prev] = await Promise.all([
      supabase.rpc('team_overview', { p_from: w.from, p_to: w.to }),
      supabase.rpc('team_overview', { p_from: w.prevFrom, p_to: w.prevTo }),
    ]);
    if (cur.error) throw cur.error;
    const members = normalize(cur.data);
    return { members, totals: totalsOf(members), prev: totalsOf(normalize(prev.data)) };
  }, [supabase, range, token]);
}

/** Active "daily_calls" KPI target (set by admins on the targets screen), or null when none is set. */
export function useDailyCallsTarget() {
  return useAsync<number | null>(async () => {
    const all = await kpiTargetsService.getAll();
    const t = all.find(
      (k) => k.isActive && k.metric === 'daily_calls' && k.periodType === 'day' && ['all', 'agent'].includes(k.targetRole)
    );
    return t && t.targetValue > 0 ? t.targetValue : null;
  }, []);
}

// ── Pipeline + source counts, computed in SQL (no 1000-row cap) ─────────────────────────────────
export interface StageCounts {
  stages: Record<string, number>;
  sources: Record<string, number>;
  total: number;
}
export function useStageCounts(token = 0) {
  const supabase = useMemo(() => createClient(), []);
  return useAsync<StageCounts>(async () => {
    const { data, error } = await supabase.rpc('get_stage_counts');
    if (error) throw error;
    const stages: Record<string, number> = {};
    const sources: Record<string, number> = {};
    let total = 0;
    for (const r of (data as { kind: string; key: string; count: number }[]) || []) {
      const n = num(r.count);
      if (r.kind === 'stage') {
        stages[r.key] = n;
        total += n;
      } else sources[r.key] = n;
    }
    return { stages, sources, total };
  }, [supabase, token]);
}

// ── Follow-ups (shared by the attention bar and the follow-ups panel) ───────────────────────────
export interface FollowUp {
  id: string;
  contactName: string;
  contactPhone?: string;
  dueDate: string;
  dueTime?: string;
  priority?: string;
  status?: string;
  notes?: string;
  propertyInterest?: string;
  leadId?: string;
}
export function useFollowUps(token = 0) {
  const res = useAsync<FollowUp[]>(async () => {
    const list = await followUpsService.getAll();
    return ((Array.isArray(list) ? list : []) as FollowUp[]).filter((f) => {
      const s = (f.status || '').trim().toLowerCase();
      return s !== 'completed' && s !== 'cancelled';
    });
  }, [token]);
  useFollowUpSync(res.reload);
  return res;
}

/** Follow-up "today" uses the device-local date, like the rest of the follow-ups screens. */
export const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
