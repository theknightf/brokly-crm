import 'package:flutter_test/flutter_test.dart';
import 'package:brokly_mobile/core/theme/app_colors.dart';
import 'package:brokly_mobile/core/utils/currency_formatter.dart';
import 'package:brokly_mobile/core/utils/date_utils.dart';

void main() {
  test('CurrencyFormatter formats Egyptian Pounds', () {
    expect(CurrencyFormatter.format(1500000), '1,500,000 ج.م');
    expect(CurrencyFormatter.formatRange(1000000, 2000000), '1,000,000–2,000,000 ج.م');
    expect(CurrencyFormatter.format(null), '—');
  });

  test('AppDateUtils duration and date tests', () {
    expect(AppDateUtils.formatDuration(75), '1m 15s');
    expect(AppDateUtils.formatDuration(45), '45s');
    expect(AppDateUtils.formatDuration(0), '0s');
    expect(AppDateUtils.formatDuration(null), '—');
  });

  test('AppColors status colors resolution', () {
    final freshColors = AppColors.getStatusColors('Fresh Leads');
    expect(freshColors.text, AppColors.statusFreshLeads);
    expect(freshColors.bg, AppColors.statusFreshLeadsBg);

    final meetingColors = AppColors.getStatusColors('Meeting');
    expect(meetingColors.text, AppColors.statusMeeting);
  });
}
