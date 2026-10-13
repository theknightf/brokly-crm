/**
 * Egyptian Arabic text normalizer & keyword extractor
 * Strips tashkeel, normalizes Alef variants, Taa Marbuta, Yaa,
 * removes leading 'ال' and drops dialect filler words.
 */

// Egyptian / Levant filler words to drop when extracting search keywords
const ARABIC_STOP_WORDS = new Set([
  'مين', 'مين_هو', 'العميل', 'عميل', 'اللي', 'الي', 'يلي', 'عاوز', 'عايز', 'عايزه', 'عاوزه',
  'يشتري', 'شراء', 'محتاج', 'محتاجه', 'مهتم', 'مهتمه', 'بيدور', 'بتدور', 'دورلي', 'ابحثلي',
  'في', 'فى', 'عن', 'من', 'الي', 'على', 'علي', 'مع', 'لو', 'سمحت', 'ممكن', 'هاتلي', 'اديني',
  'هو', 'هي', 'هم', 'كل', 'اي', 'اية', 'ايه', 'كان', 'قال', 'سأل', 'طلب', 'بيسال', 'بيسأل',
  'بكام', 'كام', 'فين', 'شقه', 'شقة', 'فيلا', 'وحده', 'وحدة'
]);

/**
 * Normalizes Arabic string matching the database normalization logic
 */
export function normalizeArabic(text: string): string {
  if (!text) return '';
  let cleaned = text.toLowerCase().trim();

  // Strip Tashkeel & Tatweel
  cleaned = cleaned.replace(/[\u064B-\u065F\u0640]/g, '');

  // Normalize Alef variants (أ / إ / آ / ٱ -> ا)
  cleaned = cleaned.replace(/[أإآٱ]/g, 'ا');

  // Normalize Taa Marbuta (ة -> ه)
  cleaned = cleaned.replace(/ة/g, 'ه');

  // Normalize Alef Maksura (ى -> ي)
  cleaned = cleaned.replace(/ى/g, 'ي');

  // Normalize English / punctuation
  cleaned = cleaned.replace(/[^\w\s\u0600-\u06FF]/g, ' ');

  // Strip leading 'ال' from words
  cleaned = cleaned.replace(/(^|\s+)ال([^\s]{2,})/g, '$1$2');

  // Collapse whitespace
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Extracts searchable search tokens from an agent's conversational prompt.
 * e.g. "مين العميل اللي عاوز يشتري في النرجس؟" -> ["نرجس"]
 */
export function extractKeywords(prompt: string): string[] {
  const normalized = normalizeArabic(prompt);
  const words = normalized.split(/\s+/).filter(Boolean);

  const keywords = words.filter((w) => {
    if (w.length < 2) return false;
    if (ARABIC_STOP_WORDS.has(w)) return false;
    return true;
  });

  return keywords.length > 0 ? keywords : words;
}

/**
 * Generates forgiving search terms for a given query:
 * handles 'ال' prefix, Alef variations, Taa Marbuta/Haa, and common typos.
 */
export function getArabicSearchVariants(query: string): string[] {
  const raw = query.trim();
  if (!raw) return [];

  const norm = normalizeArabic(raw);
  const variants = new Set<string>();

  if (raw.length >= 2) variants.add(raw);
  if (norm.length >= 2) variants.add(norm);

  // If raw has 'ال', add variant without it; if not, add variant with 'ال'
  if (raw.startsWith('ال') && raw.length > 3) {
    variants.add(raw.slice(2));
  } else if (!raw.startsWith('ال') && raw.length >= 2) {
    variants.add(`ال${raw}`);
  }

  if (norm.length >= 2) {
    variants.add(`ال${norm}`);
    if (norm.startsWith('ال') && norm.length > 3) {
      variants.add(norm.slice(2));
    }
  }

  // Taa Marbuta vs Haa variations
  if (raw.endsWith('ة')) variants.add(raw.slice(0, -1) + 'ه');
  if (raw.endsWith('ه')) variants.add(raw.slice(0, -1) + 'ة');

  return Array.from(variants).filter((v) => v.length >= 2);
}

/**
 * Maps Arabic and English conversational stage mentions to canonical CRM statuses
 */
export function mapArabicToStage(input: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();

  const STAGE_MAP: Record<string, string> = {
    'مهتم': 'Interested',
    'مهتمة': 'Interested',
    'مهتمين': 'Interested',
    'انترستد': 'Interested',
    'interested': 'Interested',
    'متابعه': 'Following Up',
    'متابعة': 'Following Up',
    'فولو اب': 'Following Up',
    'following up': 'Following Up',
    'فولو': 'Following Up',
    'اجتماع': 'Meeting',
    'ميتنج': 'Meeting',
    'مقابله': 'Meeting',
    'مقابلة': 'Meeting',
    'meeting': 'Meeting',
    'متابعه بعد الاجتماع': 'Follow Up After Meeting',
    'متابعة بعد الاجتماع': 'Follow Up After Meeting',
    'حجز': 'Reservation',
    'ريزرفيشن': 'Reservation',
    'reservation': 'Reservation',
    'ديل': 'Done Deal',
    'تم البيع': 'Done Deal',
    'بيع': 'Done Deal',
    'done deal': 'Done Deal',
    'won': 'Done Deal',
    'غير مهتم': 'Not Interested',
    'مش مهتم': 'Not Interested',
    'not interested': 'Not Interested',
    'لم يرد': 'No Answer',
    'ماردش': 'No Answer',
    'ما بيردش': 'No Answer',
    'ما ردش': 'No Answer',
    'no answer': 'No Answer',
    'ما بيردش خالص': 'No Answer At All',
    'لا يرد نهائيا': 'No Answer At All',
    'no answer at all': 'No Answer At All',
    'رقم خاطئ': 'Wrong Number',
    'رقم غلط': 'Wrong Number',
    'wrong number': 'Wrong Number',
    'مغلق': 'Closed Number',
    'غير متاح': 'Closed Number',
    'closed number': 'Closed Number',
    'ميزانيه منخفضه': 'Low Budget',
    'ميزانية منخفضة': 'Low Budget',
    'low budget': 'Low Budget',
    'الغاء': 'Cancellation',
    'إلغاء': 'Cancellation',
    'كنسل': 'Cancellation',
    'cancellation': 'Cancellation',
    'مؤجل': 'Pending Leads',
    'بيندينج': 'Pending Leads',
    'pending': 'Pending Leads',
    'بارد': 'Cold Calls',
    'كولد': 'Cold Calls',
    'cold': 'Cold Calls',
    'جديد': 'Fresh Leads',
    'فريش': 'Fresh Leads',
    'fresh': 'Fresh Leads',
    'تاجيل اجتماع': 'Reschedule Meeting',
    'تأجيل الاجتماع': 'Reschedule Meeting',
    'reschedule meeting': 'Reschedule Meeting',
  };

  const norm = normalizeArabic(trimmed).toLowerCase();
  if (STAGE_MAP[norm]) return STAGE_MAP[norm];
  if (STAGE_MAP[trimmed.toLowerCase()]) return STAGE_MAP[trimmed.toLowerCase()];

  for (const [key, stage] of Object.entries(STAGE_MAP)) {
    if (norm.includes(key) || key.includes(norm)) {
      return stage;
    }
  }

  return undefined;
}

