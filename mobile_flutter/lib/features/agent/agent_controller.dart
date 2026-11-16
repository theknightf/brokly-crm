import 'dart:async';
import 'package:flutter/foundation.dart';
import 'dart:ui' show Color;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/realtime_pause.dart';
import '../../data/models/follow_up_model.dart';
import '../../data/models/lead_model.dart';
import '../../data/models/user_profile_model.dart';
import '../../data/services/follow_ups_service.dart';
import '../../data/services/pending_call_saves.dart';
import '../../data/services/supabase_service.dart';

/// The simplified app is for the plain sales-agent role only. Team leaders, admins and owners keep the full app.
bool isSalesAgent(UserProfileModel? p) {
  if (p == null) return false;
  final r = p.role.toLowerCase().trim().replaceAll('-', '_');
  return r == 'agent' || r == 'sales';
}

/// One pipeline stage card (from the lead_stages table via my_stage_counts()).
class StageCount {
  final String key;
  final String labelAr;
  final String labelEn;
  final int sortOrder;
  final Color color;
  final String bucket;
  final int total;
  final int needsAction;

  const StageCount({
    required this.key,
    required this.labelAr,
    required this.labelEn,
    required this.sortOrder,
    required this.color,
    required this.bucket,
    required this.total,
    required this.needsAction,
  });

  factory StageCount.fromJson(Map<String, dynamic> j) => StageCount(
        key: j['key']?.toString() ?? '',
        labelAr: j['label_ar']?.toString() ?? '',
        labelEn: j['label_en']?.toString() ?? '',
        sortOrder: (j['sort_order'] as num?)?.toInt() ?? 0,
        color: parseHexColor(j['color']?.toString()),
        bucket: j['bucket']?.toString() ?? 'active',
        total: (j['total'] as num?)?.toInt() ?? 0,
        needsAction: (j['needs_action'] as num?)?.toInt() ?? 0,
      );
}

Color parseHexColor(String? hex) {
  final h = (hex ?? '').replaceAll('#', '');
  final v = int.tryParse(h.length == 6 ? 'FF$h' : h, radix: 16);
  return Color(v ?? 0xFF84CC16);
}

/// State for the agent app: call target, stage cards, calling queue and follow-ups.
/// Everything is RLS-scoped server side (agents only ever receive their own leads).
class AgentController extends ChangeNotifier {
  AgentController() {
    _unregisterSaved = PendingCallSaves.instance.addOnSaved(() => refreshSoon());
    RealtimePause.resumed.addListener(_onResumed);
    _subscribe();
    unawaited(_restoreQueuePosition());
    unawaited(refreshAll());
  }

  SupabaseClient get _db => SupabaseService().client;
  String? get _uid => _db.auth.currentUser?.id;

  // ── Call target ───────────────────────────────────────────────────────────────────────────────
  int target = 0;
  int callsToday = 0;
  String _progressDay = '';
  bool get targetReached => target > 0 && callsToday >= target;
  int get remaining => (target - callsToday).clamp(0, 1 << 30);
  double get progress => target > 0 ? (callsToday / target).clamp(0.0, 1.0) : 0;

  /// Set when a save pushes the agent over the target, so the UI can celebrate once.
  final ValueNotifier<int> targetHit = ValueNotifier<int>(0);

  // ── Stages ────────────────────────────────────────────────────────────────────────────────────
  List<StageCount> stages = const [];
  int get totalLeads => stages.fold(0, (a, s) => a + s.total);
  int get totalNeedsAction => stages.fold(0, (a, s) => a + s.needsAction);
  String? selectedStage;

  // ── Queue (Leads tab) ─────────────────────────────────────────────────────────────────────────
  List<LeadModel> queue = const [];
  String search = '';
  bool loadingQueue = true;
  bool queueError = false;

  // ── Follow-ups tab ────────────────────────────────────────────────────────────────────────────
  List<FollowUpModel> followUps = const [];
  bool loadingFollowUps = true;
  bool followUpsError = false;

  /// Last lead Call Mode stopped on, so "Exit" keeps the agent's place.
  String? resumeLeadId;

  RealtimeChannel? _channel;
  VoidCallback? _unregisterSaved;
  Timer? _debounce;
  int _queueSeq = 0;

  Future<void> refreshAll() async {
    await Future.wait([loadProgress(), loadStages(), loadQueue(), loadFollowUps()]);
  }

