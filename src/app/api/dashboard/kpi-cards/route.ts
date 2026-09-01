import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

const STATUSES = [
  'All Leads','Duplicate Leads','Fresh Leads','Cold Calls','Pending Leads','Leaders Pending','Following Up','Meeting',
  'Following Up After Meeting','Cancellation','Done Deal','Not Interested','Interested','Wrong Number','Data Rotation','Closed Number',
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

  // RBAC filter
  let assignedFilter: string | null = null;
  if (actor.role === 'team_leader') {
    // locked to own team
    if (teamId && teamId !== actor.team_id) return NextResponse.json({ error: 'Team Leader limited to own team' }, { status: 403 });
  }
  if (actor.role === 'agent' || actor.role === 'senior_agent' || actor.role === 'telecaller') {
    assignedFilter = actor.id;
  } else if (agentId) {
    assignedFilter = agentId;
  }

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
  const prevFrom = new Date(now.getFullYear(), now.getMonth()-1, 1).toISOString().slice(0,10);
  const prevTo = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0,10);

  const db:any = supabase;
  // Build base query
  let q = db.from('leads').select('id, crm_status, lead_status, assigned_to, team, created_at');
  if (assignedFilter) q = q.eq('assigned_to', assignedFilter);
  if (teamId) q = q.eq('team', teamId);
  const { data: leads } = await q.limit(5000);

  const countBy = (arr:any[], stage:string) => {
    if (stage==='All Leads') return arr.length;
    if (stage==='Duplicate Leads') return arr.filter((l:any)=> l.crm_status==='Duplicate').length;
    return arr.filter((l:any)=> (l.crm_status||l.lead_status)===stage).length;
  };

  // Trend vs prev month
  let prevLeads:any[] = [];
  if (isAdminRole(actor.role)) {
    let pq = db.from('leads').select('crm_status').gte('created_at', prevFrom).lte('created_at', prevTo);
    if (teamId) pq = pq.eq('team', teamId);
    const { data } = await pq.limit(5000);
    prevLeads = data||[];
  }

  const cards = STATUSES.map(stage=>{
    const curr = countBy(leads||[], stage);
    const prev = countBy(prevLeads, stage);
    const trend = prev ? Math.round(((curr-prev)/Math.max(1,prev))*1000)/10 : 0;
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

  return NextResponse.json({ cards, teams, agents, period: { from, to: now.toISOString().slice(0,10) } });
}
