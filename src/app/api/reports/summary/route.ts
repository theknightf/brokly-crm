import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: actor } = await supabase
    .from('user_profiles')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();
  const isAdmin = isAdminRole(actor?.role);

  const [leadsRes, followUpsRes, customersRes, teamRes, callsRes, membershipsRes, teamsRes, expensesRes, ratingsRes] =
    await Promise.all([
      supabase
        .from('leads')
        .select(
          'lead_status, source, property_type, budget_max, created_at, agent, assigned_to, created_by'
        ),
      supabase.from('follow_ups').select('follow_up_status, follow_up_type, priority, due_date'),
      supabase.from('leads').select('budget_max, created_at').eq('lead_status', 'Won'),
      supabase
        .from('team_members')
        .select('name, closed_deals, assigned_leads, total_revenue, conversion_rate')
        .eq('member_status', 'Active'),
      supabase
        .from('call_logs')
        .select('user_id, channel, duration_seconds, outcome, direction, created_at'),
      supabase.from('team_memberships').select('team_id, user_id, is_leader'),
      supabase.from('teams').select('id, name, leader_id, description'),
      supabase.from('expenses').select('created_by, amount, expense_date'),
      supabase.from('team_leader_ratings').select('*'),
    ]);

  if (
    [
      leadsRes.error,
      followUpsRes.error,
      customersRes.error,
      teamRes.error,
      callsRes.error,
      membershipsRes.error,
      teamsRes.error,
      expensesRes.error,
      ratingsRes.error,
    ].some(Boolean)
  ) {
    return NextResponse.json({ error: 'Failed to load report data' }, { status: 500 });
  }

  const leads = leadsRes.data || [];
  const followUps = followUpsRes.data || [];
  const customers = customersRes.data || [];
  const team = teamRes.data || [];
  const calls = callsRes.data || [];
  const memberships = membershipsRes.data || [];
  const allTeams = teamsRes.data || [];
  const expenses = expensesRes.data || [];
  const ratings = ratingsRes.data || [];

  // Lead status breakdown
  const leadsByStatus: Record<string, number> = {};
  leads.forEach((l: any) => {
    leadsByStatus[l.lead_status] = (leadsByStatus[l.lead_status] || 0) + 1;
  });

  // Lead source breakdown
  const leadsBySource: Record<string, number> = {};
  leads.forEach((l: any) => {
    if (l.source) leadsBySource[l.source] = (leadsBySource[l.source] || 0) + 1;
  });

  // Property type breakdown
  const leadsByPropertyType: Record<string, number> = {};
  leads.forEach((l: any) => {
    if (l.property_type)
      leadsByPropertyType[l.property_type] = (leadsByPropertyType[l.property_type] || 0) + 1;
  });

  // Follow-up status breakdown
  const followUpsByStatus: Record<string, number> = {};
  followUps.forEach((f: any) => {
    followUpsByStatus[f.follow_up_status] = (followUpsByStatus[f.follow_up_status] || 0) + 1;
  });

  // Monthly leads (last 6 months)
  const now = new Date();
  const monthlyLeads: { month: string; leads: number; won: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = d.toISOString().slice(0, 7);
    const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
    const monthLeads = leads.filter((l: any) => l.created_at?.startsWith(monthStr));
    monthlyLeads.push({
      month: label,
      leads: monthLeads.length,
      won: monthLeads.filter((l: any) => l.lead_status === 'Won').length,
    });
  }

  // Agent performance
  const agentPerf: Record<string, { leads: number; won: number }> = {};
  leads.forEach((l: any) => {
    if (l.agent) {
      if (!agentPerf[l.agent]) agentPerf[l.agent] = { leads: 0, won: 0 };
      agentPerf[l.agent].leads++;
      if (l.lead_status === 'Won') agentPerf[l.agent].won++;
    }
  });

  const totalRevenue = customers.reduce(
    (sum: number, c: any) => sum + Number(c.budget_max || 0),
    0
  );
  const conversionRate =
    leads.length > 0 ? ((customers.length / leads.length) * 100).toFixed(1) : '0';

  // ── Calls by employee (RLS-scoped: admins see all, leaders see team, sales see own) ──
  const userNames: Record<string, string> = {};
  (calls || []).forEach((c: any) => {
    if (!userNames[c.user_id]) userNames[c.user_id] = '';
  });
  if (Object.keys(userNames).length) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name')
      .in('id', Object.keys(userNames));
    (profiles || []).forEach((p: any) => (userNames[p.id] = p.full_name || ''));
  }

  const callsByEmployee: Record<string, any> = {};
  calls.forEach((c: any) => {
    const uid = c.user_id;
    if (!callsByEmployee[uid]) {
      callsByEmployee[uid] = {
        userId: uid,
        name: userNames[uid] || 'Unknown',
        calls: 0,
        totalDurationSeconds: 0,
        connected: 0,
        noAnswer: 0,
        incoming: 0,
      };
    }
    const e = callsByEmployee[uid];
    e.calls++;
    e.totalDurationSeconds += Number(c.duration_seconds) || 0;
    if (['Reached', 'Interested', 'Site Visit', 'Won Deal', 'Customer Replied'].includes(c.outcome) ||
        (Number(c.duration_seconds) || 0) >= 60) {
      e.connected++;
    }
    if (['No Answer', 'No Answer At All', 'Busy', 'Wrong Number', 'No Reply'].includes(c.outcome)) {
      e.noAnswer++;
    }
    if (c.direction === 'incoming') e.incoming++;
  });

  // ── Team performance & profitability ──────────────────────────────────────
  // Non-admins only see the teams they are allowed to (their own team / the
  // teams they lead). Admin sees all teams.
  let visibleTeams = allTeams;
  if (!isAdmin) {
    const myMemberships = memberships.filter((m: any) => m.user_id === user.id);
    const led = myMemberships.filter((m: any) => m.is_leader).map((m: any) => m.team_id);
    const mine = myMemberships.map((m: any) => m.team_id);
    const allowed = led.length ? led : mine;
    visibleTeams = allTeams.filter((t: any) => allowed.includes(t.id));
  }

  const memberIdsByTeam = new Map<string, string[]>();
  memberships
    .filter((m: any) => visibleTeams.some((t: any) => t.id === m.team_id))
    .forEach((m: any) => {
      if (!memberIdsByTeam.has(m.team_id)) memberIdsByTeam.set(m.team_id, []);
      memberIdsByTeam.get(m.team_id)!.push(m.user_id);
    });

  const leadByUserId = (id: string) =>
    leads.filter((l: any) => l.assigned_to === id || l.created_by === id);
  const wonByUserId = (id: string) => leadByUserId(id).filter((l: any) => l.lead_status === 'Won');

  const teamPerformance = visibleTeams.map((t: any) => {
    const memberIds = memberIdsByTeam.get(t.id) || [];
    let assignedLeads = 0;
    let closedDeals = 0;
    let revenue = 0;
    let callsCount = 0;
    let callSeconds = 0;
    let teamExpenses = 0;

    memberIds.forEach((mid) => {
      const myLeads = leadByUserId(mid);
      assignedLeads += myLeads.length;
      const won = myLeads.filter((l: any) => l.lead_status === 'Won');
      closedDeals += won.length;
      revenue += won.reduce((s: number, l: any) => s + Number(l.budget_max || 0), 0);
      calls
        .filter((c: any) => c.user_id === mid)
        .forEach((c: any) => {
          callsCount++;
          callSeconds += Number(c.duration_seconds) || 0;
        });
      teamExpenses += expenses
        .filter((e: any) => e.created_by === mid)
        .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    });

    const profit = Math.round((revenue - teamExpenses) * 100) / 100;
    const profitMargin = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0;
    const conversionRateTeam =
      assignedLeads > 0 ? Math.round((closedDeals / assignedLeads) * 1000) / 10 : 0;

    // Latest leader rating for this team.
    const ratingRow = ratings
      .filter((r: any) => r.team_id === t.id)
      .sort((a: any, b: any) => +new Date(a.created_at) - +new Date(b.created_at))
      .pop();

    return {
      id: t.id,
      name: t.name,
      leaderId: t.leader_id || null,
      leaderName: '',
      assignedLeads,
      closedDeals,
      totalRevenue: Math.round(revenue * 100) / 100,
      conversionRate: conversionRateTeam,
      calls: callsCount,
      callDurationSeconds: callSeconds,
      expenses: Math.round(teamExpenses * 100) / 100,
      profit,
      profitMargin,
      leaderRating: ratingRow ? Number(ratingRow.rating) : null,
      leaderRatingComment: ratingRow?.comment || '',
      leaderRatingAt: ratingRow?.updated_at || ratingRow?.created_at || null,
    };
  });

  // Attach leader names.
  const leaderIds = visibleTeams.map((t: any) => t.leader_id).filter(Boolean);
  if (leaderIds.length) {
    const { data: leaders } = await supabase
      .from('user_profiles')
      .select('id, full_name')
      .in('id', leaderIds);
    const nameById = Object.fromEntries((leaders || []).map((p: any) => [p.id, p.full_name]));
    teamPerformance.forEach((tp: any) => {
      tp.leaderName = nameById[tp.leaderId] || '';
    });
  }

  return NextResponse.json({
    totalLeads: leads.length,
    totalCustomers: customers.length,
    totalRevenue,
    conversionRate,
    leadsByStatus,
    leadsBySource,
    leadsByPropertyType,
    followUpsByStatus,
    monthlyLeads,
    agentPerformance: Object.entries(agentPerf).map(([name, stats]) => ({
      name,
      leads: stats.leads,
      won: stats.won,
      rate: stats.leads > 0 ? ((stats.won / stats.leads) * 100).toFixed(1) : '0',
    })),
    teamPerformance,
    callsByEmployee: Object.values(callsByEmployee).sort((a: any, b: any) => b.calls - a.calls),
  });
}
