import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function getSupabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function rowToFollowUp(row: any) {
  return {
    id: row.id,
    title: row.title,
    contactName: row.contact_name,
    contactType: row.contact_type,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    type: row.follow_up_type,
    status: row.follow_up_status,
    priority: row.priority,
    dueDate: row.due_date,
    dueTime: row.due_time,
    agent: row.agent,
    agentInitials: row.agent_initials,
    notes: row.notes,
    propertyInterest: row.property_interest,
    relationshipStatus: row.relationship_status,
    completedAt: row.completed_at,
    createdAt: row.created_at?.split('T')[0] || row.created_at,
    leadId: row.lead_id || '',
  };
}

/**
 * POST /api/follow-ups — create a follow-up (any signed-in member).
 *
 * Why this route exists: browser inserts hit follow_ups RLS + the
 * uq_follow_ups_lead_id unique constraint directly, and any failure was
 * swallowed by the UI's optimistic fallback — the item appeared locally then
 * vanished on reload ("does not show up"). This endpoint runs service-side:
 *   - validates required fields (title, contactName, dueDate, dueTime)
 *   - upserts on lead_id when the follow-up is linked to a lead, so a second
 *     reminder for the same lead updates the row instead of 409-ing
 *   - returns the saved row, so the UI only renders confirmed records
 */
export async function POST(request: Request) {
  const serverClient = await createServerClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const title = String(body.title || '').trim();
  const contactName = String(body.contactName || '').trim();
  const dueDate = String(body.dueDate || '').trim();
  const dueTime = String(body.dueTime || '').trim();
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  if (!contactName) return NextResponse.json({ error: 'Contact name is required' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return NextResponse.json({ error: 'Valid dueDate (YYYY-MM-DD) is required' }, { status: 400 });
  }
  if (!/^\d{1,2}:\d{2}$/.test(dueTime)) {
    return NextResponse.json({ error: 'Valid dueTime (HH:MM) is required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const status = String(body.status || 'Pending');
  const row: any = {
    title,
    contact_name: contactName,
    contact_type: body.contactType || 'Lead',
    contact_phone: body.contactPhone || '',
    contact_email: body.contactEmail || '',
    follow_up_type: body.type || 'Call',
    follow_up_status: status,
    priority: body.priority || 'Medium',
    due_date: dueDate,
    due_time: dueTime,
    agent: body.agent || '',
    agent_initials: body.agentInitials || '',
    notes: body.notes || '',
    property_interest: body.propertyInterest || '',
    relationship_status: body.relationshipStatus || 'New',
    completed_at: status === 'Completed' ? now : null,
    created_by: user.id,
    updated_at: now,
  };
  const leadId = String(body.leadId || '').trim();
  if (leadId) row.lead_id = leadId;

  try {
    const db: any = getSupabaseService();
    let saved: any;
    if (leadId) {
      // One reminder row per lead: refresh the existing one instead of
      // violating uq_follow_ups_lead_id (which previously failed silently).
      const { data, error } = await db
        .from('follow_ups')
        .upsert(row, { onConflict: 'lead_id' })
        .select()
        .single();
      if (error) throw new Error(error.message);
      saved = data;
      // Re-open a completed/cancelled row when it is explicitly re-followed.
      if (saved && ['Completed', 'Cancelled'].includes(saved.follow_up_status) && status === 'Pending') {
        const { data: reopened } = await db
          .from('follow_ups')
          .update({ follow_up_status: 'Pending', updated_at: now })
          .eq('id', saved.id)
          .select()
          .single();
        if (reopened) saved = reopened;
      }
    } else {
      const { data, error } = await db.from('follow_ups').insert(row).select().single();
      if (error) throw new Error(error.message);
      saved = data;
    }
    return NextResponse.json({ followUp: rowToFollowUp(saved) }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create follow-up' }, { status: 500 });
  }
}
