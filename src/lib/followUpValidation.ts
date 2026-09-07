/**
 * Single source of truth for follow-up field validation.
 * Used by POST /api/follow-ups (authoritative, server-side) and by
 * FollowUpForm (client-side) so the lead card, the queue, and the dashboard
 * can never disagree about what a valid reminder looks like.
 */

export interface FollowUpInput {
  title?: unknown;
  contactName?: unknown;
  dueDate?: unknown;
  dueTime?: unknown;
  contactPhone?: unknown;
  contactEmail?: unknown;
}

export type FollowUpErrors = Partial<
  Record<'title' | 'contactName' | 'dueDate' | 'dueTime' | 'contactPhone' | 'contactEmail', string>
>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateFollowUpInput(input: FollowUpInput): FollowUpErrors {
  const errors: FollowUpErrors = {};
  const title = String(input.title ?? '').trim();
  const contactName = String(input.contactName ?? '').trim();
  const dueDate = String(input.dueDate ?? '').trim();
  const dueTime = String(input.dueTime ?? '').trim();
  const phone = String(input.contactPhone ?? '').trim();
  const email = String(input.contactEmail ?? '').trim();

  if (!title) errors.title = 'Title is required';
  else if (title.length > 160) errors.title = 'Title must be 160 characters or less';

  if (!contactName) errors.contactName = 'Contact name is required';

  if (!DATE_RE.test(dueDate)) {
    errors.dueDate = 'Valid due date (YYYY-MM-DD) is required';
  } else {
    const [y, m, d] = dueDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
      errors.dueDate = 'Due date is not a real calendar date';
    }
  }

  if (!TIME_RE.test(dueTime)) {
    errors.dueTime = 'Valid due time (HH:MM) is required';
  } else {
    const [h, mi] = dueTime.split(':').map(Number);
    if (h < 0 || h > 23 || mi < 0 || mi > 59) errors.dueTime = 'Due time is out of range';
  }

  // Past guard: a reminder due before today is instantly "overdue" — flag it
  // instead of silently creating noise in the Overdue widget.
  if (!errors.dueDate && !errors.dueTime) {
    const [y, m, d] = dueDate.split('-').map(Number);
    const [h, mi] = dueTime.split(':').map(Number);
    const due = new Date(y, m - 1, d, h, mi);
    const now = new Date();
    // Allow ~15 min of clock skew / slow typing.
    if (due.getTime() < now.getTime() - 15 * 60 * 1000) {
      errors.dueDate = 'Due date/time is in the past — pick a future slot';
    }
  }

  if (phone && !/^\+?[0-9][0-9\s\-()]{5,18}$/.test(phone)) {
    errors.contactPhone = 'Phone number looks invalid';
  }
  if (email && !EMAIL_RE.test(email)) {
    errors.contactEmail = 'Email address looks invalid';
  }

  return errors;
}

/** True when the input passes every rule (no error entries). */
export function isValidFollowUpInput(input: FollowUpInput): boolean {
  return Object.keys(validateFollowUpInput(input)).length === 0;
}
