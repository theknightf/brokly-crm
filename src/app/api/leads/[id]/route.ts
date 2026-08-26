import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { getLeadsServiceClient, canDeleteLead } from '@/lib/leadsAuthz';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params;

  const supabase = await createServerClient();
  const guard = await requireAuth(supabase);
  if (!guard.ok) return guard.response;

  const service = getLeadsServiceClient();
  if (!service) {
    return NextResponse.json(
      { error: 'Server is missing a valid SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 500 }
    );
  }

  const { data: lead, error: leadErr } = await service
    .from('leads')
    .select('id, created_by, assigned_to')
    .eq('id', leadId)
    .maybeSingle();

  if (leadErr) {
    return NextResponse.json({ error: leadErr.message }, { status: 400 });
  }
  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  const allowed = await canDeleteLead(service, guard.actor, lead);
  if (!allowed) {
    return NextResponse.json(
      { error: 'You do not have permission to delete this lead.' },
      { status: 403 }
    );
  }

  const { error: delErr } = await service.from('leads').delete().eq('id', leadId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
