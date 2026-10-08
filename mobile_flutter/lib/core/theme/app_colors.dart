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
  static const Color darkBackground = Color(0xFF0B0E14);
  static const Color darkForeground = Color(0xFFE7E9EE);
  static const Color darkCard = Color(0xFF161B22);
  static const Color darkCardElevated = Color(0xFF1A1F29);
  static const Color darkMuted = Color(0xFF13171F);
  static const Color darkMutedForeground = Color(0xFF9CA3AF);
  static const Color darkBorder = Color(0xFF21262D);
  static const Color darkInput = Color(0xFF21262D);

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
  static const Color secondaryDark = Color(0xFF1A2612); // Dark Lime Tint
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

  /// Helper to get background and text colors for any lead status
  static ({Color text, Color bg}) getStatusColors(String? status, {bool isDark = false}) {
    if (status == null || status.isEmpty) {
      return (
        text: isDark ? darkMutedForeground : lightMutedForeground,
        bg: isDark ? darkMuted : lightMuted,
      );
    }

    switch (status) {
      case 'Fresh Leads':
      case 'New':
        return (
          text: isDark ? const Color(0xFFA3E635) : statusFreshLeads,
          bg: isDark ? const Color(0xFF1C2416) : statusFreshLeadsBg,
        );
      case 'Cold Calls':
        return (
          text: isDark ? const Color(0xFF4ADE80) : statusColdCalls,
          bg: isDark ? const Color(0xFF11261A) : statusColdCallsBg,
        );
      case 'Pending Leads':
        return (
          text: isDark ? const Color(0xFF94A3B8) : statusPendingLeads,
          bg: isDark ? const Color(0xFF1E293B) : statusPendingLeadsBg,
        );
      case 'Following Up':
        return (
          text: isDark ? const Color(0xFF38BDF8) : statusFollowingUp,
          bg: isDark ? const Color(0xFF0C4A6E) : statusFollowingUpBg,
        );
      case 'Meeting':
      case 'Site Visit Scheduled':
        return (
          text: isDark ? const Color(0xFF4ADE80) : statusMeeting,
          bg: isDark ? const Color(0xFF11261A) : statusMeetingBg,
        );
      case 'Interested':
      case 'Qualified':
        return (
          text: isDark ? const Color(0xFF34D399) : statusInterested,
          bg: isDark ? const Color(0xFF064E3B) : statusInterestedBg,
        );
      case 'Done Deal':
      case 'Won':
        return (
          text: isDark ? const Color(0xFFD9F99D) : statusDoneDeal,
          bg: isDark ? const Color(0xFF22300F) : statusDoneDealBg,
        );
      case 'Reservation':
        return (
          text: isDark ? const Color(0xFFBEF264) : statusReservation,
          bg: isDark ? const Color(0xFF1A2E05) : statusReservationBg,
        );
      case 'Cancellation':
        return (
          text: const Color(0xFFEF4444),
          bg: isDark ? const Color(0xFF450A0A) : statusCancellationBg,
        );
      case 'No Answer':
      case 'No Answer At All':
      case 'Reschedule Meeting':
        return (
          text: isDark ? const Color(0xFFFDE047) : statusNoAnswer,
          bg: isDark ? const Color(0xFF422006) : statusNoAnswerBg,
        );
      case 'Not Interested':
      case 'Wrong Number':
      case 'Closed Number':
      case 'Duplicate Leads':
      case 'Low Budget':
      default:
        return (
          text: isDark ? darkMutedForeground : statusNotInterested,
          bg: isDark ? darkMuted : statusNotInterestedBg,
        );
    }
  }

  /// Helper to get outcome color
  static Color getOutcomeColor(String? outcome) {
    if (outcome == null) return lightMutedForeground;
    switch (outcome) {
      case 'Reached':
      case 'Connected':
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
