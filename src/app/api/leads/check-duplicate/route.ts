import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkAndRecordDuplicates } from '@/lib/duplicateCheck';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leads/check-duplicate  { rows: [{ name, phone, email, ... }] }
 *
 * Server-side duplicate gate used before a lead is created. The match runs in a
 * SECURITY DEFINER function, so it works even when the adder cannot see the
 * original lead under RLS. Response: { duplicates: boolean[] } and nothing about
 * the original lead or its owner.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const rows: any[] = Array.isArray(body?.rows) ? body.rows.slice(0, 5000) : [];
  if (!rows.length) return NextResponse.json({ error: 'rows array required' }, { status: 400 });

  try {
    const { duplicates } = await checkAndRecordDuplicates(supabase as any, rows);
    return NextResponse.json({ duplicates });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Duplicate check failed' }, { status: 500 });
  }
}
