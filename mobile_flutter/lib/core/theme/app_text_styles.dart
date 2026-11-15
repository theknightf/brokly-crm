import 'package:flutter/material.dart';

/// Type scale (Plus Jakarta Sans, like the website). Colours come from the theme, never from here,
/// so every style works in light and dark mode. Use via `Theme.of(context).textTheme` or `context.text`.
class AppTextStyles {
  static const String family = 'PlusJakartaSans';

  static TextTheme textTheme(Color fg, Color muted) => TextTheme(
        // Page and section titles
        headlineMedium: TextStyle(fontSize: 26, height: 1.2, fontWeight: FontWeight.w800, color: fg, letterSpacing: -0.4),
        headlineSmall: TextStyle(fontSize: 22, height: 1.25, fontWeight: FontWeight.w800, color: fg, letterSpacing: -0.3),
        titleLarge: TextStyle(fontSize: 18, height: 1.3, fontWeight: FontWeight.w700, color: fg),
        titleMedium: TextStyle(fontSize: 16, height: 1.35, fontWeight: FontWeight.w700, color: fg),
        titleSmall: TextStyle(fontSize: 14, height: 1.35, fontWeight: FontWeight.w600, color: fg),
        // Body
        bodyLarge: TextStyle(fontSize: 16, height: 1.45, fontWeight: FontWeight.w400, color: fg),
        bodyMedium: TextStyle(fontSize: 14, height: 1.45, fontWeight: FontWeight.w400, color: fg),
        bodySmall: TextStyle(fontSize: 12, height: 1.4, fontWeight: FontWeight.w400, color: muted),
        // Labels (buttons, chips, captions)
        labelLarge: TextStyle(fontSize: 15, height: 1.2, fontWeight: FontWeight.w700, color: fg),
        labelMedium: TextStyle(fontSize: 13, height: 1.2, fontWeight: FontWeight.w600, color: fg),
        labelSmall: TextStyle(fontSize: 11, height: 1.2, fontWeight: FontWeight.w600, color: muted, letterSpacing: 0.4),
        // Big numbers (KPIs)
        displaySmall: TextStyle(fontSize: 30, height: 1.1, fontWeight: FontWeight.w800, color: fg, letterSpacing: -0.6),
      );
}

extension AppTextX on BuildContext {
  TextTheme get text => Theme.of(this).textTheme;
}
