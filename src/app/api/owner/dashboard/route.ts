import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';
import { loadOfficeHours } from '@/lib/officeHours';

export const dynamic = 'force-dynamic';

function isSchemaError(msg?: string): boolean {
  if (!msg) return false;
  return /relation .* does not exist|column .* does not exist|syntax error|could not find the table|in the schema cache|does not exist/i.test(
    msg
  );
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function localDay(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${pad(month + 1)}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return { from, to: `${year}-${pad(month + 1)}-${pad(lastDay)}` };
}

function minutesOfDay(iso: string | null | undefined): number {
  if (!iso) return -1;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return -1;
  return d.getHours() * 60 + d.getMinutes();
}

function durationHours(checkIn?: string | null, checkOut?: string | null): number {
  if (!checkIn || !checkOut) return 0;
  const a = new Date(checkIn).getTime();
  const b = new Date(checkOut).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return (b - a) / 3600000;
}

function statusOf(
  rec: { check_in_time?: string | null; check_out_time?: string | null },
  toleranceMinutes: number
): string {
  if (!rec?.check_in_time) return 'absent';
  const min = minutesOfDay(rec.check_in_time);
  if (min < 0) return 'present';
  return min <= toleranceMinutes ? 'present' : 'late';
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: actor } = await supabase
    .from('user_profiles')
    .select('id, role, full_name, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!actor || actor.is_active === false || !isAdminRole(actor.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const office = await loadOfficeHours(supabase);

  const url = new URL(request.url);
  const rangeParam = url.searchParams.get('range') || 'week';
  const today = localDay(0);
  const yesterday = localDay(-1);
  const weekAgo = localDay(-6);
  const now = new Date();
  const thisMonth = monthRange(now.getFullYear(), now.getMonth());
  const prevMonth = monthRange(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), now.getMonth() === 0 ? 11 : now.getMonth() - 1);

  const period = rangeParam === 'month' ? thisMonth : { from: weekAgo, to: today };

  const [profilesRes, todayRes, periodRes, prevMonthRes, monthRes, expensesThisRes, expensesPrevRes, activityRes, leadsRes] =
    await Promise.all([
      supabase
        .from('user_profiles')
        .select('id, full_name, email, role, is_active, team_id')
        .order('full_name'),
      supabase
        .from('attendance')
        .select('user_id, check_in_time, check_out_time')
        .eq('attendance_date', today),
      supabase
        .from('attendance')
        .select('user_id, attendance_date, check_in_time, check_out_time')
        .gte('attendance_date', period.from)
        .lte('attendance_date', period.to),
      supabase
        .from('attendance')
        .select('user_id, attendance_date, check_in_time, check_out_time')
        .gte('attendance_date', prevMonth.from)
        .lte('attendance_date', prevMonth.to),
      supabase
        .from('attendance')
        .select('user_id, attendance_date, check_in_time, check_out_time')
        .gte('attendance_date', thisMonth.from)
        .lte('attendance_date', thisMonth.to),
      supabase.from('expenses').select('amount, expense_date, category').gte('expense_date', thisMonth.from).lte('expense_date', thisMonth.to),
      supabase.from('expenses').select('amount, expense_date, category').gte('expense_date', prevMonth.from).lte('expense_date', prevMonth.to),
      supabase
        .from('activity_log')
        .select('user_id, action_type, detail, meta, entity_type, created_at')
        .order('created_at', { ascending: false })
        .limit(80),
      supabase.from('leads').select('crm_status, lead_status'),
    ]);

  const leadsByStage: Record<string, number> = {};
  (leadsRes.data || []).forEach((lead: any) => {
    const stage = String(lead.crm_status || lead.lead_status || 'Unknown');
    leadsByStage[stage] = (leadsByStage[stage] || 0) + 1;
  });
  const leadStageSummary = Object.entries(leadsByStage)
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count);

  const profiles = (profilesRes.data || []).filter((p: any) => p.is_active !== false);
  const employees = profiles.filter((p: any) => p.role !== 'owner' && p.role !== 'admin');
  const totalEmployees = employees.length;

  // ── Today's attendance ────────────────────────────────────────────────
  const todayMap: Record<string, any> = {};
  (todayRes.data || []).forEach((r: any) => (todayMap[r.user_id] = r));
  let presentToday = 0;
  let lateToday = 0;
  let notCheckedInToday = 0;
  const attentionToday: string[] = [];
  employees.forEach((e: any) => {
    const rec = todayMap[e.user_id];
    if (rec?.check_in_time) {
      presentToday += 1;
      if (statusOf(rec, office.toleranceMinutes) === 'late') {
        lateToday += 1;
        attentionToday.push(`${e.full_name} is late today`);
      }
    } else {
      notCheckedInToday += 1;
      attentionToday.push(`${e.full_name} has not checked in today`);
    }
  });
  const absentToday = totalEmployees - presentToday;

  // ── Period stats (attendance rate, hours, overtime) ──────────────────
  const periodByUser: Record<string, { present: number; late: number; hours: number }> = {};
  const dayKeys = new Set<string>();
  (periodRes.data || []).forEach((r: any) => {
    dayKeys.add(r.attendance_date);
    const s = statusOf(r, office.toleranceMinutes);
    const cur = periodByUser[r.user_id] || { present: 0, late: 0, hours: 0 };
    if (r.check_in_time) cur.present += 1;
    if (s === 'late') cur.late += 1;
    cur.hours += durationHours(r.check_in_time, r.check_out_time);
    periodByUser[r.user_id] = cur;
  });
  const workingDays = Math.max(1, dayKeys.size);
  const totalHours = Object.values(periodByUser).reduce((s, v) => s + v.hours, 0);
  const avgHours = employees.length ? totalHours / Math.max(1, employees.length) : 0;

  let totalOvertime = 0;
  (periodRes.data || []).forEach((r: any) => {
    const out = minutesOfDay(r.check_out_time);
    if (out > office.endMinutes) totalOvertime += out - office.endMinutes;
  });

  // Attendance rate = present / (workingDays * employees)
  const expectedSlots = workingDays * Math.max(1, employees.length);
  const presentSlots = Object.values(periodByUser).reduce((s, v) => s + v.present, 0);
  const attendanceRate = expectedSlots ? Math.round((presentSlots / expectedSlots) * 100) : 0;
  const lateDays = Object.values(periodByUser).reduce((s, v) => s + v.late, 0);
  const lateRate = presentSlots ? Math.round((lateDays / presentSlots) * 100) : 0;
  const absenceRate = Math.max(0, 100 - attendanceRate);

  // Attention needed — low working hours this period
  const lowHours = employees.filter((e: any) => {
    const v = periodByUser[e.id];
    return v && v.hours > 0 && v.hours < 6;
  });
  const attentionList: { id: string; text: string; type: string }[] = attentionToday.map((t) => ({
    id: 'today',
    text: t,
    type: 'today',
  }));
  lowHours.forEach((e: any) => {
    attentionList.push({
      id: e.id,
      text: `${e.full_name} has low working hours (${Math.round(periodByUser[e.id].hours * 10) / 10}h this period)`,
      type: 'low-hours',
    });
  });

  // ── Employee performance list ─────────────────────────────────────────
  const performance = employees.map((e: any) => {
    const v = periodByUser[e.id];
    const present = v?.present || 0;
    const rate = workingDays ? Math.round((present / workingDays) * 100) : 0;
    const hours = v?.hours || 0;
    const activity = (activityRes.data || []).filter((a: any) => a.user_id === e.id).length;
    const lateD = v?.late || 0;
    let perf = '—';
    if (present > 0) {
      const score = rate * 0.6 + Math.min(100, (hours / 8) * 100) * 0.4;
      perf = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Average' : 'Needs Attention';
    }
    return {
      id: e.id,
      name: e.full_name || e.email,
      role: e.role,
      email: e.email,
      attendanceRate: rate,
      avgHours: Math.round(hours * 10) / 10,
      activity,
      lateDays: lateD,
      status: present === 0 ? 'No attendance' : perf,
      isActive: e.is_active,
    };
  });
  performance.sort((a: any, b: any) => (b.attendanceRate || 0) - (a.attendanceRate || 0));
  const bestEmployee = performance.find((p: any) => p.attendanceRate > 0);
  const needsAttention = performance.filter((p: any) => p.attendanceRate < 60 || p.lateDays > 3);
  const mostActive = [...performance].sort((a: any, b: any) => b.activity - a.activity)[0];

  // ── Expenses ──────────────────────────────────────────────────────────
  const expensesThis = toExpenses(expensesThisRes).map((e: any) => ({
    amount: Number(e.amount) || 0,
    expense_date: e.expense_date,
    category: e.category,
  }));
  const expensesPrev = toExpenses(expensesPrevRes).map((e: any) => ({
    amount: Number(e.amount) || 0,
    expense_date: e.expense_date,
    category: e.category,
  }));
  const totalThis = expensesThis.reduce((s: number, e: any) => s + e.amount, 0);
  const totalPrev = expensesPrev.reduce((s: number, e: any) => s + e.amount, 0);
  const changePct = totalPrev > 0 ? Math.round(((totalThis - totalPrev) / totalPrev) * 100) : 0;
  const byCategory: Record<string, number> = {};
  expensesThis.forEach((e: any) => {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  });
  const categories = Object.entries(byCategory)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
  const largestCategory = categories[0] || null;

  // ── Recent activity timeline ──────────────────────────────────────────
  const profilesById: Record<string, string> = {};
  profiles.forEach((p: any) => (profilesById[p.id] = p.full_name || p.email));
  const timeline = (activityRes.data || []).map((a: any) => ({
    id: a.id,
    employee: profilesById[a.user_id] || 'Unknown',
    action: a.action_type,
    detail: a.detail || '',
    entityType: a.entity_type || '',
    createdAt: a.created_at,
  }));

  // ── Monthly summary (attendance, team perf, expenses) ────────────────
  const monthByUser: Record<string, { present: number; late: number; hours: number }> = {};
  (monthRes.data || []).forEach((r: any) => {
    const s = statusOf(r, office.toleranceMinutes);
    const cur = monthByUser[r.user_id] || { present: 0, late: 0, hours: 0 };
    if (r.check_in_time) cur.present += 1;
    if (s === 'late') cur.late += 1;
    cur.hours += durationHours(r.check_in_time, r.check_out_time);
    monthByUser[r.user_id] = cur;
  });
  const monthWorkingDays = Math.max(1, new Set((monthRes.data || []).map((r: any) => r.attendance_date)).size);
  const monthSlots = monthWorkingDays * Math.max(1, employees.length);
  const monthPresent = Object.values(monthByUser).reduce((s, v) => s + v.present, 0);
  const monthLate = Object.values(monthByUser).reduce((s, v) => s + v.late, 0);
  const monthHours = Object.values(monthByUser).reduce((s, v) => s + v.hours, 0);
  const monthRate = monthSlots ? Math.round((monthPresent / monthSlots) * 100) : 0;
  const monthLateRate = monthPresent ? Math.round((monthLate / monthPresent) * 100) : 0;
  const monthAbsenceRate = Math.max(0, 100 - monthRate);
  const monthAvgHours = employees.length ? monthHours / employees.length : 0;

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    range: rangeParam,
    period: { from: period.from, to: period.to },
    summary: {
      totalEmployees,
      presentToday,
      absentToday,
      lateToday,
      avgHours: Math.round(avgHours * 10) / 10,
      totalHours: Math.round(totalHours * 10) / 10,
      overtimeMinutes: totalOvertime,
      attendanceRate,
      absenceRate,
      lateRate,
      expensesThisMonth: totalThis,
      expensesPrevMonth: totalPrev,
      expensesChangePct: changePct,
    },
    attendanceOverview: {
      present: presentToday,
      absent: absentToday,
      late: lateToday,
      leave: 0,
    },
    attentionNeeded: attentionList,
    performance,
    bestEmployee: bestEmployee
      ? { id: bestEmployee.id, name: bestEmployee.name, attendanceRate: bestEmployee.attendanceRate, avgHours: bestEmployee.avgHours }
      : null,
    needsAttention: needsAttention.slice(0, 5),
    mostActive: mostActive && mostActive.activity > 0 ? { id: mostActive.id, name: mostActive.name, activity: mostActive.activity } : null,
    expenses: {
      totalThis,
      totalPrev,
      changePct,
      categories,
      largestCategory,
    },
    monthlySummary: {
      attendanceRate: monthRate,
      absenceRate: monthAbsenceRate,
      lateRate: monthLateRate,
      avgHours: Math.round(monthAvgHours * 10) / 10,
      totalHours: Math.round(monthHours * 10) / 10,
    },
    leadSummary: {
      total: (leadsRes.data || []).length,
      byStage: leadStageSummary,
    },
    timeline,
  });
}

function toExpenses(res: { data?: any[] | null; error?: any } | null | undefined): any[] {
  return res?.data || [];
}
