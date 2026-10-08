import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../data/models/call_log_model.dart';
import '../data/services/call_logs_service.dart';

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

  void _setupRealtime() {
    _subscription = _service.subscribeToChanges(() {
      fetchCalls(silent: true);
    });
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

  Future<CallLogModel> logCall(CallLogModel call) async {
    final saved = await _service.logCall(call);
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
    _subscription?.unsubscribe();
    super.dispose();
  }
}
