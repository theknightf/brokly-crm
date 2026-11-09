import { normalizePhone } from '@/lib/phone';

/**
 * Lead search used by the Leads page, the stage counts and the lead pickers.
 *
 * What it fixes compared with `name.ilike.%q%,phone.ilike.%q%…` built from the raw text:
 *  - commas, parentheses, quotes and % typed by the user broke the PostgREST filter, so the list silently came back empty;
 *  - phone numbers typed with spaces, "+20", "0020" or without the leading zero never matched ("100 123 4567");
 *  - several words had to appear together in ONE column ("hassan ahmed" never matched "Ahmed Hassan");
 *  - project and the agent text were not searched.
 */

/** Removes characters that are PostgREST filter syntax and escapes LIKE wildcards. */
export function safeSearchTerm(raw: string): string {
  return raw
    .replace(/[,()"'\\]/g, ' ')
    .replace(/[%*]/g, ' ')
    .replace(/_/g, '\\_')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A query made only of digits and phone punctuation, with at least 3 digits. */
export function looksLikePhone(raw: string): boolean {
  const q = raw.trim();
  return /^[\d\s+()\-.]+$/.test(q) && q.replace(/\D/g, '').length >= 3;
}

/**
 * Applies the search to a supabase-js query on `leads`. Each `.or()` is ANDed with the previous one, so a
 * multi-word query needs every word to match somewhere (name, email, location, project, phone or agent).
 */
export function applyLeadSearch<T extends { or: (filter: string) => T }>(query: T, raw: string): T {
  const q = (raw || '').trim();
  if (!q) return query;

  if (looksLikePhone(q)) {
    const digits = normalizePhone(q); // "+20 100 123 4567" / "0100 123 4567" -> "1001234567"
    if (digits) return query.or(`phone_normalized.ilike.%${digits}%,phone.ilike.%${safeSearchTerm(q)}%`);
  }

  const words = safeSearchTerm(q).split(' ').filter(Boolean).slice(0, 5);
  let out = query;
  for (const w of words) {
    const wordDigits = /^\d{4,}$/.test(w) ? normalizePhone(w) : '';
    const cols = [
      `name.ilike.%${w}%`,
      `email.ilike.%${w}%`,
      `phone.ilike.%${w}%`,
      `location.ilike.%${w}%`,
      `project.ilike.%${w}%`,
      `agent.ilike.%${w}%`,
    ];
    if (wordDigits) cols.push(`phone_normalized.ilike.%${wordDigits}%`);
    out = out.or(cols.join(','));
  }
  return out;
}
