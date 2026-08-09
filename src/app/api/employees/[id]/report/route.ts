import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

function isSchemaError(msg?: string): boolean {
  if (!msg) return false;
  return /relation .* does not exist|column .* does not exist|syntax error|could not find the table|in the schema cache|does not exist/i.test(
    msg
  );
}

const CALL_TYPES = ['Call', 'Video Call'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  return {
    from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`,
    to: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
      new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    )}`,
  };
}

function durationSeconds(checkInAt?: string | null, checkOutAt?: string | null): number {
  if (!checkInAt || !checkOutAt) return 0;
  const a = new Date(checkInAt).getTime();
  const b = new Date(checkOutAt).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 1000);
}

function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// GET /api/employees/[id]/report?from=YYYY-MM-DD&to=YYYY-MM-DD
// Admin-only aggregated report for one employee.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user: actorUser },
    } = await supabase.auth.getUser();
    if (!actorUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: actor } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', actorUser.id)
      .maybeSingle();
    if (!actor || !isAdminRole(actor.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const resolved = await params;
    const employeeId = resolved.id;

    const url = new URL(request.url);
    const { from: fallbackFrom, to: fallbackTo } = defaultRange();
    const fromParam = url.searchParams.get('from') || '';
    const toParam = url.searchParams.get('to') || '';
    const from = /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : fallbackFrom;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? toParam : fallbackTo;
    const startISO = `${from}T00:00:00`;
    const endISO = `${to}T23:59:59.999`;
    const todayStr = new Date().toISOString().slice(0, 10);

    const [{ data: employee }, attendanceRes, leadsRes, callsRes, followRes, visitsRes, expensesRes, activityRes, dailyRes, eventsRes, auditRes] =
      await Promise.all([
        supabase
          .from('user_profiles')
          .select('id, full_name, email, role, phone, is_active, created_at')
          .eq('id', employeeId)
          .maybeSingle(),
        supabase
          .from('attendance')
          .select('*')
          .eq('user_id', employeeId)
          .gte('attendance_date', from)
          .lte('attendance_date', to)
          .order('attendance_date', { ascending: false }),
        supabase
          .from('leads')
          .select('*')
          .or(`created_by.eq.${employeeId},assigned_to.eq.${employeeId}`)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('call_logs')
          .select('*')
          .eq('user_id', employeeId)
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('follow_ups')
          .select('*')
          .eq('created_by', employeeId)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('site_visits')
          .select('*')
          .eq('user_id', employeeId)
          .lte('check_in_at', endISO)
          .gte('check_in_at', startISO)
          .order('check_in_at', { ascending: false })
          .limit(300),
        supabase.from('expenses').select('*').eq('created_by', employeeId).order('created_at', { ascending: false }).limit(500),
        supabase
          .from('activity_log')
          .select('user_id, action_type, created_at')
          .eq('user_id', employeeId)
          .gte('created_at', startISO)
          .lte('created_at', endISO),
        supabase
          .from('user_daily_activity')
          .select('activity_date, total_active_seconds')
          .eq('user_id', employeeId)
          .gte('activity_date', from)
          .lte('activity_date', to),
        supabase
          .from('site_visit_events')
          .select('*')
          .eq('user_id', employeeId)
          .lte('created_at', endISO)
          .gte('created_at', startISO)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('audit_log')
          .select('*')
          .eq('user_id', employeeId)
          .lte('created_at', endISO)
          .gte('created_at', startISO)
          .order('created_at', { ascending: false })
          .limit(500),
      ]);

    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const attendance = (attendanceRes.data || attendanceRes.error ? attendanceRes.data : []) || [];
    const leads = leadsRes.error ? [] : leadsRes.data || [];
    const calls = callsRes.error ? [] : callsRes.data || [];
    const followups = followRes.error ? [] : followRes.data || [];
    const visits = visitsRes.error ? [] : visitsRes.data || [];
    const expenses = expensesRes.error ? [] : expensesRes.data || [];
    const activity = activityRes.error ? [] : activityRes.data || [];
    const daily = dailyRes.error ? [] : dailyRes.data || [];
    const events = eventsRes.error ? [] : eventsRes.data || [];
    const audit = auditRes.error ? [] : auditRes.data || [];

    const activeSeconds = daily.reduce((s: number, r: any) => s + (r.total_active_seconds || 0), 0);
    const actions = activity.length;

    const myLeads = leads;
    const leadsCreated = myLeads.filter((l: any) => l.created_by === employeeId).length;
    const leadsAssigned = myLeads.filter((l: any) => l.assigned_to === employeeId).length;

    const callsCount = calls.length;
    const whatsappCount = calls.filter((c: any) => c.channel === 'WhatsApp').length;
    const emailCount = calls.filter((c: any) => c.channel === 'Email').length;
    const callOnlyCount = calls.filter((c: any) => CALL_TYPES.includes(c.channel || '')).length;

    let callSeconds = 0;
    calls.forEach((c: any) => (callSeconds += Number(c.duration_seconds) || 0));

    const activeFollowups = followups.filter((f: any) => f.follow_up_status !== 'Cancelled');
    const totalFollowups = activeFollowups.length;
    const completedFollowups = activeFollowups.filter(
      (f: any) => f.follow_up_status === 'Completed' || f.completed_at
    ).length;
    const overdueFollowups = activeFollowups.filter(
      (f: any) =>
        (f.follow_up_status === 'Pending' ||
          f.follow_up_status === 'In Progress' ||
          f.follow_up_status === 'Overdue') &&
        new Date(f.due_date + 'T23:59:59') < new Date(todayStr + 'T00:00:00')
    ).length;

    const overdueLeads = myLeads.filter(
      (l: any) =>
        l.lead_status !== 'Won' &&
        l.lead_status !== 'Lost' &&
        l.follow_up_due &&
        new Date(l.follow_up_due + 'T23:59:59') < new Date(todayStr + 'T00:00:00')
    ).length;

    const visitsCompleted = visits.filter((v: any) => v.status === 'completed' || v.check_out_at).length;
    const visitsTotal = visits.filter((v: any) => v.status !== 'cancelled' && v.status !== 'no_show').length;
    const visitsVerified = visits.filter(
      (v: any) => (v.verified || v.within_radius) && v.check_out_at
    ).length;

    const expenseTotal = expenses.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);

    const workSec = attendance.reduce((s: number, r: any) => s + durationSeconds(r.check_in_time, r.check_out_time), 0);
    const daysWorked = attendance.length;

    // ---- Scoring (0-100) explained ----
    const followupRate = totalFollowups > 0 ? Math.round((completedFollowups / totalFollowups) * 100) : 0;

    const workHoursReq = 40;
    const hoursWorked = workSec / 3600;
    const catAttendance = Math.min(25, Math.round(25 * Math.min(1, hoursWorked / workHoursReq)));
    const catCalls = Math.min(20, Math.min(20, Math.round(callOnlyCount / 10) * 2));
    const catSiteVisits = Math.min(15, Math.min(15, visitsCompleted * 5));
    const catFollowup = Math.min(15, Math.round(0.15 * followupRate));
    const catActivity = Math.min(15, Math.round(15 * Math.min(1, actions / 40)));
    const catContact =
      leadsAssigned > 0 || leadsCreated > 0
        ? Math.min(
            10,
            Math.round(
              10 * Math.min(1, callsCount / Math.max(1, leadsAssigned + leadsCreated))
            )
          )
        : 0;

    const base = catAttendance + catCalls + catSiteVisits + catFollowup + catActivity + catContact;
    const lost: { reason: string; points: number }[] = [];
    let score = base;

    if (overdueFollowups > 0) {
      const pts = Math.min(10, overdueFollowups * 2);
      lost.push({ reason: `${overdueFollowups} overdue follow-up${overdueFollowups > 1 ? 's' : ''}`, points: pts });
      score -= pts;
    }
    if (overdueLeads > 0) {
      const pts = Math.min(10, overdueLeads * 2);
      lost.push({ reason: `${overdueLeads} overdue lead${overdueLeads > 1 ? 's' : ''}`, points: pts });
      score -= pts;
    }
    if (leadsAssigned > 0 && leadsContactedCount(leads, calls) === 0) {
      const pts = 5;
      lost.push({ reason: 'No contact logged for assigned client base', points: pts });
      score -= pts;
    }
    if (hoursWorked < 8) {
      const pts = Math.min(8, Math.round((8 - hoursWorked) * 2));
      lost.push({ reason: 'Low logged attendance this period', points: pts });
      score -= pts;
    }
    score = Math.max(0, Math.min(100, score));

    function leadsContactedCount(ls: any[], cs: any[]): number {
      const em = new Set<string>();
      cs.forEach((c: any) => {
        if (c.entity_type === 'lead' && c.entity_id) em.add(c.entity_id);
      });
      return ls.filter((l: any) => em.has(l.id)).length;
    }

    const gradeFor = (s: number) =>
      s >= 90 ? 'Excellent' : s >= 75 ? 'Good' : s >= 60 ? 'Average' : s >= 40 ? 'Needs Improvement' : 'Critical';

    const category_scores: Record<string, number> = {
      'Attendance & Work Hours': catAttendance,
      Calls: catCalls,
      'Site Visits': catSiteVisits,
      'Follow-up Rate': catFollowup,
      'Activity Level': catActivity,
      'Client Contact': catContact,
    };

    // ---- Timeline (chronological, merged) ----
    const timeline: any[] = [];
    calls.forEach((c: any) =>
      timeline.push({
        at: c.created_at,
        type: 'call',
        label: `${c.channel || 'Call'}${c.outcome ? ` · ${c.outcome}` : ''}`,
        detail: c.contact_name || c.contact_phone || '',
      })
    );
    visits.forEach((v: any) =>
      timeline.push({
        at: v.check_in_at || v.created_at,
        type: 'site_visit',
        label: `Site visit ${v.status || ''}`.trim(),
        detail: v.project_name || v.lead_name || '',
      })
    );
    followups.forEach((f: any) =>
      timeline.push({
        at: f.created_at,
        type: 'followup',
        label: `Follow-up · ${f.follow_up_status || ''}`,
        detail: f.title || '',
      })
    );
    events.forEach((e: any) =>
      timeline.push({
        at: e.created_at,
        type: 'event',
        label: e.action || '',
        detail: e.detail || '',
      })
    );
    activity.forEach((a: any) =>
      timeline.push({
        at: a.created_at,
        type: 'action',
        label: 'Activity',
        detail: a.action_type || '',
      })
    );
    timeline.sort((a, b) => (a.at > b.at ? -1 : 1));
    timeline.slice(0, 400);

    return NextResponse.json({
      employee: {
        id: employee.id,
        full_name: employee.full_name || employee.email || 'Employee',
        email: employee.email,
        role: employee.role,
        phone: employee.phone,
        is_active: employee.is_active,
      },
      from,
      to,
      generated_at: new Date().toISOString(),
      summary: {
        days_worked: daysWorked,
        work_hours_seconds: workSec,
        work_hours_label: fmtDur(workSec),
        hours_worked: Math.round(hoursWorked * 100) / 100,
        active_hours_label: fmtDur(activeSeconds),
        actions,
        leads_created: leadsCreated,
        leads_assigned: leadsAssigned,
        calls: callOnlyCount,
        whatsapp: whatsappCount,
        emails: emailCount,
        contact_messages: calls.length,
        call_hours_label: fmtDur(callSeconds),
        followups: totalFollowups,
        followups_completed: completedFollowups,
        followups_overdue: overdueFollowups,
        followup_rate: followupRate,
        overdue_leads: overdueLeads,
        site_visits: visitsTotal,
        site_visits_completed: visitsCompleted,
        site_visits_verified: visitsVerified,
        expenses_total: Math.round(expenseTotal * 100) / 100,
      },
      score,
      grade: gradeFor(score),
      category_scores,
      lost_points: lost,
      attendance,
      leads,
      calls,
      followups,
      visits,
      expenses,
      timeline,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
