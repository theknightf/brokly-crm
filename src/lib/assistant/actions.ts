import { isAdminRole } from '@/lib/roles';
import { normalizePhone } from '@/lib/phone';
import { ALL_REAL_STATUSES } from '@/app/leads-management/components/leadStages';

/**
 * Every CRM write the AI assistant can make lives here, in one place, so that:
 *  - it always runs with the CALLER's session client (row-level security applies; the service-role key is never used),
 *  - it verifies the write really happened (RLS can silently update 0 rows) before reporting success,
 *  - it leaves an audit row (who, what, which record, before/after).
 * Direct tools and the confirm route both call executeAssistantAction().
 */

export interface Actor {
  id: string;
  name: string;
  role: string;
}

export type AssistantAction =
  | { action: 'update_customer_status'; leadId: string; newStatus: string }
  | { action: 'assign_customer'; leadId: string; userId: string }
  | { action: 'add_note'; leadId: string; text: string }
  | { action: 'create_followup'; leadId: string; dueDate: string; note?: string }
  | {
      action: 'log_call';
      leadId: string;
      outcome: string;
      direction: 'incoming' | 'outgoing' | 'missed';
      durationSeconds: number;
      notes?: string;
      callLogId?: string;
      newStatus?: string;
      followUpDate?: string;
    }
  | {
      action: 'create_customer';
      name: string;
      phone: string;
      source?: string;
      project?: string;
      notes?: string;
      assignToUserId?: string;
    }
  | { action: 'bulk_update_status'; leadIds: string[]; newStatus: string }
  | { action: 'bulk_assign'; leadIds: string[]; userId: string };

export interface ActionResult {
  message: string;
  entityId?: string;
  label?: string;
  before?: unknown;
  after?: unknown;
}

export const MAX_BULK = 100;

export async function getActor(supabase: any, userId: string): Promise<Actor> {
  const { data } = await supabase.from('user_profiles').select('full_name, role').eq('id', userId).maybeSingle();
  return { id: userId, name: data?.full_name || 'User', role: data?.role || 'agent' };
}

export async function writeAudit(
  supabase: any,
  actor: Actor,
  row: {
    action: string;
    entityId?: string;
    label?: string;
    before?: unknown;
    after?: unknown;
    status: 'success' | 'failed';
    summary: string;
    confirmed: boolean;
  }
) {
  try {
    await supabase.from('assistant_audit_log').insert({
      user_id: actor.id,
      user_name: actor.name,
      action: row.action,
      entity_type: 'lead',
      entity_id: row.entityId || null,
      entity_label: row.label || null,
      before_value: row.before ?? null,
      after_value: row.after ?? null,
      status: row.status,
      summary: row.summary.slice(0, 500),
      confirmed: row.confirmed,
    });
  } catch {
    // The audit write must never break the operation it describes; the failure is visible in server logs.
    console.error('assistant_audit_log insert failed');
  }
}

const cairoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());

function assertStatus(s: string) {
  if (!(ALL_REAL_STATUSES as string[]).includes(s)) throw new Error(`Unknown stage "${s}"`);
}

async function loadLead(supabase: any, leadId: string) {
  const { data, error } = await supabase
    .from('leads')
    .select('id, name, phone, crm_status, assigned_to, agent, follow_up_due')
    .eq('id', leadId)
    .maybeSingle();
  if (error || !data) throw new Error('Customer not found or you do not have permission to access it.');
  return data as any;
}

function requireAdmin(actor: Actor, what: string) {
  if (!isAdminRole(actor.role)) throw new Error(`Only the owner or an admin can ${what}.`);
}

