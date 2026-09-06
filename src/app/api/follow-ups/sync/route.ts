import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getLeadsServiceClient } from '@/lib/leadsAuthz';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

// Terminal stages: a linked reminder is CANCELLED (the work is over).
// NOTE: 'No Answer' / 'No Answer At All' are deliberately NOT here — a
// no-answer with a follow-up date is a retry queue entry and must survive
// as a Pending reminder in Follow-ups & Workspace.
const CANCEL_STATUSES = new Set([
  'Done Deal',
  'Not Interested',
  'Cancellation',
  'Duplicate Leads',
  'Wrong Number',
  'Closed Number',
  'Low Budget',
  'Data Rotation',
  'Won',
  'Lost',
]);

type SyncOutcome = 'created' | 'updated' | 'reopened' | 'cancelled' | 'skipped';

/**
 * Reconcile ONE lead's follow_ups row with its follow_up_due + stage.
 * Manual select/insert/update (no ON CONFLICT) so it works even when the
 * unique constraint migration hasn't been applied yet.
 */
async function syncOne(db: any, lead: any): Promise<SyncOutcome> {
  if (!lead?.id) return 'skipped';
  const status = lead.crm_status || lead.lead_status || '';
  const due = lead.follow_up_due || null;

  let existing: any = null;
  try {
    const { data } = await db
      .from('follow_ups')
      .select('id, follow_up_status')
      .eq('lead_id', lead.id)
      .maybeSingle();
    existing = data || null;
  } catch {
    existing = null;
  }

  // No due date or terminal stage → cancel any open reminder.
  if (!due || CANCEL_STATUSES.has(status)) {
    if (existing && existing.follow_up_status !== 'Completed' && existing.follow_up_status !== 'Cancelled') {
      const { error } = await db
        .from('follow_ups')
        .update({ follow_up_status: 'Cancelled', updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) return 'skipped';
      return 'cancelled';
    }
    return 'skipped';
  }

  const assignee = lead.assigned_to || lead.created_by || null;
  if (existing) {
    const patch: any = {
      due_date: due,
      contact_name: lead.name || '',
      contact_phone: lead.phone || '',
      contact_email: lead.email || '',
      agent: lead.agent || '',
      agent_initials: lead.agent_initials || '',
      notes: lead.notes || '',
      property_interest: lead.property_type || '',
      updated_at: new Date().toISOString(),
    };
    if (existing.follow_up_status === 'Completed' || existing.follow_up_status === 'Cancelled') {
      patch.follow_up_status = 'Pending';
    }
    const { error } = await db.from('follow_ups').update(patch).eq('id', existing.id);
    if (error) return 'skipped';
    return patch.follow_up_status ? 'reopened' : 'updated';
  }

  const { error } = await db.from('follow_ups').insert({
    lead_id: lead.id,
    title: `Follow up: ${lead.name || ''}`,
    contact_name: lead.name || '',
    contact_type: 'Lead',
    contact_phone: lead.phone || '',
    contact_email: lead.email || '',
    follow_up_type: 'Call',
    follow_up_status: 'Pending',
    priority: 'Medium',
    due_date: due,
    due_time: '09:00',
    agent: lead.agent || '',
    agent_initials: lead.agent_initials || '',
    notes: lead.notes || '',
    property_interest: lead.property_type || '',
    relationship_status: 'New',
    created_by: assignee,
  });
  if (error) return 'skipped';
  return 'created';
}

/**
 * POST /api/follow-ups/sync — reconcile follow_ups rows from leads.
 * Body: { leadId: string } → sync one lead (any signed-in user).
 * Body: { allMissing: true } → backfill every lead with a due date
 *        (ADMIN/OWNER only). Repairs the 98+ invisible reminders.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Service-role bypasses RLS so sync works for every agent even when the
  // follow_ups RLS migration hasn't been applied. Falls back to the session
  // client (RLS applies) when the key is not configured.
  const db: any = getLeadsServiceClient() || supabase;

  if (body.allMissing === true) {
    const { data: actor } = await supabase
      .from('user_profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .maybeSingle();
    if (!actor || actor.is_active === false || !isAdminRole(actor.role)) {
      return NextResponse.json({ error: 'Forbidden — admin or owner only' }, { status: 403 });
    }
    const { data: leads } = await db
      .from('leads')
      .select(
        'id, name, phone, email, crm_status, lead_status, follow_up_due, assigned_to, created_by, agent, agent_initials, notes, property_type'
      )
      .not('follow_up_due', 'is', null)
      .limit(500);
    const counts: Record<SyncOutcome, number> = {
      created: 0,
      updated: 0,
      reopened: 0,
      cancelled: 0,
      skipped: 0,
    };
    for (const lead of leads || []) {
      try {
        counts[await syncOne(db, lead)] += 1;
      } catch {
        counts.skipped += 1;
      }
    }
    return NextResponse.json({ ok: true, ...counts, total: (leads || []).length });
  }

  const leadId = typeof body.leadId === 'string' ? body.leadId : '';
  if (!leadId) return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
  const { data: lead } = await db
    .from('leads')
    .select(
      'id, name, phone, email, crm_status, lead_status, follow_up_due, assigned_to, created_by, agent, agent_initials, notes, property_type'
    )
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  const outcome = await syncOne(db, lead);
  return NextResponse.json({ ok: true, outcome });
}
