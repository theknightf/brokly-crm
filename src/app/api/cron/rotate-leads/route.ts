import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Cron: checks unacted leads older than X hours and round-robins to next agent
// Configure via admin_settings key=rotation_hours (default 24)

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!serviceKey) return NextResponse.json({ error: 'Missing service key' }, { status: 500 });

  const service = createServiceClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let hours = 24;
  try {
    const { data: cfg } = await service.from('admin_settings').select('color').eq('category','rotation').eq('name','hours').maybeSingle();
    if (cfg?.color) hours = parseInt(cfg.color,10) || 24;
  } catch {}

  // Allow override via body
  try {
    const body = await request.json();
    if (body.hours) hours = parseInt(body.hours,10) || hours;
  } catch {}

  const cutoff = new Date(Date.now() - hours*3600*1000).toISOString();

  // Find stale leads: assigned, not acted, older than cutoff, not Done Deal/Cancel
  const { data: stale } = await service.from('leads').select('id, assigned_to, team, last_activity_at').eq('crm_status','New Fresh').lt('last_activity_at', cutoff).limit(100);

  if (!stale || stale.length===0) return NextResponse.json({ rotated: 0, hours, cutoff });

  // Get active agents round-robin
  const { data: agents } = await service.from('user_profiles').select('id, team_id').in('role', ['agent','senior_agent','telecaller','team_leader']).eq('is_active', true);
  if (!agents || agents.length===0) return NextResponse.json({ error: 'No agents' }, { status: 400 });

  let idx = 0;
  let rotated = 0;
  for (const lead of stale) {
    const pool = agents.filter((a:any)=> !lead.team || a.team_id===lead.team);
    const target = (pool.length?pool:agents)[idx % (pool.length?pool.length:agents.length)];
    idx++;
    const { error } = await service.from('leads').update({ assigned_to: target.id, crm_status: 'Data Rotation', last_activity_at: new Date().toISOString() }).eq('id', lead.id);
    if (!error) {
      rotated++;
      await service.from('activity_log').insert({ user_id: target.id, action_type: 'Lead Rotated', entity_type:'lead', entity_id: lead.id, detail: `Auto-rotated from ${lead.assigned_to} after ${hours}h inactivity` });
      await service.from('lead_rotation_log').insert({ lead_id: lead.id, from_user: lead.assigned_to, to_user: target.id, reason: 'auto_rotation_hours' });
    }
  }

  return NextResponse.json({ rotated, hours, cutoff, totalStale: stale.length });
}

// GET for manual trigger via cron
export async function GET(request: Request) {
  return POST(request);
}
