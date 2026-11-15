import 'package:flutter/material.dart';
import 'app_colors.dart';
import 'app_spacing.dart';
import 'app_text_styles.dart';

/// Semantic colours every screen reads instead of hard-coding (`context.palette.danger`, …).
@immutable
class AppPalette extends ThemeExtension<AppPalette> {
  final Color background;
  final Color card;
  final Color muted;
  final Color text;
  final Color subtext;
  final Color border;
  final Color accent; // brand lime for the current mode
  final Color onAccent;
  final Color accentSoft; // light lime tint behind icons / selected chips
  final Color success;
  final Color warning;
  final Color danger;
  final Color info;
  final Color whatsapp;
  final List<BoxShadow> cardShadow;
  final List<BoxShadow> glow;

  const AppPalette({
    required this.background,
    required this.card,
    required this.muted,
    required this.text,
    required this.subtext,
    required this.border,
    required this.accent,
    required this.onAccent,
    required this.accentSoft,
    required this.success,
    required this.warning,
    required this.danger,
    required this.info,
    required this.whatsapp,
    required this.cardShadow,
    required this.glow,
  });

  static const light = AppPalette(
    background: AppColors.lightBackground,
    card: AppColors.lightCard,
    muted: AppColors.lightMuted,
    text: AppColors.lightForeground,
    subtext: AppColors.lightMutedForeground,
    border: AppColors.lightBorder,
    accent: AppColors.primary,
    onAccent: Colors.white,
    accentSoft: AppColors.secondary,
    success: Color(0xFF15803D),
    warning: Color(0xFFB45309),
    danger: Color(0xFFDC2626),
    info: Color(0xFF0369A1),
    whatsapp: AppColors.outcomeWhatsApp,
    cardShadow: [
      BoxShadow(color: Color(0x0F000000), blurRadius: 4, offset: Offset(0, 1)),
    ],
    glow: [
      BoxShadow(color: Color(0x7384CC16), blurRadius: 30, spreadRadius: -8, offset: Offset(0, 8)),
    ],
  );

  static const dark = AppPalette(
    background: AppColors.darkBackground,
    card: AppColors.darkCard,
    muted: AppColors.darkMuted,
    text: AppColors.darkForeground,
    subtext: AppColors.darkMutedForeground,
    border: AppColors.darkBorder,
    accent: AppColors.primaryDark,
    onAccent: Color(0xFF1A2E05),
    accentSoft: AppColors.secondaryDark,
    success: Color(0xFF4ADE80),
    warning: Color(0xFFFCD34D),
    danger: Color(0xFFF87171),
    info: Color(0xFF7DD3FC),
    whatsapp: AppColors.outcomeWhatsApp,
    cardShadow: [
      BoxShadow(color: Color(0x40000000), blurRadius: 12, offset: Offset(0, 4)),
    ],
    glow: [
      BoxShadow(color: Color(0x5984CC16), blurRadius: 30, spreadRadius: -8, offset: Offset(0, 8)),
    ],
  );

  @override
  AppPalette copyWith() => this;

  @override
  AppPalette lerp(ThemeExtension<AppPalette>? other, double t) => t < 0.5 ? this : (other as AppPalette? ?? this);
}

extension AppPaletteX on BuildContext {
  AppPalette get palette => Theme.of(this).extension<AppPalette>() ?? AppPalette.light;
  bool get isDark => Theme.of(this).brightness == Brightness.dark;
}

/// Material 3 theme built from the website's tokens (colours, Plus Jakarta Sans, 20 px radii).
class AppTheme {
  static const double defaultRadius = AppRadius.lg;

  static ThemeData get lightTheme => _build(Brightness.light, AppPalette.light);
  static ThemeData get darkTheme => _build(Brightness.dark, AppPalette.dark);

