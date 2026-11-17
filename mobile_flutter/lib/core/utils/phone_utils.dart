/// Phone rules shared by the add / edit lead screens and the lead card. Matches `src/lib/phone.ts` on the website.
class PhoneUtils {
  PhoneUtils._();

  /// ITU country calling codes (1-3 digits), except Egypt's 20 which counts as "Egyptian".
  static const Set<String> _callingCodes = {
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
  };

  static final RegExp _egyptMobileNoZero = RegExp(r'^1[0125]\d{8}$');

  static String _digits(String s) => s.replaceAll(RegExp(r'\D'), '');

  /// The country calling code a digits-only number starts with (966500318426 -> 966), or null. "1" and "7" need 11 digits.
  static String? countryCodeOfDigits(String digits) {
    for (final len in const [3, 2, 1]) {
      if (digits.length < len) continue;
      final cc = digits.substring(0, len);
      if (!_callingCodes.contains(cc)) continue;
      if ((cc == '1' || cc == '7') && digits.length != 11) return null;
      return cc;
    }
    return null;
  }

  /// Digits that already start with a real country code and are not Egyptian (966500318426, 971507769714, 19175936411).
  static bool _isPlainInternationalDigits(String d) =>
      d.length >= 10 && // a full international number (code + subscriber) is at least 10 digits; shorter ones are local numbers
      d.length <= 15 &&
      !d.startsWith('0') &&
      !d.startsWith('20') &&
      !_egyptMobileNoZero.hasMatch(d) &&
      countryCodeOfDigits(d) != null;

  /// True for any non-Egyptian number (for the "International" tag on lead cards).
  /// Egyptian = domestic format (starts with 0), Egypt's code (20 / +20 / 0020), or an Egyptian mobile typed without the 0.
  static bool isInternational(String? phone) {
    final typed = (phone ?? '').trim();
    final digits = _digits(typed);
    if (digits.isEmpty) return false;
    if (typed.startsWith('+')) return !digits.startsWith('20');
    if (digits.startsWith('00')) return !digits.substring(2).startsWith('20');
    if (digits.startsWith('0')) return false;
    if (digits.startsWith('20')) return false;
    if (_egyptMobileNoZero.hasMatch(digits)) return false;
    return digits.length >= 9;
  }

  /// The country code of an international number ("+966 50…" -> "966"), or null when it can't be told.
  static String? countryCodeOf(String? phone) {
    if (!isInternational(phone)) return null;
    var digits = _digits(phone ?? '');
    if (digits.startsWith('00')) digits = digits.substring(2);
    return countryCodeOfDigits(digits);
  }

  /// Phone to save from a typed value (edit screens): a number that starts with a country code but has no "+" gets
  /// the "+"; "00…" becomes "+…"; everything else is kept as typed.
  static String withPlusIfInternational(String raw) {
    final typed = raw.trim();
    final digits = _digits(typed);
    if (digits.isEmpty) return typed;
    if (typed.startsWith('+')) return typed;
    if (digits.startsWith('00') && !digits.substring(2).startsWith('20')) return '+${digits.substring(2)}';
    if (RegExp(r'^[\d\s().-]+$').hasMatch(typed) && _isPlainInternationalDigits(digits)) return '+$digits';
    return typed;
  }

  /// Phone to save from the Add Lead screen, where a country dropdown ([dropdownCode], e.g. "+20") sits next to the field.
  /// A number that already carries its own country code is used as is (never gets the dropdown code on top).
  static String fromAddLead(String raw, String dropdownCode) {
    final typed = raw.trim();
    if (typed.isEmpty) return '';
    final digits = _digits(typed);
    if (digits.isEmpty) return typed;
    if (typed.startsWith('+')) return typed;
    if (digits.startsWith('00')) return '+${digits.substring(2)}';
    // Egypt written with its code (201012345678): store the national form, like the rest of the app.
    if (digits.startsWith('20') && digits.length == 12) return '0${digits.substring(2)}';
    // Already starts with a country code (966500318426): add the "+", don't add the dropdown's code again.
    if (RegExp(r'^[\d\s().-]+$').hasMatch(typed) && _isPlainInternationalDigits(digits)) return '+$digits';
    // Local number: Egypt stays national (01…, or +20 added when the 0 was left out); for another country drop the
    // local leading 0 and add its code.
    if (dropdownCode == '+20') return typed.startsWith('0') ? typed : '+20$typed';
    return '$dropdownCode${digits.replaceFirst(RegExp(r'^0+'), '')}';
  }
}
