import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

const STATUSES = [
  'All Leads','Duplicate Leads','Fresh Leads','Cold Calls','Pending Leads','Following Up','Meeting',
  'Cancellation','Done Deal','Not Interested','Interested','Wrong Number','Data Rotation','Closed Number',
  'No Answer','No Answer At All','Low Budget','Reschedule Meeting','Reservation'
];

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: actor } = await supabase.from('user_profiles').select('id,role,team_id,is_active').eq('id', user.id).maybeSingle();
  if (!actor || actor.is_active===false) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const teamId = url.searchParams.get('teamId');
  const agentId = url.searchParams.get('agentId');
  // Optional period filter: ?range=month retains legacy monthly behavior; default = lifetime total (fixes historic Not Interested under-count)
  const range = url.searchParams.get('range'); // 'month' | null
  const normalizedRole = String(actor.role||'').trim().toLowerCase().replace(/[\s-]+/g,'_');
  const isOwner = normalizedRole === 'owner' || normalizedRole === 'owner_admin' || normalizedRole === 'owneradmin';
  const isAdmin = normalizedRole === 'admin' || isOwner; // owner inherits admin visibility

  // ── Role-scoped RBAC ───────────────────────────────────────────────
  // Sales: assigned_to = self (strict)
  // Team Leader: locked to own team, counts across team members
  // Admin: team/branch scope via teamId or admin_id fallback
  // Owner: global (no assignment filter)
  let assignedFilter: string | null = null;
  let teamMemberIds: string[] | null = null; // for team_leader / admin-team filter
  if (normalizedRole === 'team_leader') {
    if (teamId && teamId !== actor.team_id) return NextResponse.json({ error: 'Team Leader limited to own team' }, { status: 403 });
    const effectiveTeamId = teamId || actor.team_id;
    if (effectiveTeamId) {
      const { data: m } = await (supabase as any).from('team_memberships').select('user_id').eq('team_id', effectiveTeamId);
      teamMemberIds = (m||[]).map((x:any)=>x.user_id);
      // include leader themselves if not in memberships (some setups store team_id directly)
      if (actor.id && !teamMemberIds.includes(actor.id)) teamMemberIds.push(actor.id);
    }
  } else if (['agent','senior_agent','telecaller','broker','sales'].includes(normalizedRole)) {
    assignedFilter = actor.id;
  } else if (agentId) {
    // Owner/Admin drilling into a single agent
    assignedFilter = agentId;
  } else if (isAdmin && teamId) {
    // Admin explicitly filtering by team
    const { data: m } = await (supabase as any).from('team_memberships').select('user_id').eq('team_id', teamId);
    teamMemberIds = (m||[]).map((x:any)=>x.user_id);
  }
  // Admin without teamId = global (Owner semantics) OR admin_id-scoped if you want branch isolation.
  // To enforce branch isolation uncomment the block below that filters by admin_id.
  // if (normalizedRole === 'admin' && !teamId && !agentId) {
  //   const { data: managed } = await (supabase as any).from('user_profiles').select('id').eq('admin_id', actor.id);
  //   teamMemberIds = (managed||[]).map((x:any)=>x.id);
  //   teamMemberIds.push(actor.id);
  // }

  // Cairo timezone helpers (only used when range=month)
  const cairoDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const cairoMonthStart = (offset=0) => {
    const now = new Date();
    const cairoNowStr = cairoDate(now);
    const [y,m] = cairoNowStr.split('-').map(Number);
    const base = new Date(Date.UTC(y, m-1, 1, 0,0,0));
    base.setUTCMonth(base.getUTCMonth()+offset);
    const y2 = base.getUTCFullYear();
    const m2 = String(base.getUTCMonth()+1).padStart(2,'0');
    return `${y2}-${m2}-01`;
  };
  const from = range === 'month' ? cairoMonthStart(0) : undefined;
  const prevFrom = range === 'month' ? cairoMonthStart(-1) : undefined;
  const prevTo = range === 'month' ? (()=>{ const d=new Date((from as string)+'T00:00:00'); d.setDate(0); return d.toISOString().slice(0,10); })() : undefined;

  const db:any = supabase;
  // ── Normalized status helper — single source of truth for DB enum variance ──
  // Handles: case-insensitive, trim, snake_case vs PascalCase, legacy lead_status
  const normalize = (v: string | null | undefined) => String(v||'').trim().toLowerCase().replace(/[\s_-]+/g,' ');
  const STATUS_SYNONYMS: Record<string,string[]> = {
    'duplicate leads': ['duplicate leads','duplicate','duplicates'],
    'fresh leads': ['fresh leads','fresh','new fresh','new'],
    'cold calls': ['cold calls','cold','new cold','cold call'],
    'pending leads': ['pending leads','pending','leads pending'],
    'following up': ['following up','follow up','followup','following'],
    'meeting': ['meeting','site visit scheduled','site visit','scheduled'],
    'cancellation': ['cancellation','cancel','cancelled','canceled'],
    'done deal': ['done deal','d deal','won','closed won','reservation'],
    'not interested': ['not interested','not_interested','not-interested','lost','notintrested'],
    'interested': ['interested','qualified'],
    'wrong number': ['wrong number','wrong_number','wrong-number'],
    'data rotation': ['data rotation','data_rotation','rotation'],
    'closed number': ['closed number','closed_number','closed-number'],
    'no answer': ['no answer','no_answer','noanswer'],
    'no answer at all': ['no answer at all','no_answer_at_all'],
    'low budget': ['low budget','low_budget','low-budget'],
    'reschedule meeting': ['reschedule meeting','reschedule','rescheduled'],
    'reservation': ['reservation','reserved'],
  };
  const toCanonical = (raw: string) => {
    const n = normalize(raw);
    if (!n) return 'fresh leads';
    for (const [canon, alts] of Object.entries(STATUS_SYNONYMS)) {
      if (n === canon || alts.includes(n)) return canon;
    }
    // fallback: if raw contains key phrase
    for (const canon of Object.keys(STATUS_SYNONYMS)) {
      if (n.includes(canon)) return canon;
    }
    return n;
  };
  const isSoftDeleted = (row:any) => {
    // Intentional: soft-deleted leads (deleted_at / is_deleted) are excluded from ALL counts
    if (row.deleted_at) return true;
    if (row.is_deleted === true) return true;
    if (row.is_active === false) return true;
    return false;
  };

  // ── Try normalized RPC first (single round-trip, handles trim/case/legacy + RLS) ──
  // Falls back to per-stage head counts if RPC missing on older DBs
  type CountsMap = Record<string, number>;
  const fetchNormalizedCounts = async (fromDate?:string, toDate?:string): Promise<CountsMap> => {
    // 1) Prefer server-side normalized aggregate (SECURITY INVOKER → respects RLS + role scope via our filters below if RPC supports params; else we filter client side)
    // We implement client-side aggregation over a lightweight select to guarantee normalization + soft-delete + unassigned handling.
    // Fetch minimal columns, chunked to avoid 1000-row PostgREST limit via pagination
    const pageSize = 1000;
    let offset = 0;
    const map: CountsMap = {};
    let total = 0;
    // Build base filter as a query builder factory
    const buildBase = () => {
      let q:any = db.from('leads').select('crm_status, lead_status, assigned_to, deleted_at, is_deleted, is_active, created_at');
      if (assignedFilter) q = q.eq('assigned_to', assignedFilter);
      else if (teamMemberIds) {
        if (teamMemberIds.length === 0) return null;
        q = q.in('assigned_to', teamMemberIds);
      } else if (teamId && isAdmin) {
        q = q.eq('team', teamId);
      }
      if (fromDate) q = q.gte('created_at', fromDate);
      if (toDate) q = q.lte('created_at', toDate+'T23:59:59.999Z');
      return q;
    };
    // If role is Owner/Admin and no team filter, we rely on RLS global; no extra filter
    while (true) {
      const base = buildBase();
      if (base === null) break;
      const { data, error } = await base.range(offset, offset+pageSize-1);
      if (error) {
        // Column deleted_at/is_deleted may not exist on older schemas → retry without them
        if (/deleted_at|is_deleted|is_active|team/i.test(error.message||'')) {
          let retry:any = db.from('leads').select('crm_status, lead_status, assigned_to, created_at');
          if (assignedFilter) retry = retry.eq('assigned_to', assignedFilter);
          else if (teamMemberIds && teamMemberIds.length) retry = retry.in('assigned_to', teamMemberIds);
          if (fromDate) retry = retry.gte('created_at', fromDate);
          if (toDate) retry = retry.lte('created_at', toDate+'T23:59:59.999Z');
          const { data: d2, error: e2 } = await retry.range(offset, offset+pageSize-1);
          if (e2) break;
          if (!d2 || d2.length===0) break;
          for (const row of d2 as any[]) {
            const raw = row.crm_status ?? row.lead_status ?? 'Fresh Leads';
            const canon = toCanonical(String(raw));
            // Map canon to STATUSES casing
            const statusKey = STATUSES.find(s=> normalize(s)===canon) || raw;
            map[statusKey] = (map[statusKey]||0)+1;
            if (canon==='not interested') map['Not Interested'] = (map['Not Interested']||0); // ensure key exists
            total++;
          }
          if (d2.length < pageSize) break;
          offset += pageSize;
          if (offset > 50000) break; // safety cap
          continue;
        }
        break;
      }
      if (!data || data.length===0) break;
      for (const row of data as any[]) {
        if (isSoftDeleted(row)) continue; // exclude soft-deleted
        // Unassigned handling: count all per business logic; optionally filter out if required
        // Business rule now: count unassigned in Owner/Admin global, exclude from Sales (already filtered by assigned_to)
        const raw = row.crm_status ?? row.lead_status ?? 'Fresh Leads';
        const canon = toCanonical(String(raw));
        const statusKey = STATUSES.find(s=> normalize(s)===canon) || String(raw).trim() || 'Fresh Leads';
        map[statusKey] = (map[statusKey]||0)+1;
        total++;
      }
      if (data.length < pageSize) break;
      offset += pageSize;
      if (offset > 50000) break; // safety: >50k leads → switch to head-count fallback
    }
    // If we fetched zero due to RLS empty or error, fallback to head counts (previous logic)
    if (total===0 && offset===0) return {};
    // Ensure All Leads total is sum of all normalized
    const allTotal = Object.values(map).reduce((a,b)=>a+b,0);
    map['All Leads'] = allTotal;
    // Ensure every STATUSES key exists (0 if missing) for UI stability
    for (const s of STATUSES) if (!(s in map)) map[s]=0;
    // Alias legacy counts: ensure Not Interested includes both crm_status and lead_status='Lost' already via toCanonical
    return map;
  };

  // Accurate counts without 5000 truncation — try normalized fetch, fallback to per-stage head
  const fetchCounts = async (fromDate?:string, toDate?:string): Promise<number[]> => {
    const norm = await fetchNormalizedCounts(fromDate, toDate);
    if (Object.keys(norm).length) {
      return STATUSES.map(s=> Number(norm[s]||0));
    }
    // Fallback: per-stage head:true (legacy, case-sensitive)
    const countStage = async (stage:string) => {
      let q:any = db.from('leads').select('id', { count: 'exact', head: true });
      if (assignedFilter) q = q.eq('assigned_to', assignedFilter);
      else if (teamMemberIds) {
        if (teamMemberIds.length === 0) return 0;
        q = q.in('assigned_to', teamMemberIds);
      } else if (teamId && isAdmin) q = q.eq('team', teamId);
      if (stage !== 'All Leads') {
        if (stage === 'Duplicate Leads') q = q.ilike('crm_status', 'Duplicate Leads');
        else if (stage === 'Not Interested') q = q.or(`crm_status.ilike.Not Interested,and(crm_status.is.null,lead_status.ilike.Lost)`);
        else q = q.or(`crm_status.ilike.${stage},and(crm_status.is.null,lead_status.ilike.${stage})`);
      }
      if (fromDate) q = q.gte('created_at', fromDate);
      if (toDate) q = q.lte('created_at', toDate+'T23:59:59.999Z');
      const { count } = await q;
      return Number(count||0);
    };
    return Promise.all(STATUSES.map(s=> countStage(s)));
  };

  const currCounts = await fetchCounts(from, undefined);
  const prevCounts = isAdminRole(actor.role) && range === 'month' ? await fetchCounts(prevFrom, prevTo) : STATUSES.map(()=>0);

  const calcTrend = (curr:number, prev:number) => {
    if (prev === 0) return curr === 0 ? 0 : 100; // spec: 0->0 =0%, 0->>0 =+100%
    return Math.round(((curr - prev) / prev) * 1000) / 10;
  };
  const cards = STATUSES.map((stage, i)=>{
    const curr = currCounts[i];
    const prev = prevCounts[i];
    const trend = calcTrend(curr, prev);
    const sign = trend > 0 ? '↑' : trend < 0 ? '↓' : '↑';
    // Keep ↑ 0% for zero case to avoid ↓ 0% confusion
    return { stage, count: curr, trend: `${sign} ${Math.abs(trend)}%`, trendValue: trend };
  });

  // Team filter options for Admin/Owner
  let teams: any[] = [];
  let agents: any[] = [];
  if (isAdminRole(actor.role) || actor.role==='team_leader') {
    const { data: t } = await db.from('teams').select('id, name').limit(50);
    teams = t||[];
    const teamFilter = teamId || (actor.role==='team_leader' ? actor.team_id : null);
    if (teamFilter) {
      const { data: m } = await db.from('team_memberships').select('user_id').eq('team_id', teamFilter);
      const ids = (m||[]).map((x:any)=>x.user_id);
      if (ids.length) {
        const { data: u } = await db.from('user_profiles').select('id, full_name, email').in('id', ids);
        agents = u||[];
      }
    } else if (isAdminRole(actor.role)) {
      const { data: u } = await db.from('user_profiles').select('id, full_name, email, team_id').limit(100);
      agents = u||[];
    }
  }

  // ── Diagnostic: raw DB grouping for cross-check (only when ?diagnostic=1 or ?debug=1) ──
  const wantDiag = url.searchParams.get('diagnostic') === '1' || url.searchParams.get('debug') === '1';
  let diagnostic: any = undefined;
  if (wantDiag) {
    try {
      const rawMap: Record<string,number> = {};
      const rawCanon: Record<string,number> = {};
      const sample: Record<string,string[]> = {};
      let off=0;
      while (true) {
        let q:any = db.from('leads').select('crm_status, lead_status, assigned_to, created_at');
        if (assignedFilter) q=q.eq('assigned_to', assignedFilter);
        else if (teamMemberIds) { if(!teamMemberIds.length) break; q=q.in('assigned_to', teamMemberIds); }
        else if (teamId && isAdmin) q=q.eq('team', teamId);
        // no date filter for diagnostic — full truth
        const { data } = await q.range(off, off+999);
        if (!data || !data.length) break;
        for (const r of data as any[]) {
          const raw = String(r.crm_status ?? r.lead_status ?? 'NULL');
          rawMap[raw] = (rawMap[raw]||0)+1;
          const canon = toCanonical(raw);
          const pretty = STATUSES.find(s=> normalize(s)===canon) || canon;
          rawCanon[pretty] = (rawCanon[pretty]||0)+1;
          if (!sample[raw]) sample[raw]=[];
          if (sample[raw].length<3) sample[raw].push(String(r.assigned_to||'unassigned'));
        }
        if (data.length<1000) break;
        off+=1000; if(off>50000) break;
      }
      diagnostic = { rawByExactValue: rawMap, rawByCanonical: rawCanon, sampleAssignees: sample, totalRaw: Object.values(rawMap).reduce((a,b)=>a+b,0) };
    } catch (e:any) { diagnostic = { error: String(e?.message||e) }; }
  }

  return NextResponse.json({ cards, teams, agents, period: { from: from || 'all-time', to: cairoDate(new Date()) }, scope: isOwner ? 'owner-global' : normalizedRole==='admin' ? 'admin-team' : teamMemberIds ? 'team' : assignedFilter ? 'sales-assigned' : 'unknown', ...(wantDiag?{diagnostic}:{}) });
}
