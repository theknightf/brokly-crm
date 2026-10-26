// ─── Add Lead — Egyptian phone helpers ──────────────────────────────────────
// Small, dependency-free helpers used by the Add Lead form to auto-format an
// Egyptian mobile number while typing, to normalize it before saving, and to
// build the key used for the inline duplicate lookup.
//
// The validity rule is NOT re-implemented here: `normalizeEgyptianPhone` in
// @/lib/leadsImport is the single source of truth for what counts as an
// Egyptian mobile (010 / 011 / 012 / 015, optionally prefixed with 20 or 0020).

import { normalizeEgyptianPhone } from '@/lib/leadsImport';

/** Digits only — strips spaces, dashes, brackets and a leading '+'. */
export function phoneDigits(raw: string | number | null | undefined): string {
  return String(raw ?? '').replace(/\D/g, '');
}

/**
 * National form of an Egyptian mobile ("01012345678"), or '' when the number
 * is not a valid Egyptian mobile.
 *
 * `normalizeEgyptianPhone` owns the validity rule. It does not recognise a
 * country code followed by a zero-prefixed national number ("+20 010…"), so
 * that combination is unwrapped first and the result is handed back to the
 * shared helper for the actual check.
 */
export function nationalPhone(raw: string | number | null | undefined): string {
  let digits = phoneDigits(raw);
  if (!digits) return '';
  if (digits.startsWith('0020')) digits = digits.slice(4);
  else if (digits.startsWith('20')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return normalizeEgyptianPhone(digits);
}

/**
 * Canonical comparison key for a phone number.
 *
 * A valid Egyptian mobile is keyed by its national form ("01012345678") so
 * "+20 010 1234 5678", "201012345678" and "01012345678" are all recognised as
 * the same number. Anything else falls back to the last-10-digits rule used by
 * the server-side duplicate check.
 */
export function phoneCanonicalKey(raw: string | number | null | undefined): string {
  const national = nationalPhone(raw);
  if (national) return national;
  return phoneDigits(raw).slice(-10);
}

/**
 * The value to persist for a phone number.
 *
 * Valid Egyptian mobiles are stored in the canonical national form
 * ("01012345678") — exactly what the Excel/CSV importer writes — so the
 * existing duplicate lookups, which match on contiguous digits, keep working.
 * Numbers that are not valid Egyptian mobiles are stored as typed.
 */
export function phoneToStore(raw: string | number | null | undefined): string {
  const national = nationalPhone(raw);
  if (national) return national;
  return String(raw ?? '').trim();
}

/**
 * Formats an Egyptian mobile for display.
 *
 *   01012345678        -> "010 1234 5678"
 *   +20 10 1234 5678   -> "+20 010 1234 5678"
 *   201012345678       -> "+20 010 1234 5678"
 *   00201012345678     -> "+20 010 1234 5678"
 *
 * Anything that is not a recognisable Egyptian mobile is returned untouched, so
 * landlines, foreign numbers or half-typed values are never mangled.
 */
export function formatEgyptianPhone(raw: string | number | null | undefined): string {
  const source = String(raw ?? '');
  const national = nationalPhone(source);
  if (!national) return source.trim();

  const digits = phoneDigits(source);
  const hadCountryCode = digits.startsWith('0020') || digits.startsWith('20');

  // national is always "0" + 10 digits -> 010 1234 5678
  const body = `${national.slice(0, 3)} ${national.slice(3, 7)} ${national.slice(7)}`;
  return hadCountryCode ? `+20 ${body}` : body;
}

/**
 * Caret index inside `formatted` that sits after the same number of digits the
 * caret was after in the pre-format text. Keeps the cursor in place while the
 * value is reformatted on every keystroke.
 */
export function caretAfterDigits(formatted: string, digitCount: number): number {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    const ch = formatted[i];
    if (ch >= '0' && ch <= '9') {
      seen += 1;
      if (seen === digitCount) return i + 1;
    }
  }
  return formatted.length;
}
