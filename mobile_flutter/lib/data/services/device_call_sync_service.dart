import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;
import 'package:call_log/call_log.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:workmanager/workmanager.dart';
import '../../core/utils/phone_normalizer.dart';
import 'supabase_service.dart';

/// Outcome of one sync run.
enum CallSyncStatus { ok, partial, disabled, noPermission, notSupported, notSignedIn, busy, error }

class CallSyncResult {
  final CallSyncStatus status;

  /// Calls the server added in this run.
  final int inserted;

  /// Distinct leads those calls belong to.
  final int leads;

  /// Calls still waiting to be uploaded (offline / server error). They are kept and retried.
  final int pending;

  const CallSyncResult(this.status, {this.inserted = 0, this.leads = 0, this.pending = 0});
}

/// What the settings screen shows.
class CallSyncState {
  final bool enabled;
  final DateTime? lastSyncAt;
  final int totalSynced;
  final int pending;

  const CallSyncState({this.enabled = false, this.lastSyncAt, this.totalSynced = 0, this.pending = 0});
}

/// Android-only: reads the phone's call log and adds the calls made to/from LEADS to the CRM.
///
/// Privacy rules enforced here (and again on the server, see `sync_device_calls`):
///  - the call log is read and matched against the agent's visible leads ON THE DEVICE;
///  - only calls whose number matches a lead are uploaded; every other call never leaves the phone;
///  - only phone (E.164), direction, start time and duration are sent: no contact names, nothing else;
///  - nothing is logged with a phone number.
class DeviceCallSyncService with WidgetsBindingObserver {
  DeviceCallSyncService._();
  static final DeviceCallSyncService instance = DeviceCallSyncService._();

  static const _taskName = 'brokly-device-call-sync';
  static const _batchSize = 100;
  static const _maxQueued = 5000;

  /// The feature exists only on Android. iOS and web never show or run it.
  static bool get isSupported => !kIsWeb && Platform.isAndroid;

  final ValueNotifier<CallSyncState> state = ValueNotifier(const CallSyncState());
  final List<void Function(CallSyncResult)> _onSynced = [];

  bool _running = false;
  bool _initialized = false;
  DateTime? _lastAttempt;

  VoidCallback addOnSynced(void Function(CallSyncResult) cb) {
    _onSynced.add(cb);
    return () => _onSynced.remove(cb);
  }

  // ── lifecycle ────────────────────────────────────────────────────────────────

  Future<void> init() async {
    if (!isSupported || _initialized) return;
    _initialized = true;
    WidgetsBinding.instance.addObserver(this);
    await onSignedIn();
  }

  /// Loads this agent's settings and, if call sync is on, schedules the background task and syncs.
  /// Called at app start and again once the agent is signed in (the app can start on the login screen).
  Future<void> onSignedIn() async {
    if (!isSupported) return;
    await _refreshState();
    if (state.value.enabled) {
      unawaited(_scheduleBackground());
      unawaited(syncIfEnabled());
    }
  }

