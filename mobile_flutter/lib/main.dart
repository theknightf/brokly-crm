import 'package:flutter/material.dart';
import 'core/app.dart';
import 'core/services/telephony_service.dart';
import 'data/services/supabase_service.dart';
import 'features/telephony/caller_id_overlay.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Supabase client
  await SupabaseService.initialize();

  // Initialize native telephony & live caller ID background service
  await TelephonyService().init();

  runApp(const BroklyApp());
}

/// Entry point for the floating Caller ID overlay window
@pragma('vm:entry-point')
void overlayMain() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: CallerIdOverlayWidget(),
    ),
  );
}
