import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [leadsRes, followUpsRes, customersRes, teamRes] = await Promise.all([
    supabase
      .from('leads')
      .select('lead_status, source, property_type, budget_max, created_at, agent'),
    supabase.from('follow_ups').select('follow_up_status, follow_up_type, priority, due_date'),
    supabase.from('leads').select('budget_max, created_at').eq('lead_status', 'Won'),
    supabase
      .from('team_members')
      .select('name, closed_deals, assigned_leads, total_revenue, conversion_rate')
      .eq('member_status', 'Active'),
  ]);

  if ([leadsRes.error, followUpsRes.error, customersRes.error, teamRes.error].some(Boolean)) {
    return NextResponse.json({ error: 'Failed to load report data' }, { status: 500 });
  }

  const leads = leadsRes.data || [];
  const followUps = followUpsRes.data || [];
  const customers = customersRes.data || [];
  const team = teamRes.data || [];

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
    teamPerformance: team.map((m: any) => ({
      name: m.name,
      closedDeals: m.closed_deals,
      assignedLeads: m.assigned_leads,
      totalRevenue: Number(m.total_revenue),
      conversionRate: Number(m.conversion_rate),
    })),
  });
}
