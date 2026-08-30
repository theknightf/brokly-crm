import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
// GET /api/notifications/my-alerts — employee inbox (deduction alerts)
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const limit = Math.min(100, Number(url.searchParams.get('limit') || 50));
  const unreadOnly = url.searchParams.get('unread') === 'true';

  let q = (supabase as any).from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(limit);
  if (unreadOnly) q = q.eq('is_read', false);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ notifications: data || [], unread: (data || []).filter((n: any) => !n.is_read).length });
}

// PATCH /api/notifications/my-alerts — mark read
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
  if (ids.length === 0) {
    // mark all read
    await (supabase as any).from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('user_id', user.id).eq('is_read', false);
    return NextResponse.json({ success: true, marked: 'all' });
  }
  await (supabase as any).from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).in('id', ids).eq('user_id', user.id);
  return NextResponse.json({ success: true, marked: ids.length });
}