  /// Coalesces bursts (realtime + queued saves) into one refresh.
  void refreshSoon() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 700), () => unawaited(refreshAll()));
  }

  Future<void> loadProgress() async {
    try {
      final res = await _db.rpc('my_call_progress');
      final row = (res is List && res.isNotEmpty) ? res.first as Map<String, dynamic> : null;
      if (row != null) {
        final wasReached = targetReached;
        target = (row['target'] as num?)?.toInt() ?? 0;
        final server = (row['calls_today'] as num?)?.toInt() ?? 0;
        final day = DateTime.now().toIso8601String().substring(0, 10);
        // Within the same day never move backwards (a just-saved call may not be on the server yet);
        // on a new day start from the server's count.
        callsToday = (day == _progressDay && callsToday > server) ? callsToday : server;
        _progressDay = day;
        if (!wasReached && targetReached) targetHit.value++;
        notifyListeners();
      }
    } catch (_) {}
  }

  Future<void> loadStages() async {
    try {
      final res = await _db.rpc('my_stage_counts');
      stages = (res as List).map((e) => StageCount.fromJson(e as Map<String, dynamic>)).toList();
      notifyListeners();
    } catch (_) {}
  }

  Future<void> loadQueue() async {
    final seq = ++_queueSeq;
    loadingQueue = queue.isEmpty;
    queueError = false;
    notifyListeners();
    try {
      final res = await _db.rpc('my_call_queue', params: {
        'p_stage': selectedStage,
        'p_search': search.trim().isEmpty ? null : search.trim(),
        'p_limit': 300,
      });
      if (seq != _queueSeq) return;
      queue = (res as List).map((e) => LeadModel.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      if (seq == _queueSeq) queueError = true;
    } finally {
      if (seq == _queueSeq) {
        loadingQueue = false;
        notifyListeners();
      }
    }
  }

  Future<void> loadFollowUps() async {
    loadingFollowUps = followUps.isEmpty;
    followUpsError = false;
    notifyListeners();
    try {
      // Same source and "live follow-up" rule as the existing Follow-ups screen and the website. For an agent the
      // service (and RLS) already limits rows to their own leads.
      final all = await FollowUpsService().getAll();
      followUps = all
          .where((f) => f.status.toLowerCase() == 'pending')
          .toList()
        ..sort((a, b) => '${a.dueDate} ${a.dueTime ?? ''}'.compareTo('${b.dueDate} ${b.dueTime ?? ''}'));
    } catch (_) {
      followUpsError = true;
    } finally {
      loadingFollowUps = false;
      notifyListeners();
    }
  }

  void setStage(String? stage) {
    selectedStage = (selectedStage == stage) ? null : stage;
    unawaited(loadQueue());
  }

  void setSearch(String value) {
    search = value;
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () => unawaited(loadQueue()));
  }

  /// Called right after a call outcome is queued: instant header + list feedback, server refresh follows.
  void onCallSaved({required String leadId, required bool wasCall}) {
    final wasReached = targetReached;
    if (wasCall) callsToday++;
    queue = queue.where((l) => l.id != leadId).toList();
    if (!wasReached && targetReached) targetHit.value++;
    notifyListeners();
    refreshSoon();
  }

  Future<void> saveQueuePosition(String? leadId) async {
    resumeLeadId = leadId;
    try {
      final p = await SharedPreferences.getInstance();
      if (leadId == null) {
        await p.remove(_posKey);
      } else {
        await p.setString(_posKey, leadId);
      }
    } catch (_) {}
  }

  String get _posKey => 'brokly:agent:callmode:${_uid ?? 'anon'}';

  Future<void> _restoreQueuePosition() async {
    try {
      resumeLeadId = (await SharedPreferences.getInstance()).getString(_posKey);
    } catch (_) {}
  }

  void _onResumed() {
    _subscribe();
    refreshSoon();
  }

  /// Realtime: any change to the agent's own leads or calls refreshes counts and lists (debounced).
  void _subscribe() {
    final uid = _uid;
    if (uid == null) return;
    try {
      if (_channel != null) _db.removeChannel(_channel!);
      _channel = _db
          .channel('agent-home-$uid')
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'leads',
            filter: PostgresChangeFilter(type: PostgresChangeFilterType.eq, column: 'assigned_to', value: uid),
            callback: (_) => refreshSoon(),
          )
          .onPostgresChanges(
            event: PostgresChangeEvent.insert,
            schema: 'public',
            table: 'call_logs',
            filter: PostgresChangeFilter(type: PostgresChangeFilterType.eq, column: 'user_id', value: uid),
            callback: (_) => refreshSoon(),
          )
          .subscribe();
    } catch (_) {}
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _unregisterSaved?.call();
    RealtimePause.resumed.removeListener(_onResumed);
    if (_channel != null) {
      try {
        _db.removeChannel(_channel!);
      } catch (_) {}
    }
    targetHit.dispose();
    super.dispose();
  }
}
