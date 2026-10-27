import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyDuplicateOwnersServer } from '@/lib/duplicateNotify';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leads/duplicate-notify  { leadIds: string[] }
 *
 * Called silently after a manual add. The user who added the lead gets nothing
 * back that would surface a warning; only the ORIGINAL owner is notified.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const leadIds: string[] = Array.isArray(body?.leadIds)
    ? body.leadIds.filter((x: unknown) => typeof x === 'string').slice(0, 2000)
    : [];

  const res = await notifyDuplicateOwnersServer(supabase as any, leadIds);
  return NextResponse.json({ ok: true, ...res });
}
