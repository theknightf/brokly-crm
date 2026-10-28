// ─── Add Lead — "Quick paste" parser ────────────────────────────────────────
// Pulls a name, a phone number and an e-mail out of free text (a WhatsApp
// message, an SMS, a note). Pure and dependency-free; the form decides what to
// do with the result.

export interface ParsedLead {
  name?: string;
  phone?: string;
  email?: string;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;
// 7–15 digits, optionally with +, spaces, dots, dashes or brackets between them.
const PHONE_RE = /(?:\+|00)?\d[\d\s().-]{5,}\d/g;
// Arabic-Indic digits → ASCII so "٠١٠١٢٣٤٥٦٧٨" parses too.
const toAsciiDigits = (s: string) =>
  s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

const LABEL_RE =
  /\b(?:full\s*name|name|phone|mobile|tel|telephone|whatsapp|email|e-mail|mail)\b\s*[:：=-]?|(?:الاسم|اسم|رقم|موبايل|تليفون|واتساب|ايميل|إيميل)\s*[:：=-]?/gi;

export function parsePastedLead(raw: string): ParsedLead {
  const out: ParsedLead = {};
  let text = toAsciiDigits(String(raw || '')).replace(/\r/g, '');
  if (!text.trim()) return out;

  const emailMatch = text.match(EMAIL_RE);
  if (emailMatch) {
    out.email = emailMatch[0].toLowerCase();
    text = text.replace(emailMatch[0], ' ');
  }

  // Drop WhatsApp "[12:30, 3/4/2025] Ahmed:" / "3/4/25, 12:30 - Ahmed:" prefixes first,
  // so their digits are not mistaken for a phone number.
  text = text
    .replace(/\[[^\]\n]*\]/g, ' ')
    .replace(/\d{1,2}\/\d{1,2}\/\d{2,4},?\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?\s*-\s*/g, ' ');

  const phones = (text.match(PHONE_RE) || [])
    .map((p) => ({ p, digits: p.replace(/\D/g, '') }))
    .filter((x) => x.digits.length >= 7 && x.digits.length <= 15);
  if (phones.length) {
    // Prefer an Egyptian mobile (01x… / 201x… / 00201x…), else the longest number.
    const egyptian = phones.find((x) => /^(?:0020|20)?0?1[0125]\d{8}$/.test(x.digits));
    const best = egyptian || phones.sort((a, b) => b.digits.length - a.digits.length)[0];
    out.phone = best.p.trim().startsWith('+') ? `+${best.digits}` : best.digits;
    text = text.replace(best.p, ' ');
  }

  const cleaned = text.replace(LABEL_RE, ' ');
  const segments = cleaned
    .split(/[\n,;|•·]+/)
    .map((s) => s.replace(/[:：]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((s) => /[A-Za-z؀-ۿ]{2,}/.test(s));
  if (segments.length) {
    const name = segments[0]
      .replace(/^[^A-Za-z؀-ۿ]+|[^A-Za-z؀-ۿ]+$/g, '')
      .split(' ')
      .slice(0, 5)
      .join(' ')
      .slice(0, 60)
      .trim();
    if (name) out.name = name;
  }
  return out;
}
