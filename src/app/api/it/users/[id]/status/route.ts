import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth';
import { canUseItConsole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/it/users/[id]/status  { active: boolean }
 * Close (active:false) or reopen (active:true) one account. Closing:
 *  1. marks the profile inactive (every API and the app check this and sign the user out),
 *  2. bans the login so the user cannot sign in again or renew a session,
 *  3. ends their open sessions.
 * Rules: IT / owner only; never yourself; never the owner.
 */
export async function POST(request: Request, { params }: Ctx) {
  const guard = await requireAuth(await createClient());
  if (!guard.ok) return guard.response;
  if (!canUseItConsole(guard.actor.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!id || typeof body?.active !== 'boolean') return NextResponse.json({ error: 'active (true/false) is required' }, { status: 400 });
  const active: boolean = body.active;
  if (id === guard.actor.id) return NextResponse.json({ error: 'You cannot close your own account.' }, { status: 403 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Server is missing the service key.' }, { status: 500 });
  const db: any = createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: target } = await db.from('user_profiles').select('id, full_name, email, role, is_active').eq('id', id).maybeSingle();
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (String(target.role).toLowerCase() === 'owner') return NextResponse.json({ error: 'The owner account cannot be closed.' }, { status: 403 });

  const { error: upErr } = await db.from('user_profiles').update({ is_active: active }).eq('id', id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  // Block / unblock the login itself (about 100 years = closed until reopened).
  let banWarning: string | null = null;
  try {
    const { error: banErr } = await db.auth.admin.updateUserById(id, { ban_duration: active ? 'none' : '876000h' });
    if (banErr) banWarning = banErr.message;
  } catch (e: any) {
    banWarning = e?.message || 'Could not update the login';
  }

  if (!active) {
    await db
      .from('user_sessions')
      .update({ is_active: false, logout_at: new Date().toISOString(), closed_reason: 'Closed by IT' })
      .eq('user_id', id)
      .eq('is_active', true);
  }

  // Leave a trail: who closed / reopened whom.
  try {
    const { data: me } = await db.from('user_profiles').select('full_name, email').eq('id', guard.actor.id).maybeSingle();
    await db.from('audit_log').insert({
      user_id: guard.actor.id,
      user_name: me?.full_name || me?.email || 'IT',
      entity_type: 'user',
      entity_id: id,
      action: active ? 'account_reopened' : 'account_closed',
      description: `${active ? 'Reopened' : 'Closed'} the account of ${target.full_name || target.email}`,
    });
  } catch {
    /* the action itself already succeeded */
  }

  return NextResponse.json({ ok: true, active, warning: banWarning });
}
