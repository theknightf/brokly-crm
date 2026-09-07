import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  // Block in production; allow only admin in dev for debugging auth issues.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await db.from('user_profiles').select('role').eq('id', auth.user.id).maybeSingle();
  const role = (profile as any)?.role || '';
  if (!['owner', 'admin', 'OWNER_ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const store = await cookies();
  const all = store.getAll();
  const names = all.map((c) => c.name);
  const { data, error } = await db.auth.getUser();
  return NextResponse.json({
    count: all.length,
    names,
    hasAuth: names.some((n) => n.includes('auth-token')),
    user: data?.user?.email ?? null,
    getUserError: error?.message ?? null,
  });
}