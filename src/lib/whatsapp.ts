'use client';

/**
 * The first message a salesperson sends. {greeting} is صباح/مساء الخير by Cairo time, {lead} is the customer's
 * name (left out when unknown) and {agent} is the logged-in salesperson. Same wording as the phone app.
 */
const DEFAULT_TEMPLATE =
  '{greeting}{leadPart}، معاك {agent} من شركة On Point للتسويق العقاري.\nحابب أعرّف حضرتك بالوحدات والعروض المتاحة اللي تناسبك، ممكن أعرف إمتى يكون مناسب أكلم حضرتك؟';

// The logged-in salesperson (set from AuthContext), so every WhatsApp button signs the message with their own name.
let senderName = '';
export function setWhatsAppSenderName(name?: string | null) {
  senderName = String(name || '').trim();
}

function cairoGreeting(): string {
  try {
    const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', hour12: false }).format(new Date()));
    return h >= 5 && h < 12 ? 'صباح الخير' : 'مساء الخير';
  } catch {
    return 'مساء الخير';
  }
}


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

export function buildWhatsAppTemplate(leadName?: string | null, template: string = DEFAULT_TEMPLATE): string {
  const lead = (leadName || '').trim();
  const agent = senderName || 'مستشار عقاري';
  return template
    .replace('{greeting}', cairoGreeting())
    .replace('{leadPart}', lead ? ` يا ${lead}` : '')
    .replace('{agent}', agent)
    .replace('{username}', lead || 'حضرتك');
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
