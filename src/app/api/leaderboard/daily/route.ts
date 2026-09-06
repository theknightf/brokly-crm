import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MEETING_OUTCOMES = ['Meeting', 'Schedule Meeting', 'Site Visit'];

// GET /api/leaderboard/daily?date=YYYY-MM-DD
// Ranks agents by TOTAL daily actions (desc): calls made + status updates +
// meetings logged + deals closed on that date. Breakdown is returned per agent
// so the UI can show exactly what the number is made of.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const date = url.searchParams.get('date') || new Date().toISOString().slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });

  const start = `${date}T00:00:00`, end = `${date}T23:59:59.999`;
  const db:any = supabase;

  const [usersRes, callsRes, statusRes, dealsRes, visitsRes] = await Promise.all([
    db.from('user_profiles').select('id, full_name, email, role').eq('is_active', true).limit(100),
    // Calls made that day (any outcome)
    db.from('call_logs').select('user_id, outcome, created_at').gte('created_at', start).lte('created_at', end),
    // Status updates that day
    db.from('activity_log').select('user_id, action_type').gte('created_at', start).lte('created_at', end).eq('action_type', 'lead_status_updated'),
    // Deals closed that day (status moved to Done Deal, attributed to assignee)
    db.from('leads').select('assigned_to, crm_status, updated_at').eq('crm_status', 'Done Deal').gte('updated_at', start).lte('updated_at', end),
    // Field meetings / site visits checked in that day (table may not exist yet)
    db.from('site_visits').select('user_id, check_in_at').gte('check_in_at', start).lte('check_in_at', end).then(
      (r: any) => r,
      () => ({ data: [] as any[] })
    ),
  ]);

  const users = usersRes.data||[];
  const calls = callsRes.data || [];
  const statusUpdates = statusRes.data || [];
  const deals = dealsRes.data || [];
  const visits = (visitsRes as any)?.data || [];

  const countBy = (arr:any[], key:string, uid:string) => arr.filter((x:any)=> x[key]===uid).length;

  const ranked = users.map((u:any)=>{
    const userCalls = (calls as any[]).filter((x:any)=> x.user_id===u.id);
    const callCount = userCalls.length;
    const statusCount = countBy(statusUpdates, 'user_id', u.id);
    const meetingCalls = userCalls.filter((x:any)=> MEETING_OUTCOMES.includes(x.outcome || '')).length;
    const visitCount = countBy(visits, 'user_id', u.id);
    const meetingCount = meetingCalls + visitCount;
    const dealCount = countBy(deals, 'assigned_to', u.id);
    return {
      user_id: u.id,
      full_name: u.full_name||u.email,
      role: u.role,
      calls: callCount,
      statusUpdates: statusCount,
      meetings: meetingCount,
      deals: dealCount,
      totalActions: callCount + statusCount + meetingCount + dealCount,
    };
  }).filter((r:any)=> r.totalActions>0).sort((a:any,b:any)=> b.totalActions - a.totalActions).map((r:any,i:number)=>({...r, rank:i+1}));

  // Fill rest with 0
  const zero = users.filter((u:any)=> !ranked.find((r:any)=>r.user_id===u.id)).map((u:any)=>({ user_id:u.id, full_name: u.full_name||u.email, role:u.role, calls:0, statusUpdates:0, meetings:0, deals:0, totalActions:0, rank: ranked.length+1 }));
  const all = [...ranked, ...zero].sort((a:any,b:any)=> b.totalActions - a.totalActions).map((r:any,i:number)=>({...r, rank:i+1}));

  return NextResponse.json({ date, users: all, generated_at: new Date().toISOString() });
}
