import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const date = url.searchParams.get('date') || new Date().toISOString().slice(0,10);
  const teamId = url.searchParams.get('teamId');
  const agentId = url.searchParams.get('agentId');

  const db:any = supabase;
  let userIds: string[] | null = null;
  if (teamId) {
    const { data: members } = await db.from('team_memberships').select('user_id').eq('team_id', teamId);
    userIds = (members||[]).map((m:any)=> m.user_id);
  }
  if (agentId) userIds = [agentId];

  // Fetch activity per hour 0-23 for working hours 9-18
  let q = db.from('activity_log').select('created_at').gte('created_at', `${date}T00:00:00`).lte('created_at', `${date}T23:59:59.999`);
  if (userIds && userIds.length) q = q.in('user_id', userIds);
  else if (teamId && userIds && userIds.length===0) return NextResponse.json({ date, hours: Array.from({length:10},(_,i)=>({ hour: 9+i, count:0 })) });

  const { data } = await q.limit(5000);
  const hours = Array.from({ length: 10 }, (_, i) => {
    const h = 9 + i;
    const count = (data||[]).filter((a:any)=> new Date(a.created_at).getHours()===h).length;
    return { hour: h, label: `${h}:00`, count };
  });

  return NextResponse.json({ date, hours, total: (data||[]).length });
}
