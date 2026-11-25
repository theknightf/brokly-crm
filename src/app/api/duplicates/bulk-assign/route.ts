import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SALES_ROLES = ['agent', 'senior_agent', 'telecaller', 'team_leader', 'broker', 'branch_manager'];

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  const { data: me } = await supabase.from('user_profiles').select('role, is_active').eq('id', user.id).maybeSingle();
  if (!me || me.is_active === false || !isAdminRole(me.role)) {
    return { error: NextResponse.json({ error: 'Only Owner, Admin and Admin Manager can do this' }, { status: 403 }) } as const;
  }
  return { supabase } as const;
}

/** GET: the sales agents that can receive duplicates (for the picker). */
export async function GET() {
  const g = await requireAdmin();
  if ('error' in g) return g.error;
  const { data, error } = await g.supabase
    .from('user_profiles')
    .select('id, full_name, email, role')
    .eq('is_active', true)
    .in('role', SALES_ROLES)
    .order('full_name', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({
    agents: (data || []).map((a: any) => ({ id: a.id, name: a.full_name || a.email || 'User', role: a.role })),
  });
}

/**
 * POST { ids: string[], agentId: string }
 * One transaction in bulk_assign_duplicates(): the original lead moves to the agent, the duplicate entries are kept
 * as copies (status "assigned") and stay with nobody. The function re-checks the caller's role itself.
 */
export async function POST(request: Request) {
  const g = await requireAdmin();
  if ('error' in g) return g.error;
  const body = await request.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.map((x: unknown) => String(x)) : [];
  const agentId = String(body?.agentId || '');
  if (!ids.length || !agentId) {
    return NextResponse.json({ error: 'ids and agentId are required' }, { status: 400 });
  }
  if (ids.length > 5000) {
    return NextResponse.json({ error: 'Select at most 5000 at a time' }, { status: 400 });
  }
  const { data, error } = await (g.supabase as any).rpc('bulk_assign_duplicates', { p_ids: ids, p_agent: agentId });
  if (error) {
    const code = String(error.code || '');
    const status = code === '42501' ? 403 : code === 'P0001' ? 409 : code === 'P0002' ? 404 : code === '22023' ? 400 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ ok: true, result: data });
}
