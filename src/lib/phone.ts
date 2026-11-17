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
 * ITU country calling codes (1–3 digits), except Egypt's 20 which is handled as "Egyptian".
 * Same list as the 2026-11-17 phone migration and the phone app (mobile_flutter/lib/core/utils/phone_utils.dart).
 */
const CALLING_CODES = new Set([
  '1', '7', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49',
  '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86',
  '90', '91', '92', '93', '94', '95', '98',
  '211', '212', '213', '216', '218', '220', '221', '222', '223', '224', '225', '226', '227', '228', '229', '230', '231',
  '232', '233', '234', '235', '236', '237', '238', '239', '240', '241', '242', '243', '244', '245', '246', '247', '248',
  '249', '250', '251', '252', '253', '254', '255', '256', '257', '258', '260', '261', '262', '263', '264', '265', '266',
  '267', '268', '269', '290', '291', '297', '298', '299',
  '350', '351', '352', '353', '354', '355', '356', '357', '358', '359', '370', '371', '372', '373', '374', '375', '376',
  '377', '378', '380', '381', '382', '383', '385', '386', '387', '389', '420', '421', '423',
  '500', '501', '502', '503', '504', '505', '506', '507', '508', '509', '590', '591', '592', '593', '594', '595', '596',
  '597', '598', '599',
  '670', '672', '673', '674', '675', '676', '677', '678', '679', '680', '681', '682', '683', '685', '686', '687', '688',
  '689', '690', '691', '692',
  '850', '852', '853', '855', '856', '880', '886',
  '960', '961', '962', '963', '964', '965', '966', '967', '968', '970', '971', '972', '973', '974', '975', '976', '977',
  '992', '993', '994', '995', '996', '998',
]);

/** The country calling code a digits-only number starts with (966500318426 -> "966"), or null. "1" and "7" need 11 digits. */
export function countryCodeOfDigits(digits: string): string | null {
  for (const len of [3, 2, 1]) {
    const cc = digits.slice(0, len);
    if (!CALLING_CODES.has(cc)) continue;
    if ((cc === '1' || cc === '7') && digits.length !== 11) return null;
    return cc;
  }
  return null;
}

/** Digits-only number that starts with a real country code and is not Egyptian (966500318426, 971507769714, 19175936411). */
function isPlainInternationalDigits(digits: string): boolean {
  return (
    digits.length >= 10 && // a full international number (code + subscriber) is at least 10 digits; shorter ones are local numbers
    digits.length <= 15 &&
    !digits.startsWith('0') &&
    !digits.startsWith('20') &&
    !/^1[0125]\d{8}$/.test(digits) &&
    countryCodeOfDigits(digits) !== null
  );
}

/**
 * True for any non-Egyptian number — for the "International" badge on lead cards.
 * Egyptian = domestic format (starts with 0), Egypt's code (20 / +20 / 0020), or an Egyptian mobile typed without the 0.
 */
export function isInternationalPhone(phone: string | number | null | undefined): boolean {
  const typed = String(phone ?? '').trim();
  const digits = typed.replace(/\D/g, '');
  if (!digits) return false;
  if (typed.startsWith('+')) return !digits.startsWith('20');
  if (digits.startsWith('00')) return !digits.slice(2).startsWith('20');
  if (digits.startsWith('0')) return false;
  if (digits.startsWith('20')) return false;
  if (/^1[0125]\d{8}$/.test(digits)) return false;
  return digits.length >= 9;
}

/** The country calling code of an international number ("+966 50…" -> "966"), or null when it can't be told. */
export function countryCodeOfPhone(phone: string | number | null | undefined): string | null {
  if (!isInternationalPhone(phone)) return null;
  let digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  return countryCodeOfDigits(digits);
}

/**
 * The value to store for any phone number (Egyptian or international), or '' when it is not a phone:
 *  - an Egyptian mobile in any form → national "01012345678";
 *  - a number written with "+" or "00" → "+<country code><number>", e.g. "+971501234567";
 *  - plain digits that start with a country code (966500318426, 971507769714) → the same, with the "+" added;
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
  // Typed without "+" but already starting with a country code: add the "+" (so it dials and opens WhatsApp correctly).
  if (!intl && /^[\d\s().-]+$/.test(typed) && isPlainInternationalDigits(digits)) return `+${digits}`;
  return intl ? `+${body}` : typed.replace(/[^\d+]/g, '');
}
