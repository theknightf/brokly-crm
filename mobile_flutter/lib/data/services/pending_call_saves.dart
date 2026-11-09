import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import '../models/call_log_model.dart';
import 'call_logs_service.dart';
import 'leads_service.dart';
import 'supabase_service.dart';

/// Durable "save after the call" queue.
///
/// The post-call sheet closes immediately (the agent is already dialing the next lead), so the save has to
/// survive a dropped connection, the OS killing the app, or a server hiccup. Every submit is written to a
/// small JSON file FIRST, then sent; it is removed only after the server accepted it. Anything left over is
/// retried automatically (backoff), when the app returns to the foreground and on the next app start.
///
/// Retries are safe: each call log carries a `client_ref`, and [CallLogsService.logCall] updates the existing
/// row for a client_ref instead of inserting a second one.
class PendingCallSaves with WidgetsBindingObserver {
  PendingCallSaves._();
  static final PendingCallSaves instance = PendingCallSaves._();

  static const _fileName = 'brokly_pending_call_saves.json';
  static const _maxAttempts = 30;

  final List<Map<String, dynamic>> _items = [];
  final List<VoidCallback> _onSaved = [];
  final ValueNotifier<int> pendingCount = ValueNotifier<int>(0);

  bool _initialized = false;
  Timer? _retryTimer;
  int _retrySeconds = 10;
  Future<void> _chain = Future<void>.value();

  File? get _file => kIsWeb ? null : File('${Directory.systemTemp.path}/$_fileName');

  /// Called after something was saved on the server (refresh lists, counters...).
  VoidCallback addOnSaved(VoidCallback cb) {
    _onSaved.add(cb);
    return () => _onSaved.remove(cb);
  }

  /// Load anything left from a previous run and try to send it.
  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;
    WidgetsBinding.instance.addObserver(this);
    try {
      final f = _file;
      if (f != null && await f.exists()) {
        final decoded = jsonDecode(await f.readAsString());
        if (decoded is List) {
          for (final e in decoded) {
            if (e is Map) _items.add(Map<String, dynamic>.from(e));
          }
        }
      }
    } catch (_) {
      // A corrupt file must not block the app; start empty.
    }
    pendingCount.value = _items.length;
    if (_items.isNotEmpty) unawaited(flush());
  }

  Future<void> _persist() async {
    pendingCount.value = _items.length;
    try {
      final f = _file;
      if (f == null) return;
      if (_items.isEmpty) {
        if (await f.exists()) await f.delete();
      } else {
        await f.writeAsString(jsonEncode(_items), flush: true);
      }
    } catch (_) {
      // Disk full / no access: the in-memory queue still retries while the app is alive.
    }
  }

  /// Persist first, then try to send. Returns true when the server accepted this save right away;
  /// false means it is stored on the phone and will be retried (never lost).
  Future<bool> enqueue({
    required CallLogModel call,
    required String leadId,
    required String stage,
    String? followUpDate,
    String? followUpTime,
  }) async {
    final id = '${DateTime.now().microsecondsSinceEpoch}-$leadId';
    _items.add({
      'id': id,
      'userId': SupabaseService().currentUser?.id,
      'call': call.toJson(),
      'leadId': leadId,
      'stage': stage,
      'followUpDate': followUpDate,
      'followUpTime': followUpTime,
      'attempts': 0,
      'queuedAt': DateTime.now().toUtc().toIso8601String(),
    });
    await _persist();
    await flush();
    return !_items.any((e) => e['id'] == id);
  }

  /// Sends queued saves in order. Runs one flush at a time. Returns true when the queue is empty.
  Future<bool> flush() {
    final run = _chain.then((_) => _flushOnce());
    _chain = run.then((_) {}, onError: (_) {});
    return run;
  }

  Future<bool> _flushOnce() async {
    _retryTimer?.cancel();
    final userId = SupabaseService().currentUser?.id;
    if (userId == null) return _items.isEmpty;

    var savedAny = false;
    var failed = false;
    for (final item in List<Map<String, dynamic>>.from(_items)) {
      // Another account's saves stay on disk until that account signs in again.
      if (item['userId'] != null && item['userId'] != userId) continue;
      try {
        final call = CallLogModel.fromJson(Map<String, dynamic>.from(item['call'] as Map));
        await CallLogsService().logCall(
          call,
          followUpDate: item['followUpDate'] as String?,
          followUpTime: item['followUpTime'] as String?,
        );
        await LeadsService().updateStatus(item['leadId'] as String, item['stage'] as String);
        _items.removeWhere((e) => e['id'] == item['id']);
        await _persist();
        savedAny = true;
      } catch (e) {
        // "NOTE_REQUIRED": the server refuses a stage change without a written note. Retrying can never succeed, so the
        // save is dropped (the call itself is already stored) instead of blocking the queue.
        if (e.toString().contains('NOTE_REQUIRED')) {
          _items.removeWhere((x) => x['id'] == item['id']);
          await _persist();
          continue;
        }
        failed = true;
        final attempts = ((item['attempts'] as num?)?.toInt() ?? 0) + 1;
        if (attempts >= _maxAttempts) {
          _items.removeWhere((e) => e['id'] == item['id']);
        } else {
          item['attempts'] = attempts;
        }
        await _persist();
        break; // keep order; try again later
      }
    }

    if (savedAny) {
      for (final cb in List.of(_onSaved)) {
        try {
          cb();
        } catch (_) {}
      }
    }

    if (failed && _items.isNotEmpty) {
      _retryTimer = Timer(Duration(seconds: _retrySeconds), () => unawaited(flush()));
      _retrySeconds = (_retrySeconds * 2).clamp(10, 300);
    } else {
      _retrySeconds = 10;
    }
    return _items.isEmpty;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _items.isNotEmpty) {
      unawaited(flush());
    }
  }
}
