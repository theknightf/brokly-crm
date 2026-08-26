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
  const rangeStart = hasRange
    ? new Date(`${fromParam}T00:00:00`).getTime()
    : Number.NEGATIVE_INFINITY;
  const rangeEnd = hasRange
    ? new Date(`${toParam}T23:59:59.999`).getTime()
    : Number.POSITIVE_INFINITY;
  const inRange = (iso: string | null | undefined): boolean => {
    if (!iso) return !hasRange;
    const ts = new Date(iso).getTime();
    if (Number.isNaN(ts)) return !hasRange;
    return ts >= rangeStart && ts <= rangeEnd;
  };

  // Fetch leads with all filter-relevant columns + profiles/teams for team derivation
  const [leadsRes, profilesRes, teamsRes, membershipsRes, callsRes, activityRes] =
    await Promise.all([
      supabase
        .from('leads')
        .select(
          'id, crm_status, lead_status, source, project, team, created_at, assigned_to, created_by'
        ),
      supabase.from('user_profiles').select('id, full_name, email, team_id'),
      supabase.from('teams').select('id, name, leader_id'),
      supabase.from('team_memberships').select('team_id, user_id, is_leader'),
      supabase
        .from('call_logs')
        .select('user_id, entity_id, channel, direction, duration_seconds, outcome, created_at'),
      supabase.from('activity_log').select('user_id, action_type, meta, created_at'),
    ]);

  if (
    leadsRes.error ||
    profilesRes.error ||
    teamsRes.error ||
    membershipsRes.error ||
    callsRes.error ||
    activityRes.error
  ) {
    const msg =
      leadsRes.error?.message ||
      profilesRes.error?.message ||
      teamsRes.error?.message ||
      membershipsRes.error?.message ||
      callsRes.error?.message ||
      activityRes.error?.message ||
      'Failed to load calls matrix';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  let leads = (leadsRes.data || []) as any[];
  const profiles = (profilesRes.data || []) as any[];
  const teams = (teamsRes.data || []) as any[];
  const memberships = (membershipsRes.data || []) as any[];
  const allCalls = (callsRes.data || []) as any[];
  const allActivity = (activityRes.data || []) as any[];

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
    const leaderTeams = teams
      .filter((t: any) => t.leader_id === teamLeaderParam)
      .map((t: any) => t.id);
    // Also include memberships where is_leader true
    const leaderMembershipTeams = memberships
      .filter((m: any) => m.user_id === teamLeaderParam && m.is_leader)
      .map((m: any) => m.team_id);
    const allLeaderTeamIds = Array.from(new Set([...leaderTeams, ...leaderMembershipTeams]));
    if (allLeaderTeamIds.length === 0) {
      leads = [];
    } else {
      const memberIds = new Set(
        memberships
          .filter((m: any) => allLeaderTeamIds.includes(m.team_id))
          .map((m: any) => m.user_id)
      );
      // Also include users whose profile team_id is in leader teams
      profiles.forEach((p: any) => {
        if (allLeaderTeamIds.includes(p.team_id)) memberIds.add(p.id);
      });
      leads = leads.filter((l: any) => memberIds.has(l.assigned_to) || memberIds.has(l.created_by));
    }
  }

  // Project / Campaign / Source / Stage filters
  if (projectParam) leads = leads.filter((l: any) => (l.project || '') === projectParam);
  if (campaignParam)
    leads = leads.filter(
      (l: any) => (l.source || '') === campaignParam || (l.team || '') === campaignParam
    );
  if (sourceParam) leads = leads.filter((l: any) => (l.source || '') === sourceParam);

  // Stage filter — applied AFTER computing allowed lead ids so the actions/calls
  // tables below can scope by the same set of leads when needed.
  let stageFilteredLeads = leads;
  if (stageParam) {
    stageFilteredLeads = leads.filter((l: any) => {
      const stage = l.crm_status || l.lead_status || 'Fresh Leads';
      return stage === stageParam;
    });
  }

  // Resolve the set of lead ids that pass ALL filters (used for call scoping)
  const allowedLeadIds = new Set(stageFilteredLeads.map((l: any) => String(l.id)));

  // ── Scope calls & actions to the same agents that own the filtered leads ──
  const visibleAgentIds = new Set<string>();
  for (const l of stageFilteredLeads) {
    if (l.assigned_to) visibleAgentIds.add(String(l.assigned_to));
    else if (l.created_by) visibleAgentIds.add(String(l.created_by));
  }
  if (agentParam) visibleAgentIds.add(agentParam);

  const scopedCalls = allCalls.filter(
    (c: any) =>
      visibleAgentIds.has(c.user_id) &&
      inRange(c.created_at) &&
      (!c.entity_id ||
        c.entity_type !== 'lead' ||
        allowedLeadIds.size === 0 ||
        allowedLeadIds.has(String(c.entity_id)))
  );
  const scopedActivity = allActivity.filter(
    (a: any) => visibleAgentIds.has(a.user_id) && inRange(a.created_at)
  );

  // Build Agent × Stage matrix from the fully-filtered leads
  const ALL_STATUSES = [
    'Fresh Leads',
    'Cold Calls',
    'Pending Leads',
    'Following Up',
    'Meeting',
    'Interested',
    'Not Interested',
    'Cancellation',
    'Done Deal',
    'Duplicate Leads',
    'Wrong Number',
    'Data Rotation',
    'Closed Number',
    'No Answer',
    'No Answer At All',
    'Low Budget',
    'Reschedule Meeting',
    'Reservation',
  ];

  const stagesInData = Array.from(
    new Set(stageFilteredLeads.map((l: any) => l.crm_status || l.lead_status || 'Fresh Leads'))
  );
  const stages = stagesInData.sort((a: any, b: any) => {
    const ia = ALL_STATUSES.indexOf(a as string);
    const ib = ALL_STATUSES.indexOf(b as string);
    if (ia === -1 && ib === -1) return String(a).localeCompare(String(b));
    return ia === -1 ? 1 : ib === -1 ? -1 : ia - ib;
  });

  const displayStages = stageParam ? [stageParam] : stages;

  // Group by agent (name resolution via profile; fallback to raw uuid)
  const nameOf = (uid: string | null | undefined): string => {
    if (!uid) return 'Unassigned';
    const p = profiles.find((x: any) => x.id === uid);
    return p?.full_name || p?.email || uid;
  };
  const displayNameOfAgentFilter = agentParam ? nameOf(agentParam) : '';

  const byAgent = new Map<string, Map<string, number>>();
  const totalsByAgent = new Map<string, number>();
  for (const lead of stageFilteredLeads) {
    const stage = lead.crm_status || lead.lead_status || 'Fresh Leads';
    const agentName = nameOf(lead.assigned_to || lead.created_by);
    if (!byAgent.has(agentName)) byAgent.set(agentName, new Map());
    const m = byAgent.get(agentName)!;
    m.set(stage, (m.get(stage) || 0) + 1);
    totalsByAgent.set(agentName, (totalsByAgent.get(agentName) || 0) + 1);
  }

  let agents = Array.from(byAgent.keys());
  if (agentParam && displayNameOfAgentFilter) {
    agents = byAgent.has(displayNameOfAgentFilter) ? [displayNameOfAgentFilter] : [];
  }

  const rows = agents
    .map((agent) => {
      const counts = displayStages.map((s) => byAgent.get(agent)?.get(s) || 0);
      const total = totalsByAgent.get(agent) || 0;
      return { agent, counts, total };
    })
    .sort((a, b) => b.total - a.total);

  const columnTotals = displayStages.map((_, idx) =>
    rows.reduce((sum, r) => sum + r.counts[idx], 0)
  );
  const grandTotal = columnTotals.reduce((sum, v) => sum + v, 0);

  // ── Per-agent performance: calls outcomes + actions (from real DB tables) ──
  // Call outcome columns follow the same buckets used across the app:
  //   connected/noAnswer mirror src/lib/callVerification.ts + reports summary.
  const SUCCESS_OUTCOMES = ['Reached', 'Interested', 'Site Visit', 'Won Deal', 'Customer Replied'];
  const NO_ANSWER_OUTCOMES = ['No Answer', 'No Answer At All', 'Busy', 'Wrong Number', 'No Reply'];

  const perfByAgentId = new Map<
    string,
    {
      calls: number;
      connected: number;
      noAnswer: number;
      incoming: number;
      shortCalls: number;
      durationSeconds: number;
      reached: number;
      notInterested: number;
      callbacks: number;
      whatsapp: number;
      emails: number;
      meetings: number;
      notes: number;
      actionsTotal: number;
      byAction: Record<string, number>;
    }
  >();

  const ensurePerf = (uid: string) => {
    if (!perfByAgentId.has(uid)) {
      perfByAgentId.set(uid, {
        calls: 0,
        connected: 0,
        noAnswer: 0,
        incoming: 0,
        shortCalls: 0,
        durationSeconds: 0,
        reached: 0,
        notInterested: 0,
        callbacks: 0,
        whatsapp: 0,
        emails: 0,
        meetings: 0,
        notes: 0,
        actionsTotal: 0,
        byAction: {},
      });
    }
    return perfByAgentId.get(uid)!;
  };

  for (const c of scopedCalls) {
    const p = ensurePerf(c.user_id);
    const dur = Number(c.duration_seconds) || 0;
    p.calls++;
    p.durationSeconds += dur;
    if (SUCCESS_OUTCOMES.includes(c.outcome) || dur >= 60) {
      p.connected++;
    }
    if (NO_ANSWER_OUTCOMES.includes(c.outcome)) p.noAnswer++;
    if (c.direction === 'incoming') p.incoming++;
    if (c.outcome === 'Reached') p.reached++;
    if (c.outcome === 'Not Interested') p.notInterested++;
    if (c.outcome === 'Call back later') p.callbacks++;
    if (dur > 0 && dur < 60 && !SUCCESS_OUTCOMES.includes(c.outcome)) p.shortCalls++;
    const ch = (c.channel || '').toLowerCase();
    if (ch === 'whatsapp') p.whatsapp++;
    else if (ch === 'email') p.emails++;
    else if (ch === 'site visit' || ch === 'meeting') p.meetings++;
  }

  for (const a of scopedActivity) {
    const p = ensurePerf(a.user_id);
    const t = a.action_type || 'Action';
    p.byAction[t] = (p.byAction[t] || 0) + 1;
    p.actionsTotal++;
    const meta = typeof a.meta === 'string' ? a.meta : '';
    if (meta === 'WhatsApp') p.whatsapp++;
    else if (meta === 'Email') p.emails++;
    else if (meta === 'Meeting' || meta === 'Video Call') p.meetings++;
    if (t.toLowerCase().includes('note')) p.notes++;
  }

  const performance = agents
    .map((agentName) => {
      const prof = profiles.find((x: any) => x.full_name === agentName || x.email === agentName);
      const uid = prof?.id || '';
      const base = perfByAgentId.get(uid) || {
        calls: 0,
        connected: 0,
        noAnswer: 0,
        incoming: 0,
        shortCalls: 0,
        durationSeconds: 0,
        reached: 0,
        notInterested: 0,
        callbacks: 0,
        whatsapp: 0,
        emails: 0,
        meetings: 0,
        notes: 0,
        actionsTotal: 0,
        byAction: {},
      };
      return {
        agent: agentName,
        userId: uid,
        ...base,
        reachPct: base.calls ? Math.round((base.connected / base.calls) * 100) : 0,
      };
    })
    .sort((a, b) => b.calls - a.calls);

  // Filter options for UI
  const allLeadsForOptions = hasRange
    ? (leadsRes.data || []).filter((l: any) => inRange(l.created_at))
    : leadsRes.data || [];
  const projectOptions = Array.from(
    new Set((allLeadsForOptions as any[]).map((l: any) => l.project).filter(Boolean))
  ).sort();
  const sourceOptions = Array.from(
    new Set((allLeadsForOptions as any[]).map((l: any) => l.source).filter(Boolean))
  ).sort();

  return NextResponse.json({
    stages: displayStages,
    rows,
    columnTotals,
    grandTotal,
    performance,
    filterOptions: {
      projects: projectOptions,
      sources: sourceOptions,
      teams: teams.map((t: any) => ({ id: t.id, name: t.name })),
      teamLeaders: teams
        .filter((t: any) => t.leader_id)
        .map((t: any) => {
          const p = profiles.find((x: any) => x.id === t.leader_id);
          return {
            id: t.leader_id,
            name: p?.full_name || 'Unknown',
            teamId: t.id,
            teamName: t.name,
          };
        }),
      stages: ALL_STATUSES,
    },
  });
}
