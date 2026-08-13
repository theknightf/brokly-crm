import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

interface DayStat {
  date: string;
  actions: number;
  activeSeconds: number;
}

async function requireAdmin(db: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  const { data: actor } = await db
    .from('user_profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!actor || actor.is_active === false || !isAdminRole(actor.role)) return null;
  return actor;
}

function gradeFor(score: number): string {
  if (score >= 1750) return 'Excellent';
  if (score >= 1200) return 'Good';
  if (score >= 700) return 'Average';
  if (score >= 300) return 'Needs Improvement';
  return 'Critical';
}

function scoreFor(leads: number, calls: number, actions: number, activeSeconds: number): number {
  return leads * 40 + calls * 15 + actions * 2 + Math.floor(activeSeconds / 120);
}

function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// GET /api/admin/reports?from=YYYY-MM-DD&to=YYYY-MM-DD[&user_id=]
// Returns a per-user report with per-day action/active series, daily averages
// and a productivity score/grade for the requested date range (default: month).
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const actor = await requireAdmin(supabase);
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const db = supabase as any;

    const url = new URL(request.url);
    const fromParam = url.searchParams.get('from') || '';
    const toParam = url.searchParams.get('to') || '';
    const filterUserId = url.searchParams.get('user_id') || '';

    // Default to the current calendar month.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fallbackFrom = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    const fallbackTo = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
      new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    )}`;
    const from = /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : fallbackFrom;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? toParam : fallbackTo;

    const usersRes = await db
      .from('user_profiles')
      .select('id, full_name, email, role, is_active')
      .order('full_name');
    if (usersRes.error) {
      return NextResponse.json({ error: 'Failed to load users' }, { status: 500 });
    }
    let users = usersRes.data || [];
    if (filterUserId) users = users.filter((u: any) => u.id === filterUserId);

    // All activity for the range (needed for per-day breakdowns).
    const activityRes = await db
      .from('activity_log')
      .select('user_id, action_type, created_at')
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59.999`);
    const activity = activityRes.data || [];

    const dailyRes = await db
      .from('user_daily_activity')
      .select('user_id, activity_date, total_active_seconds')
      .gte('activity_date', from)
      .lte('activity_date', to);
    const daily = dailyRes.data || [];

    const callsRes = await db
      .from('call_logs')
      .select('user_id, created_at')
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59.999`);
    const calls = callsRes.data || [];

    const leadsRes = await db
      .from('leads')
      .select('created_by, created_at')
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59.999`);
    const leads = leadsRes.data || [];

    // Build a day-keyed index of dates in range.
    const dayKeys: string[] = [];
    const d0 = new Date(`${from}T00:00:00`);
    const d1 = new Date(`${to}T00:00:00`);
    for (let dt = new Date(d0); dt <= d1; dt.setDate(dt.getDate() + 1)) {
      dayKeys.push(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`);
    }

    const rows = users.map((u: any) => {
      const aByDay = new Map<string, number>();
      const sByDay = new Map<string, number>();
      activity
        .filter((x: any) => x.user_id === u.id)
        .forEach((x: any) => {
          const k = String(x.created_at).slice(0, 10);
          aByDay.set(k, (aByDay.get(k) || 0) + 1);
        });
      daily
        .filter((x: any) => x.user_id === u.id)
        .forEach((x: any) => {
          const k = String(x.activity_date).slice(0, 10);
          sByDay.set(k, (sByDay.get(k) || 0) + (x.total_active_seconds || 0));
        });

      const dailyStats: DayStat[] = dayKeys.map((date) => ({
        date,
        actions: aByDay.get(date) || 0,
        activeSeconds: sByDay.get(date) || 0,
      }));

      const totalActions = dailyStats.reduce((s, d) => s + d.actions, 0);
      const totalActiveSeconds = dailyStats.reduce((s, d) => s + d.activeSeconds, 0);
      const daysWorked = dailyStats.filter((d) => d.actions > 0 || d.activeSeconds > 0).length;
      const totalCalls = calls.filter((c: any) => c.user_id === u.id).length;
      const totalLeads = leads.filter((l: any) => l.created_by === u.id).length;
      const score = scoreFor(totalLeads, totalCalls, totalActions, totalActiveSeconds);

      return {
        user: { id: u.id, full_name: u.full_name || u.email, email: u.email, role: u.role },
        totalLeads,
        totalCalls,
        totalActions,
        totalActiveSeconds,
        totalActiveHours: fmtDur(totalActiveSeconds),
        daysWorked,
        totalDays: dayKeys.length,
        dailyAvgActions: daysWorked > 0 ? totalActions / daysWorked : 0,
        dailyAvgActiveHours: daysWorked > 0 ? totalActiveSeconds / daysWorked / 3600 : 0,
        score,
        grade: gradeFor(score),
        daily: dailyStats,
      };
    });

    rows.sort((a: any, b: any) => b.score - a.score);

    return NextResponse.json({
      from,
      to,
      generated_at: new Date().toISOString(),
      users: rows,
      days: dayKeys,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg, users: [], days: [] }, { status: 500 });
  }
}
