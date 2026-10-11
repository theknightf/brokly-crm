import 'package:intl/intl.dart';

/// Formatter for Egyptian Pound currency matching PWA's formatEgyBudget.
class CurrencyFormatter {
  static final NumberFormat _formatter = NumberFormat('#,###', 'en_US');

  /// Formats single amount, e.g. "1,500,000 ج.م"
  static String format(num? amount) {
    if (amount == null) return '—';
    return '${_formatter.format(amount)} ج.م';
  }

  /// Formats budget min/max range, e.g. "1,000,000–2,500,000 ج.م"
  static String formatRange(num? min, num? max) {
    if (min == null && max == null) return '—';
    final parts = <String>[];
    if (min != null) parts.add(_formatter.format(min));
    if (max != null) parts.add(_formatter.format(max));
    return '${parts.join('–')} ج.م';
  }

  /// Compact currency formatting (e.g., 1.5M EGP, 250K EGP)
  static String formatCompact(num? amount) {
    if (amount == null) return '—';
    final abs = amount.abs();
    if (abs >= 1000000) {
      return '${(amount / 1000000).toStringAsFixed(2)}M ج.م';
    }
    if (abs >= 1000) {
      return '${(amount / 1000).toStringAsFixed(0)}K ج.م';
    }
    return '${_formatter.format(amount.round())} ج.م';
  }
}

