'use client';

const DEFAULT_TEMPLATE = 'مساء الخير مع حضرتك {username} من شركة onpoint للتسويق العقاري بتواصل معاك حابب اعرفك العروض المتاحة';

/**
 * Number for a wa.me link (digits only, with the country code).
 *  - Egyptian numbers get Egypt's 20: 01012345678 -> 201012345678, 1012345678 -> 201012345678, 0222345678 -> 20222345678,
 *    and 201012345678 stays as is.
 *  - International numbers are NEVER given the Egypt code: "+971 50 123 4567", "00971501234567" and the plain
 *    "971501234567" (how most international leads are stored, without the +) all stay 971501234567.
 */
export function sanitizeEgyptPhone(phone?: string | null): string {
  if (!phone) return '';
  const raw = String(phone).trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  // Written with "+" or "00": it already carries its country code.
  if (raw.startsWith('+') || digits.startsWith('00')) return digits.replace(/^00/, '');
  // Domestic format with a leading 0 (01012345678, 0222345678): Egyptian.
  if (digits.startsWith('0')) {
    const national = digits.replace(/^0+/, '');
    return national.startsWith('20') ? national : `20${national}`;
  }
  // Already has Egypt's code (201012345678, or an Egyptian landline with the code).
  if (digits.startsWith('20')) return digits;
  // Egyptian mobile typed without the leading 0 (1012345678).
  if (/^1[0125]\d{8}$/.test(digits)) return `20${digits}`;
  // Anything else already includes its own country code (966…, 971…, 965…, 44…, 1… for US/Canada).
  return digits;
}

export function buildWhatsAppTemplate(username?: string | null, template: string = DEFAULT_TEMPLATE): string {
  const name = (username || '').trim() || 'حضرتك';
  return template.replace('{username}', name);
}

/**
 * Build wa.me link with proper sanitization and URL encoding.
 * If message is provided, it is encodeURIComponent'd.
 */
export function getWhatsAppLink(phone?: string | null, message?: string | null): string {
  const digits = sanitizeEgyptPhone(phone);
  if (!digits) return '#';
  const base = `https://wa.me/${digits}`;
  if (message && String(message).trim()) {
    return `${base}?text=${encodeURIComponent(String(message).trim())}`;
  }
  return base;
}

export function getWhatsAppLinkForLead(phone?: string | null, leadName?: string | null, customTemplate?: string): string {
  const msg = buildWhatsAppTemplate(leadName, customTemplate || DEFAULT_TEMPLATE);
  return getWhatsAppLink(phone, msg);
}

export const WHATSAPP_TEMPLATE = DEFAULT_TEMPLATE;
