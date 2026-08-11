import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

/**
 * GET /api/teams/performance?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Per-team performance & profitability:
 *   - team KPIs (members, calls, leads, won deals, revenue, expenses, profit)
 *   - the team leader's own performance
 *   - the latest Owner/Admin/Manager rating for the team leader
 *
 * Permissions (RLS-scoped reads so data never leaks):
 *   - owners & admins: every team
 *   - team leaders: the teams they lead
 *   - sales: their own team only (metrics limited to what they can see)
 *
 * POST /api/teams/performance  { team_id, leader_id, rating, comment }
 * Owner/Admin/Manager rate a team leader (1–5). Stored per rating event;
 * the latest rating per (team, leader) is what reports display.
 */
export async function GET(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  const startISO = /^\d{4}-\d{2}-\d{2}$/.test(from) ? `${from}T00:00:00` : '';
  const endISO = /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999` : '';

  try {
    const { data: actor } = await supabase
      .from('user_profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle();
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const isAdmin = isAdminRole(actor.role);

    // ── Which teams may this user see? ────────────────────────────────────
    const { data: allTeams } = await supabase
      .from('teams')
      .select('id, name, description, leader_id, created_at');
    const { data: memberships } = await supabase.from('team_memberships').select('*');

    let visibleTeamIds: string[] | null = null; // null = all
    if (!isAdmin) {
      const myTeams = (memberships || []).filter((m: any) => m.user_id === user.id);
      const myLeaderTeams = (memberships || []).filter(
        (m: any) => m.user_id === user.id && m.is_leader
      );
      if (myLeaderTeams.length) {
        visibleTeamIds = myLeaderTeams.map((m: any) => m.team_id);
      } else if (myTeams.length) {
        visibleTeamIds = myTeams.map((m: any) => m.team_id);
      } else {
        visibleTeamIds = [];
      }
    }

    const teams = (allTeams || []).filter(
      (t: any) => visibleTeamIds === null || visibleTeamIds.includes(t.id)
    );
    if (!teams.length) return NextResponse.json({ teams: [] });

    const teamIds = teams.map((t: any) => t.id);

    // ── Team membership → member ids ──────────────────────────────────────
    const membersByTeam = new Map<string, string[]>();
    const memberIds = new Set<string>();
    const leaderIds = new Set<string>();
    (memberships || [])
      .filter((m: any) => teamIds.includes(m.team_id))
      .forEach((m: any) => {
        if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, []);
        membersByTeam.get(m.team_id)!.push(m.user_id);
        memberIds.add(m.user_id);
        if (m.is_leader) leaderIds.add(m.user_id);
      });

    const allMemberIds = Array.from(memberIds);

    // ── Data needed for the KPIs (RLS scopes each read to the viewer) ─────
    const [profilesRes, leadsRes, callsRes, expensesRes, ratingsRes] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('id, full_name, email, role')
        .in('id', allMemberIds.length ? allMemberIds : ['00000000-0000-0000-0000-000000000000']),
      supabase
        .from('leads')
        .select('id, name, assigned_to, created_by, lead_status, crm_status, budget_max, project')
        .in(
          'assigned_to',
          allMemberIds.length ? allMemberIds : ['00000000-0000-0000-0000-000000000000']
        ),
      supabase
        .from('call_logs')
        .select('user_id, channel, duration_seconds, outcome, created_at')
        .in('user_id', allMemberIds.length ? allMemberIds : ['00000000-0000-0000-0000-000000000000']),
      supabase
        .from('expenses')
        .select('created_by, amount, expense_date')
        .in(
          'created_by',
          allMemberIds.length ? allMemberIds : ['00000000-0000-0000-0000-000000000000']
        ),
      supabase.from('team_leader_ratings').select('*').in('team_id', teamIds),
    ]);

    const profiles = profilesRes.data || [];
    const leads = (leadsRes.data || []).filter((l: any) => {
      if (startISO && l.created_at < startISO) return false;
      if (endISO && l.created_at > endISO) return false;
      return true;
    });
    const calls = (callsRes.data || []).filter((c: any) => {
      if (startISO && c.created_at && c.created_at < startISO) return false;
      if (endISO && c.created_at && c.created_at > endISO) return false;
      return true;
    });
    const expenses = (expensesRes.data || []).filter((e: any) => {
      if (!startISO) return true;
      if (e.expense_date && e.expense_date < from) return false;
      if (e.expense_date && e.expense_date > to) return false;
      return true;
    });
    const ratings = ratingsRes.data || [];

    const profileById = new Map(profiles.map((p: any) => [p.id, p]));
    const leadByMember = (memberId: string) =>
      leads.filter((l: any) => l.assigned_to === memberId || l.created_by === memberId);
    const callsByMember = (memberId: string) => calls.filter((c: any) => c.user_id === memberId);
    const expensesByMember = (memberId: string) =>
      expenses.filter((e: any) => e.created_by === memberId);

    const memberStats = (memberId: string) => {
      const myLeads = leadByMember(memberId);
      const won = myLeads.filter((l: any) => l.lead_status === 'Won');
      const revenue = won.reduce((s: number, l: any) => s + Number(l.budget_max || 0), 0);
      const myCalls = callsByMember(memberId);
      const myExpenses = expensesByMember(memberId);
      return {
        leads: myLeads.length,
        won: won.length,
        revenue: Math.round(revenue * 100) / 100,
        calls: myCalls.length,
        call_duration_seconds: myCalls.reduce(
          (s: number, c: any) => s + Number(c.duration_seconds || 0),
          0
        ),
        expenses: Math.round(myExpenses.reduce((s: number, e: any) => s + Number(e.amount || 0), 0) * 100) / 100,
      };
    };

    const latestRatingByTeam = new Map<string, any>();
    ratings
      .sort((a: any, b: any) => +new Date(a.created_at) - +new Date(b.created_at))
      .forEach((r: any) => {
        latestRatingByTeam.set(r.team_id, r);
      });

    const result = teams.map((t: any) => {
      const memberIdsOfTeam = membersByTeam.get(t.id) || [];
      const leaderId = t.leader_id || null;
      const leaderProfile = leaderId ? profileById.get(leaderId) : null;
      const leaderIsMember = leaderId && memberIdsOfTeam.includes(leaderId);

      // Team leader stats: their own numbers (as leader) — if the leader is
      // not a membership row, fall back to teams.leader_id still applying.
      const leaderStats = leaderId ? memberStats(leaderId) : null;

      // Team totals = sum over all members (leader included as a member).
      const teamStats = memberIdsOfTeam.reduce(
        (acc, mid) => {
          const s = memberStats(mid);
          acc.leads += s.leads;
          acc.won += s.won;
          acc.revenue += s.revenue;
          acc.calls += s.calls;
          acc.call_duration_seconds += s.call_duration_seconds;
          acc.expenses += s.expenses;
          return acc;
        },
        {
          leads: 0,
          won: 0,
          revenue: 0,
          calls: 0,
          call_duration_seconds: 0,
          expenses: 0,
        }
      );
      const profit = Math.round((teamStats.revenue - teamStats.expenses) * 100) / 100;
      const profitMargin =
        teamStats.revenue > 0 ? Math.round((profit / teamStats.revenue) * 1000) / 10 : 0;
      const conversion =
        teamStats.leads > 0 ? Math.round((teamStats.won / teamStats.leads) * 1000) / 10 : 0;

      const rating = latestRatingByTeam.get(t.id) || null;
      const ratedByProfile = rating?.rated_by ? profileById.get(rating.rated_by) : null;

      return {
        id: t.id,
        name: t.name,
        description: t.description || '',
        leaderId,
        leaderName: leaderProfile?.full_name || '',
        memberCount: memberIdsOfTeam.length,
        stats: {
          ...teamStats,
          profit,
          profitMargin,
          conversion,
        },
        leader: leaderStats
          ? {
              id: leaderId,
              name: leaderProfile?.full_name || '',
              email: leaderProfile?.email || '',
              role: leaderProfile?.role || '',
              isMemberOfTeam: !!leaderIsMember,
              ...leaderStats,
            }
          : null,
        leaderRating: rating
          ? {
              id: rating.id,
              rating: Number(rating.rating),
              comment: rating.comment || '',
              ratedByName: ratedByProfile?.full_name || '',
              updatedAt: rating.updated_at,
            }
          : null,
      };
    });

    return NextResponse.json({ teams: result, canRate: isAdmin, from, to });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: actor } = await supabase
    .from('user_profiles')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();
  if (!actor || !isAdminRole(actor.role)) {
    return NextResponse.json({ error: 'Forbidden — only Owner/Admin can rate team leaders' }, { status: 403 });
  }

  const body = await request.json();
  const { team_id, leader_id, rating, comment } = body as {
    team_id?: string;
    leader_id?: string;
    rating?: number;
    comment?: string;
  };

  if (!team_id || !leader_id) {
    return NextResponse.json({ error: 'team_id and leader_id are required' }, { status: 400 });
  }
  const num = Number(rating);
  if (!Number.isFinite(num) || num < 1 || num > 5) {
    return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 });
  }

  try {
    // Make sure the leader actually belongs to the team (correct association).
    const { data: team } = await supabase
      .from('teams')
      .select('leader_id')
      .eq('id', team_id)
      .maybeSingle();
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 });

    const { data: membership } = await supabase
      .from('team_memberships')
      .select('id')
      .eq('team_id', team_id)
      .eq('user_id', leader_id)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json(
        { error: 'The selected user is not a member of this team' },
        { status: 400 }
      );
    }

    // Keep teams.leader_id in sync so the rating is associated with the
    // correct team leader.
    if (team.leader_id !== leader_id) {
      await supabase.from('teams').update({ leader_id }).eq('id', team_id);
    }

    const { data, error } = await supabase
      .from('team_leader_ratings')
      .insert({
        team_id,
        leader_id,
        rating: Math.round(num * 10) / 10,
        comment: (comment || '').trim(),
        rated_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ rating: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
