import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole, canManageUsers } from '@/lib/roles';

export type ServerClient = Awaited<ReturnType<typeof createClient>>;

export interface Actor {
  id: string;
  email: string | null;
  role: string;
  is_active: boolean;
}

export type AuthResult<T> =
  | { ok: true; actor: T; response?: never }
  | { ok: false; response: NextResponse; actor?: never };

/**
 * Authenticate the request and load the acting user's profile.
 * Deactivated users are rejected so deactivation takes effect immediately.
 */
export async function requireAuth(
  db: ServerClient
): Promise<AuthResult<Actor>> {
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: actor } = await db
    .from('user_profiles')
    .select('id, email, role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!actor) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  if (actor.is_active === false) {
    return { ok: false, response: NextResponse.json({ error: 'Account disabled' }, { status: 403 }) };
  }
  return { ok: true, actor };
}

/** Authenticate + require an admin/owner role. */
export async function requireAdmin(
  db: ServerClient
): Promise<AuthResult<Actor>> {
  const result = await requireAuth(db);
  if (!result.ok) return result;
  if (!isAdminRole(result.actor.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return result;
}

/** Authenticate + require permission to manage users (owner/admin). */
export async function requireUserManager(
  db: ServerClient
): Promise<AuthResult<Actor>> {
  const result = await requireAuth(db);
  if (!result.ok) return result;
  if (!canManageUsers(result.actor.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return result;
}