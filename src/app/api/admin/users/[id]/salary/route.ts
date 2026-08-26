import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireUserManager } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/users/[id]/salary  { baseSalary }
 * Sets a user's base salary. Uses the service-role client so the write is
 * not blocked by user_profiles RLS (users may only update their own row).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'User id is required' }, { status: 400 });

  const supabase = await createServerClient();
  const guard = await requireUserManager(supabase);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const baseSalary = Number(body?.baseSalary);
  if (!Number.isFinite(baseSalary) || baseSalary < 0) {
    return NextResponse.json({ error: 'A valid base salary is required' }, { status: 400 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || serviceRoleKey.startsWith('replace-with-')) {
    return NextResponse.json(
      {
        error:
          'Server is missing a valid SUPABASE_SERVICE_ROLE_KEY. Add your real service-role key to the server environment variables and redeploy.',
      },
      { status: 500 }
    );
  }

  const serviceClient = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await serviceClient
    .from('user_profiles')
    .update({ base_salary: baseSalary, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    await supabase.from('activity_log').insert({
      user_id: guard.actor.id,
      action_type: 'Salary Updated',
      entity_type: 'user',
      entity_id: id,
      detail: 'Admin set base salary',
      meta: JSON.stringify({ base_salary: baseSalary, target_user: id }),
    });
  } catch {
    /* best effort */
  }

  return NextResponse.json({ ok: true });
}
