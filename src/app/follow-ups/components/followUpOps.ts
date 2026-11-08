'use client';
import { createClient } from '@/lib/supabase/client';
import { followUpsService } from '@/lib/services/crmService';
import { emitFollowUpsChanged } from '@/lib/followUpEvents';
import type { FollowUp } from './mockFollowUps';

/**
 * Every write the Follow-ups page makes, in one place.
 *
 * Why this exists — how the data really behaves:
 *  - For a lead-linked follow-up, the lead's `follow_up_due` is the source of truth. A database trigger
 *    (sync_follow_up_from_lead) upserts the follow_ups row whenever the lead changes and its due date is set:
 *    it RE-OPENS a Completed/Cancelled row and OVERWRITES follow_ups.notes with the lead's notes.
 *  - So: closing a follow-up must also clear the lead's due date (or it comes back on the next lead edit),
 *    a new date must be written to the lead (or the page hides the row as stale),
 *    and anything the agent writes must go to the lead's comments (follow_ups.notes gets overwritten).
 */

export const cairoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const isOpen = (f: Pick<FollowUp, 'status'>) => f.status !== 'Completed' && f.status !== 'Cancelled';

async function setLeadDue(leadId: string, due: string | null) {
  const supabase = createClient();
  const { error } = await supabase.from('leads').update({ follow_up_due: due }).eq('id', leadId);
  if (error) throw new Error(error.message);
}

/** Adds a comment on the lead (counts as a note/action, and is never overwritten). */
export async function addLeadNote(leadId: string, text: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from('lead_comments').insert({ lead_id: leadId, user_id: user?.id, body: text });
  if (error) throw new Error(error.message);
}

function stamp() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
}

/** Note on a follow-up: lead comment when linked, otherwise appended to the follow-up itself. */
export async function addFollowUpNote(fu: FollowUp, text: string) {
  if (fu.leadId) {
    await addLeadNote(fu.leadId, text);
  } else {
    const notes = [fu.notes?.trim(), `[${stamp()}] ${text}`].filter(Boolean).join('\n');
    await followUpsService.update(fu.id, { ...fu, notes });
  }
  emitFollowUpsChanged();
}

/** Create or edit from the form. Lead-linked rows go through the API, which upserts by lead and syncs the lead's date. */
export async function saveFollowUp(fu: FollowUp, opts: { existingId?: string; userId: string }) {
  const closed = !isOpen(fu);
  if (fu.leadId) {
    const res = await fetch('/api/follow-ups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fu, leadId: fu.leadId }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error || 'Could not save the follow-up');
    if (closed) await setLeadDue(fu.leadId, null);
  } else if (opts.existingId) {
    await followUpsService.update(opts.existingId, fu);
  } else {
    await followUpsService.create(fu, opts.userId);
  }
  emitFollowUpsChanged();
}

export async function completeFollowUp(fu: FollowUp) {
  await followUpsService.updateStatus(fu.id, 'Completed', new Date().toISOString());
  if (fu.leadId) await setLeadDue(fu.leadId, null);
  emitFollowUpsChanged();
}

export async function reopenFollowUp(fu: FollowUp) {
  // Re-open on its original date when it is still ahead, otherwise today.
  const due = (fu.dueDate || '').slice(0, 10);
  const date = due && due >= cairoToday() ? due : cairoToday();
  if (fu.leadId) {
    await rescheduleFollowUp({ ...fu, status: 'Pending' }, date, fu.dueTime || '10:00');
    return;
  }
  await followUpsService.update(fu.id, { ...fu, status: 'Pending', dueDate: date, completedAt: undefined });
  emitFollowUpsChanged();
}

export async function rescheduleFollowUp(fu: FollowUp, dueDate: string, dueTime: string, reason?: string) {
  if (fu.leadId) {
    const res = await fetch('/api/follow-ups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: fu.title || `Follow up: ${fu.contactName}`,
        contactName: fu.contactName || 'Lead',
        contactType: fu.contactType,
        contactPhone: fu.contactPhone,
        contactEmail: fu.contactEmail,
        type: fu.type,
        status: 'Pending',
        priority: fu.priority,
        dueDate,
        dueTime: /^\d{1,2}:\d{2}/.test(dueTime) ? dueTime.slice(0, 5) : '10:00',
        agent: fu.agent,
        agentInitials: fu.agentInitials,
        notes: fu.notes,
        propertyInterest: fu.propertyInterest,
        relationshipStatus: fu.relationshipStatus,
        leadId: fu.leadId,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error || 'Could not reschedule');
    if (reason) {
      try {
        await addLeadNote(fu.leadId, `Follow-up moved to ${dueDate}${reason ? ` — ${reason}` : ''}`);
      } catch {
        /* the new date is saved */
      }
    }
  } else {
    const notes = reason ? [fu.notes?.trim(), `[${stamp()}] Moved to ${dueDate} — ${reason}`].filter(Boolean).join('\n') : fu.notes;
    await followUpsService.update(fu.id, { ...fu, dueDate, dueTime, status: 'Pending', notes });
  }
  emitFollowUpsChanged();
}

export async function deleteFollowUp(fu: FollowUp) {
  await followUpsService.delete(fu.id);
  if (fu.leadId) await setLeadDue(fu.leadId, null);
  emitFollowUpsChanged();
}

/** Runs one operation over many follow-ups; returns how many succeeded. */
export async function runMany(items: FollowUp[], op: (fu: FollowUp) => Promise<void>): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (const fu of items) {
    try {
      await op(fu);
      ok++;
    } catch {
      failed++;
    }
  }
  return { ok, failed };
}