async function runAction(supabase: any, actor: Actor, a: AssistantAction): Promise<ActionResult> {
  const nowIso = new Date().toISOString();

  switch (a.action) {
    case 'update_customer_status': {
      assertStatus(a.newStatus);
      const lead = await loadLead(supabase, a.leadId);
      if (lead.crm_status === a.newStatus) {
        return { message: `"${lead.name}" is already in "${a.newStatus}". Nothing changed.`, entityId: lead.id, label: lead.name };
      }
      const { data, error } = await supabase
        .from('leads')
        .update({ crm_status: a.newStatus, last_action_at: nowIso, last_action_by: actor.id })
        .eq('id', a.leadId)
        .select('id, crm_status');
      if (error) throw new Error(error.message);
      if (!data?.length || data[0].crm_status !== a.newStatus) throw new Error('The update was not applied (permission denied).');
      return {
        message: `Stage of "${lead.name}" changed from "${lead.crm_status}" to "${a.newStatus}".`,
        entityId: lead.id,
        label: lead.name,
        before: { status: lead.crm_status },
        after: { status: a.newStatus },
      };
    }

    case 'assign_customer': {
      requireAdmin(actor, 'assign customers');
      const lead = await loadLead(supabase, a.leadId);
      const { data: target } = await supabase
        .from('user_profiles')
        .select('id, full_name, is_active')
        .eq('id', a.userId)
        .maybeSingle();
      if (!target || target.is_active === false) throw new Error('The selected sales agent was not found or is inactive.');
      const { error } = await supabase.rpc('set_lead_assignees', { p_lead_id: a.leadId, p_user_ids: [a.userId] });
      if (error) throw new Error(error.message);
      const { data: check } = await supabase.from('leads').select('assigned_to').eq('id', a.leadId).maybeSingle();
      if (check?.assigned_to !== a.userId) throw new Error('The assignment was not applied.');
      return {
        message: `"${lead.name}" is now assigned to ${target.full_name}.`,
        entityId: lead.id,
        label: lead.name,
        before: { assigned_to: lead.assigned_to, agent: lead.agent },
        after: { assigned_to: a.userId, agent: target.full_name },
      };
    }

    case 'add_note': {
      const lead = await loadLead(supabase, a.leadId);
      const { error } = await supabase.from('lead_comments').insert({ lead_id: a.leadId, user_id: actor.id, body: a.text });
      if (error) throw new Error(error.message);
      await supabase.from('activity_log').insert({
        user_id: actor.id,
        action_type: 'Comment Added',
        entity_type: 'lead',
        entity_id: a.leadId,
        detail: a.text.slice(0, 80),
      });
      return { message: `Note added to "${lead.name}".`, entityId: lead.id, label: lead.name, after: { note: a.text } };
    }

    case 'create_followup': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.dueDate)) throw new Error('dueDate must be YYYY-MM-DD.');
      const lead = await loadLead(supabase, a.leadId);
      // The lead's follow_up_due is the source of truth: a database trigger creates/updates the follow_ups row from it.
      const { data, error } = await supabase
        .from('leads')
        .update({ follow_up_due: a.dueDate, last_action_at: nowIso, last_action_by: actor.id })
        .eq('id', a.leadId)
        .select('id, follow_up_due');
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error('The follow-up was not saved (permission denied).');
      if (a.note) {
        try {
          await supabase.from('follow_ups').update({ notes: a.note }).eq('lead_id', a.leadId).eq('follow_up_status', 'Pending');
        } catch {
          /* the date itself is saved */
        }
      }
      return {
        message: `Follow-up for "${lead.name}" set to ${a.dueDate}.`,
        entityId: lead.id,
        label: lead.name,
        before: { follow_up_due: lead.follow_up_due },
        after: { follow_up_due: a.dueDate, note: a.note || null },
      };
    }

    case 'log_call': {
      if (a.newStatus) assertStatus(a.newStatus);
      if (a.followUpDate && !/^\d{4}-\d{2}-\d{2}$/.test(a.followUpDate)) throw new Error('followUpDate must be YYYY-MM-DD.');
      const lead = await loadLead(supabase, a.leadId);
      const duration = Math.max(0, Math.round(a.durationSeconds || 0));
      let callId = a.callLogId || '';

      if (a.callLogId) {
        // Attach an existing (e.g. auto-synced) call to this customer and record its result.
        const { data, error } = await supabase
          .from('call_logs')
          .update({
            outcome: a.outcome,
            notes: a.notes || null,
            lead_id: lead.id,
            entity_type: 'lead',
            entity_id: lead.id,
            contact_name: lead.name,
          })
          .eq('id', a.callLogId)
          .select('id');
        if (error) throw new Error(error.message);
        if (!data?.length) throw new Error('That call was not found or is not yours to edit.');
      } else {
        const { data, error } = await supabase
          .from('call_logs')
          .insert({
            user_id: actor.id,
            entity_type: 'lead',
            entity_id: lead.id,
            lead_id: lead.id,
            contact_name: lead.name,
            contact_phone: lead.phone || '',
            channel: 'Call',
            direction: a.direction,
            duration_seconds: duration,
            outcome: a.outcome,
            notes: a.notes || null,
            client_ref: `assistant-${lead.id}-${Date.now()}`,
            source: 'manual', // call_logs.source only allows manual | device_sync; client_ref marks it as assistant-made
          })
          .select('id');
        if (error) throw new Error(error.message);
        if (!data?.length) throw new Error('The call was not saved.');
        callId = data[0].id;
      }

      // The agent contacted the lead: it leaves the follow-up queue unless a new date was given.
      const patch: any = {
        last_action_at: nowIso,
        last_action_by: actor.id,
        follow_up_due: a.followUpDate || null,
      };
      if (a.newStatus) patch.crm_status = a.newStatus;
      const { data: upd, error: updErr } = await supabase.from('leads').update(patch).eq('id', lead.id).select('id');
      if (updErr) throw new Error(updErr.message);
      if (!upd?.length) throw new Error('The call was saved but the customer record could not be updated (permission denied).');

      const noteText = `[Call • ${a.outcome} • ${duration}s] ${a.notes?.trim() || 'Call outcome logged'}`;
      try {
        await supabase.from('lead_comments').insert({ lead_id: lead.id, user_id: actor.id, body: noteText });
      } catch {
        /* the call and the stage are saved */
      }

      return {
        message:
          `Call with "${lead.name}" saved (${a.outcome})` +
          (a.newStatus ? `, stage → "${a.newStatus}"` : '') +
          (a.followUpDate ? `, follow-up ${a.followUpDate}` : ', follow-up cleared') +
          '.',
        entityId: lead.id,
        label: lead.name,
        before: { status: lead.crm_status, follow_up_due: lead.follow_up_due },
        after: {
          call_log_id: callId,
          outcome: a.outcome,
          status: a.newStatus || lead.crm_status,
          follow_up_due: a.followUpDate || null,
        },
      };
    }

    case 'create_customer': {
      const name = a.name.trim();
      const digits = normalizePhone(a.phone);
      if (!name) throw new Error('Name is required.');
      if (digits.length < 7) throw new Error('A valid phone number is required.');
      const { data: dup } = await supabase.from('leads').select('id, name').eq('phone_normalized', digits).limit(1);
      if (dup?.length) throw new Error(`A customer with this phone already exists: "${dup[0].name}" (${dup[0].id}).`);
      const assignee = a.assignToUserId || (isAdminRole(actor.role) ? null : actor.id);
      const { data, error } = await supabase
        .from('leads')
        .insert({
          name,
          phone: a.phone.trim(),
          crm_status: 'Fresh Leads',
          source: a.source || '',
          project: a.project || null,
          notes: a.notes || null,
          created_by: actor.id,
          assigned_to: assignee,
        })
        .select('id, name');
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error('The customer was not created (permission denied).');
      return {
        message: `Customer "${name}" created (Fresh Leads).`,
        entityId: data[0].id,
        label: name,
        after: { name, phone: a.phone.trim(), assigned_to: assignee },
      };
    }

    case 'bulk_update_status': {
      requireAdmin(actor, 'update customers in bulk');
      assertStatus(a.newStatus);
      const ids = Array.from(new Set(a.leadIds)).slice(0, MAX_BULK);
      if (!ids.length) throw new Error('No customers selected.');
      const { data: before } = await supabase.from('leads').select('id, name, crm_status').in('id', ids);
      const { data, error } = await supabase
        .from('leads')
        .update({ crm_status: a.newStatus, last_action_at: nowIso, last_action_by: actor.id })
        .in('id', ids)
        .select('id');
      if (error) throw new Error(error.message);
      const done = data?.length || 0;
      if (done === 0) throw new Error('No customer was updated (permission denied).');
      return {
        message: `${done} of ${ids.length} customers moved to "${a.newStatus}".`,
        before: (before || []).slice(0, 50).map((l: any) => ({ id: l.id, name: l.name, status: l.crm_status })),
        after: { status: a.newStatus, updated: done, requested: ids.length },
      };
    }

    case 'bulk_assign': {
      requireAdmin(actor, 'assign customers in bulk');
      const ids = Array.from(new Set(a.leadIds)).slice(0, MAX_BULK);
      if (!ids.length) throw new Error('No customers selected.');
      const { data: target } = await supabase
        .from('user_profiles')
        .select('id, full_name, is_active')
        .eq('id', a.userId)
        .maybeSingle();
      if (!target || target.is_active === false) throw new Error('The selected sales agent was not found or is inactive.');
      const { data: before } = await supabase.from('leads').select('id, name, assigned_to, agent').in('id', ids);
      let done = 0;
      for (const id of ids) {
        const { error } = await supabase.rpc('set_lead_assignees', { p_lead_id: id, p_user_ids: [a.userId] });
        if (!error) done++;
      }
      if (done === 0) throw new Error('No customer was assigned.');
      return {
        message: `${done} of ${ids.length} customers assigned to ${target.full_name}.`,
        before: (before || []).slice(0, 50).map((l: any) => ({ id: l.id, name: l.name, agent: l.agent })),
        after: { agent: target.full_name, assigned: done, requested: ids.length },
      };
    }
  }
}

/** Runs one action with audit. Throws on failure (after writing a failed audit row). */
export async function executeAssistantAction(
  supabase: any,
  actor: Actor,
  a: AssistantAction,
  opts: { confirmed: boolean }
): Promise<ActionResult> {
  try {
    const res = await runAction(supabase, actor, a);
    await writeAudit(supabase, actor, {
      action: a.action,
      entityId: res.entityId,
      label: res.label,
      before: res.before,
      after: res.after,
      status: 'success',
      summary: res.message,
      confirmed: opts.confirmed,
    });
    return res;
  } catch (e: any) {
    await writeAudit(supabase, actor, {
      action: a.action,
      entityId: 'leadId' in a ? a.leadId : undefined,
      status: 'failed',
      summary: String(e?.message || e),
      confirmed: opts.confirmed,
    });
    throw e;
  }
}

export { cairoToday };
