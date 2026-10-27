import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';
import { ALL_STATUSES } from '@/lib/ui';

export const dynamic = 'force-dynamic';

//Single source of truth: canonical list from @/lib/ui (same as Import dropdown,
// Leads Filters, Add/Edit forms). 'All Leads' is filter-only, prepended for cards.
const FALLBACK_STATUSES = ['All Leads', ...ALL_STATUSES];

// Short server-side cache per user+filter (10s TTL) to eliminate duplicate burst hits
const kpiServerCache = new Map<string, { expiresAt: number; payload: any }>();

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: actor } = await supabase.from('user_profiles').select('id,role,team_id,is_active').eq('id', user.id).maybeSingle();
  if (!actor || actor.is_active === false) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const teamId = url.searchParams.get('teamId');
  const agentId = url.searchParams.get('agentId');
  const range = url.searchParams.get('range'); // 'month' | null
  const cacheKey = `${actor.id}:${actor.role}:${teamId || ''}:${agentId || ''}:${range || ''}`;
  const hit = kpiServerCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    return NextResponse.json(hit.payload);
  }

  const normalizedRole = String(actor.role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const isOwner = normalizedRole === 'owner' || normalizedRole === 'owner_admin' || normalizedRole === 'owneradmin';
  const isAdmin = normalizedRole === 'admin' || isOwner;

  // ── Role-scoped RBAC ───────────────────────────────────────────────
  let assignedFilter: string | null = null;
  let teamMemberIds: string[] | null = null;
  if (normalizedRole === 'team_leader') {
    if (teamId && teamId !== actor.team_id) return NextResponse.json({ error: 'Team Leader limited to own team' }, { status: 403 });
    const effectiveTeamId = teamId || actor.team_id;
    if (effectiveTeamId) {
      const { data: m } = await (supabase as any).from('team_memberships').select('user_id').eq('team_id', effectiveTeamId);
      const ids: string[] = (m || []).map((x: any) => x.user_id);
      if (actor.id && !ids.includes(actor.id)) ids.push(actor.id);
      teamMemberIds = ids;
    }
  } else if (['agent', 'senior_agent', 'telecaller', 'broker', 'sales'].includes(normalizedRole)) {
    assignedFilter = actor.id;
  } else if (agentId) {
    assignedFilter = agentId;
  } else if (isAdmin && teamId) {
    const { data: m } = await (supabase as any).from('team_memberships').select('user_id').eq('team_id', teamId);
    teamMemberIds = (m || []).map((x: any) => x.user_id);
  }

  // Cairo timezone helpers (only used when range=month)
  const cairoDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const cairoMonthStart = (offset = 0) => {
    const now = new Date();
    const cairoNowStr = cairoDate(now);
    const [y, m] = cairoNowStr.split('-').map(Number);
    const base = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    base.setUTCMonth(base.getUTCMonth() + offset);
    const y2 = base.getUTCFullYear();
    const m2 = String(base.getUTCMonth() + 1).padStart(2, '0');
    return `${y2}-${m2}-01`;
  };
  const from = range === 'month' ? cairoMonthStart(0) : undefined;
  const prevFrom = range === 'month' ? cairoMonthStart(-1) : undefined;
  const prevTo = range === 'month' ? (() => { const d = new Date((from as string) + 'T00:00:00'); d.setDate(0); return d.toISOString().slice(0, 10); })() : undefined;

  const db: any = supabase;

  // Build single leads query + admin settings + team/agent metadata in parallel!
  const buildLeadsQuery = (withTeamCol: boolean) => {
    let q: any = db.from('leads').select('crm_status, lead_status, created_at');
    if (assignedFilter) q = q.eq('assigned_to', assignedFilter);
    else if (teamMemberIds) {
      if (teamMemberIds.length === 0) return null;
      q = q.in('assigned_to', teamMemberIds);
    } else if (withTeamCol && teamId && isAdmin) {
      q = q.eq('team', teamId);
    }
    if (prevFrom) q = q.gte('created_at', prevFrom);
    else if (from) q = q.gte('created_at', from);
    return q;
  };

  const leadsQuery = buildLeadsQuery(true);
  const [settingsRes, leadsResRaw, teamsRes] = await Promise.all([
    db.from('admin_settings').select('name, sort_order').eq('category', 'pipelineStages').eq('is_active', true).order('sort_order', { ascending: true }),
    leadsQuery ? leadsQuery : Promise.resolve({ data: [], error: null }),
    (isAdminRole(actor.role) || actor.role === 'team_leader')
      ? db.from('teams').select('id, name').limit(50)
      : Promise.resolve({ data: [] }),
  ]);

  let leadRows: any[] = leadsResRaw?.data || [];
  if (leadsResRaw?.error && /team/i.test(leadsResRaw.error.message || '')) {
    const retryQ = buildLeadsQuery(false);
    if (retryQ) {
      const r2 = await retryQ;
      leadRows = r2?.data || [];
    }
  }

  // Merge canonical statuses with custom admin_settings pipelineStages + distinct DB statuses
  const pipelineNames: string[] = !settingsRes.error && settingsRes.data?.length
    ? (settingsRes.data as any[]).map((r) => String(r.name || '').trim()).filter(Boolean)
    : [];
  const distinctLeadStatuses: string[] = Array.from(
    new Set(leadRows.map((r: any) => String(r.crm_status || '').trim()).filter(Boolean) as string[])
  );
  const seen = new Set(FALLBACK_STATUSES.map((s) => s.toLowerCase()));
  const STATUSES = [...FALLBACK_STATUSES];
  for (const name of [...pipelineNames, ...distinctLeadStatuses]) {
    const key = name.toLowerCase();
    if (!seen.has(key) && key !== 'not intereted' && key !== 'not_interested') {
      seen.add(key);
      STATUSES.push(name);
    }
  }

  // Single-pass in-memory aggregation (replaces 20-40 separate HTTP queries!)
  const canonicalByLower = new Map<string, string>();
  for (const st of STATUSES) {
    canonicalByLower.set(st.toLowerCase(), st);
  }
  const currByStage = new Map<string, number>();
  const prevByStage = new Map<string, number>();
  for (const st of STATUSES) {
    currByStage.set(st, 0);
    prevByStage.set(st, 0);
  }

  const prevToEnd = prevTo ? `${prevTo}T23:59:59.999Z` : undefined;
  for (const row of leadRows) {
    const raw = String(row.crm_status || row.lead_status || '').trim();
    const lower = raw.toLowerCase();
    let matchedStage: string | undefined;
    if (lower === 'not interested' || lower === 'not intereted' || lower === 'not_interested' || (!row.crm_status && lower === 'lost')) {
      matchedStage = 'Not Interested';
    } else {
      matchedStage = canonicalByLower.get(lower);
    }

    const createdAt = row.created_at ? String(row.created_at) : '';
    const inCurr = !from || createdAt >= from;
    const inPrev = !!(prevFrom && prevToEnd && createdAt >= prevFrom && createdAt <= prevToEnd);

    if (inCurr) {
      currByStage.set('All Leads', (currByStage.get('All Leads') || 0) + 1);
      if (matchedStage) {
        currByStage.set(matchedStage, (currByStage.get(matchedStage) || 0) + 1);
      }
    } else if (inPrev) {
      prevByStage.set('All Leads', (prevByStage.get('All Leads') || 0) + 1);
      if (matchedStage) {
        prevByStage.set(matchedStage, (prevByStage.get(matchedStage) || 0) + 1);
      }
    }
  }

  const cards = STATUSES.map((stage) => {
    const curr = currByStage.get(stage) || 0;
    const prev = isAdminRole(actor.role) && range === 'month' ? (prevByStage.get(stage) || 0) : 0;
    let trend: number;
    if (prev === 0 && curr === 0) trend = 0;
    else if (prev === 0 && curr > 0) trend = 100;
    else trend = Math.round(((curr - prev) / prev) * 1000) / 10;
    return { stage, count: curr, trend: `${trend >= 0 ? '↑' : '↓'} ${Math.abs(trend)}%`, trendValue: trend };
  });

  // Team filter options for Admin/Owner
  const teams: any[] = teamsRes?.data || [];
  let agents: any[] = [];
  if (isAdminRole(actor.role) || actor.role === 'team_leader') {
    const teamFilter = teamId || (actor.role === 'team_leader' ? actor.team_id : null);
    if (teamFilter) {
      const ids = teamMemberIds || ((await db.from('team_memberships').select('user_id').eq('team_id', teamFilter)).data || []).map((x: any) => x.user_id);
      if (ids.length) {
        const { data: u } = await db.from('user_profiles').select('id, full_name, email').in('id', ids);
        agents = u || [];
      }
    } else if (isAdminRole(actor.role)) {
      const { data: u } = await db.from('user_profiles').select('id, full_name, email, team_id').limit(100);
      agents = u || [];
    }
  }

  const payload = {
    cards,
    teams,
    agents,
    period: { from: from || 'all-time', to: cairoDate(new Date()) },
    scope: isOwner ? 'owner-global' : normalizedRole === 'admin' ? 'admin-team' : teamMemberIds ? 'team' : assignedFilter ? 'sales-assigned' : 'unknown',
  };
  kpiServerCache.set(cacheKey, { expiresAt: Date.now() + 10_000, payload });
  return NextResponse.json(payload);
}
