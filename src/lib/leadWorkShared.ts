/**
 * Constants + types shared by the employee drawer UI and the notes / actions / calls routes.
 * Browser-safe: no server-only imports here (routes import the zod schemas from leadWork.ts).
 */

export const NOTE_MAX = 500;
/** Authors may edit or delete their own note for this long (RLS enforces the same). */
export const NOTE_EDIT_WINDOW_MS = 15 * 60 * 1000;

export const ACTION_TYPES = [
  { value: 'status_update', label: 'Status update' },
  { value: 'follow_up_call', label: 'Follow-up call' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'send_whatsapp', label: 'Send WhatsApp' },
  { value: 'send_offer', label: 'Send offer' },
] as const;

export const ACTION_STATUSES = [
  'Interested',
  'Follow-up',
  'Meeting scheduled',
  'Not interested',
  'Wrong number',
  'Retry',
  'Closed/Deal',
] as const;

export type CallResult = 'connected' | 'no_answer' | 'incoming' | 'other';
export const CALL_RESULTS: CallResult[] = ['connected', 'no_answer', 'incoming', 'other'];

export interface CallItem {
  id: string;
  leadId: string | null;
  leadName: string | null;
  phone: string | null;
  createdAt: string;
  direction: 'incoming' | 'outgoing';
  result: CallResult;
  durationSeconds: number;
}

export interface NoteItem {
  id: string;
  leadId: string;
  leadName: string | null;
  callId: string | null;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  edited: boolean;
}

export interface ActionItem {
  id: string;
  leadId: string;
  leadName: string | null;
  callId: string | null;
  type: string;
  status: string | null;
  note: string | null;
  dueAt: string | null;
  doneAt: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
}

export interface HistoryEntry {
  id: string;
  kind: 'action' | 'status_change';
  at: string;
  byName: string;
  label: string;
  note: string | null;
  leadName: string | null;
  from: string | null;
  to: string | null;
}

/** "1m 42s" / "45s" / "-" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  if (!s) return '-';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m}m ${r}s` : `${r}s`;
}
