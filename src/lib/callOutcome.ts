// Same notion of "answered" as the is_answered_outcome() SQL function: a call (not WhatsApp) where the lead picked up.
const UNANSWERED = new Set(['no answer', 'no answer at all', 'busy', 'closed number', 'wrong phone', 'wrong number', 'voicemail', 'cancelled', 'canceled', 'no reply', 'whatsapp sent', 'whatsapp follow-up']);
const ANSWERED = new Set(['answered', 'completed', 'connected', 'reached', 'interested', 'follow-up', 'follow up', 'followup', 'follow up after meeting', 'call back later', 'callback', 'meeting', 'schedule meeting', 'site visit', 'not interested', 'won deal', 'done deal']);

export function isAnsweredCall(c: { outcome?: string | null; channel?: string | null; duration_seconds?: number | null }): boolean {
  if (String(c.channel || 'Call').trim().toLowerCase() !== 'call') return false;
  const o = String(c.outcome || '').trim().replace(/_/g, ' ').toLowerCase();
  if (UNANSWERED.has(o)) return false;
  if (ANSWERED.has(o)) return true;
  return Number(c.duration_seconds || 0) > 0;
}
