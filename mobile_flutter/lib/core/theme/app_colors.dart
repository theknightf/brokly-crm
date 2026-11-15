import 'package:flutter/material.dart';

/// Centralized Design Tokens directly extracted from Brokly CRM PWA's Tailwind configuration.
class AppColors {
  // ── Light Theme Base ───────────────────────────────────────────────
  static const Color lightBackground = Color(0xFFFFFFFF);
  static const Color lightForeground = Color(0xFF18181B);
  static const Color lightCard = Color(0xFFFFFFFF);
  static const Color lightMuted = Color(0xFFF4F6F3);
  static const Color lightMutedForeground = Color(0xFF6B7280);
  static const Color lightBorder = Color(0xFFE5E7EB);
  static const Color lightInput = Color(0xFFE5E7EB);

  // ── Dark Theme Base (OLED Dark UI) ──────────────────────────────────
  static const Color darkBackground = Color(0xFF0F1115);
  static const Color darkForeground = Color(0xFFE7E9EE);
  static const Color darkCard = Color(0xFF14171D);
  static const Color darkCardElevated = Color(0xFF1A1D23);
  static const Color darkMuted = Color(0xFF1A1D23);
  static const Color darkMutedForeground = Color(0xFF9AA1AB);
  static const Color darkBorder = Color(0xFF262A31);
  static const Color darkInput = Color(0xFF262A31);

  // ── Brand Lime Palette & Accents ───────────────────────────────────
  static const Color primary = Color(0xFF65A30D); // Lime 600
  static const Color primaryDark = Color(0xFFA3E635); // Neon Lime (High contrast)
  static const Color primaryHover = Color(0xFF4D7C0F); // Lime 700
  static const Color accent = Color(0xFF84CC16); // Lime 500
  static const Color neonLime = Color(0xFFA3E635); // Neon Lime #A3E635
  static const Color neonLimeDark = Color(0xFF84CC16); // #84CC16
  static const Color amber = Color(0xFFF59E0B);
  static const Color alertRed = Color(0xFFEF4444);
  static const Color tealCyan = Color(0xFF06B6D4);
  static const Color mutedText = Color(0xFF9CA3AF);
  static const Color secondary = Color(0xFFF2F7E8); // Soft Lime Tint
  static const Color secondaryDark = Color(0xFF1C2416); // Dark Lime Tint
  static const Color secondaryForeground = Color(0xFF3F6212); // Deep Lime Ink

  // ── Semantic Status Colors (PWA Pipeline) ─────────────────────────
  static const Color statusFreshLeads = Color(0xFF84CC16);
  static const Color statusFreshLeadsBg = Color(0xFFF0FCD8);

  static const Color statusColdCalls = Color(0xFF22C55E);
  static const Color statusColdCallsBg = Color(0xFFE8F9EE);

  static const Color statusPendingLeads = Color(0xFF64748B);
  static const Color statusPendingLeadsBg = Color(0xFFF1F5F9);

  static const Color statusFollowingUp = Color(0xFF0284C7);
  static const Color statusFollowingUpBg = Color(0xFFE0F2FE);

  static const Color statusMeeting = Color(0xFF22C55E);
  static const Color statusMeetingBg = Color(0xFFE8F9EE);

  static const Color statusInterested = Color(0xFF10B981);
  static const Color statusInterestedBg = Color(0xFFD1FAE5);

  static const Color statusDoneDeal = Color(0xFF4D7C0F);
  static const Color statusDoneDealBg = Color(0xFFD9F99D);

  static const Color statusReservation = Color(0xFF65A30D);
  static const Color statusReservationBg = Color(0xFFECF5DF);

  static const Color statusNotInterested = Color(0xFF52525B);
  static const Color statusNotInterestedBg = Color(0xFFF4F4F5);

  static const Color statusCancellation = Color(0xFFEF4444);
  static const Color statusCancellationBg = Color(0xFFFEE2E2);

  static const Color statusDuplicate = Color(0xFF6B7280);
  static const Color statusDuplicateBg = Color(0xFFF3F4F6);

  static const Color statusNoAnswer = Color(0xFFEAB308);
  static const Color statusNoAnswerBg = Color(0xFFFEF9C3);

  // ── Call & Activity Outcome Colors ─────────────────────────────────
  static const Color outcomeReached = Color(0xFF65A30D);
  static const Color outcomeInterested = Color(0xFF10B981);
  static const Color outcomeMeeting = Color(0xFF22C55E);
  static const Color outcomeWonDeal = Color(0xFF4D7C0F);
  static const Color outcomeNotInterested = Color(0xFF71717A);
  static const Color outcomeNoAnswer = Color(0xFFEAB308);
  static const Color outcomeBusy = Color(0xFFF59E0B);
  static const Color outcomeWhatsApp = Color(0xFF25D366);

