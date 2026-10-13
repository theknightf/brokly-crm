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
