import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';
import { loadOfficeHours } from '@/lib/officeHours';

export const dynamic = 'force-dynamic';

function pad(n: number) { return String(n).padStart(2, '0'); }
function localDay(offset = 0): string {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function monthRange(y: number, m: number) {
  const from = `${y}-${pad(m + 1)}-01`;
  const last = new Date(y, m + 1, 0).getDate();
  return { from, to: `${y}-${pad(m + 1)}-${pad(last)}` };
}
function minutesOfDay(iso?: string | null) {
  if (!iso) return -1;
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return -1;
  return d.getHours() * 60 + d.getMinutes();
}
function durationHours(a?: string | null, b?: string | null) {
  if (!a || !b) return 0;
  const x = new Date(a).getTime(), y = new Date(b).getTime();
  if (Number.isNaN(x) || Number.isNaN(y) || y <= x) return 0;
  return (y - x) / 3600000;
}
function statusOf(rec: any, tol: number) {
  if (!rec?.check_in_time) return 'absent';
  const m = minutesOfDay(rec.check_in_time);
  return m < 0 ? 'present' : m <= tol ? 'present' : 'late';
}

// Scoring per spec: 40% Valid Calls, 30% Attendance, 30% Dress
function callScore(calls: number, valid: number) {
  if (calls === 0) return 0;
  const vol = Math.min(100, (valid / 20) * 100);
  return Math.round(vol);
}
function attendanceScore(present: number, total: number, late: number) {
  if (total === 0) return 0;
  const rate = (present / total) * 100;
  const punct = present > 0 ? ((present - late) / present) * 100 : 0;
  return Math.round(rate * 0.5 + punct * 0.5);
}
function dressScore(avg: number | null) {
  return avg == null ? 0 : Math.round((avg / 5) * 100);
}

// GET /api/dashboard/unified-master?range=week|month
// Identical for Admin and Owner - single unified executive view per spec
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: actor } = await supabase.from('user_profiles').select('id, role, is_active').eq('id', user.id).maybeSingle();
  if (!actor || actor.is_active === false || !isAdminRole(actor.role)) return NextResponse.json({ error: 'Forbidden: Admin/Owner only' }, { status: 403 });

  const office = await loadOfficeHours(supabase as any);
  const url = new URL(request.url);
  const rangeParam = url.searchParams.get('range') || 'week';
  const today = localDay(0);
  const weekAgo = localDay(-6);
  const now = new Date();
  const thisMonth = monthRange(now.getFullYear(), now.getMonth());
  const prevMonth = monthRange(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), now.getMonth() === 0 ? 11 : now.getMonth() - 1);
  const period = rangeParam === 'month' ? thisMonth : { from: weekAgo, to: today };
  const totalDays = Math.round((new Date(period.to).getTime() - new Date(period.from).getTime()) / 86400000) + 1;

  const [profilesRes, todayRes, periodRes, monthRes, expensesThisRes, expensesPrevRes, activityRes, leadsRes, callsRes, evalsRes, deductionsRes, notificationsRes] = await Promise.all([
    supabase.from('user_profiles').select('id, full_name, email, role, is_active, team_id').order('full_name'),
    supabase.from('attendance').select('user_id, check_in_time, check_out_time').eq('attendance_date', today),
    supabase.from('attendance').select('user_id, attendance_date, check_in_time, check_out_time').gte('attendance_date', period.from).lte('attendance_date', period.to),
    supabase.from('attendance').select('user_id, attendance_date, check_in_time, check_out_time').gte('attendance_date', thisMonth.from).lte('attendance_date', thisMonth.to),
    supabase.from('expenses').select('amount, expense_date, category').gte('expense_date', thisMonth.from).lte('expense_date', thisMonth.to),
    supabase.from('expenses').select('amount, expense_date, category').gte('expense_date', prevMonth.from).lte('expense_date', prevMonth.to),
    supabase.from('activity_log').select('user_id, action_type, detail, created_at').order('created_at', { ascending: false }).limit(80),
    supabase.from('leads').select('crm_status, lead_status, assigned_to'),
    supabase.from('call_logs').select('user_id, outcome, is_valid, created_at, duration_seconds').gte('created_at', `${period.from}T00:00:00`).lte('created_at', `${period.to}T23:59:59.999`),
    supabase.from('evaluations').select('employee_id, dress_code_rating, date').gte('date', period.from).lte('date', period.to),
    supabase.from('payroll_deductions').select('id, user_id, reason, amount, month_year, is_applied, source_ref, created_at').order('created_at', { ascending: false }).limit(50),
    supabase.from('notifications').select('id, user_id, title, message, is_read, created_at').order('created_at', { ascending: false }).limit(20),
  ]);

  const profiles = (profilesRes.data || []).filter((p: any) => p.is_active !== false);
  const employees = profiles.filter((p: any) => p.role !== 'owner');
  const totalEmployees = employees.length;

  // Today's attendance
  const todayMap: Record<string, any> = {};
  (todayRes.data || []).forEach((r: any) => (todayMap[r.user_id] = r));
  let presentToday = 0, lateToday = 0;
  employees.forEach((e: any) => {
    const rec = todayMap[e.id];
    if (rec?.check_in_time) {
      presentToday++;
      if (statusOf(rec, office.toleranceMinutes) === 'late') lateToday++;
    }
  });
  const absentToday = totalEmployees - presentToday;

  // Period attendance aggregates
  const periodByUser: Record<string, { present: number; late: number; hours: number }> = {};
  const dayKeys = new Set<string>();
  (periodRes.data || []).forEach((r: any) => {
    dayKeys.add(r.attendance_date);
    const s = statusOf(r, office.toleranceMinutes);
    const cur = periodByUser[r.user_id] || { present: 0, late: 0, hours: 0 };
    if (r.check_in_time) cur.present++;
    if (s === 'late') cur.late++;
    cur.hours += durationHours(r.check_in_time, r.check_out_time);
    periodByUser[r.user_id] = cur;
  });
  const workingDays = Math.max(1, dayKeys.size);
  const totalHours = Object.values(periodByUser).reduce((s, v) => s + v.hours, 0);
  const avgHours = employees.length ? totalHours / employees.length : 0;

  // Calls grouped
  const callsByUser = new Map<string, any[]>();
  (callsRes.data || []).forEach((c: any) => {
    if (!callsByUser.has(c.user_id)) callsByUser.set(c.user_id, []);
    callsByUser.get(c.user_id)!.push(c);
  });
  // Evaluations grouped
  const evalByUser = new Map<string, any[]>();
  (evalsRes.data || []).forEach((e: any) => {
    if (!evalByUser.has(e.employee_id)) evalByUser.set(e.employee_id, []);
    evalByUser.get(e.employee_id)!.push(e);
  });

  // Leaderboard weighted 40/30/30
  const leaderboard = employees.map((e: any) => {
    const v = periodByUser[e.id] || { present: 0, late: 0, hours: 0 };
    const calls = callsByUser.get(e.id) || [];
    const validCalls = calls.filter((c: any) => c.is_valid !== false).length;
    const totalCalls = calls.length;
    const evals = evalByUser.get(e.id) || [];
    const avgDress = evals.length ? evals.reduce((s: number, x: any) => s + x.dress_code_rating, 0) / evals.length : null;
    const c = callScore(totalCalls, validCalls);
    const a = attendanceScore(v.present, totalDays, v.late);
    const d = dressScore(avgDress);
    const total = Math.round(c * 0.40 + a * 0.30 + d * 0.30);
    return { id: e.id, name: e.full_name || e.email, role: e.role, email: e.email, scores: { callScore: c, attendanceScore: a, dressScore: d, totalScore: total }, totalScore: total, metrics: { totalCalls, validCalls, presentDays: v.present, avgDress } };
  }).sort((a: any, b: any) => b.totalScore - a.totalScore).map((r: any, i: number) => ({ ...r, rank: i + 1 }));

  // Expenses & pipeline
  const totalThis = (expensesThisRes.data || []).reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
  const totalPrev = (expensesPrevRes.data || []).reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
  const changePct = totalPrev ? Math.round(((totalThis - totalPrev) / totalPrev) * 100) : 0;
  const byCategory: Record<string, number> = {};
  (expensesThisRes.data || []).forEach((e: any) => { byCategory[e.category] = (byCategory[e.category] || 0) + (Number(e.amount) || 0); });
  const categories = Object.entries(byCategory).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);

  const leadsByStage: Record<string, number> = {};
  (leadsRes.data || []).forEach((l: any) => {
    const s = String(l.crm_status || l.lead_status || 'Unknown');
    leadsByStage[s] = (leadsByStage[s] || 0) + 1;
  });
  const leadSummary = { total: (leadsRes.data || []).length, byStage: Object.entries(leadsByStage).map(([stage, count]) => ({ stage, count })).sort((a, b) => b.count - a.count) };

  const profilesById: Record<string, string> = {};
  profiles.forEach((p: any) => (profilesById[p.id] = p.full_name || p.email));
  const timeline = (activityRes.data || []).map((a: any) => ({ id: a.id, employee: profilesById[a.user_id] || 'Unknown', action: a.action_type, detail: a.detail || '', createdAt: a.created_at }));

  // Deductions & notifications for hub
  const recentDeductions = deductionsRes.data || [];
  const recentNotifications = notificationsRes.data || [];
  const pendingDeductions = recentDeductions.filter((d: any) => !d.is_applied).length;

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    range: rangeParam,
    period,
    actor: { id: actor.id, role: actor.role },
    summary: {
      totalEmployees, presentToday, absentToday, lateToday,
      avgHours: Math.round(avgHours * 10) / 10,
      totalHours: Math.round(totalHours * 10) / 10,
      attendanceRate: Math.round((Object.values(periodByUser).reduce((s, v) => s + v.present, 0) / Math.max(1, workingDays * totalEmployees)) * 100),
      expensesThisMonth: totalThis, expensesPrevMonth: totalPrev, expensesChangePct: changePct,
      totalLeads: leadSummary.total,
      pendingDeductions,
    },
    attendanceOverview: { present: presentToday, absent: absentToday, late: lateToday, leave: 0 },
    leaderboard, // weighted 40/30/30
    leadSummary,
    expenses: { totalThis, totalPrev, changePct, categories },
    timeline,
    deductions: { recent: recentDeductions, pending: pendingDeductions, total: recentDeductions.length },
    notifications: { recent: recentNotifications, unread: recentNotifications.filter((n: any) => !n.is_read).length },
    operationalControls: {
      canEvaluateDressCode: true,
      canAssignLeads: true,
      canRotateLeads: true,
      canApproveFlaggedCalls: true,
    },
  });
}
