import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/duplicates/count — number of PENDING duplicates the caller may review
 * (RLS: owner of the original lead, or owner/admin/manager). Drives the badges.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ count: 0 }, { status: 401 });

  const { count, error } = await (supabase as any)
    .from('duplicate_leads')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) return NextResponse.json({ count: 0 });
  return NextResponse.json({ count: count ?? 0 });
}
