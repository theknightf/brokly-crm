'use client';

const DEFAULT_TEMPLATE = 'مساء الخير مع حضرتك {username} من شركة onpoint للتسويق العقاري بتواصل معاك حابب اعرفك العروض المتاحة';

/**
 * Sanitize Egyptian phone for wa.me: strip non-digits, handle leading 0,
 * ensure +20 country code without plus.
 * Examples: 01012345678 -> 201012345678, +20 1012345678 -> 201012345678, 201012345678 -> 201012345678
 */
export function sanitizeEgyptPhone(phone?: string | null): string {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  // Remove leading zeros (local format)
  digits = digits.replace(/^0+/, '');
  // If already starts with 20 (Egypt), keep; otherwise prepend 20
  if (!digits.startsWith('20')) {
    // Handle 10-digit local without leading 0 (e.g., 1012345678)
    digits = '20' + digits;
  }
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