  /// Sync when the app comes back to the foreground.
  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    if (s == AppLifecycleState.resumed) unawaited(syncIfEnabled());
  }

  // ── permission / enable / disable ───────────────────────────────────────────

  Future<bool> hasPermission() async {
    if (!isSupported) return false;
    try {
      return await Permission.phone.isGranted;
    } catch (_) {
      return false;
    }
  }

  Future<bool> requestPermission() async {
    if (!isSupported) return false;
    try {
      return (await Permission.phone.request()).isGranted;
    } catch (_) {
      return false;
    }
  }

  Future<bool> isPermanentlyDenied() async {
    try {
      return await Permission.phone.isPermanentlyDenied;
    } catch (_) {
      return false;
    }
  }

  /// Turns sync on. [lookbackDays]: 0 = calls from today, 7, 30... How far back the FIRST import goes.
  /// Call only after the explanation screen was accepted and the permission granted.
  Future<CallSyncResult> enable({required int lookbackDays}) async {
    final uid = _uid;
    if (!isSupported) return const CallSyncResult(CallSyncStatus.notSupported);
    if (uid == null) return const CallSyncResult(CallSyncStatus.notSignedIn);
    if (!await hasPermission()) return const CallSyncResult(CallSyncStatus.noPermission);

    final now = DateTime.now();
    final startOfToday = DateTime(now.year, now.month, now.day);
    final from = startOfToday.subtract(Duration(days: lookbackDays.clamp(0, 365)));

    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_k('enabled', uid), true);
    await prefs.setInt(_k('cursor', uid), from.millisecondsSinceEpoch);
    await _refreshState();
    unawaited(_scheduleBackground());
    return syncNow();
  }

  /// Re-imports older calls (today / 7 / 30 days...). Only ever moves the read position backwards, so the
  /// normal incremental sync is never pushed forward by it. Duplicates are ignored by the server.
  Future<CallSyncResult> importHistory({required int lookbackDays}) async {
    final uid = _uid;
    if (!isSupported) return const CallSyncResult(CallSyncStatus.notSupported);
    if (uid == null) return const CallSyncResult(CallSyncStatus.notSignedIn);
    final now = DateTime.now();
    final from = DateTime(now.year, now.month, now.day).subtract(Duration(days: lookbackDays.clamp(0, 365)));
    final prefs = await SharedPreferences.getInstance();
    final current = prefs.getInt(_k('cursor', uid));
    if (current == null || from.millisecondsSinceEpoch < current) {
      await prefs.setInt(_k('cursor', uid), from.millisecondsSinceEpoch);
    }
    return syncNow();
  }

  Future<void> disable() async {
    final uid = _uid;
    if (uid != null) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_k('enabled', uid), false);
      await prefs.remove(_k('queue', uid)); // nothing stays queued once the agent turns it off
    }
    await _cancelBackground();
    await _refreshState();
  }

  // ── sync ─────────────────────────────────────────────────────────────────────

  /// Runs a sync only if the agent turned the feature on (used by app open / resume / call end).
  Future<CallSyncResult> syncIfEnabled() async {
    if (!isSupported) return const CallSyncResult(CallSyncStatus.notSupported);
    final last = _lastAttempt;
    if (last != null && DateTime.now().difference(last) < const Duration(seconds: 45)) {
      return const CallSyncResult(CallSyncStatus.busy);
    }
    return syncNow();
  }

  Future<CallSyncResult> syncNow({bool background = false}) async {
    if (!isSupported) return const CallSyncResult(CallSyncStatus.notSupported);
    final uid = _uid;
    if (uid == null) return const CallSyncResult(CallSyncStatus.notSignedIn);
    if (_running) return const CallSyncResult(CallSyncStatus.busy);

    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(_k('enabled', uid)) != true) {
      return const CallSyncResult(CallSyncStatus.disabled);
    }
    if (!await hasPermission()) return const CallSyncResult(CallSyncStatus.noPermission);

    _running = true;
    _lastAttempt = DateTime.now();
    try {
      // 1) Read new calls from the device and keep only those that belong to leads.
      final queue = _loadQueue(prefs, uid);
      final cursor = prefs.getInt(_k('cursor', uid)) ??
          DateTime.now().subtract(const Duration(days: 1)).millisecondsSinceEpoch;

      final read = await _readMatchingCalls(sinceMs: cursor);
      if (read.error != null) {
        _log('device read failed: ${read.error}');
        return CallSyncResult(CallSyncStatus.error, pending: queue.length);
      }
      final known = queue.map((c) => '${c['phone']}|${c['started_at']}').toSet();
      for (final c in read.calls) {
        if (queue.length >= _maxQueued) break;
        if (known.add('${c['phone']}|${c['started_at']}')) queue.add(c);
      }
      // The cursor moves past EVERYTHING that was read (matched or not): matching calls are safe in the
      // persisted queue, the others are never uploaded.
      if (read.maxTimestampMs != null) {
        await prefs.setInt(_k('cursor', uid), read.maxTimestampMs! + 1);
      }
      await _saveQueue(prefs, uid, queue);

      // 2) Upload in batches; a failure keeps the rest queued for the next run (never lose calls).
      var inserted = 0;
      var leads = 0;
      var failed = false;
      while (queue.isNotEmpty) {
        final batch = queue.take(_batchSize).toList();
        final res = await _uploadWithRetry(batch, quick: background);
        if (res == null) {
          failed = true;
          break;
        }
        inserted += res.$1;
        leads += res.$2;
        queue.removeRange(0, batch.length);
        await _saveQueue(prefs, uid, queue);
      }

      if (inserted > 0) {
        await prefs.setInt(_k('total', uid), (prefs.getInt(_k('total', uid)) ?? 0) + inserted);
      }
      if (!failed) {
        await prefs.setInt(_k('lastSync', uid), DateTime.now().millisecondsSinceEpoch);
      }
      await _refreshState();

      final result = CallSyncResult(
        failed ? CallSyncStatus.partial : CallSyncStatus.ok,
        inserted: inserted,
        leads: leads,
        pending: queue.length,
      );
      _log('sync done: status=${result.status.name} inserted=$inserted leads=$leads pending=${queue.length}');
      for (final cb in List.of(_onSynced)) {
        try {
          cb(result);
        } catch (_) {}
      }
      return result;
    } catch (e) {
      _log('sync failed: ${e.runtimeType}');
      return const CallSyncResult(CallSyncStatus.error);
    } finally {
      _running = false;
    }
  }

  // ── device read + on-device matching ────────────────────────────────────────

  Future<({List<Map<String, dynamic>> calls, int? maxTimestampMs, Object? error})> _readMatchingCalls({
    required int sinceMs,
  }) async {
    try {
      final entries = (await CallLog.query(dateFrom: sinceMs)).toList();
      if (entries.isEmpty) return (calls: <Map<String, dynamic>>[], maxTimestampMs: null, error: null);

      int? maxTs;
      for (final e in entries) {
        final ts = e.timestamp;
        if (ts != null && (maxTs == null || ts > maxTs)) maxTs = ts;
      }

      // Match against the leads this agent can see; the key set lives only in memory for this run.
      final leadKeys = await _loadLeadKeys();
      final calls = <Map<String, dynamic>>[];
      if (leadKeys.isEmpty) return (calls: calls, maxTimestampMs: maxTs, error: null);

      for (final e in entries) {
        final ts = e.timestamp;
        final direction = _direction(e.callType);
        if (ts == null || direction == null) continue;
        final e164 = PhoneNormalizer.toE164(e.number);
        if (e164 == null) continue;
        final key = PhoneNormalizer.matchKey(e164);
        if (key == null || !leadKeys.contains(key)) continue; // not a lead: never leaves the phone
        calls.add({
          'phone': e164,
          'direction': direction,
          'started_at': DateTime.fromMillisecondsSinceEpoch(ts, isUtc: true).toIso8601String(),
          'duration_seconds': e.duration ?? 0,
        });
      }
      return (calls: calls, maxTimestampMs: maxTs, error: null);
    } catch (e) {
      return (calls: <Map<String, dynamic>>[], maxTimestampMs: null, error: e.runtimeType);
    }
  }

  /// Match keys (last 10 digits) of every lead visible to this agent. Row-level security decides what is visible.
  Future<Set<String>> _loadLeadKeys() async {
    final client = SupabaseService().client;
    final keys = <String>{};
    for (var from = 0; from < 50000; from += 1000) {
      final rows = await client.from('leads').select('phone').order('id').range(from, from + 999);
      final list = rows as List<dynamic>;
      for (final r in list) {
        final k = PhoneNormalizer.matchKey(r['phone']?.toString());
        if (k != null) keys.add(k);
      }
      if (list.length < 1000) break;
    }
    return keys;
  }

  String? _direction(CallType? t) {
    switch (t) {
      case CallType.incoming:
      case CallType.wifiIncoming:
      case CallType.answeredExternally:
        return 'incoming';
      case CallType.outgoing:
      case CallType.wifiOutgoing:
        return 'outgoing';
      case CallType.missed:
      case CallType.rejected:
      case CallType.blocked:
      case CallType.voiceMail:
        return 'missed';
      default:
        return null;
    }
  }

  // ── upload with retry/backoff ───────────────────────────────────────────────

  /// Returns (inserted, leads) or null when the batch could not be sent (it stays queued).
  Future<(int, int)?> _uploadWithRetry(List<Map<String, dynamic>> batch, {required bool quick}) async {
    final delays = quick ? const [1, 3] : const [1, 3, 9];
    for (var attempt = 0; attempt <= delays.length; attempt++) {
      try {
        final res = await SupabaseService().client.rpc('sync_device_calls', params: {'p_calls': batch});
        final map = res is Map ? res : const {};
        return ((map['inserted'] as num?)?.toInt() ?? 0, (map['leads'] as num?)?.toInt() ?? 0);
      } on PostgrestException catch (e) {
        // Auth / permission problems will not fix themselves in a few seconds: stop and retry next run.
        if (e.code == '28000' || e.code == '42501' || e.code == 'PGRST301') return null;
        _log('upload attempt ${attempt + 1} failed: PostgrestException ${e.code}');
      } catch (e) {
        _log('upload attempt ${attempt + 1} failed: ${e.runtimeType}');
      }
      if (attempt < delays.length) await Future<void>.delayed(Duration(seconds: delays[attempt]));
    }
    return null;
  }

  // ── background (WorkManager) ────────────────────────────────────────────────

  Future<void> _scheduleBackground() async {
    try {
      await Workmanager().initialize(callSyncDispatcher);
      await Workmanager().registerPeriodicTask(
        _taskName,
        _taskName,
        frequency: const Duration(minutes: 15), // Android's minimum period
        constraints: Constraints(networkType: NetworkType.connected),
      );
    } catch (e) {
      // Blocked background execution / battery restrictions must never break the app: the app-open and
      // resume triggers still sync.
      _log('background scheduling unavailable: ${e.runtimeType}');
    }
  }

  Future<void> _cancelBackground() async {
    try {
      await Workmanager().cancelByUniqueName(_taskName);
    } catch (_) {}
  }

  // ── persistence helpers ─────────────────────────────────────────────────────

  String? get _uid => SupabaseService().currentUser?.id;

  String _k(String name, String uid) => 'callsync.$name.$uid';

  List<Map<String, dynamic>> _loadQueue(SharedPreferences prefs, String uid) {
    try {
      final raw = prefs.getString(_k('queue', uid));
      if (raw == null) return [];
      return (jsonDecode(raw) as List<dynamic>).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _saveQueue(SharedPreferences prefs, String uid, List<Map<String, dynamic>> q) async {
    if (q.isEmpty) {
      await prefs.remove(_k('queue', uid));
    } else {
      await prefs.setString(_k('queue', uid), jsonEncode(q));
    }
  }

  Future<void> _refreshState() async {
    final uid = _uid;
    if (uid == null) {
      state.value = const CallSyncState();
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    final last = prefs.getInt(_k('lastSync', uid));
    state.value = CallSyncState(
      enabled: prefs.getBool(_k('enabled', uid)) == true,
      lastSyncAt: last == null ? null : DateTime.fromMillisecondsSinceEpoch(last),
      totalSynced: prefs.getInt(_k('total', uid)) ?? 0,
      pending: _loadQueue(prefs, uid).length,
    );
  }

  /// Counts and statuses only, never phone numbers or names.
  void _log(String message) => debugPrint('[CallSync] $message');
}

/// WorkManager entry point (runs in its own isolate, possibly with the app closed).
@pragma('vm:entry-point')
void callSyncDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    try {
      WidgetsFlutterBinding.ensureInitialized();
      await SupabaseService.initialize();
      await DeviceCallSyncService.instance.syncNow(background: true);
    } catch (_) {
      // Never throw out of the worker: the next 15-minute period tries again.
    }
    return true;
  });
}
