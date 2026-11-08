import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireUserManager } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/users/:id/impact — what permanently deleting this user would erase or detach.
 * Deleting a user cascades to their own records (call logs, attendance, payroll, …) and detaches
 * their leads (assigned_to becomes empty), so the owner is shown these numbers before confirming.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient();
  const guard = await requireUserManager(supabase);
  if (!guard.ok) return guard.response;

  const id = String((await params).id);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!id || !key || key.startsWith('replace-with-')) {
    return NextResponse.json({ error: 'Server is missing a valid SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 });
  }
  const db: any = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const count = async (table: string, col: string) => {
    const { count: n } = await db.from(table).select('id', { count: 'exact', head: true }).eq(col, id);
    return n || 0;
  };

  const [callLogs, attendance, payroll, leave, evaluations, leadsAssigned, leadsCreated, followUps, notes, profile] = await Promise.all([
    count('call_logs', 'user_id'),
    count('attendance', 'user_id'),
    count('payroll_entries', 'user_id'),
    count('leave_requests', 'user_id'),
    count('evaluations', 'employee_id'),
    count('leads', 'assigned_to'),
    count('leads', 'created_by'),
    count('follow_ups', 'created_by'),
    count('lead_comments', 'user_id'),
    db.from('user_profiles').select('role, full_name').eq('id', id).maybeSingle(),
  ]);

  return NextResponse.json({
    name: profile?.data?.full_name || '',
    role: profile?.data?.role || '',
    // Erased together with the user:
    erased: { callLogs, attendance, payroll, leave, evaluations },
    // Kept, but no longer tied to this user:
    detached: { leadsAssigned, leadsCreated, followUps, notes },
  });
}
