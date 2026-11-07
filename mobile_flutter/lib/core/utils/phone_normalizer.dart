/// Phone number normalization to E.164 (`+201005015545`) for matching device calls against leads.
///
/// Handles Egyptian formats out of the box (`01005015545`, `+201005015545`, `00201005015545`,
/// `201005015545`, `1005015545`, with spaces / dashes / dots / parentheses / Arabic digits) and any other
/// country through [defaultCountryCode] or the `countryCode` argument.
class PhoneNormalizer {
  PhoneNormalizer._();

  /// Country calling code (without `+`) assumed for numbers written in national format. Egypt by default.
  static String defaultCountryCode = '20';

  static const _arabicIndic = '٠١٢٣٤٥٦٧٨٩';
  static const _easternArabicIndic = '۰۱۲۳۴۵۶۷۸۹';

  /// E.164 (`+<country><national>`) or null when the input is not a plausible phone number.
  static String? toE164(String? raw, {String? countryCode}) {
    if (raw == null) return null;
    final cc = _digitsOnly(countryCode ?? defaultCountryCode);
    if (cc.isEmpty) return null;

    var s = _asciiDigits(raw.trim());
    if (s.isEmpty) return null;

    final hasPlus = s.startsWith('+');
    // Drop everything that is not a digit (spaces, dashes, dots, parentheses, letters like "ext").
    var digits = s.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return null;

    String e164Digits;
    if (hasPlus) {
      e164Digits = digits;
    } else if (digits.startsWith('00')) {
      // International dialing prefix: 00201005015545
      e164Digits = digits.substring(2);
    } else if (digits.startsWith('0')) {
      // National format with trunk zero: 01005015545 -> <cc>1005015545
      e164Digits = '$cc${digits.substring(1)}';
    } else if (digits.startsWith(cc) && _isPlausibleLength(digits.length, cc)) {
      // Already carries the country code, just without "+": 201005015545
      e164Digits = digits;
    } else {
      // National number written without the trunk zero: 1005015545
      e164Digits = '$cc$digits';
    }

    if (e164Digits.startsWith('0')) return null;
    if (e164Digits.length < 8 || e164Digits.length > 15) return null;

    // Egypt: national part is 9 digits (landline, 2/3-digit area code) or 10 digits (mobile 1x).
    if (e164Digits.startsWith('20')) {
      final national = e164Digits.length - 2;
      if (national < 8 || national > 10) return null;
    }
    return '+$e164Digits';
  }

  /// Last 10 digits of the E.164 number: the key used to compare a call with a lead. It mirrors the server's
  /// `leads.phone_normalized` (national number without the trunk zero, e.g. `1005015545`).
  static String? matchKey(String? raw, {String? countryCode}) {
    final e164 = toE164(raw, countryCode: countryCode);
    if (e164 == null) return null;
    final d = e164.substring(1);
    return d.length <= 10 ? d : d.substring(d.length - 10);
  }

  static bool _isPlausibleLength(int totalDigits, String cc) {
    // cc + national (8..11 digits)
    final national = totalDigits - cc.length;
    return national >= 8 && national <= 11;
  }

  static String _digitsOnly(String s) => s.replaceAll(RegExp(r'\D'), '');

  /// Converts Arabic-Indic and Eastern Arabic-Indic digits to ASCII (contacts saved with an Arabic keyboard).
  static String _asciiDigits(String input) {
    final b = StringBuffer();
    for (final r in input.runes) {
      final ch = String.fromCharCode(r);
      final a = _arabicIndic.indexOf(ch);
      final e = _easternArabicIndic.indexOf(ch);
      if (a >= 0) {
        b.write(a);
      } else if (e >= 0) {
        b.write(e);
      } else {
        b.write(ch);
      }
    }
    return b.toString();
  }
}
