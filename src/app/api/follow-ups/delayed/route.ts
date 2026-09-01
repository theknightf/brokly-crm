import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const filter = url.searchParams.get('filter') || 'all'; // all | delayed | pending

  const db:any = supabase;
  let q = db.from('follow_up_tasks').select('*, lead:leads!follow_up_tasks_lead_id_fkey(name, phone), assignee:user_profiles!follow_up_tasks_user_id_fkey(full_name)').order('scheduled_at', { ascending: true }).limit(200);

  // RBAC: agent sees own, team_leader sees team, admin sees all
  const { data: actor } = await db.from('user_profiles').select('id, role, team_id').eq('id', user.id).maybeSingle();
  if (actor?.role === 'agent' || actor?.role === 'senior_agent' || actor?.role === 'telecaller') {
    q = q.eq('user_id', actor.id);
  } else if (actor?.role === 'team_leader' && actor.team_id) {
    const { data: members } = await db.from('team_memberships').select('user_id').eq('team_id', actor.team_id);
    const ids = (members||[]).map((m:any)=>m.user_id);
    if (ids.length) q = q.in('user_id', ids);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const now = Date.now();
  const enriched = (data||[]).map((t:any)=>{
    const isDelayed = t.status==='PENDING' && new Date(t.scheduled_at).getTime() < now;
    return { ...t, isDelayed, delayMinutes: isDelayed ? Math.round((now - new Date(t.scheduled_at).getTime())/60000) : 0 };
  });

  let filtered = enriched;
  if (filter==='delayed') filtered = enriched.filter((t:any)=> t.isDelayed);
  if (filter==='pending') filtered = enriched.filter((t:any)=> t.status==='PENDING');

  return NextResponse.json({ followUps: filtered, delayedCount: enriched.filter((t:any)=>t.isDelayed).length, total: enriched.length });
}
