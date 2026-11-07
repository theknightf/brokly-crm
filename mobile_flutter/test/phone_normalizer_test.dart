import 'package:brokly_mobile/core/utils/phone_normalizer.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  tearDown(() => PhoneNormalizer.defaultCountryCode = '20');

  group('Egyptian formats -> E.164', () {
    const expected = '+201005015545';
    for (final input in [
      '01005015545',
      '+201005015545',
      '00201005015545',
      '201005015545',
      '1005015545',
      '010 0501 5545',
      '010-0501-5545',
      '(010) 0501.5545',
      '+20 100 501 5545',
      '+20-100-501-5545',
      '  01005015545  ',
      '٠١٠٠٥٠١٥٥٤٥', // Arabic-Indic digits
      '۰۱۰۰۵۰۱۵۵۴۵', // Eastern Arabic-Indic digits
    ]) {
      test('"$input"', () => expect(PhoneNormalizer.toE164(input), expected));
    }

    test('all mobile prefixes', () {
      expect(PhoneNormalizer.toE164('01112345678'), '+201112345678');
      expect(PhoneNormalizer.toE164('01212345678'), '+201212345678');
      expect(PhoneNormalizer.toE164('01512345678'), '+201512345678');
    });

    test('landline with area code', () {
      expect(PhoneNormalizer.toE164('0224123456'), '+20224123456');
      expect(PhoneNormalizer.toE164('+20 2 2412 3456'), '+20224123456');
    });
  });

  group('rejects things that are not phone numbers', () {
    for (final input in [null, '', '   ', 'abc', '+', '00', '12345', '0', '+0123456789', '+1234567890123456']) {
      test('"$input"', () => expect(PhoneNormalizer.toE164(input), isNull));
    }

    test('too many digits for Egypt', () {
      expect(PhoneNormalizer.toE164('+2010050155451234'), isNull);
    });
  });

  group('other countries', () {
    test('explicit country code for national format', () {
      expect(PhoneNormalizer.toE164('0501234567', countryCode: '966'), '+966501234567');
      expect(PhoneNormalizer.toE164('0501234567', countryCode: '+966'), '+966501234567');
    });

    test('configurable default country code', () {
      PhoneNormalizer.defaultCountryCode = '971';
      expect(PhoneNormalizer.toE164('0501234567'), '+971501234567');
      expect(PhoneNormalizer.toE164('00971501234567'), '+971501234567');
    });

    test('numbers that already carry another country stay as they are', () {
      expect(PhoneNormalizer.toE164('+966501234567'), '+966501234567');
      expect(PhoneNormalizer.toE164('00966501234567'), '+966501234567');
      expect(PhoneNormalizer.toE164('+1 (415) 555-2671'), '+14155552671');
    });
  });

  group('matchKey', () {
    test('every Egyptian spelling of one number gives the same key', () {
      const key = '1005015545';
      for (final input in ['01005015545', '+201005015545', '00201005015545', '010 0501 5545', '1005015545']) {
        expect(PhoneNormalizer.matchKey(input), key);
      }
    });

    test('different numbers give different keys', () {
      expect(PhoneNormalizer.matchKey('01005015545'), isNot(PhoneNormalizer.matchKey('01005015546')));
    });

    test('invalid input gives null', () {
      expect(PhoneNormalizer.matchKey('abc'), isNull);
      expect(PhoneNormalizer.matchKey(null), isNull);
    });
  });
}
