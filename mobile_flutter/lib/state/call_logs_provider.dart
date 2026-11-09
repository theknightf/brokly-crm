import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/utils/stage_note_guard.dart';
import '../data/models/call_log_model.dart';
import '../data/services/call_logs_service.dart';
import '../data/services/supabase_service.dart';

class CallLogsProvider extends ChangeNotifier {
  final CallLogsService _service = CallLogsService();

  List<CallLogModel> _calls = [];
  bool _isLoading = false;
  bool _isSyncing = false;
  String _searchQuery = '';
  String _channelFilter = 'All';
  RealtimeChannel? _subscription;

  List<CallLogModel> get calls => _calls;
  bool get isLoading => _isLoading;
  bool get isSyncing => _isSyncing;
  String get searchQuery => _searchQuery;
  String get channelFilter => _channelFilter;

  CallLogsProvider() {
    fetchCalls();
    _setupRealtime();
  }

  Timer? _refetchTimer;

  Future<void> _setupRealtime() async {
    // Owners/admins watch all calls; everyone else only their own (far cheaper for the database).
    final admin = await StageNoteGuard.isAdmin();
    final uid = SupabaseService().currentUser?.id;
    _subscription = _service.subscribeToChanges(() {
      // Coalesce a burst of events into one reload.
      _refetchTimer?.cancel();
      _refetchTimer = Timer(const Duration(seconds: 3), () => fetchCalls(silent: true));
    }, userId: admin ? null : uid);
  }

  void setSearchQuery(String q) {
    _searchQuery = q;
    fetchCalls();
  }

  void setChannelFilter(String ch) {
    _channelFilter = ch;
    fetchCalls();
  }

  Future<void> fetchCalls({bool silent = false}) async {
    if (!silent) {
      _isLoading = true;
      notifyListeners();
    }

    try {
      _calls = await _service.getAll(
        search: _searchQuery,
        channelFilter: _channelFilter,
      );
      _isLoading = false;
      notifyListeners();
    } catch (_) {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<CallLogModel> logCall(
    CallLogModel call, {
    String? followUpDate,
    String? followUpTime,
  }) async {
    final saved = await _service.logCall(
      call,
      followUpDate: followUpDate,
      followUpTime: followUpTime,
    );
    _calls.insert(0, saved);
    notifyListeners();
    return saved;
  }

  Future<int> syncDeviceCallLogs() async {
    _isSyncing = true;
    notifyListeners();

    try {
      final count = await _service.syncDeviceCallLogs();
      await fetchCalls(silent: true);
      _isSyncing = false;
      notifyListeners();
      return count;
    } catch (_) {
      _isSyncing = false;
      notifyListeners();
      return 0;
    }
  }

  @override
  void dispose() {
    _refetchTimer?.cancel();
    _subscription?.unsubscribe();
    super.dispose();
  }
}
