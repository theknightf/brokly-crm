import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/leave/[id] → review (approve/reject) by admin, or cancel by owner.
 *   { status: 'approved' | 'rejected' | 'cancelled' }
 * DELETE /api/leave/[id] → admin removes a request.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient();
  const auth = await requireAuth(db);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const status = body?.status;
  if (!['approved', 'rejected', 'cancelled'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const isAdmin = ['owner', 'admin'].includes(auth.actor.role);

  try {
    const patch: any = {};
    if (status === 'approved' || status === 'rejected') {
      if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      patch.status = status;
      patch.approved_by = auth.actor.id;
      patch.reviewed_at = new Date().toISOString();
    } else {
      // cancellation: request owner or admin
      const { data: reqRow } = await db
        .from('leave_requests')
        .select('user_id')
        .eq('id', id)
        .maybeSingle();
      if (!reqRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (!isAdmin && reqRow.user_id !== auth.actor.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      patch.status = 'cancelled';
    }

    const { error } = await db.from('leave_requests').update(patch).eq('id', id);
    if (error) throw error;

    if (isAdmin && (status === 'approved' || status === 'rejected')) {
      const { data: row } = await db
        .from('leave_requests')
        .select('*, user_name:user_profiles!leave_requests_user_id_fkey(full_name)')
        .eq('id', id)
        .maybeSingle();
      if (row) {
        await db.from('activity_log').insert({
          user_id: row.user_id,
          action_type: 'Leave ' + (status === 'approved' ? 'Approved' : 'Rejected'),
          entity_type: 'leave',
          entity_id: id,
          detail: row.user_name?.[0]?.full_name
            ? `${row.user_name[0].full_name}'s leave was ${status}`
            : 'Leave request was ' + status,
        });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to update leave' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient();
  const auth = await requireAdmin(db);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const { error } = await db.from('leave_requests').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to delete leave' }, { status: 500 });
  }
}
