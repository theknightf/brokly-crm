import 'dart:ui';

/// Picks the Arabic or English text from the device language. The app has no localization framework (screens
/// carry their own strings), so new screens use this instead of hard-coding one language.
String tr(String en, String ar) =>
    PlatformDispatcher.instance.locale.languageCode.toLowerCase() == 'ar' ? ar : en;
