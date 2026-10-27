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
  if (d.startsWith('0020') && d.length > 4) d = d.slice(4);
  else if (d.startsWith('20') && d.length >= 12) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  return d;
}