  static ThemeData _build(Brightness b, AppPalette p) {
    final isDark = b == Brightness.dark;
    final scheme = ColorScheme(
      brightness: b,
      primary: p.accent,
      onPrimary: p.onAccent,
      primaryContainer: p.accentSoft,
      onPrimaryContainer: isDark ? const Color(0xFFD9F99D) : AppColors.secondaryForeground,
      secondary: p.accentSoft,
      onSecondary: isDark ? const Color(0xFFD9F99D) : AppColors.secondaryForeground,
      error: p.danger,
      onError: Colors.white,
      surface: p.card,
      onSurface: p.text,
      onSurfaceVariant: p.subtext,
      surfaceContainerHighest: p.muted,
      surfaceContainerHigh: p.muted,
      surfaceContainer: p.muted,
      surfaceContainerLow: p.card,
      surfaceContainerLowest: p.card,
      outline: p.border,
      outlineVariant: p.border,
    );
    final text = AppTextStyles.textTheme(p.text, p.subtext);
    final buttonShape = RoundedRectangleBorder(borderRadius: AppRadius.button);
    OutlineInputBorder inputBorder(Color c, [double w = 1]) =>
        OutlineInputBorder(borderRadius: AppRadius.input, borderSide: BorderSide(color: c, width: w));

    return ThemeData(
      useMaterial3: true,
      brightness: b,
      colorScheme: scheme,
      fontFamily: AppTextStyles.family,
      textTheme: text,
      scaffoldBackgroundColor: p.background,
      canvasColor: p.background,
      dividerColor: p.border,
      splashFactory: InkSparkle.splashFactory,
      materialTapTargetSize: MaterialTapTargetSize.padded,
      visualDensity: VisualDensity.standard,
      extensions: [p],
      appBarTheme: AppBarTheme(
        backgroundColor: p.background,
        foregroundColor: p.text,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: text.titleLarge,
      ),
      cardTheme: CardThemeData(
        color: p.card,
        elevation: 0,
        margin: EdgeInsets.zero,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: AppRadius.card, side: BorderSide(color: p.border)),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: p.accent,
          foregroundColor: p.onAccent,
          disabledBackgroundColor: p.muted,
          disabledForegroundColor: p.subtext,
          elevation: 0,
          minimumSize: const Size(64, AppSpacing.tap),
          padding: const EdgeInsets.symmetric(horizontal: 20),
          shape: buttonShape,
          textStyle: text.labelLarge,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: p.accent,
          foregroundColor: p.onAccent,
          minimumSize: const Size(64, AppSpacing.tap),
          padding: const EdgeInsets.symmetric(horizontal: 20),
          shape: buttonShape,
          textStyle: text.labelLarge,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: p.text,
          backgroundColor: p.card,
          side: BorderSide(color: p.border),
          minimumSize: const Size(64, AppSpacing.tap),
          padding: const EdgeInsets.symmetric(horizontal: 20),
          shape: buttonShape,
          textStyle: text.labelLarge,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: p.accent,
          minimumSize: const Size(48, AppSpacing.tap),
          shape: buttonShape,
          textStyle: text.labelLarge,
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(minimumSize: const Size(AppSpacing.tap, AppSpacing.tap), foregroundColor: p.text),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: p.accent,
        foregroundColor: p.onAccent,
        elevation: 2,
        highlightElevation: 4,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.lg)),
        extendedTextStyle: text.labelLarge,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: p.card,
        isDense: false,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: inputBorder(p.border),
        enabledBorder: inputBorder(p.border),
        focusedBorder: inputBorder(p.accent, 2),
        errorBorder: inputBorder(p.danger),
        focusedErrorBorder: inputBorder(p.danger, 2),
        hintStyle: text.bodyMedium?.copyWith(color: p.subtext),
        labelStyle: text.bodyMedium?.copyWith(color: p.subtext),
        floatingLabelStyle: text.labelMedium?.copyWith(color: p.accent),
        prefixIconColor: p.subtext,
        suffixIconColor: p.subtext,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: p.card,
        selectedColor: p.accentSoft,
        disabledColor: p.muted,
        side: BorderSide(color: p.border),
        shape: const StadiumBorder(),
        labelStyle: text.labelMedium,
        secondaryLabelStyle: text.labelMedium,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        checkmarkColor: p.accent,
        showCheckmark: false,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: p.card,
        surfaceTintColor: Colors.transparent,
        indicatorColor: p.accent.withAlpha(isDark ? 40 : 38),
        height: 68,
        elevation: 0,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (s) => text.labelSmall?.copyWith(
            letterSpacing: 0,
            fontSize: 11,
            color: s.contains(WidgetState.selected) ? p.text : p.subtext,
            fontWeight: s.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (s) => IconThemeData(size: 22, color: s.contains(WidgetState.selected) ? (isDark ? p.accent : AppColors.primaryHover) : p.subtext),
        ),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: p.card,
        selectedItemColor: p.accent,
        unselectedItemColor: p.subtext,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
        selectedLabelStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
        unselectedLabelStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: p.card,
        surfaceTintColor: Colors.transparent,
        modalBackgroundColor: p.card,
        showDragHandle: false,
        dragHandleColor: p.border,
        shape: RoundedRectangleBorder(borderRadius: AppRadius.sheet),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: p.card,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.xl)),
        titleTextStyle: text.titleLarge,
        contentTextStyle: text.bodyMedium?.copyWith(color: p.subtext),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: isDark ? const Color(0xFFE7E9EE) : const Color(0xFF18181B),
        contentTextStyle: text.bodyMedium?.copyWith(color: isDark ? const Color(0xFF18181B) : Colors.white, fontWeight: FontWeight.w600),
        actionTextColor: isDark ? AppColors.primary : AppColors.primaryDark,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
        insetPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      ),
      listTileTheme: ListTileThemeData(
        minVerticalPadding: 12,
        iconColor: p.subtext,
        textColor: p.text,
        titleTextStyle: text.titleSmall,
        subtitleTextStyle: text.bodySmall,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
      ),
      dividerTheme: DividerThemeData(color: p.border, thickness: 1, space: 1),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: p.accent, linearTrackColor: p.muted),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? p.onAccent : p.subtext),
        trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? p.accent : p.muted),
      ),
      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? p.accent : Colors.transparent),
        checkColor: WidgetStatePropertyAll(p.onAccent),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: p.text,
        unselectedLabelColor: p.subtext,
        indicatorColor: p.accent,
        labelStyle: text.labelMedium,
        unselectedLabelStyle: text.labelMedium,
        dividerColor: p.border,
      ),
      datePickerTheme: DatePickerThemeData(
        backgroundColor: p.card,
        surfaceTintColor: Colors.transparent,
        headerBackgroundColor: p.accent,
        headerForegroundColor: p.onAccent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.xl)),
      ),
    );
  }
}
