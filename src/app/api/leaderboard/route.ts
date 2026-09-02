import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { loadOfficeHours } from '@/lib/officeHours';

export const dynamic = 'force-dynamic';

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmt(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function startOfPeriod(period: 'day' | 'week' | 'month', ref: Date): Date {
  if (period === 'day') return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  if (period === 'week') {
    const dow = (ref.getDay() + 6) % 7;
    return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - dow);
  }
  return new Date(ref.getFullYear(), ref.getMonth(), 1);
}
function periodRange(period: 'day' | 'week' | 'month', ref: Date) {
  const start = startOfPeriod(period, ref);
  if (period === 'day') return { start: fmt(ref), end: fmt(ref) };
  if (period === 'week') {
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { start: fmt(start), end: fmt(end) };
  }
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return { start: fmt(start), end: fmt(end) };
}
function daysInRange(start: string, end: string) {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  return Math.round((b - a) / 86400000) + 1;
}

// Scoring helpers - weighted model per spec: 40% Call, 30% Attendance, 30% Dress
function callScore(totalCalls: number, convertedLeads: number): number {
  const volume = Math.min(100, (totalCalls / 20) * 100); // 20 calls = 100
  const conversion = totalCalls > 0 ? Math.min(100, (convertedLeads / Math.max(1, totalCalls)) * 100) : 0;
  // If no conversion data, use volume alone
  if (convertedLeads === 0 && totalCalls > 0) return Math.round(volume);
  return Math.round(volume * 0.6 + conversion * 0.4);
}
function attendanceScore(presentDays: number, totalDays: number, lateDays: number): number {
  if (totalDays === 0) return 0;
  const rate = (presentDays / totalDays) * 100;
  const punctuality = presentDays > 0 ? ((presentDays - lateDays) / presentDays) * 100 : 0;
  return Math.round(Math.max(0, rate * 0.5 + punctuality * 0.5));
}
function dressScore(avgRating: number | null): number {
  if (avgRating == null) return 0;
  return Math.round((avgRating / 5) * 100);
}

// GET /api/leaderboard?period=day|week|month&from=&to=
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const periodParam = (url.searchParams.get('period') || 'month') as 'day' | 'week' | 'month';
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');
    const now = new Date();
    const valid = /^\d{4}-\d{2}-\d{2}$/;
    let range: { start: string; end: string };
    if (fromParam && toParam && valid.test(fromParam) && valid.test(toParam)) {
      range = { start: fromParam, end: toParam };
    } else {
      range = periodRange(['day', 'week', 'month'].includes(periodParam) ? periodParam : 'month', now);
    }
    const totalDays = daysInRange(range.start, range.end);

    const db: any = supabase;
    const { data: usersRaw } = await db.from('user_profiles').select('id, full_name, email, role, is_active, created_at').eq('is_active', true).order('full_name');
    const users = (usersRaw || []).filter((u: any) => u.role !== 'owner' && u.role !== 'admin');
    if (!users || users.length === 0) return NextResponse.json({ period: periodParam, range, users: [] });

    const userIds = users.map((u: any) => u.id);
    const office = await loadOfficeHours(db as any).catch(() => ({ toleranceMinutes: 12 * 60 + 30 } as any));

    const [attendanceRes, callsRes, evalRes] = await Promise.all([
      db.from('attendance').select('user_id, attendance_date, check_in_time').gte('attendance_date', range.start).lte('attendance_date', range.end),
      db.from('call_logs').select('user_id, outcome, created_at').gte('created_at', `${range.start}T00:00:00`).lte('created_at', `${range.end}T23:59:59.999`),
      db.from('evaluations').select('employee_id, dress_code_rating, date').gte('date', range.start).lte('date', range.end),
    ]);

    // New: fetch status change events from activity_log for the same period
    const statusChangesRes = await db.from('activity_log').select('user_id, action_type, created_at').gte('created_at', `${range.start}T00:00:00`).lte('created_at', `${range.end}T23:59:59.999`).eq('action_type', 'lead_status_updated');

    const attendance = attendanceRes.data || [];
    const calls = callsRes.data || [];
    const evals = evalRes.data || [];
    const statusChanges = statusChangesRes.data || [];

    // Group maps
    const attByUser = new Map<string, typeof attendance>();
    attendance.forEach((a: any) => {
      if (!attByUser.has(a.user_id)) attByUser.set(a.user_id, []);
      attByUser.get(a.user_id)!.push(a);
    });
    const callsByUser = new Map<string, typeof calls>();
    calls.forEach((c: any) => {
      if (!callsByUser.has(c.user_id)) callsByUser.set(c.user_id, []);
      callsByUser.get(c.user_id)!.push(c);
    });
    const evalByUser = new Map<string, typeof evals>();
    evals.forEach((e: any) => {
      if (!evalByUser.has(e.employee_id)) evalByUser.set(e.employee_id, []);
      evalByUser.get(e.employee_id)!.push(e);
    });
    const statusByUser = new Map<string, typeof statusChanges>();
    statusChanges.forEach((s: any) => {
      if (!statusByUser.has(s.user_id)) statusByUser.set(s.user_id, []);
      statusByUser.get(s.user_id)!.push(s);
    });

    const ranked = users.map((u: any) => {
      const att = attByUser.get(u.id) || [];
      const present = att.length;
      // Late using officeHours tolerance (respects company_settings)
      const late = att.filter((a: any) => {
        if (!a.check_in_time) return false;
        const t = new Date(a.check_in_time);
        const minutes = t.getUTCHours() * 60 + t.getUTCMinutes();
        return minutes > (office.toleranceMinutes ?? 12 * 60 + 30);
      }).length;

      const userCalls = callsByUser.get(u.id) || [];
      const totalCalls = userCalls.length;
      const converted = userCalls.filter((c: any) => ['Successful', 'Converted', 'Won'].includes(c.outcome || '')).length;

      const userEvals = evalByUser.get(u.id) || [];
      const avgRating = userEvals.length > 0 ? userEvals.reduce((s: number, e: any) => s + e.dress_code_rating, 0) / userEvals.length : null;

      // NEW: count only status change actions from activity_log
      const userStatusChanges = statusByUser.get(u.id) || [];
      const statusChangeCount = userStatusChanges.length;

      const cScore = callScore(totalCalls, converted);
      const aScore = attendanceScore(present, totalDays, late);
      const dScore = dressScore(avgRating);
      const total = Math.round(cScore * 0.40 + aScore * 0.30 + dScore * 0.30);

      return {
        user_id: u.id,
        full_name: u.full_name || u.email,
        email: u.email,
        role: u.role,
        period: range,
        metrics: {
          totalCalls,
          convertedLeads: converted,
          presentDays: present,
          totalDays,
          lateDays: late,
          dressEvaluations: userEvals.length,
          avgDressRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
          statusChanges: statusChangeCount,
        },
        scores: {
          callScore: cScore,
          attendanceScore: aScore,
          dressScore: dScore,
          totalScore: total,
        },
        totalScore: total,
      };
    });

    ranked.sort((a: any, b: any) => b.totalScore - a.totalScore);
    ranked.forEach((r: any, i: number) => (r.rank = i + 1));

    return NextResponse.json({
      period: periodParam,
      range,
      formula: 'Total = Call*0.40 + Attendance*0.30 + Dress*0.30',
      users: ranked,
      generated_at: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
