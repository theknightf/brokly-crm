import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

async function requireAdmin(db: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  const { data: actor } = await db
    .from('user_profiles')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();
  if (!actor || !isAdminRole(actor.role)) return null;
  return actor;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function fmt(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfPeriod(period: 'day' | 'week' | 'month', ref: Date): Date {
  if (period === 'day') return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  if (period === 'week') {
    const dow = (ref.getDay() + 6) % 7;
    return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - dow);
  }
  return new Date(ref.getFullYear(), ref.getMonth(), 1);
}

// Returns the inclusive ISO date range [start..end] for a period as local dates.
function periodDateRange(
  period: 'day' | 'week' | 'month',
  ref: Date
): { start: string; end: string } {
  const start = startOfPeriod(period, ref);
  if (period === 'day') return { start: fmt(ref), end: fmt(ref) };
  if (period === 'week') {
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { start: fmt(start), end: fmt(end) };
  }
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return { start: fmt(start), end: fmt(end) };
}

function leaderboardScore(
  leadCount: number,
  callCount: number,
  actionCount: number,
  activeSeconds: number
): number {
  return leadCount * 40 + callCount * 15 + actionCount * 2 + Math.floor(activeSeconds / 120);
}

// GET /api/admin/analytics?period=day|week|month|range&from=&to=
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const actor = await requireAdmin(supabase);
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const db = supabase as any;

    const url = new URL(request.url);
    const periodParam = url.searchParams.get('period') || 'day';
    const fromParam = url.searchParams.get('from') || '';
    const toParam = url.searchParams.get('to') || '';

    const validRange = /^\d{4}-\d{2}-\d{2}$/;
    const hasRange = validRange.test(fromParam) && validRange.test(toParam);
    const period = (
      ['day', 'week', 'month', 'range'].includes(periodParam) ? periodParam : 'day'
    ) as 'day' | 'week' | 'month' | 'range';

    const now = new Date();
    const ranges: Record<
      'day' | 'week' | 'month' | 'range' | 'total',
      { start: string; end: string }
    > = {
      day: periodDateRange('day', now),
      week: periodDateRange('week', now),
      month: periodDateRange('month', now),
      // Custom date-range aggregation (falls back to month if invalid/missing)
      range: hasRange ? { start: fromParam, end: toParam } : periodDateRange('month', now),
      // All-time range (open ended start 2024)
      total: { start: '2024-01-01', end: fmt(new Date(now.getFullYear(), 11, 31)) },
    };

    const { data: users } = await db
      .from('user_profiles')
      .select('id, full_name, email, role, is_active')
      .order('full_name');
    if (!users) {
      return NextResponse.json({ users: [], rows: [], online: [], not_setup: true });
    }
    const userIds = users.map((u: any) => u.id);
    if (userIds.length === 0)
      return NextResponse.json({ users: [], rows: [], online: [], not_setup: false });

    // ── 1. Actions (activity_log) per period ─────────────────────────────
    const activityQueries = ['day', 'week', 'month', 'range', 'total'] as const;
    const activityByPeriod: Record<string, any[]> = {};
    await Promise.all(
      activityQueries.map(async (key) => {
        const r = ranges[key];
        const { data } = await db
          .from('activity_log')
          .select('user_id, action_type, created_at')
          .gte('created_at', `${r.start}T00:00:00`)
          .lte('created_at', `${r.end}T23:59:59.999`);
        activityByPeriod[key] = data || [];
      })
    );

    // ── 2. Active seconds (user_daily_activity) per period ───────────────
    const dailyQueries = ['day', 'week', 'month', 'range', 'total'] as const;
    const dailyByPeriod: Record<string, any[]> = {};
    await Promise.all(
      dailyQueries.map(async (key) => {
        const r = ranges[key];
        const { data } = await db
          .from('user_daily_activity')
          .select('user_id, activity_date, total_active_seconds')
          .gte('activity_date', r.start)
          .lte('activity_date', r.end);
        dailyByPeriod[key] = data || [];
      })
    );

    // ── 3. Calls (call_logs) per period ──────────────────────────────────
    const callQueries = ['day', 'week', 'month', 'range', 'total'] as const;
    const callsByPeriod: Record<string, any[]> = {};
    await Promise.all(
      callQueries.map(async (key) => {
        const r = ranges[key];
        const { data } = await db
          .from('call_logs')
          .select('user_id, channel, created_at')
          .gte('created_at', `${r.start}T00:00:00`)
          .lte('created_at', `${r.end}T23:59:59.999`);
        callsByPeriod[key] = data || [];
      })
    );

    // ── 4. Leads created per period (from activity_log Lead Added + leads table) ──
    const leadQueries = ['day', 'week', 'month', 'range', 'total'] as const;
    const leadsByPeriod: Record<string, any[]> = {};
    await Promise.all(
      leadQueries.map(async (key) => {
        const r = ranges[key];
        const { data } = await db
          .from('leads')
          .select('id, created_by, created_at')
          .gte('created_at', `${r.start}T00:00:00`)
          .lte('created_at', `${r.end}T23:59:59.999`);
        leadsByPeriod[key] = data || [];
      })
    );

    // ── 5. Online status — active sessions with heartbeat in last 2 min ──
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: activeSessions } = await db
      .from('user_sessions')
      .select('user_id, last_heartbeat_at, duration_seconds, login_at')
      .eq('is_active', true)
      .gte('last_heartbeat_at', twoMinAgo);
    const onlineMap: Record<string, { last_heartbeat_at: string; login_at: string }> = {};
    (activeSessions || []).forEach((s: any) => {
      onlineMap[s.user_id] = s;
    });

    // ── 6. Aggregate per user ────────────────────────────────────────────
    const countByUser = (arr: any[], uid: string, key = 'user_id') =>
      arr.filter((x: any) => x[key] === uid).length;
    const sumActive = (arr: any[], uid: string) =>
      arr
        .filter((x: any) => x.user_id === uid)
        .reduce((s: number, x: any) => s + (x.total_active_seconds || 0), 0);

    const rows = users.map((u: any) => {
      const stat = (periodKey: 'day' | 'week' | 'month' | 'range' | 'total') => ({
        leads: countByUser(leadsByPeriod[periodKey], u.id, 'created_by'),
        calls: countByUser(callsByPeriod[periodKey], u.id),
        actions: countByUser(activityByPeriod[periodKey], u.id),
        activeSeconds: sumActive(dailyByPeriod[periodKey], u.id),
      });
      const scoreKey: 'day' | 'week' | 'month' | 'range' = period === 'range' ? 'range' : period;
      const s = stat(scoreKey);
      return {
        user_id: u.id,
        full_name: u.full_name || u.email,
        email: u.email,
        role: u.role,
        is_active: u.is_active,
        online: !!onlineMap[u.id],
        last_heartbeat_at: onlineMap[u.id]?.last_heartbeat_at || null,
        today: stat('day'),
        week: stat('week'),
        month: stat('month'),
        range: stat('range'),
        total: stat('total'),
        score: leaderboardScore(s.leads, s.calls, s.actions, s.activeSeconds),
      };
    });

    // Leaderboard = rank by score for the selected period
    rows.sort((a: any, b: any) => b.score - a.score);
    rows.forEach((r: any, i: number) => {
      r.rank = i + 1;
    });

    return NextResponse.json({
      period,
      range: ranges[period],
      total_range: ranges['total'],
      users: rows,
      online_count: Object.keys(onlineMap).length,
      not_setup: false,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json(
      { error: msg, users: [], rows: [], online: [], not_setup: true },
      { status: 500 }
    );
  }
}
