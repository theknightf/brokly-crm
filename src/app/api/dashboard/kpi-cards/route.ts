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

  // Cairo timezone helpers (consistent with attendanceLogic.ts)
  const cairoDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const cairoMonthStart = (offset=0) => {
    const now = new Date();
    const cairoNowStr = cairoDate(now);
    const [y,m] = cairoNowStr.split('-').map(Number);
    const base = new Date(Date.UTC(y, m-1, 1, 0,0,0));
    // adjust offset
    base.setUTCMonth(base.getUTCMonth()+offset);
    const y2 = base.getUTCFullYear();
    const m2 = String(base.getUTCMonth()+1).padStart(2,'0');
    return `${y2}-${m2}-01`;
  };
  const from = cairoMonthStart(0);
  const prevFrom = cairoMonthStart(-1);
  const prevTo = (()=>{ const d=new Date(from+'T00:00:00'); d.setDate(0); return d.toISOString().slice(0,10); })();

  const db:any = supabase;
  // Accurate counts without 5000 truncation — count per stage via head:true
  const countStage = async (stage:string, fromDate?:string, toDate?:string) => {
    let q:any = db.from('leads').select('id', { count: 'exact', head: true });
    if (assignedFilter) q = q.eq('assigned_to', assignedFilter);
    if (teamId) q = q.eq('team', teamId);
    if (stage !== 'All Leads') {
      if (stage === 'Duplicate Leads') q = q.eq('crm_status', 'Duplicate Leads');
      else q = q.or(`crm_status.eq.${stage},and(crm_status.is.null,lead_status.eq.${stage})`);
    }
    if (fromDate) q = q.gte('created_at', fromDate);
    if (toDate) q = q.lte('created_at', toDate+'T23:59:59.999Z');
    const { count } = await q;
    return Number(count||0);
  };

  const currCounts = await Promise.all(STATUSES.map(s=> countStage(s, from, undefined)));
  const prevCounts = isAdminRole(actor.role) ? await Promise.all(STATUSES.map(s=> countStage(s, prevFrom, prevTo))) : STATUSES.map(()=>0);

  const cards = STATUSES.map((stage, i)=>{
    const curr = currCounts[i];
    const prev = prevCounts[i];
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

  return NextResponse.json({ cards, teams, agents, period: { from, to: cairoDate(new Date()) } });
}
