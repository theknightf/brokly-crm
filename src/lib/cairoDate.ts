/**
 * One place for showing dates in Brokly: always Africa/Cairo time.
 * Accepts an ISO timestamp or a plain "YYYY-MM-DD" date (treated as that calendar day).
 */

const TZ = 'Africa/Cairo';

function parse(v?: string | null): Date | null {
  if (!v) return null;
  const s = String(v);
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00Z` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "YYYY-MM-DD" of today (or of a timestamp) in Cairo. */
export function cairoDay(v?: string | Date | null): string {
  const d = v instanceof Date ? v : v ? parse(v) : new Date();
  return (d || new Date()).toLocaleDateString('en-CA', { timeZone: TZ });
}

/** "12 Nov 2026" */
export function fmtDate(v?: string | null): string {
  const d = parse(v);
  return d ? d.toLocaleDateString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

/** "14:05" ('' for a plain date) */
export function fmtTime(v?: string | null): string {
  if (!v || /^\d{4}-\d{2}-\d{2}$/.test(String(v))) return '';
  const d = parse(v);
  return d ? d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '';
}

/** "12 Nov 2026, 14:05" */
export function fmtDateTime(v?: string | null): string {
  const t = fmtTime(v);
  return t ? `${fmtDate(v)}, ${t}` : fmtDate(v);
}

/** "just now", "5m ago", "3h ago", "2d ago", else a date. */
export function fmtAgo(v?: string | null): string {
  const d = parse(v);
  if (!d) return '';
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(v);
}

/** Days from today (Cairo) to a date: 0 today, 1 tomorrow, -2 two days late. */
export function daysFromToday(v?: string | null): number | null {
  if (!v) return null;
  const a = Date.parse(`${cairoDay()}T00:00:00Z`);
  const b = Date.parse(`${String(v).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** Next action label: "Today", "Tomorrow", "Yesterday", else the date. */
export function fmtNextAction(v?: string | null): string {
  const n = daysFromToday(v);
  if (n === null) return '—';
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return fmtDate(String(v).slice(0, 10));
}

const CLOSED = new Set([
  'done deal', 'won', 'lost', 'cancellation', 'not interested', 'duplicate leads', 'wrong number', 'closed number', 'low budget',
]);

/** A next action date before today on a lead that is still open. */
export function isOverdue(due?: string | null, stage?: string | null): boolean {
  const n = daysFromToday(due);
  return n !== null && n < 0 && !CLOSED.has(String(stage || '').toLowerCase());
}
