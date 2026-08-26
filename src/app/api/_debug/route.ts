import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const store = await cookies();
  const all = store.getAll();
  const names = all.map((c) => c.name);
  const val = all.find((c) => c.name.includes('auth-token'))?.value || '';
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  return NextResponse.json({
    count: all.length,
    names,
    hasAuth: names.some((n) => n.includes('auth-token')),
    valLen: val.length,
    valHead: val.slice(0, 20),
    user: data?.user?.email ?? null,
    getUserError: error?.message ?? null,
  });
}