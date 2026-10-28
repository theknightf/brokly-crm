import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/claim-conflicts — audit log of rejected lead claims.
 * Admin/owner only, enforced twice: here (role check) and by RLS on
 * lead_claim_conflicts (SELECT policy = is_admin_or_owner_v2()).
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!isAdminRole((profile as any)?.role)) {
    return NextResponse.json({ error: 'Forbidden — Admins & Owner only' }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 200)));

  const { data, error } = await (supabase as any)
    .from('lead_claim_conflicts')
    .select(
      'id, created_at, lead_id, lead_name, lead_phone, holder_id, holder_name, requester_id, requester_name, attempted_action, status'
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ conflicts: data || [] });
}
