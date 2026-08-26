import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireUserManager } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerClient();
  const guard = await requireUserManager(supabase);
  if (!guard.ok) return guard.response;

  const targetId = String((await params).id);
  if (!targetId) {
    return NextResponse.json({ error: 'Missing user id' }, { status: 400 });
  }

  // Never let an admin delete their own account (anti-lockout).
  if (targetId === guard.actor.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 403 });
  }

  // Don't allow removing the last owner.
  const { data: target } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', targetId)
    .maybeSingle();
  if (target?.role === 'owner') {
    const { count } = await supabase
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'owner');
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: 'Cannot delete the last owner' }, { status: 403 });
    }
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || serviceRoleKey.startsWith('replace-with-')) {
    return NextResponse.json(
      { error: 'Server is missing a valid SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 500 }
    );
  }
  const serviceClient = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await serviceClient.rpc('delete_user', { target_user_id: targetId });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
