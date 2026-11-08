import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestSupabase } from '@/lib/supabase/requestAuth';
import { ALL_REAL_STATUSES } from '@/app/leads-management/components/leadStages';
import { MAX_BULK, executeAssistantAction, getActor, type AssistantAction } from '@/lib/assistant/actions';

export const dynamic = 'force-dynamic';

const status = z.enum(ALL_REAL_STATUSES as [string, ...string[]]);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Only previews that need a human "Confirm" arrive here: notes, call logging and bulk changes.
// (Older clients still send create_followup / update_lead_status, so those stay accepted.)
const confirmSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add_note'), leadId: z.string().uuid(), text: z.string().min(2).max(1000) }),
  z.object({ action: z.literal('create_followup'), leadId: z.string().uuid(), dueDate: day, note: z.string().optional().default('') }),
  z.object({ action: z.literal('update_lead_status'), leadId: z.string().uuid(), newStatus: status }),
  z.object({
    action: z.literal('log_call'),
    leadId: z.string().uuid(),
    outcome: z.string().min(2).max(80),
    direction: z.enum(['incoming', 'outgoing', 'missed']).optional().default('outgoing'),
    durationSeconds: z.number().int().min(0).max(14400).optional().default(0),
    notes: z.string().max(1000).optional(),
    callLogId: z.string().uuid().optional(),
    newStatus: status.optional(),
    followUpDate: day.optional(),
  }),
  z.object({ action: z.literal('bulk_update_status'), leadIds: z.array(z.string().uuid()).min(1).max(MAX_BULK), newStatus: status }),
  z.object({ action: z.literal('bulk_assign'), leadIds: z.array(z.string().uuid()).min(1).max(MAX_BULK), userId: z.string().uuid() }),
]);

/**
 * POST /api/assistant/confirm
 * Runs a previewed assistant action after the person pressed Confirm. The caller's own session (cookie or Bearer token)
 * is used, so row-level security and the owner/admin checks in executeAssistantAction apply. Every run is audited.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getRequestSupabase(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = confirmSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid confirmation payload', details: parsed.error.format() }, { status: 400 });
  }

  const p = parsed.data;
  const action: AssistantAction =
    p.action === 'update_lead_status'
      ? { action: 'update_customer_status', leadId: p.leadId, newStatus: p.newStatus }
      : (p as AssistantAction);

  try {
    const actor = await getActor(supabase, user.id);
    const result = await executeAssistantAction(supabase, actor, action, { confirmed: true });
    try {
      await supabase.from('assistant_logs').insert({
        user_id: user.id,
        tool_name: action.action,
        tool_args: json,
        status: 'confirmed',
        result_summary: result.message.slice(0, 300),
      });
    } catch {
      /* the audit row above is the record of truth */
    }
    return NextResponse.json({ success: true, message: result.message });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to execute confirmed action' }, { status: 500 });
  }
}
