import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function isoDay(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const agentParam = url.searchParams.get('agent'); // user id
  const teamParam = url.searchParams.get('team');
  const teamLeaderParam = url.searchParams.get('teamLeader');
  const projectParam = url.searchParams.get('project');
  const campaignParam = url.searchParams.get('campaign');
  const sourceParam = url.searchParams.get('source');
  const stageParam = url.searchParams.get('stage');

  const hasRange = !!fromParam && !!toParam;
  const rangeStart = hasRange ? new Date(`${fromParam}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const rangeEnd = hasRange ? new Date(`${toParam}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
  const inRange = (iso: string | null | undefined): boolean => {
    if (!iso) return !hasRange;
    const ts = new Date(iso).getTime();
    if (Number.isNaN(ts)) return !hasRange;
    return ts >= rangeStart && ts <= rangeEnd;
  };

  // Fetch leads with all filter-relevant columns + profiles/teams for team derivation
  const [leadsRes, profilesRes, teamsRes, membershipsRes] = await Promise.all([
    supabase.from('leads').select('id, crm_status, lead_status, source, project, team, created_at, assigned_to, created_by'),
    supabase.from('user_profiles').select('id, full_name, email, team_id'),
    supabase.from('teams').select('id, name, leader_id'),
    supabase.from('team_memberships').select('team_id, user_id, is_leader'),
  ]);

  if (leadsRes.error || profilesRes.error || teamsRes.error || membershipsRes.error) {
    return NextResponse.json({ error: 'Failed to load calls matrix' }, { status: 500 });
  }

  let leads = (leadsRes.data || []) as any[];
  const profiles = (profilesRes.data || []) as any[];
  const teams = (teamsRes.data || []) as any[];
  const memberships = (membershipsRes.data || []) as any[];

  // Date range filter
  if (hasRange) leads = leads.filter((l) => inRange(l.created_at));

  // Helper: get team for a user via memberships or profile team_id
  const teamIdForUser = (userId: string | null): string | null => {
    if (!userId) return null;
    const m = memberships.find((x: any) => x.user_id === userId);
    if (m) return m.team_id;
    const p = profiles.find((x: any) => x.id === userId);
    return p?.team_id || null;
  };

  // Agent filter
  if (agentParam) {
    leads = leads.filter((l: any) => l.assigned_to === agentParam || l.created_by === agentParam);
  }

  // Team filter
  if (teamParam) {
    leads = leads.filter((l: any) => {
      const tid = teamIdForUser(l.assigned_to);
      return tid === teamParam;
    });
  }

  // Team Leader filter: show only leads assigned to members of the leader's team
  if (teamLeaderParam) {
    const leaderTeams = teams.filter((t: any) => t.leader_id === teamLeaderParam).map((t: any) => t.id);
    // Also include memberships where is_leader true
    const leaderMembershipTeams = memberships.filter((m: any) => m.user_id === teamLeaderParam && m.is_leader).map((m: any) => m.team_id);
    const allLeaderTeamIds = Array.from(new Set([...leaderTeams, ...leaderMembershipTeams]));
    if (allLeaderTeamIds.length === 0) {
      leads = [];
    } else {
      const memberIds = new Set(
        memberships.filter((m: any) => allLeaderTeamIds.includes(m.team_id)).map((m: any) => m.user_id)
      );
      // Also include users whose profile team_id is in leader teams
      profiles.forEach((p: any) => { if (allLeaderTeamIds.includes(p.team_id)) memberIds.add(p.id); });
      leads = leads.filter((l: any) => memberIds.has(l.assigned_to) || memberIds.has(l.created_by));
    }
  }

  // Project filter
  if (projectParam) {
    leads = leads.filter((l: any) => (l.project || '') === projectParam);
  }

  // Campaign filter: treat as source alias if campaign column does not exist (filtered by source)
  if (campaignParam) {
    leads = leads.filter((l: any) => (l.source || '') === campaignParam || (l.team || '') === campaignParam);
  }

  // Source filter
  if (sourceParam) {
    leads = leads.filter((l: any) => (l.source || '') === sourceParam);
  }

  // Stage filter
  if (stageParam) {
    leads = leads.filter((l: any) => {
      const stage = l.crm_status || l.lead_status || 'Fresh Leads';
      return stage === stageParam;
    });
  }

  // Build Agent × Stage matrix from filtered leads
  const ALL_STATUSES = [
    'Fresh Leads','Cold Calls','Pending Leads','Following Up','Meeting','Interested','Not Interested','Cancellation','Done Deal','Duplicate Leads','Wrong Number','Data Rotation','Closed Number','No Answer','No Answer At All','Low Budget','Reschedule Meeting','Reservation',
  ];

  // Derive distinct stages present in filtered leads (or all if no filter)
  const stagesInData = Array.from(new Set(leads.map((l: any) => l.crm_status || l.lead_status || 'Fresh Leads')));
  const stages = stagesInData.sort((a: any, b: any) => {
    const ia = ALL_STATUSES.indexOf(a);
    const ib = ALL_STATUSES.indexOf(b);
    if (ia === -1 && ib === -1) return String(a).localeCompare(String(b));
    return ia === -1 ? 1 : ib === -1 ? -1 : ia - ib;
  });

  // If stage filter is set, narrow stages to that single value for cleaner table
  const displayStages = stageParam ? [stageParam] : stages;

  // Group by agent
  const byAgent = new Map<string, Map<string, number>>();
  const totalsByAgent = new Map<string, number>();
  for (const lead of leads) {
    const stage = lead.crm_status || lead.lead_status || 'Fresh Leads';
    if (stageParam && stage !== stageParam) continue;
    const agentName = profiles.find((p: any) => p.id === lead.assigned_to)?.full_name || lead.assigned_to || 'Unassigned';
    // If agent filter is set, we already filtered leads, but agentName may still be 'Unassigned' for those
    if (!byAgent.has(agentName)) byAgent.set(agentName, new Map());
    const m = byAgent.get(agentName)!;
    m.set(stage, (m.get(stage) || 0) + 1);
    totalsByAgent.set(agentName, (totalsByAgent.get(agentName) || 0) + 1);
  }

  // If agent filter is set, ensure we only return that agent (or all if unassigned)
  let agents = Array.from(byAgent.keys()).sort();
  if (agentParam) {
    const agentProfile = profiles.find((p: any) => p.id === agentParam);
    const agentName = agentProfile?.full_name || agentProfile?.email || '';
    if (agentName && byAgent.has(agentName)) agents = [agentName];
    else if (agents.length === 0) agents = [];
  }

  const rows = agents.map((agent) => {
    const counts = displayStages.map((s) => byAgent.get(agent)?.get(s) || 0);
    const total = totalsByAgent.get(agent) || 0;
    return { agent, counts, total };
  }).sort((a, b) => b.total - a.total);

  const columnTotals = displayStages.map((_, idx) => rows.reduce((sum, r) => sum + r.counts[idx], 0));
  const grandTotal = columnTotals.reduce((sum, v) => sum + v, 0);

  // Filter options for UI (distinct values from unfiltered leads, but we could use filtered for dynamic)
  const allLeadsForOptions = hasRange ? (leadsRes.data || []).filter((l: any) => inRange(l.created_at)) : (leadsRes.data || []);
  const projectOptions = Array.from(new Set((allLeadsForOptions as any[]).map((l: any) => l.project).filter(Boolean))).sort();
  const sourceOptions = Array.from(new Set((allLeadsForOptions as any[]).map((l: any) => l.source).filter(Boolean))).sort();

  return NextResponse.json({
    stages: displayStages,
    rows,
    columnTotals,
    grandTotal,
    filterOptions: {
      projects: projectOptions,
      sources: sourceOptions,
      teams: teams.map((t: any) => ({ id: t.id, name: t.name })),
      teamLeaders: teams.filter((t: any) => t.leader_id).map((t: any) => {
        const p = profiles.find((x: any) => x.id === t.leader_id);
        return { id: t.leader_id, name: p?.full_name || 'Unknown', teamId: t.id, teamName: t.name };
      }),
      stages: ALL_STATUSES,
    },
  });
}
