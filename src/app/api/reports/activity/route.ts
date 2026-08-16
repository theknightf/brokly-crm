import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

function localDay(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayBounds(day: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { start: '', end: '' };
  }
  const start = new Date(`${day}T00:00:00`);
  const end = new Date(`${day}T23:59:59.999`);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function requireAdminRole(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: actor } = await supabase
    .from('user_profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  return !!actor && actor.is_active !== false && isAdminRole(actor.role);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const isAdmin = await requireAdminRole(supabase);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get('from') || localDay(0);
  const to = url.searchParams.get('to') || from || localDay(0);
  const fromBounds = dayBounds(from);
  const toBounds = dayBounds(to);

  const [usersRes, activityRes] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('id, full_name, email, role, is_active')
      .order('full_name'),
    supabase
      .from('activity_log')
      .select('user_id, action_type, entity_type, detail, meta, created_at')
      .gte('created_at', fromBounds.start)
      .lte('created_at', toBounds.end)
      .order('created_at'),
  ]);

  if (usersRes.error || activityRes.error) {
    return NextResponse.json({ from, to, users: [], activity: [] });
  }

  return NextResponse.json({
    from,
    to,
    users: usersRes.data || [],
    activity: activityRes.data || [],
  });
}
