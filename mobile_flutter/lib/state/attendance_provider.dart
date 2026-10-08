import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../data/models/attendance_model.dart';
import '../data/services/attendance_service.dart';

class AttendanceProvider extends ChangeNotifier {
  final AttendanceService _service = AttendanceService();

  AttendanceModel? _today;
  List<AttendanceModel> _history = [];
  bool _isLoading = true;
  bool _isBusy = false;
  String _busyPhase = '';
  String? _error;
  RealtimeChannel? _subscription;

  AttendanceModel? get today => _today;
  List<AttendanceModel> get history => _history;
  bool get isLoading => _isLoading;
  bool get isBusy => _isBusy;
  String get busyPhase => _busyPhase;
  String? get error => _error;

  bool get isCheckedIn => _today?.checkInTime != null;
  bool get isCheckedOut => _today?.checkOutTime != null;

  String? get durationString {
    if (_today?.checkInTime == null) return null;
    final minutes = _today!.durationMinutes;
    final h = minutes ~/ 60;
    final m = minutes % 60;
    return '${h}h ${m}m';
  }

  AttendanceProvider() {
    init();
    _setupRealtime();
  }

  void _setupRealtime() {
    _subscription = _service.subscribeToChanges(() {
      fetchToday();
    });
  }

  Future<void> init() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    await Future.wait([
      fetchToday(),
      fetchHistory(),
    ]);

    _isLoading = false;
    notifyListeners();
  }

  Future<void> fetchToday() async {
    try {
      _today = await _service.getTodayAttendance();
      notifyListeners();
    } catch (e) {
      _error = e.toString();
    }
  }

  Future<void> fetchHistory() async {
    try {
      _history = await _service.getHistory();
      notifyListeners();
    } catch (_) {}
  }

  Future<bool> checkIn() async {
    _isBusy = true;
    _busyPhase = 'Getting GPS location…';
    _error = null;
    notifyListeners();

    try {
      _busyPhase = 'Verifying & recording check-in…';
      notifyListeners();

      _today = await _service.checkIn();
      await fetchHistory();
      _isBusy = false;
      _busyPhase = '';
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      _isBusy = false;
      _busyPhase = '';
      notifyListeners();
      return false;
    }
  }

  Future<bool> checkOut() async {
    _isBusy = true;
    _busyPhase = 'Recording check-out…';
    _error = null;
    notifyListeners();

    try {
      _today = await _service.checkOut();
      await fetchHistory();
      _isBusy = false;
      _busyPhase = '';
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      _isBusy = false;
      _busyPhase = '';
      notifyListeners();
      return false;
    }
  }

  @override
  void dispose() {
    _subscription?.unsubscribe();
    super.dispose();
  }
}
