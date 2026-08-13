import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

const SALES_ROLES = ['broker', 'branch_manager', 'senior_agent', 'agent', 'telecaller'];
const CALL_TYPES = ['Call', 'Video Call'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function fmt(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfPeriod(period: string, ref: Date): { start: string; end: string } {
  if (period === 'day') return { start: fmt(ref), end: fmt(ref) };
  if (period === 'week') {
    const dow = (ref.getDay() + 6) % 7;
    const s = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - dow);
    const e = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - dow + 6);
    return { start: fmt(s), end: fmt(e) };
  }
  const s = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const e = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { start: fmt(s), end: fmt(e) };
}

function gradeFor(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Average';
  if (score >= 40) return 'Needs Improvement';
  return 'Critical';
}

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: actor } = await supabase
    .from('user_profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!actor || actor.is_active === false || !isAdminRole(actor.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const db = serviceKey
    ? createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : supabase;

  const url = new URL(request.url);
  const period = url.searchParams.get('period') || 'day';
  const refStr = url.searchParams.get('date');
  const ref =
    refStr && /^\d{4}-\d{2}-\d{2}$/.test(refStr) ? new Date(`${refStr}T00:00:00`) : new Date();
  if (!['day', 'week', 'month'].includes(period)) {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
  }

  const { start, end } = startOfPeriod(period, ref);
  const startISO = `${start}T00:00:00.000Z`;
  const endISO = `${end}T23:59:59.999Z`;
  const todayStr = new Date().toISOString().slice(0, 10);

  const [
    usersRes,
    leadsRes,
    followRes,
    commentsRes,
    actionRes,
    activityRes,
    sessionsRes,
    historyRes,
  ] = await Promise.all([
    db.from('user_profiles').select('id, full_name, email, role, is_active'),
    db
      .from('leads')
      .select(
        'id, name, created_by, created_at, follow_up_due, lead_status, last_contact, assigned_to'
      )
      .gte('created_at', startISO)
      .lte('created_at', endISO),
    db
      .from('follow_ups')
      .select(
        'id, title, created_by, follow_up_type, follow_up_status, due_date, completed_at, created_at'
      ),
    db
      .from('lead_comments')
      .select('lead_id, user_id, created_at')
      .gte('created_at', startISO)
      .lte('created_at', endISO),
    db
      .from('activity_log')
      .select('user_id, created_at')
      .gte('created_at', startISO)
      .lte('created_at', endISO),
    db
      .from('user_daily_activity')
      .select('user_id, activity_date, total_active_seconds')
      .gte('activity_date', start)
      .lte('activity_date', end),
    db
      .from('user_sessions')
      .select('user_id, created_at')
      .gte('created_at', startISO)
      .lte('created_at', endISO),
    db
      .from('sales_performance')
      .select('*')
      .eq('period_type', period)
      .eq('period_start', start)
      .eq('period_end', end)
      .order('score', { ascending: false }),
  ]);

  const users = usersRes.data || [];
  const leads = leadsRes.data || [];
  const followUps = followRes.data || [];
  const comments = commentsRes.data || [];
  const actions = actionRes.data || [];
  const dailyActivity = activityRes.data || [];
  const sessions = sessionsRes.data || [];
  const history = historyRes.data || [];

  // ---------- Per-user aggregation ----------
  const results = users
    .filter((u: any) => SALES_ROLES.includes(u.role))
    .map((u: any) => {
      const uid = u.id;
      const myLeads = leads.filter((l: any) => l.created_by === uid || l.assigned_to === uid);
      const myFollowups = followUps.filter((f: any) => f.created_by === uid);
      const myComments = comments.filter((c: any) => c.user_id === uid);
      const myActions = actions.filter((a: any) => a.user_id === uid);
      const mySessions = sessions.filter((s: any) => s.user_id === uid);
      const myDaily = dailyActivity.filter((d: any) => d.user_id === uid);

      const leadsCreated = myLeads.length;
      const leadsAssigned = myLeads.length;

      // Follow-ups
      const activeFollowups = myFollowups.filter((f: any) => f.follow_up_status !== 'Cancelled');
      const totalFollowups = activeFollowups.length;
      const completedFollowups = activeFollowups.filter(
        (f: any) => f.follow_up_status === 'Completed' || f.completed_at
      ).length;

      // Overdue: pending & due before today
      const overdueFollowups = activeFollowups.filter(
        (f: any) =>
          (f.follow_up_status === 'Pending' ||
            f.follow_up_status === 'In Progress' ||
            f.follow_up_status === 'Overdue') &&
          new Date(f.due_date + 'T23:59:59') < new Date(todayStr + 'T00:00:00')
      ).length;

      // Unanswered calls: Call/VideoCall follow-ups past due & not completed
      const unansweredCalls = myFollowups.filter(
        (f: any) =>
          CALL_TYPES.includes(f.follow_up_type) &&
          (f.follow_up_status === 'Pending' ||
            f.follow_up_status === 'In Progress' ||
            f.follow_up_status === 'Overdue') &&
          new Date(f.due_date + 'T23:59:59') < new Date(todayStr + 'T00:00:00') &&
          !f.completed_at
      ).length;

      // Overdue leads: not Won/Lost and follow_up_due < today
      const overdueLeads = myLeads.filter(
        (l: any) =>
          l.lead_status !== 'Won' &&
          l.lead_status !== 'Lost' &&
          l.follow_up_due &&
          new Date(l.follow_up_due + 'T23:59:59') < new Date(todayStr + 'T00:00:00')
      ).length;

      // Leads contacted: any comment or the lead has last_contact within period
      const contactedLeadIds = new Set([
        ...comments
          .filter((c: any) => myLeads.some((l: any) => l.id === c.lead_id))
          .map((c: any) => c.lead_id),
      ]);
      myLeads.forEach((l: any) => {
        if (l.last_contact && l.last_contact >= start && l.last_contact <= end)
          contactedLeadIds.add(l.id);
      });
      const leadsContacted = myLeads.filter((l: any) => contactedLeadIds.has(l.id)).length;

      // Active seconds in period
      const activeSeconds = myDaily.reduce(
        (s: number, d: any) => s + (d.total_active_seconds || 0),
        0
      );

      const actionCount = myActions.length;

      // Rates
      const followupRate =
        totalFollowups > 0 ? Math.round((completedFollowups / totalFollowups) * 100) : 0;
      const contactRate =
        leadsAssigned > 0 ? Math.round((leadsContacted / leadsAssigned) * 100) : 0;
      const productiveHours = activeSeconds / 3600;
      const productivity = productiveHours > 0 ? Math.round(actionCount / productiveHours) : 0;

      // Avg response: time lead created -> first follow-up due (proxy for responsiveness)
      let respTotal = 0,
        respCount = 0;
      myLeads.forEach((l: any) => {
        const fu = myFollowups.find(
          (f: any) => f.created_by === uid && f.created_at >= l.created_at
        );
        if (fu) {
          respTotal +=
            (new Date(fu.due_date).getTime() - new Date(l.created_at).getTime()) / 3600000;
          respCount++;
        }
      });
      const avgResponseHours = respCount > 0 ? respTotal / respCount : 0;

      // Hours since last activity (any activity in current computed window)
      let lastActivityAt = new Date(0);
      comments.forEach((c: any) => {
        if (c.user_id === uid)
          lastActivityAt = new Date(Math.max(+lastActivityAt, +new Date(c.created_at)));
      });
      actions.forEach((a: any) => {
        if (a.user_id === uid)
          lastActivityAt = new Date(Math.max(+lastActivityAt, +new Date(a.created_at)));
      });
      const hoursSinceLastActivity =
        lastActivityAt.getTime() > 0
          ? Math.max(0, (Date.now() - lastActivityAt.getTime()) / 3600000)
          : 0;

      // ---------- SCORING (0-100) ----------
      const cat: Record<string, number> = {};
      const lost: { reason: string; points: number }[] = [];
      let score = 100;

      const catFollowup = Math.min(30, Math.round(0.3 * followupRate));
      cat['Follow-up Rate'] = catFollowup;
      score += catFollowup - 30; // start from 30 budget

      const catActive = Math.min(20, Math.round(20 * Math.min(1, activeSeconds / (6 * 3600))));
      cat['Active Time'] = catActive;
      score += catActive - 20;

      const catProductivity = Math.min(20, Math.round(20 * Math.min(1, productivity / 20)));
      cat['Productivity'] = catProductivity;
      score += catProductivity - 20;

      const catContact = Math.min(15, Math.round(0.15 * contactRate));
      cat['Contact Rate'] = catContact;
      score += catContact - 15;

      const catWorkload = Math.min(15, Math.min(15, actionCount));
      cat['Activity Level'] = catWorkload;
      score += catWorkload - 15;

      // ---- Penalties (each subtracts points) ----
      if (overdueFollowups > 0) {
        const pts = Math.min(15, overdueFollowups * 3);
        lost.push({
          reason: `${overdueFollowups} overdue follow-up${overdueFollowups > 1 ? 's' : ''}`,
          points: pts,
        });
        score -= pts;
      }
      if (overdueLeads > 0) {
        const pts = Math.min(15, overdueLeads * 2);
        lost.push({
          reason: `${overdueLeads} overdue lead${overdueLeads > 1 ? 's' : ''}`,
          points: pts,
        });
        score -= pts;
      }
      if (unansweredCalls > 0) {
        const pts = Math.min(10, unansweredCalls * 2);
        lost.push({
          reason: `${unansweredCalls} unanswered call${unansweredCalls > 1 ? 's' : ''}`,
          points: pts,
        });
        score -= pts;
      }
      if (leadsAssigned > 0 && leadsContacted === 0) {
        const pts = 6;
        lost.push({
          reason: `${leadsAssigned} client${leadsAssigned > 1 ? 's' : ''} not contacted today`,
          points: pts,
        });
        score -= pts;
      }
      const noActivityHours = Math.floor(hoursSinceLastActivity);
      if (noActivityHours >= 2) {
        const pts = Math.min(10, noActivityHours * 2);
        lost.push({
          reason: `No activity for ${noActivityHours} hour${noActivityHours > 1 ? 's' : ''}`,
          points: pts,
        });
        score -= pts;
      }
      if (followupRate > 0 && followupRate < 50) {
        const pts = 5;
        lost.push({ reason: `Only ${followupRate}% follow-up completion`, points: pts });
        score -= pts;
      }

      score = Math.max(0, Math.min(100, Math.round(score)));

      // Strengths / weaknesses / recommendations
      const strengths: string[] = [];
      if (catFollowup >= 22) strengths.push('Strong follow-up discipline');
      if (catActive >= 17) strengths.push('Consistently active throughout the week');
      if (catProductivity >= 16) strengths.push('High task productivity');
      if (catContact >= 12) strengths.push('Great at keeping clients engaged');
      if (catWorkload >= 12) strengths.push('Handles a heavy workload');
      if (strengths.length === 0) strengths.push('None identified this period');

      const weaknesses: string[] = [];
      if (overdueFollowups > 0) weaknesses.push('Falling behind on follow-ups');
      if (overdueLeads > 0) weaknesses.push('Overdue leads need attention');
      if (contactRate < 50) weaknesses.push('Low contact completion');
      if (noActivityHours >= 2) weaknesses.push('Long idle gaps');
      if (weaknesses.length === 0) weaknesses.push('Balance is good');

      const recommendations: string[] = [];
      if (overdueFollowups > 0)
        recommendations.push('Clear overdue follow-ups first thing in the day');
      if (overdueLeads > 0) recommendations.push('Reach out to overdue leads to prevent churn');
      if (unansweredCalls > 0) recommendations.push('Call back unanswered clients within 2 hours');
      if (noActivityHours >= 2)
        recommendations.push('Log activity continuously to keep streaks alive');
      if (followupRate > 0 && followupRate < 70)
        recommendations.push('Aim to complete at least 70% of scheduled follow-ups');
      if (recommendations.length === 0)
        recommendations.push('Maintain current performance and target higher scores');

      return {
        user: {
          id: uid,
          full_name: u.full_name,
          email: u.email,
          role: u.role,
          is_active: u.is_active,
        },
        score,
        grade: gradeFor(score),
        leads_created: leadsCreated,
        leads_assigned: leadsAssigned,
        total_followups: totalFollowups,
        completed_followups: completedFollowups,
        overdue_followups: overdueFollowups,
        unanswered_calls: unansweredCalls,
        overdue_leads: overdueLeads,
        leads_contacted: leadsContacted,
        active_seconds: activeSeconds,
        actions: actionCount,
        followup_rate: followupRate,
        contact_rate: contactRate,
        productivity,
        avg_response_hours: avgResponseHours,
        hours_since_last_activity: hoursSinceLastActivity,
        category_scores: cat,
        lost_points: lost,
        strengths,
        weaknesses,
        recommendations,
      };
    })
    .sort((a: any, b: any) => b.score - a.score);

  // Upsert snapshots to keep permanent history
  const upsertRows = results.map((r: any) => ({
    user_id: r.user.id,
    period_type: period,
    period_start: start,
    period_end: end,
    score: r.score,
    grade: r.grade,
    leads_created: r.leads_created,
    leads_assigned: r.leads_assigned,
    total_followups: r.total_followups,
    completed_followups: r.completed_followups,
    overdue_followups: r.overdue_followups,
    unanswered_calls: r.unanswered_calls,
    overdue_leads: r.overdue_leads,
    leads_contacted: r.leads_contacted,
    active_seconds: r.active_seconds,
    actions: r.actions,
    followup_rate: r.followup_rate,
    contact_rate: r.contact_rate,
    productivity: r.productivity,
    avg_response_hours: Math.round(r.avg_response_hours * 100) / 100,
    hours_since_last_activity: Math.round(r.hours_since_last_activity * 100) / 100,
    category_scores: r.category_scores,
    lost_points: r.lost_points,
    strengths: r.strengths,
    weaknesses: r.weaknesses,
    recommendations: r.recommendations,
    is_current: true,
    computed_at: new Date().toISOString(),
  }));

  try {
    await db
      .from('sales_performance')
      .upsert(upsertRows, { onConflict: 'user_id,period_type,period_start,period_end' });
  } catch {
    /* history still works without upsert */
  }

  return NextResponse.json({
    period,
    start,
    end,
    users: results,
    history,
    not_setup: results.length === 0 && history.length === 0,
  });
}
