import 'package:flutter/foundation.dart';
import '../../data/models/reports_models.dart';
import '../../data/services/reports_calculator.dart';
import '../../data/services/reports_service.dart';

enum RangePreset { today, week, month, year, custom }

extension RangePresetX on RangePreset {
  String get label => switch (this) {
        RangePreset.today => 'Today',
        RangePreset.week => 'This week',
        RangePreset.month => 'This month',
        RangePreset.year => 'This year',
        RangePreset.custom => 'Custom',
      };
}

/// State of the Reports screen: date range, user filter, the fetched dataset
/// and the (memoised) calculated summary.
class ReportsController extends ChangeNotifier {
  ReportsController({ReportsService? service}) : _service = service ?? ReportsService() {
    final r = presetRange(RangePreset.week);
    from = r.from;
    to = r.to;
  }

  final ReportsService _service;
  ReportsService get service => _service;

  RangePreset preset = RangePreset.week;
  late String from;
  late String to;

  /// Selected user id (null = everyone the viewer may see).
  String? userId;

  ReportsDataset? dataset;
  bool loading = true;
  String? error;
  int _seq = 0;

  // Attendance (owner / admin only, loaded on demand).
  AttendanceReport? attendance;
  bool attendanceLoading = false;
  String? attendanceError;
  int _attSeq = 0;

  ReportSummary? _summary;
  String? _summaryKey;

  bool get isAdmin => dataset?.isAdmin ?? false;

  static ({String from, String to}) presetRange(RangePreset p) {
    final now = DateTime.now();
    final today = ReportsService.isoDay(now);
    switch (p) {
      case RangePreset.today:
        return (from: today, to: today);
      case RangePreset.week:
        final monday = DateTime(now.year, now.month, now.day - ((now.weekday + 6) % 7));
        return (from: ReportsService.isoDay(monday), to: today);
      case RangePreset.month:
        return (from: ReportsService.isoDay(DateTime(now.year, now.month, 1)), to: today);
      case RangePreset.year:
        return (from: ReportsService.isoDay(DateTime(now.year, 1, 1)), to: today);
      case RangePreset.custom:
        return (from: ReportsService.isoDay(DateTime(now.year, now.month, now.day - 6)), to: today);
    }
  }

  Future<void> load({bool silent = false}) async {
    final seq = ++_seq;
    if (!silent || dataset == null) {
      loading = true;
      error = null;
      notifyListeners();
    }
    try {
      final ds = await _service.fetchDataset(from, to);
      if (seq != _seq) return;
      dataset = ds;
      error = null;
      _summary = null;
    } catch (e) {
      if (seq != _seq) return;
      if (dataset == null || !silent) error = ReportsService.friendlyError(e);
    } finally {
      if (seq == _seq) {
        loading = false;
        notifyListeners();
      }
    }
  }

  Future<void> refresh() async {
    await load(silent: true);
    if (attendance != null) await loadAttendance();
  }

  Future<void> setPreset(RangePreset p) async {
    preset = p;
    final r = presetRange(p);
    from = r.from;
    to = r.to;
    attendance = null;
    await load();
  }

  Future<void> setCustomRange(String f, String t) async {
    preset = RangePreset.custom;
    from = f;
    to = t;
    attendance = null;
    await load();
  }

  void setUser(String? id) {
    userId = (id == null || id.isEmpty) ? null : id;
    _summary = null;
    notifyListeners();
  }

  ReportSummary? get summary {
    final ds = dataset;
    if (ds == null) return null;
    final key = '${ds.fetchedAt.microsecondsSinceEpoch}|${userId ?? ''}';
    if (_summary == null || _summaryKey != key) {
      _summary = ReportsCalculator.buildSummary(ds, userId: userId);
      _summaryKey = key;
    }
    return _summary;
  }

  /// People the user filter may offer (profiles in the viewer's scope + anyone with calls).
  List<({String id, String name})> get userOptions {
    final ds = dataset;
    if (ds == null) return const [];
    final map = <String, String>{};
    for (final p in ds.profiles) {
      if (!p.isActive) continue;
      if (ds.scope != null && !ds.scope!.contains(p.id)) continue;
      map[p.id] = p.name;
    }
    final out = map.entries.map((e) => (id: e.key, name: e.value)).toList()
      ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return out;
  }

  String? get selectedUserName {
    final id = userId;
    if (id == null) return null;
    for (final u in userOptions) {
      if (u.id == id) return u.name;
    }
    return 'Selected user';
  }

  Future<void> loadAttendance() async {
    if (!isAdmin) return;
    final seq = ++_attSeq;
    attendanceLoading = true;
    attendanceError = null;
    notifyListeners();
    try {
      final rep = await _service.fetchAttendance(from, to);
      if (seq != _attSeq) return;
      attendance = rep;
    } catch (e) {
      if (seq != _attSeq) return;
      attendanceError = ReportsService.friendlyError(e);
    } finally {
      if (seq == _attSeq) {
        attendanceLoading = false;
        notifyListeners();
      }
    }
  }
}
