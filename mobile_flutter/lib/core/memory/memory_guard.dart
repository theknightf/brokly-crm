import 'dart:async';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

/// Memory budget + pressure handling for low-RAM phones.
///
/// - Detects low-RAM hardware once (Android `ActivityManager.isLowRamDevice` / memory class) and exposes
///   [isLowRam] so features can scale down.
/// - Caps Flutter's decoded-image cache (the default 100 MB is far too much for a 2 GB phone).
/// - Reacts to the OS: Android `onTrimMemory` (forwarded from MainActivity) and Flutter's
///   `didHaveMemoryPressure` (Android low memory / iOS `didReceiveMemoryWarning`) drop caches and run every
///   registered trim callback so screens/providers can release heavy, rebuildable data.
class MemoryGuard with WidgetsBindingObserver {
  MemoryGuard._();
  static final MemoryGuard instance = MemoryGuard._();

  static const MethodChannel _channel = MethodChannel('com.brokly.crm/device');

  // Android ComponentCallbacks2 levels we care about.
  static const int trimRunningLow = 10;
  static const int trimRunningCritical = 15;
  static const int trimUiHidden = 20;
  static const int trimBackground = 40;
  static const int trimModerate = 60;
  static const int trimComplete = 80;

  bool _isLowRam = false;
  bool _initialized = false;
  AppLifecycleState _lifecycle = AppLifecycleState.resumed;
  final List<void Function(bool critical)> _trimCallbacks = [];

  /// True on low-RAM hardware (or when the OS says it is a "low RAM device").
  static bool get isLowRam => instance._isLowRam;

  /// False while the app is in the background; polling loops should skip work then.
  static bool get isForeground => instance._lifecycle == AppLifecycleState.resumed;

  /// Register something that can free memory on demand. `critical` is true for severe pressure.
  /// Returns a function that unregisters the callback (call it from `dispose`).
  static VoidCallback onTrim(void Function(bool critical) callback) {
    instance._trimCallbacks.add(callback);
    return () => instance._trimCallbacks.remove(callback);
  }

  static Future<void> init() async {
    final g = instance;
    if (g._initialized) return;
    g._initialized = true;

    try {
      final info = await _channel.invokeMapMethod<String, dynamic>('getMemoryInfo');
      if (info != null) {
        final low = info['isLowRamDevice'] == true;
        final classMb = (info['memoryClassMb'] as num?)?.toInt() ?? 256;
        final totalMb = (info['totalMemMb'] as num?)?.toInt() ?? 4096;
        g._isLowRam = low || classMb <= 128 || totalMb <= 3072;
      }
    } catch (_) {
      // iOS / older host: keep the conservative default (not flagged low-RAM).
    }

    g._applyImageCacheBudget();
    WidgetsBinding.instance.addObserver(g);

    _channel.setMethodCallHandler((call) async {
      if (call.method == 'onTrimMemory') {
        g._onTrim((call.arguments as num?)?.toInt() ?? trimRunningLow);
      }
      return null;
    });
  }

  /// Decoded images dominate Flutter's RAM use: keep the cache small, smaller still on low-RAM phones.
  void _applyImageCacheBudget() {
    final cache = PaintingBinding.instance.imageCache;
    if (_isLowRam) {
      cache.maximumSize = 30;
      cache.maximumSizeBytes = 16 << 20; // 16 MB
    } else {
      cache.maximumSize = 100;
      cache.maximumSizeBytes = 48 << 20; // 48 MB (default is 100 MB)
    }
  }

  void _dropImages() {
    final cache = PaintingBinding.instance.imageCache;
    cache.clear();
    cache.clearLiveImages();
  }

  void _runTrimCallbacks(bool critical) {
    for (final cb in List.of(_trimCallbacks)) {
      try {
        cb(critical);
      } catch (_) {
        // A failing callback must never stop the others from freeing memory.
      }
    }
  }

  void _onTrim(int level) {
    // Visible but the system is short on memory: free caches only.
    if (level >= trimRunningLow && level < trimUiHidden) {
      _dropImages();
      _runTrimCallbacks(level >= trimRunningCritical);
      return;
    }
    // UI hidden / app moved to background: release everything that can be rebuilt.
    if (level >= trimUiHidden) {
      _dropImages();
      _runTrimCallbacks(level >= trimModerate);
    }
  }

  @override
  void didHaveMemoryPressure() {
    // Android onLowMemory / iOS didReceiveMemoryWarning.
    _dropImages();
    _runTrimCallbacks(true);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _lifecycle = state;
    if (state == AppLifecycleState.paused && _isLowRam) {
      // On weak devices the OS kills background apps first; shrink before it decides to.
      _dropImages();
    }
  }

  @visibleForTesting
  void debugSetLowRam(bool value) {
    _isLowRam = value;
    _applyImageCacheBudget();
  }
}
