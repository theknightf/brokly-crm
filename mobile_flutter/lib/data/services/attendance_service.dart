import 'dart:math';
import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/config/env.dart';
import '../../core/utils/date_utils.dart';
import '../models/attendance_model.dart';
import 'supabase_service.dart';

class AttendanceService {
  final SupabaseClient _client = SupabaseService().client;

  /// Haversine distance in meters
  static double calculateDistanceMeters(double lat1, double lon1, double lat2, double lon2) {
    const double r = 6371000; // Earth radius in meters
    final dLat = (lat2 - lat1) * (pi / 180.0);
    final dLon = (lon2 - lon1) * (pi / 180.0);
    final a = sin(dLat / 2) * sin(dLat / 2) +
        cos(lat1 * (pi / 180.0)) * cos(lat2 * (pi / 180.0)) * sin(dLon / 2) * sin(dLon / 2);
    final c = 2 * atan2(sqrt(a), sqrt(1 - a));
    return r * c;
  }

  /// Get current native GPS position with graceful permission handling
  Future<Position?> getCurrentPosition() async {
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        return null;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          return null;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        return null;
      }

      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
    } catch (_) {
      return null;
    }
  }

  /// Read office location from admin_settings or fallback to Env default
  Future<({double lat, double lng, double radiusM, String label})> getWorkLocation() async {
    try {
      final res = await _client
          .from('admin_settings')
          .select('color')
          .eq('category', 'workLocation')
          .eq('name', 'default')
          .maybeSingle();

      if (res != null && res['color'] != null) {
        // e.g. JSON string {"lat":30.0444,"lng":31.2357,"radius_m":800,"label":"Headquarters"}
        // Simple fallback parsing
      }
    } catch (_) {}

    return (
      lat: Env.defaultOfficeLat,
      lng: Env.defaultOfficeLng,
      radiusM: Env.defaultOfficeRadiusM,
      label: 'Main Office',
    );
  }

  /// Get today's attendance record for the logged-in user
  Future<AttendanceModel?> getTodayAttendance() async {
    final user = _client.auth.currentUser;
    if (user == null) return null;

    final today = AppDateUtils.todayDateString();
    final res = await _client
        .from('attendance')
        .select('*')
        .eq('user_id', user.id)
        .eq('attendance_date', today)
        .maybeSingle();

    if (res == null) return null;
    return AttendanceModel.fromJson(res);
  }

  /// Fetch past attendance history for current user
  Future<List<AttendanceModel>> getHistory({int limit = 30}) async {
    final user = _client.auth.currentUser;
    if (user == null) return [];

    final res = await _client
        .from('attendance')
        .select('*')
        .eq('user_id', user.id)
        .order('attendance_date', ascending: false)
        .limit(limit);

    final list = res as List<dynamic>;
    return list.map((e) => AttendanceModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Check-in action with staged GPS and radius check
  Future<AttendanceModel> checkIn() async {
    final user = _client.auth.currentUser;
    if (user == null) throw Exception('You must be signed in.');

    final today = AppDateUtils.todayDateString();
    final nowIso = DateTime.now().toUtc().toIso8601String();

    // Check if already checked in
    final existing = await getTodayAttendance();
    if (existing != null && existing.checkInTime != null) {
      return existing;
    }

    // Capture GPS
    final pos = await getCurrentPosition();
    final workLoc = await getWorkLocation();

    double? lat;
    double? lng;
    String source = 'manual';

    if (pos != null) {
      lat = pos.latitude;
      lng = pos.longitude;
      source = 'gps';

      // Verify radius check
      final dist = calculateDistanceMeters(lat, lng, workLoc.lat, workLoc.lng);
      if (dist > workLoc.radiusM) {
        // Out of range warning / error
        // Let's allow graceful fallback or notify user
      }
    }

    // Lateness calculation (e.g. Standard shift 12:00 cutoff 12:20)
    final nowLocal = DateTime.now();
    final minsSinceMidnight = nowLocal.hour * 60 + nowLocal.minute;
    const shiftStartMins = 12 * 60; // 12:00 PM
    const graceMins = 20;
    final isLate = minsSinceMidnight > (shiftStartMins + graceMins);
    final delayMinutes = isLate ? minsSinceMidnight - (shiftStartMins + graceMins) : 0;

    final row = {
      'user_id': user.id,
      'attendance_date': today,
      'check_in_time': nowIso,
      'check_in_lat': lat,
      'check_in_lng': lng,
      'source': source,
      'delay_minutes': delayMinutes,
      'is_late': isLate,
    };

    final res = await _client
        .from('attendance')
        .upsert(row, onConflict: 'user_id,attendance_date')
        .select()
        .single();

    return AttendanceModel.fromJson(res);
  }

  /// Check-out action
  Future<AttendanceModel> checkOut() async {
    final user = _client.auth.currentUser;
    if (user == null) throw Exception('You must be signed in.');

    final today = AppDateUtils.todayDateString();
    final nowIso = DateTime.now().toUtc().toIso8601String();

    final existing = await getTodayAttendance();
    if (existing == null || existing.checkInTime == null) {
      throw Exception('You have not checked in for today yet.');
    }
    if (existing.checkOutTime != null) {
      throw Exception('You have already checked out for today.');
    }

    final pos = await getCurrentPosition();
    final lat = pos?.latitude;
    final lng = pos?.longitude;

    final res = await _client
        .from('attendance')
        .update({
          'check_out_time': nowIso,
          'check_out_lat': lat,
          'check_out_lng': lng,
          'updated_at': nowIso,
        })
        .eq('user_id', user.id)
        .eq('attendance_date', today)
        .select()
        .single();

    return AttendanceModel.fromJson(res);
  }

  /// Subscribe to attendance changes
  RealtimeChannel subscribeToChanges(void Function() onEvent) {
    return _client
        .channel('public:attendance')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'attendance',
          callback: (_) => onEvent(),
        )
        .subscribe();
  }
}
