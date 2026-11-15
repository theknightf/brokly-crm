import 'package:flutter/widgets.dart';

/// Spacing, radii and sizes shared by every screen (mirrors the website's Tailwind scale).
class AppSpacing {
  // 4-pt scale
  static const double xxs = 2;
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 20;
  static const double xxl = 24;
  static const double xxxl = 32;

  /// Side padding of every screen.
  static const double page = 16;
  static const EdgeInsets pagePadding = EdgeInsets.fromLTRB(page, page, page, page);

  /// Space left under lists so the FAB / bottom bar never covers the last item.
  static const double listBottom = 96;

  /// Minimum touch target.
  static const double tap = 48;
}

/// Corner radii — website: --radius 16, cards / buttons / inputs rounded-xl (20), pills full.
class AppRadius {
  static const double sm = 12;
  static const double md = 16;
  static const double lg = 20;
  static const double xl = 24;
  static const double pill = 999;

  static final BorderRadius card = BorderRadius.circular(lg);
  static final BorderRadius button = BorderRadius.circular(lg);
  static final BorderRadius input = BorderRadius.circular(lg);
  static final BorderRadius sheet = const BorderRadius.vertical(top: Radius.circular(xl));
}

/// Motion: short and calm (200–300 ms).
class AppMotion {
  static const Duration fast = Duration(milliseconds: 200);
  static const Duration normal = Duration(milliseconds: 250);
  static const Duration slow = Duration(milliseconds: 300);
  static const Curve curve = Curves.easeOutCubic;
}
