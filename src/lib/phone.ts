/**
 * Shared phone normalization. MUST stay identical to the SQL function
 * `public.normalize_phone` (supabase/migrations/20261027000000_*.sql).
 *
 * Digits only; drop a `0020` prefix, or a `20` country code when the number has
 * 12+ digits; then drop ONE leading `0`. So "+20 100 123 4567",
 * "0020 100 123 4567" and "0100 123 4567" all become "1001234567".
 */
export function normalizePhone(raw: string | number | null | undefined): string {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return '';
  // A leading "00" is the international dialling prefix (same as "+"): "00971…" = "+971…".
  if (d.startsWith('00') && d.length > 2) d = d.slice(2);
  if (d.startsWith('20') && d.length >= 12) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  return d;
}

/**
 * The value to store for any phone number (Egyptian or international), or '' when it is not a phone:
 *  - an Egyptian mobile in any form → national "01012345678";
 *  - a number written with "+" or "00" → "+<country code><number>", e.g. "+971501234567";
 *  - anything else with 7–15 digits → kept as typed (spaces/dashes trimmed).
 */
export function storablePhone(raw: string | number | null | undefined): string {
  const typed = String(raw ?? '').trim();
  const digits = typed.replace(/\D/g, '');
  if (!digits) return '';
  let d = digits;
  if (d.startsWith('0020')) d = d.slice(4);
  else if (d.startsWith('20') && d.length === 12) d = d.slice(2);
  else if (d.startsWith('0') && !d.startsWith('00')) d = d.slice(1);
  if (/^1[0125]\d{8}$/.test(d)) return '0' + d;
  const intl = typed.startsWith('+') || digits.startsWith('00');
  const body = digits.startsWith('00') ? digits.slice(2) : digits;
  if (body.length < 7 || body.length > 15) return '';
  return intl ? `+${body}` : typed.replace(/[^\d+]/g, '');
}
