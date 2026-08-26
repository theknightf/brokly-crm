import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { validateCreateUser } from '@/lib/userValidation';
import { requireUserManager } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = [
  'admin',
  'owner',
  'it_manager',
  'broker',
  'branch_manager',
  'team_leader',
  'senior_agent',
  'agent',
  'telecaller',
];

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const guard = await requireUserManager(supabase);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const errors = validateCreateUser(body);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: 'Validation failed', fields: errors }, { status: 422 });
  }

  const email = (body.email as string).trim().toLowerCase();
  const fullName = (body.fullName as string).trim();
  const code = ((body.code as string) || '').trim();
  const role = ALLOWED_ROLES.includes(body.role as string) ? (body.role as string) : 'agent';

  // Privileged roles require an acting owner — same rule as PATCH and the
  // prevent_privilege_escalation database guard.
  const isPrivileged = role === 'owner' || role === 'admin' || role === 'it_manager';
  if (isPrivileged && guard.actor.role !== 'owner') {
    return NextResponse.json(
      { error: `Only an owner can create an ${role.replace('_', ' ')}` },
      { status: 403 }
    );
  }

  const { data: existing } = await supabase
    .from('user_profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
  }

  // Assigned admin — defaults to the acting admin when not provided
  const adminId = ((body.adminId as string) || guard.actor.id) as string;
  const { data: targetAdmin } = await supabase
    .from('user_profiles')
    .select('id, role')
    .eq('id', adminId)
    .maybeSingle();
  if (!targetAdmin || (targetAdmin.role !== 'admin' && targetAdmin.role !== 'owner')) {
    return NextResponse.json(
      { error: 'Assigned admin must be an admin or owner' },
      { status: 400 }
    );
  }

  // Provisioning auth users with a known password requires the service-role key
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

  const { data: created, error: createErr } = await serviceClient.auth.admin.createUser({
    email,
    password: body.password as string,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role,
      agent_code: code,
      admin_id: adminId,
    },
  });

  if (createErr) {
    const isDuplicate =
      /already\s+(?:been\s+)?registered|already exists|duplicate|unique constraint|user already/i.test(
        createErr.message
      );
    return NextResponse.json(
      { error: isDuplicate ? 'A user with this email already exists' : createErr.message },
      { status: isDuplicate ? 409 : 400 }
    );
  }

  // handle_new_user trigger already created the base profile; upsert the admin fields
  const profileUpsert: any = {
    id: created.user.id,
    email,
    full_name: fullName,
    role,
    agent_code: code,
    admin_id: adminId,
    is_active: true,
  };

  let { error: profileErr } = await serviceClient.from('user_profiles').upsert(profileUpsert);

  if (profileErr && /column.*does not exist/i.test(profileErr.message)) {
    // admin_id/agent_code migration not applied yet — create with base fields only.
    const { error: fallbackErr } = await serviceClient.from('user_profiles').upsert({
      id: created.user.id,
      email,
      full_name: fullName,
      role,
      is_active: true,
    });
    profileErr = fallbackErr;
  }

  if (profileErr) {
    // Roll back the auth account so the email is not stranded: a retry would
    // otherwise hit "already registered" with no way to recover from the UI.
    await serviceClient.auth.admin.deleteUser(created.user.id);
    return NextResponse.json(
      { error: `Could not create user profile: ${profileErr.message}` },
      { status: 500 }
    );
  }

  // Re-read the profile with wider columns; fall back to base columns when the
  // optional admin_id/agent_code columns haven't been migrated yet.
  let profileRow: any = null;
  const fullCols =
    'id, email, full_name, phone, role, brokerage_name, avatar_url, is_active, agent_code, admin_id, created_at';
  const baseCols = 'id, email, full_name, phone, role, brokerage_name, avatar_url, is_active, created_at';
  let { data } = await serviceClient
    .from('user_profiles')
    .select(fullCols)
    .eq('id', created.user.id)
    .maybeSingle();
  if (!data) {
    ({ data } = await serviceClient
      .from('user_profiles')
      .select(baseCols)
      .eq('id', created.user.id)
      .maybeSingle());
  }
  profileRow = data || {
    id: created.user.id,
    email,
    full_name: fullName,
    role,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  return NextResponse.json({ user: profileRow }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createServerClient();
  const guard = await requireUserManager(supabase);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !body.id) {
    return NextResponse.json({ error: 'Missing user id' }, { status: 400 });
  }

  const targetId = String(body.id);
  const actorRole = guard.actor.role;
  if (actorRole !== 'owner' && actorRole !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const payload: Record<string, any> = {};
  if (body.fullName !== undefined) payload.full_name = String(body.fullName).trim();
  if (body.phone !== undefined) payload.phone = String(body.phone || '').trim();
  if (body.role !== undefined) {
    const role = String(body.role);
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    if (role === 'owner' && actorRole !== 'owner') {
      return NextResponse.json({ error: 'Only an owner can grant owner' }, { status: 403 });
    }
    if (role === 'admin' && actorRole !== 'owner') {
      return NextResponse.json({ error: 'Only an owner can grant admin' }, { status: 403 });
    }
    payload.role = role;
  }
  if (body.isActive !== undefined) payload.is_active = Boolean(body.isActive);
  if (body.teamId !== undefined) payload.team_id = body.teamId || null;

  // Prevent privilege escalation: an admin cannot change their own role or
  // is_active, and cannot change another user's role to admin/owner.
  if (targetId === guard.actor.id) {
    if (payload.role !== undefined) {
      return NextResponse.json({ error: 'Cannot change your own role' }, { status: 403 });
    }
    if (payload.is_active === false) {
      return NextResponse.json({ error: 'Cannot deactivate yourself' }, { status: 403 });
    }
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

  const { error: updateErr } = await serviceClient.from('user_profiles').update(payload).eq('id', targetId);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  const fullCols =
    'id, email, full_name, phone, role, brokerage_name, avatar_url, is_active, agent_code, admin_id, created_at';
  const baseCols = 'id, email, full_name, phone, role, brokerage_name, avatar_url, is_active, created_at';
  let { data } = await serviceClient
    .from('user_profiles')
    .select(fullCols)
    .eq('id', targetId)
    .maybeSingle();
  if (!data) {
    ({ data } = await serviceClient
      .from('user_profiles')
      .select(baseCols)
      .eq('id', targetId)
      .maybeSingle());
  }

  return NextResponse.json({ user: data || { id: targetId, ...payload } });
}
