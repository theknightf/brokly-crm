import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

function pad(n: number) { return String(n).padStart(2, '0'); }
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  return {
    from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`,
    to: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`,
  };
}
function durationSeconds(a?: string | null, b?: string | null): number {
  if (!a || !b) return 0;
  const x = new Date(a).getTime();
  const y = new Date(b).getTime();
  if (Number.isNaN(x) || Number.isNaN(y) || y < x) return 0;
  return Math.round((y - x) / 1000);
}
function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function daysInRange(start: string, end: string) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
}
function callScore(totalCalls: number, converted: number) {
  const vol = Math.min(100, (totalCalls / 20) * 100);
  const conv = totalCalls > 0 ? Math.min(100, (converted / totalCalls) * 100) : 0;
  if (converted === 0 && totalCalls > 0) return Math.round(vol);
  return Math.round(vol * 0.6 + conv * 0.4);
}
function attendanceScore(present: number, total: number, late: number) {
  if (total === 0) return 0;
  const rate = (present / total) * 100;
  const punctual = present > 0 ? ((present - late) / present) * 100 : 0;
  return Math.round(Math.max(0, rate * 0.5 + punctual * 0.5));
}
function dressScore(avg: number | null) {
  if (avg == null) return 0;
  return Math.round((avg / 5) * 100);
}

