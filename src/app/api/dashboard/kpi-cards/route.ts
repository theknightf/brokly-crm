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
  // Accurate counts without 5000 truncation — count per stage via head:true
  // Fixes: (1) no global assigned_to leak for Owner/Admin (role-scoped above), (2) no hidden month-gating unless ?range=month, (3) legacy Lost ↔ Not Interested sync, (4) team filter via membership not leads.team text
  const countStage = async (stage:string, fromDate?:string, toDate?:string) => {
    let q:any = db.from('leads').select('id', { count: 'exact', head: true });
    if (assignedFilter) q = q.eq('assigned_to', assignedFilter);
    else if (teamMemberIds) {
      if (teamMemberIds.length === 0) return 0;
      q = q.in('assigned_to', teamMemberIds);
    } else if (teamId && isAdmin) {
      // Fallback for legacy leads.team TEXT label (when membership empty)
      q = q.eq('team', teamId);
    }
    if (stage !== 'All Leads') {
      if (stage === 'Duplicate Leads') q = q.or(`crm_status.ilike.Duplicate Leads,and(crm_status.is.null,lead_status.ilike.Duplicate Leads)`);
      else if (stage === 'Not Interested') {
        // Case-insensitive + trim + typo 'not intereted' + legacy Lost
        q = q.or(`crm_status.ilike.Not Interested,crm_status.ilike.not intereted,crm_status.ilike.not_interested,and(crm_status.is.null,lead_status.ilike.Lost),and(crm_status.is.null,lead_status.ilike.Not Interested)`);
      } else {
        q = q.or(`crm_status.ilike.${stage},and(crm_status.is.null,lead_status.ilike.${stage})`);
      }
    }
    if (fromDate) q = q.gte('created_at', fromDate);
    if (toDate) q = q.lte('created_at', toDate+'T23:59:59.999Z');
    const { count, error } = await q;
    if (error) {
      // Column team may not exist on older DBs; degrade gracefully
      if (/team/i.test(error.message||'')) {
        let retry:any = db.from('leads').select('id', { count: 'exact', head: true });
        if (assignedFilter) retry = retry.eq('assigned_to', assignedFilter);
        else if (teamMemberIds && teamMemberIds.length) retry = retry.in('assigned_to', teamMemberIds);
        if (stage !== 'All Leads') {
          if (stage === 'Not Interested') retry = retry.or(`crm_status.ilike.Not Interested,crm_status.ilike.not intereted,crm_status.ilike.not_interested,and(crm_status.is.null,lead_status.ilike.Lost),and(crm_status.is.null,lead_status.ilike.Not Interested)`);
          else if (stage !== 'Duplicate Leads') retry = retry.or(`crm_status.ilike.${stage},and(crm_status.is.null,lead_status.ilike.${stage})`);
          else retry = retry.or(`crm_status.ilike.Duplicate Leads,and(crm_status.is.null,lead_status.ilike.Duplicate Leads)`);
        }
        if (fromDate) retry = retry.gte('created_at', fromDate);
        if (toDate) retry = retry.lte('created_at', toDate+'T23:59:59.999Z');
        const { count: c2 } = await retry;
        return Number(c2||0);
      }
      return 0;
    }
    return Number(count||0);
  };

  const currCounts = await Promise.all(STATUSES.map(s=> countStage(s, from, undefined)));
  const prevCounts = isAdminRole(actor.role) && range === 'month' ? await Promise.all(STATUSES.map(s=> countStage(s, prevFrom, prevTo))) : STATUSES.map(()=>0);

  const cards = STATUSES.map((stage, i)=>{
    const curr = currCounts[i];
    const prev = prevCounts[i];
    let trend: number;
    if (prev === 0 && curr === 0) trend = 0;
    else if (prev === 0 && curr > 0) trend = 100;
    else trend = Math.round(((curr-prev)/prev)*1000)/10;
    return { stage, count: curr, trend: `${trend>=0?'↑':'↓'} ${Math.abs(trend)}%`, trendValue: trend };
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

  return NextResponse.json({ cards, teams, agents, period: { from: from || 'all-time', to: cairoDate(new Date()) }, scope: isOwner ? 'owner-global' : normalizedRole==='admin' ? 'admin-team' : teamMemberIds ? 'team' : assignedFilter ? 'sales-assigned' : 'unknown' });
}
