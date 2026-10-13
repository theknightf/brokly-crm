import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { ALL_REAL_STATUSES } from '@/app/leads-management/components/leadStages';

export const dynamic = 'force-dynamic';

const confirmSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add_note'),
    leadId: z.string().uuid(),
    text: z.string().min(2).max(1000),
  }),
  z.object({
    action: z.literal('create_followup'),
    leadId: z.string().uuid(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().optional().default(''),
  }),
  z.object({
    action: z.literal('update_lead_status'),
    leadId: z.string().uuid(),
    newStatus: z.enum(ALL_REAL_STATUSES as [string, ...string[]]),
  }),
]);

/**
 * POST /api/assistant/confirm
 * Executes a pending write tool action only after explicit agent confirmation in UI.
 * Validates session, inputs, and relies on user-scoped Supabase client for strict RLS.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = confirmSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid confirmation payload', details: parsed.error.format() }, { status: 400 });
  }

  const payload = parsed.data;

  // Verify user can access the target lead under RLS before writing
  const { data: targetLead, error: leadAccessErr } = await supabase
    .from('leads')
    .select('id, name, phone, notes, crm_status')
    .eq('id', payload.leadId)
    .maybeSingle();

  if (leadAccessErr || !targetLead) {
    return NextResponse.json(
      { error: 'Lead not found or permission denied.' },
      { status: 403 }
    );
  }

  try {
    if (payload.action === 'add_note') {
      // Insert into lead_comments
      const { error: insertErr } = await supabase.from('lead_comments').insert({
        lead_id: payload.leadId,
        user_id: user.id,
        body: payload.text,
      });

      if (insertErr) {
        throw new Error(insertErr.message);
      }

      // Also record in activity_log
      await supabase.from('activity_log').insert({
        user_id: user.id,
        action_type: 'Comment Added',
        entity_type: 'lead',
        entity_id: payload.leadId,
        detail: payload.text.slice(0, 80),
      });

      // Audit log in assistant_logs
      await supabase.from('assistant_logs').insert({
        user_id: user.id,
        tool_name: 'add_note',
        tool_args: { leadId: payload.leadId, text: payload.text },
        status: 'confirmed',
        result_summary: `Added note for lead ${targetLead.name}`,
      });

      return NextResponse.json({
        success: true,
        message: `تمت إضافة الملاحظة بنجاح للعميل "${targetLead.name}"`,
      });
    }

    if (payload.action === 'create_followup') {
      const { error: fuErr } = await supabase.from('follow_ups').insert({
        title: `Follow up: ${targetLead.name}`,
        contact_name: targetLead.name,
        contact_phone: targetLead.phone || '',
        due_date: payload.dueDate,
        due_time: '09:00',
        notes: payload.note || '',
        follow_up_status: 'Pending',
        lead_id: payload.leadId,
        created_by: user.id,
      });

      if (fuErr) throw new Error(fuErr.message);

      // Audit log
      await supabase.from('assistant_logs').insert({
        user_id: user.id,
        tool_name: 'create_followup',
        tool_args: { leadId: payload.leadId, dueDate: payload.dueDate, note: payload.note },
        status: 'confirmed',
        result_summary: `Created follow-up for lead ${targetLead.name} on ${payload.dueDate}`,
      });

      return NextResponse.json({
        success: true,
        message: `تمت جدولة المتابعة للعميل "${targetLead.name}" بنجاح في تاريخ ${payload.dueDate}`,
      });
    }

    if (payload.action === 'update_lead_status') {
      const { error: updateErr } = await supabase
        .from('leads')
        .update({
          crm_status: payload.newStatus,
          last_action_at: new Date().toISOString(),
          last_action_by: user.id,
        })
        .eq('id', payload.leadId);

      if (updateErr) throw new Error(updateErr.message);

      await supabase.from('activity_log').insert({
        user_id: user.id,
        action_type: 'Lead Status Updated',
        entity_type: 'lead',
        entity_id: payload.leadId,
        detail: `Status changed to ${payload.newStatus}`,
      });

      // Audit log
      await supabase.from('assistant_logs').insert({
        user_id: user.id,
        tool_name: 'update_lead_status',
        tool_args: { leadId: payload.leadId, newStatus: payload.newStatus },
        status: 'confirmed',
        result_summary: `Updated status of lead ${targetLead.name} to ${payload.newStatus}`,
      });

      return NextResponse.json({
        success: true,
        message: `تم تحديث مرحلة العميل "${targetLead.name}" إلى "${payload.newStatus}"`,
      });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to execute confirmed action' },
      { status: 500 }
    );
  }
}