  /// One Tailwind colour family: 500 (dot / tint), 700 (text on light), 300 (text on dark).
  static const Map<String, List<Color>> _families = {
    'rose': [Color(0xFFF43F5E), Color(0xFFBE123C), Color(0xFFFDA4AF)],
    'red': [Color(0xFFEF4444), Color(0xFFB91C1C), Color(0xFFFCA5A5)],
    'fuchsia': [Color(0xFFD946EF), Color(0xFFA21CAF), Color(0xFFF0ABFC)],
    'orange': [Color(0xFFF97316), Color(0xFFC2410C), Color(0xFFFDBA74)],
    'teal': [Color(0xFF14B8A6), Color(0xFF0F766E), Color(0xFF5EEAD4)],
    'zinc': [Color(0xFF71717A), Color(0xFF3F3F46), Color(0xFFD4D4D8)],
    'blue': [Color(0xFF3B82F6), Color(0xFF1D4ED8), Color(0xFF93C5FD)],
    'indigo': [Color(0xFF6366F1), Color(0xFF4338CA), Color(0xFFA5B4FC)],
    'violet': [Color(0xFF8B5CF6), Color(0xFF6D28D9), Color(0xFFC4B5FD)],
    'amber': [Color(0xFFF59E0B), Color(0xFFB45309), Color(0xFFFCD34D)],
    'cyan': [Color(0xFF06B6D4), Color(0xFF0E7490), Color(0xFF67E8F9)],
    'sky': [Color(0xFF0EA5E9), Color(0xFF0369A1), Color(0xFF7DD3FC)],
    'green': [Color(0xFF22C55E), Color(0xFF15803D), Color(0xFF86EFAC)],
    'lime': [Color(0xFF84CC16), Color(0xFF4D7C0F), Color(0xFFBEF264)],
    'emerald': [Color(0xFF10B981), Color(0xFF047857), Color(0xFF6EE7B7)],
  };

  /// Same stage → colour rule as the website's StatusPill (first match wins).
  static String _familyFor(String status) {
    final s = status.toLowerCase();
    if (RegExp(r'not interested|low budget').hasMatch(s)) return 'rose';
    if (s.contains('cancel')) return 'red';
    if (s.contains('duplicate')) return 'fuchsia';
    if (RegExp(r'wrong|closed number').hasMatch(s)) return 'orange';
    if (s.contains('rotation')) return 'teal';
    if (s.contains('no answer')) return 'zinc';
    if (s.contains('reschedule')) return 'blue';
    if (s.contains('meeting')) return 'indigo';
    if (s.contains('follow')) return 'violet';
    if (s.contains('pending')) return 'amber';
    if (s.contains('cold')) return 'cyan';
    if (RegExp(r'fresh|new').hasMatch(s)) return 'sky';
    if (s.contains('reservation')) return 'green';
    if (RegExp(r'done deal|won').hasMatch(s)) return 'lime';
    if (s.contains('interested')) return 'emerald';
    return 'zinc';
  }

  /// Text, background, border and dot colours for a lead stage — matches the website.
  static ({Color text, Color bg, Color border, Color dot}) stageTone(String? status, {bool isDark = false}) {
    final f = _families[_familyFor(status ?? '')]!;
    return (
      text: isDark ? f[2] : f[1],
      bg: f[0].withAlpha(38), // 15 %
      border: f[0].withAlpha(77), // 30 %
      dot: f[0],
    );
  }

  /// Helper to get background and text colors for any lead status (kept for existing callers).
  static ({Color text, Color bg}) getStatusColors(String? status, {bool isDark = false}) {
    if (status == null || status.isEmpty) {
      return (
        text: isDark ? darkMutedForeground : lightMutedForeground,
        bg: isDark ? darkMuted : lightMuted,
      );
    }
    final t = stageTone(status, isDark: isDark);
    return (text: t.text, bg: t.bg);
  }

  /// Helper to get outcome color
  static Color getOutcomeColor(String? outcome) {
    if (outcome == null) return lightMutedForeground;
    switch (outcome) {
      case 'Reached':
      case 'Connected':
      case 'Follow Up After Meeting':
        return outcomeReached;
      case 'Interested':
        return outcomeInterested;
      case 'Site Visit':
      case 'Meeting':
        return outcomeMeeting;
      case 'Won Deal':
        return outcomeWonDeal;
      case 'WhatsApp Sent':
      case 'Customer Replied':
      case 'WhatsApp Follow-up':
        return outcomeWhatsApp;
      case 'No Answer':
      case 'No Answer At All':
      case 'No Reply':
        return outcomeNoAnswer;
      case 'Busy':
        return outcomeBusy;
      case 'Not Interested':
      case 'Wrong Number':
        return statusCancellation;
      default:
        return lightMutedForeground;
    }
  }
}
