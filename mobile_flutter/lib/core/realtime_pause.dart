import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Closes the realtime connection after the app has been in the background for a minute, and opens it again
/// when the app comes back. A phone left with the app in the background otherwise keeps its subscriptions open
/// for hours, and the database checks every change against each of them.
///
/// Providers listen to [resumed] and reload once when the connection comes back, so nothing is missed.
class RealtimePause with WidgetsBindingObserver {
  RealtimePause._();
  static final RealtimePause instance = RealtimePause._();

  /// Ticks each time the app returns after the realtime connection had been paused.
  static final ValueNotifier<int> resumed = ValueNotifier<int>(0);

  bool _installed = false;
  bool _paused = false;
  Timer? _timer;

  static void init() {
    if (instance._installed) return;
    instance._installed = true;
    WidgetsBinding.instance.addObserver(instance);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _timer?.cancel();
      _timer = null;
      if (!_paused) return;
      _paused = false;
      try {
        Supabase.instance.client.realtime.connect();
      } catch (_) {}
      resumed.value++;
    } else if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      if (_timer != null || _paused) return;
      _timer = Timer(const Duration(seconds: 60), () {
        _timer = null;
        try {
          Supabase.instance.client.realtime.disconnect();
          _paused = true;
        } catch (_) {}
      });
    }
  }
}
