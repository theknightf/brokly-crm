import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireUserManager } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/users/[id]/password  { password, confirmPassword }
 * Securely sets a new password for an existing user using the service-role
 * admin API. Passwords are never logged, returned, or stored in plaintext.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'User id is required' }, { status: 400 });

  const supabase = await createServerClient();
  const guard = await requireUserManager(supabase);
  if (!guard.ok) return guard.response;

  // An admin cannot change the password of another admin/owner without being
  // an owner — prevents lateral privilege tampering between admins.
  if (guard.actor.role !== 'owner') {
    const { data: target } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', id)
      .maybeSingle();
    if (target && (target.role === 'owner' || target.role === 'admin')) {
      if (guard.actor.id !== id) {
        return NextResponse.json(
          { error: 'Only the business owner can change the password of privileged users' },
          { status: 403 }
        );
      }
    }
  }

  // Self-service is not allowed through this admin endpoint (users change their
  // own password through the settings page instead).
  if (guard.actor.id === id) {
    return NextResponse.json(
      { error: 'Use your Settings page to change your own password' },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => null);
  const password = String(body?.password || '');
  const confirmPassword = String(body?.confirmPassword || '');
  if (!password) return NextResponse.json({ error: 'New password is required' }, { status: 400 });
  if (password.length < 8) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters' },
      { status: 400 }
    );
  }
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])/.test(password)) {
    return NextResponse.json(
      { error: 'Password must include uppercase, lowercase, and a number' },
      { status: 400 }
    );
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || serviceRoleKey.startsWith('replace-with-')) {
    return NextResponse.json(
      {
        error:
          'Server is missing a valid SUPABASE_SERVICE_ROLE_KEY. Add your real service-role key (Supabase dashboard → Settings → API) to the server environment variables and redeploy.',
      },
      { status: 500 }
    );
  }

  const serviceClient = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await serviceClient.auth.admin.updateUserById(id, { password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Deactivating other sessions of the changed password is handled by Supabase;
  // we keep audit trail best-effort.
  try {
    await supabase.from('activity_log').insert({
      user_id: guard.actor.id,
      action_type: 'Password Changed',
      entity_type: 'user',
      entity_id: id,
      detail: 'Admin changed this user password',
      meta: JSON.stringify({ target_user: id }),
    });
  } catch {
    /* best effort */
  }

  return NextResponse.json({ ok: true });
}