// GET /api/employees/:id/profile-360?from=&to=
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerClient();
    const { data: { user: actorUser } } = await supabase.auth.getUser();
    if (!actorUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: actor } = await supabase.from('user_profiles').select('role, is_active').eq('id', actorUser.id).maybeSingle();
    // Allow self view OR admin/owner full drill-down per RBAC spec
    const { id: employeeId } = await params;
    const isSelf = actorUser.id === employeeId;
    const isPrivileged = actor && actor.is_active !== false && isAdminRole(actor.role);
    if (!isSelf && !isPrivileged) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const url = new URL(request.url);
    const { from: fbFrom, to: fbTo } = defaultRange();
    const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('from') || '') ? url.searchParams.get('from')! : fbFrom;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('to') || '') ? url.searchParams.get('to')! : fbTo;
    const startISO = `${from}T00:00:00`;
    const endISO = `${to}T23:59:59.999`;
    const todayStr = new Date().toISOString().slice(0, 10);
    const totalDays = daysInRange(from, to);

    const [empRes, attRes, callsRes, evalRes, leadsRes, followRes, dailyRes, activityRes] = await Promise.all([
      (supabase as any).from('user_profiles').select('id, full_name, email, role, phone, is_active, created_at, team_id').eq('id', employeeId).maybeSingle(),
      (supabase as any).from('attendance').select('*').eq('user_id', employeeId).gte('attendance_date', from).lte('attendance_date', to).order('attendance_date', { ascending: false }),
      (supabase as any).from('call_logs').select('*').eq('user_id', employeeId).gte('created_at', startISO).lte('created_at', endISO).order('created_at', { ascending: false }).limit(500),
      (supabase as any).from('evaluations').select('*, evaluator:user_profiles!evaluations_evaluator_id_fkey(full_name)').eq('employee_id', employeeId).gte('date', from).lte('date', to).order('date', { ascending: false }),
      (supabase as any).from('leads').select('id, lead_status, follow_up_due, created_at').or(`created_by.eq.${employeeId},assigned_to.eq.${employeeId}`).limit(200),
      (supabase as any).from('follow_ups').select('*').eq('created_by', employeeId).limit(200),
      (supabase as any).from('user_daily_activity').select('activity_date, total_active_seconds').eq('user_id', employeeId).gte('activity_date', from).lte('activity_date', to),
      (supabase as any).from('activity_log').select('user_id, action_type, created_at').eq('user_id', employeeId).gte('created_at', startISO).lte('created_at', endISO),
    ]);

    if (!empRes.data) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    const employee = empRes.data;
    const attendance = attRes.data || [];
    const calls = callsRes.data || [];
    const evaluations = evalRes.data || [];
    const leads = leadsRes.data || [];
    const followups = followRes.data || [];
    const daily = dailyRes.data || [];
    const activity = activityRes.data || [];

    // Metrics
    const presentDays = attendance.length;
    const lateDays = attendance.filter((a: any) => {
      if (!a.check_in_time) return false;
      const t = new Date(a.check_in_time);
      return t.getUTCHours() * 60 + t.getUTCMinutes() > 12 * 60 + 30;
    }).length;
    const workSec = attendance.reduce((s: number, r: any) => s + durationSeconds(r.check_in_time, r.check_out_time), 0);
    const activeSeconds = daily.reduce((s: number, r: any) => s + (r.total_active_seconds || 0), 0);

    const totalCalls = calls.length;
    const converted = calls.filter((c: any) => ['Successful', 'Converted', 'Won'].includes(c.outcome || '')).length;
    const convertedLeads = leads.filter((l: any) => l.lead_status === 'Won').length;

    const avgDress = evaluations.length > 0 ? evaluations.reduce((s: number, e: any) => s + e.dress_code_rating, 0) / evaluations.length : null;
    const dressPass = evaluations.filter((e: any) => e.dress_code_rating >= 3).length;
    const dressPassRate = evaluations.length > 0 ? Math.round((dressPass / evaluations.length) * 100) : 0;

    const cScore = callScore(totalCalls, converted || convertedLeads);
    const aScore = attendanceScore(presentDays, totalDays, lateDays);
    const dScore = dressScore(avgDress);
    const totalScore = Math.round(cScore * 0.40 + aScore * 0.30 + dScore * 0.30);

    const grade = totalScore >= 90 ? 'Excellent' : totalScore >= 75 ? 'Good' : totalScore >= 60 ? 'Average' : totalScore >= 40 ? 'Needs Improvement' : 'Critical';

    // Build timeline unified
    const timeline: any[] = [];
    calls.forEach((c: any) => timeline.push({ at: c.created_at, type: 'call', label: `${c.channel || 'Call'}${c.outcome ? ` · ${c.outcome}` : ''}`, detail: c.contact_name || '' }));
    attendance.forEach((a: any) => timeline.push({ at: a.check_in_time || a.attendance_date, type: 'attendance', label: a.check_out_time ? 'Attendance' : 'Checked in', detail: fmtDur(durationSeconds(a.check_in_time, a.check_out_time)) }));
    evaluations.forEach((e: any) => timeline.push({ at: e.date + 'T12:00:00', type: 'evaluation', label: `Dress Code ${e.dress_code_rating}/5`, detail: e.notes || (e.behavioral_flags || []).join(', ') }));
    timeline.sort((a, b) => (a.at > b.at ? -1 : 1));

    // Score history (last 6 months from sales_performance if exists)
    let scoreHistory: any[] = [];
    try {
      const { data: hist } = await (supabase as any).from('sales_performance').select('period_start, score, grade').eq('user_id', employeeId).order('period_start', { ascending: false }).limit(6);
      scoreHistory = hist || [];
    } catch {}

    return NextResponse.json({
      employee: {
        id: employee.id,
        full_name: employee.full_name || employee.email,
        email: employee.email,
        role: employee.role,
        phone: employee.phone,
        is_active: employee.is_active,
        team_id: employee.team_id,
      },
      from,
      to,
      generated_at: new Date().toISOString(),
      scores: {
        callScore: cScore,
        attendanceScore: aScore,
        dressScore: dScore,
        totalScore,
        grade,
        formula: 'Total = Call*0.40 + Attendance*0.30 + Dress*0.30',
      },
      category_scores: {
        'Call Volume & Conversion': cScore,
        'Attendance & Punctuality': aScore,
        'Dress Code & Adherence': dScore,
      },
      summary: {
        days_worked: presentDays,
        total_days: totalDays,
        late_days: lateDays,
        work_hours_seconds: workSec,
        work_hours_label: fmtDur(workSec),
        active_hours_label: fmtDur(activeSeconds),
        totalCalls,
        convertedLeads: converted || convertedLeads,
        evaluations_count: evaluations.length,
        avg_dress_rating: avgDress ? Math.round(avgDress * 10) / 10 : null,
        dress_pass_rate: dressPassRate,
        actions: activity.length,
        leads_created: leads.filter((l: any) => (l as any).created_by === employeeId).length,
        overdue_followups: followups.filter((f: any) => ['Pending', 'In Progress', 'Overdue'].includes(f.follow_up_status) && new Date(f.due_date + 'T23:59:59') < new Date(todayStr + 'T00:00:00')).length,
      },
      attendance,
      calls,
      evaluations,
      leads,
      followups,
      timeline: timeline.slice(0, 400),
      scoreHistory,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
