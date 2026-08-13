import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { validateCreateUser } from '@/lib/userValidation';
import { requireUserManager } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = [
  'admin',
  'owner',
  'broker',
  'branch_manager',
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

  // Only the business owner may create further owners/admins' peers: a
  // non-owner admin cannot grant the owner role.
  if (role === 'owner' && guard.actor.role !== 'owner') {
    return NextResponse.json(
      { error: 'Only the business owner can create another owner' },
      { status: 403 }
    );
  }
  if (role === 'admin' && guard.actor.role !== 'owner' && guard.actor.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only an owner or admin can create an admin' },
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
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server' },
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
    const isDuplicate = /already registered|already been registered|duplicate/i.test(
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
    return NextResponse.json(
      { error: `User created but profile update failed: ${profileErr.message}` },
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
