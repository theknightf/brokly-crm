import 'package:intl/intl.dart';

class AppDateUtils {
  /// Format duration in seconds to "Xm Ys" matching PWA fmtDur
  static String formatDuration(int? seconds) {
    if (seconds == null || seconds < 0) return '—';
    final m = seconds ~/ 60;
    final s = seconds % 60;
    if (m > 0) {
      return '${m}m ${s}s';
    }
    return '${s}s';
  }

  /// Format short follow-up date "DD/MM/YY" matching PWA formatFollowUpShort
  static String formatFollowUpShort(dynamic date) {
    if (date == null) return '—';
    DateTime? dt;
    if (date is DateTime) {
      dt = date;
    } else if (date is String) {
      dt = DateTime.tryParse(date);
    }
    if (dt == null) return '—';
    return DateFormat('dd/MM/yy').format(dt);
  }

  /// Format ISO time to "HH:mm a"
  static String formatTime(dynamic date) {
    if (date == null) return '—';
    DateTime? dt;
    if (date is DateTime) {
      dt = date;
    } else if (date is String) {
      dt = DateTime.tryParse(date);
    }
    if (dt == null) return '—';
    return DateFormat('hh:mm a').format(dt);
  }

  /// Format date to readable string "MMM d, yyyy"
  static String formatDate(dynamic date) {
    if (date == null) return '—';
    DateTime? dt;
    if (date is DateTime) {
      dt = date;
    } else if (date is String) {
      dt = DateTime.tryParse(date);
    }
    if (dt == null) return '—';
    return DateFormat('MMM d, yyyy').format(dt);
  }

  /// Check if a date string/DateTime is overdue
  static bool isOverdue(dynamic date) {
    if (date == null) return false;
    DateTime? dt;
    if (date is DateTime) {
      dt = date;
    } else if (date is String) {
      dt = DateTime.tryParse(date);
    }
    if (dt == null) return false;
    return dt.isBefore(DateTime.now());
  }

  /// Check if a date string/DateTime is due today
  static bool isDueToday(dynamic date) {
    if (date == null) return false;
    DateTime? dt;
    if (date is DateTime) {
      dt = date;
    } else if (date is String) {
      dt = DateTime.tryParse(date);
    }
    if (dt == null) return false;
    final now = DateTime.now();
    return dt.year == now.year && dt.month == now.month && dt.day == now.day;
  }

  /// Returns today's date formatted as YYYY-MM-DD
  static String todayDateString() {
    final now = DateTime.now();
    return "${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}";
  }

  /// Returns timeago representation
  static String timeAgo(dynamic date) {
    if (date == null) return '—';
    DateTime? dt;
    if (date is DateTime) {
      dt = date;
    } else if (date is String) {
      dt = DateTime.tryParse(date);
    }
    if (dt == null) return '—';
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 60) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return DateFormat('MMM d').format(dt);
  }
}
