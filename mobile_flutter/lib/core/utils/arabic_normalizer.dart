/// Egyptian Arabic text normalizer & keyword extractor for Brokly Mobile.
/// Matches web platform logic in `src/lib/assistant/arabicNormalizer.ts`.
class ArabicNormalizer {
  ArabicNormalizer._();

  static final Set<String> _arabicStopWords = {
    'مين', 'مين_هو', 'العميل', 'عميل', 'اللي', 'الي', 'يلي', 'عاوز', 'عايز', 'عايزه', 'عاوزه',
    'يشتري', 'شراء', 'محتاج', 'محتاجه', 'مهتم', 'مهتمه', 'بيدور', 'بتدور', 'دورلي', 'ابحثلي',
    'في', 'فى', 'عن', 'من', 'الي', 'على', 'علي', 'مع', 'لو', 'سمحت', 'ممكن', 'هاتلي', 'اديني',
    'هو', 'هي', 'هم', 'كل', 'اي', 'اية', 'ايه', 'كان', 'قال', 'سأل', 'طلب', 'بيسال', 'بيسأل',
    'بكام', 'كام', 'فين', 'شقه', 'شقة', 'فيلا', 'وحده', 'وحدة'
  };

  /// Normalizes Arabic string matching the database normalization logic
  static String normalize(String text) {
    if (text.isEmpty) return '';
    String cleaned = text.toLowerCase().trim();

    // Strip Tashkeel & Tatweel (\u064B-\u065F, \u0640)
    cleaned = cleaned.replaceAll(RegExp(r'[\u064B-\u065F\u0640]'), '');

    // Normalize Alef variants (أ / إ / آ / ٱ -> ا)
    cleaned = cleaned.replaceAll(RegExp(r'[أإآٱ]'), 'ا');

    // Normalize Taa Marbuta (ة -> ه)
    cleaned = cleaned.replaceAll('ة', 'ه');

    // Normalize Alef Maksura (ى -> ي)
    cleaned = cleaned.replaceAll('ى', 'ي');

    // Strip non-alphanumeric except Arabic and spaces
    cleaned = cleaned.replaceAll(RegExp(r'[^\w\s\u0600-\u06FF]'), ' ');

    // Strip leading 'ال' from words
    cleaned = cleaned.replaceAllMapped(
      RegExp(r'(^|\s+)ال([^\s]{2,})'),
      (m) => '${m[1]}${m[2]}',
    );

    // Collapse whitespace
    return cleaned.replaceAll(RegExp(r'\s+'), ' ').trim();
  }

  /// Extracts searchable keywords from an agent's conversational prompt
  static List<String> extractKeywords(String prompt) {
    final normalized = normalize(prompt);
    final words = normalized.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();

    final keywords = words.where((w) {
      if (w.length < 2) return false;
      if (_arabicStopWords.contains(w)) return false;
      return true;
    }).toList();

    return keywords.isNotEmpty ? keywords : words;
  }

  /// Generates forgiving search terms for a given query:
  /// handles 'ال' prefix, Alef variations, Taa Marbuta/Haa, and common typos.
  static List<String> getSearchVariants(String query) {
    final raw = query.trim();
    if (raw.isEmpty) return [];

    final norm = normalize(raw);
    final variants = <String>{};

    if (raw.length >= 2) variants.add(raw);
    if (norm.length >= 2) variants.add(norm);

    if (raw.startsWith('ال') && raw.length > 3) {
      variants.add(raw.substring(2));
    } else if (!raw.startsWith('ال') && raw.length >= 2) {
      variants.add('ال$raw');
    }

    if (norm.length >= 2) {
      variants.add('ال$norm');
      if (norm.startsWith('ال') && norm.length > 3) {
        variants.add(norm.substring(2));
      }
    }

    if (raw.endsWith('ة')) variants.add('${raw.substring(0, raw.length - 1)}ه');
    if (raw.endsWith('ه')) variants.add('${raw.substring(0, raw.length - 1)}ة');

    return variants.where((v) => v.length >= 2).toList();
  }

  /// Maps Arabic and English conversational stage mentions to canonical CRM statuses
  static String? mapArabicToStage(String? input) {
    if (input == null || input.trim().isEmpty) return null;
    final trimmed = input.trim();

    const stageMap = <String, String>{
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

    final norm = normalize(trimmed).toLowerCase();
    if (stageMap.containsKey(norm)) return stageMap[norm];
    if (stageMap.containsKey(trimmed.toLowerCase())) return stageMap[trimmed.toLowerCase()];

    for (final entry in stageMap.entries) {
      if (norm.contains(entry.key) || entry.key.contains(norm)) {
        return entry.value;
      }
    }

    return null;
  }
}
