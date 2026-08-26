import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** GET /api/leave → all leave (admins) or own leave (employees) */
export async function GET(request: Request) {
  const db = await createClient();
  const auth = await requireAuth(db);
  if (!auth.ok) return auth.response;
  const actor = auth.actor;

  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  try {
    let query = db
      .from('leave_requests')
      .select('*, user_name:user_profiles!leave_requests_user_id_fkey(full_name)')
      .order('start_date', { ascending: false });

    const isAdmin = ['owner', 'admin'].includes(actor.role);
    if (!isAdmin) query = query.eq('user_id', actor.id);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data || []).map((r: any) => ({ ...r, user_name: r.user_name?.[0]?.full_name || '' }));
    return NextResponse.json({ leave: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load leave' }, { status: 500 });
  }
}

/** POST /api/leave → request leave for the current user */
export async function POST(request: Request) {
  const db = await createClient();
  const auth = await requireAuth(db);
  if (!auth.ok) return auth.response;
  const actor = auth.actor;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { leaveType, startDate, endDate, days, reason } = body;
  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
  }

  try {
    const { data, error } = await db
      .from('leave_requests')
      .insert({
        user_id: actor.id,
        leave_type: leaveType || 'Annual',
        start_date: startDate,
        end_date: endDate,
        days: Number(days ?? 1),
        reason: reason || '',
        status: 'pending',
      })
      .select('*')
      .maybeSingle();
    if (error) throw error;

    // Notify admins of the new request (feeds the notification bell).
    const { data: admins } = await db
      .from('user_profiles')
      .select('id, full_name')
      .in('role', ['owner', 'admin'])
      .eq('is_active', true);
    if (admins?.length) {
      const myName = actor.email || 'An employee';
      await db.from('activity_log').insert(
        admins.map((a: any) => ({
          user_id: a.id,
          action_type: 'Leave Requested',
          entity_type: 'leave',
          entity_id: data.id,
          detail: `${myName} requested ${days} day(s) of ${leaveType || 'Annual'} leave`,
        }))
      );
    }
    return NextResponse.json({ leave: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to create leave request' }, { status: 500 });
  }
}
