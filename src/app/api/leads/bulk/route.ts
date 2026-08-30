import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { getLeadsServiceClient, canDeleteLead } from '@/lib/leadsAuthz';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const guard = await requireAuth(supabase);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids)
    ? body.ids.filter((x: any) => typeof x === 'string')
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'No lead ids provided' }, { status: 400 });
  }

  const service = getLeadsServiceClient();
  if (!service) {
    return NextResponse.json(
      { error: 'Server is missing a valid SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 500 }
    );
  }

  const { data: leads, error: leadsErr } = await service
    .from('leads')
    .select('id, created_by, assigned_to')
    .in('id', ids);
  if (leadsErr) {
    return NextResponse.json({ error: leadsErr.message }, { status: 400 });
  }

  const leadsList = (leads || []) as Array<{
    id: string;
    created_by?: string | null;
    assigned_to?: string | null;
  }>;
  const allowedFlags = await Promise.all(
    leadsList.map((lead) => canDeleteLead(service, guard.actor, lead))
  );
  const allowedIds = leadsList.filter((_, i) => allowedFlags[i]).map((l) => l.id);

  if (allowedIds.length === 0) {
    return NextResponse.json(
      { error: 'You do not have permission to delete the selected leads.' },
      { status: 403 }
    );
  }

  const { error: delErr } = await service.from('leads').delete().in('id', allowedIds);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, deleted: allowedIds.length });
}
