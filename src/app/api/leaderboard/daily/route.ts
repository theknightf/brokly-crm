import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const date = url.searchParams.get('date') || new Date().toISOString().slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });

  const start = `${date}T00:00:00`, end = `${date}T23:59:59.999`;
  const db:any = supabase;

  const [usersRes, activityRes] = await Promise.all([
    db.from('user_profiles').select('id, full_name, email, role').eq('is_active', true).limit(100),
    db.from('activity_log').select('user_id, action_type').gte('created_at', start).lte('created_at', end).in('action_type', ['call_logged', 'lead_status_updated']),
  ]);

  const users = usersRes.data||[];

  const countBy = (arr:any[], key:string, uid:string) => arr.filter((x:any)=> x[key]===uid).length;

  const ranked = users.map((u:any)=>{
    const actions = countBy(activityRes||[], 'user_id', u.id);
    return { user_id: u.id, full_name: u.full_name||u.email, role: u.role, totalActions: actions };
  }).filter((r:any)=> r.totalActions>0).sort((a:any,b:any)=> b.totalActions - a.totalActions).map((r:any,i:number)=>({...r, rank:i+1}));

  // Fill rest with 0
  const zero = users.filter((u:any)=> !ranked.find((r:any)=>r.user_id===u.id)).map((u:any)=>({ user_id:u.id, full_name: u.full_name||u.email, role:u.role, totalActions:0, rank: ranked.length+1 }));
  const all = [...ranked, ...zero].sort((a:any,b:any)=> b.totalActions - a.totalActions).map((r:any,i:number)=>({...r, rank:i+1}));

  return NextResponse.json({ date, users: all, generated_at: new Date().toISOString() });
}
