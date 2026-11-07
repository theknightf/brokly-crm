import 'dart:async';
import 'package:flutter/material.dart';
import 'core/app.dart';
import 'core/memory/memory_guard.dart';
import 'core/services/telephony_service.dart';
import 'data/services/device_call_sync_service.dart';
import 'data/services/pending_call_saves.dart';
import 'data/services/supabase_service.dart';
import 'features/telephony/caller_id_overlay.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Memory budget first: caps the image cache and starts listening for OS memory-pressure signals.
  await MemoryGuard.init();

  // Initialize Supabase client
  await SupabaseService.initialize();

  // Initialize native telephony & live caller ID background service
  await TelephonyService().init();

  // Resend any call outcome that could not be saved last time (offline / app killed before it finished).
  unawaited(PendingCallSaves.instance.init());

  // Android only (no-op elsewhere): resumes call sync if the agent turned it on in Settings.
  unawaited(DeviceCallSyncService.instance.init());

  runApp(const BroklyApp());
}

/// Entry point for the floating Caller ID overlay window
@pragma('vm:entry-point')
void overlayMain() {
  WidgetsFlutterBinding.ensureInitialized();
  // The overlay is a second Flutter engine: it only draws one small card, so give it a tiny image cache.
  PaintingBinding.instance.imageCache.maximumSize = 10;
  PaintingBinding.instance.imageCache.maximumSizeBytes = 4 << 20;
  runApp(
    const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: CallerIdOverlayWidget(),
    ),
  );
}
