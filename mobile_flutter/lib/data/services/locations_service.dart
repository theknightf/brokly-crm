import 'dart:math';
import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/locations_models.dart';
import 'supabase_service.dart';

/// Site visits (GPS check-in / check-out). Mirrors the website's
/// /api/site-visits route but talks to Supabase directly.
///
/// Visibility (same as web + RLS): owners/admins can see every visit (or one
/// agent's); everyone else only their own visits.
class LocationsService {
  final SupabaseClient _client = SupabaseService().client;

  String? get currentUserId => _client.auth.currentUser?.id;

  /// Latest 200 visits. Throws on failure.
  Future<List<LocationsVisit>> fetchVisits({required bool isAdmin, String? filterUserId}) async {
    final uid = currentUserId;
    var q = _client.from('site_visits').select('*, agent:user_profiles(id, full_name)');
    if (isAdmin) {
      if (filterUserId != null && filterUserId.isNotEmpty) q = q.eq('user_id', filterUserId);
    } else {
      if (uid == null) return [];
      q = q.eq('user_id', uid);
    }
    final res = await q.order('check_in_at', ascending: false).limit(200);
    return (res as List<dynamic>).map((e) => LocationsVisit.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// True when the signed-in user already has a visit in progress.
  Future<bool> hasActiveVisit() async {
    final uid = currentUserId;
    if (uid == null) return false;
    try {
      final res = await _client
          .from('site_visits')
          .select('id')
          .eq('user_id', uid)
          .eq('status', 'in_progress')
          .isFilter('check_out_at', null)
          .limit(1);
      return (res as List<dynamic>).isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  Future<List<LocationsProjectOption>> fetchProjects() async {
    try {
      final res = await _client
          .from('projects')
          .select('id, name, latitude, longitude, radius_m')
          .order('name', ascending: true);
      return (res as List<dynamic>).map((e) {
        final m = e as Map<String, dynamic>;
        return LocationsProjectOption(
          id: m['id']?.toString() ?? '',
          name: m['name']?.toString() ?? '',
          latitude: (m['latitude'] as num?)?.toDouble(),
          longitude: (m['longitude'] as num?)?.toDouble(),
          radiusM: (m['radius_m'] as num?)?.toInt() ?? 300,
        );
      }).toList();
    } catch (_) {
      return [];
    }
  }

  /// Same matching rules as the web lead picker (name / phone / email / project / unit).
  Future<List<LocationsLeadHit>> searchLeads(String query) async {
    final q = query.trim();
    if (q.length < 2) return [];
    // Strip characters that would break the PostgREST or() filter syntax.
    final safe = q.replaceAll(RegExp(r'[,()%*]'), ' ').trim();
    if (safe.isEmpty) return [];
    final digits = q.replaceAll(RegExp(r'\D'), '');
    try {
      var base = _client.from('leads').select('id, name, phone, email, project, unit, property_type');
      final PostgrestTransformBuilder<PostgrestList> filtered;
      if (q.contains('@')) {
        filtered = base.ilike('email', '%$safe%');
      } else if (digits.length >= 2) {
        filtered = base.or(
            'name.ilike.%$safe%,phone.ilike.%$digits%,email.ilike.%$safe%,project.ilike.%$safe%,unit.ilike.%$safe%');
      } else {
        filtered = base.or('name.ilike.%$safe%,project.ilike.%$safe%,unit.ilike.%$safe%');
      }
      final res = await filtered.order('created_at', ascending: false).limit(20);
      return (res as List<dynamic>).map((e) => LocationsLeadHit.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  /// Current GPS fix, or throws [LocationsGpsException] with a readable reason.
  Future<Position> currentPosition() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw const LocationsGpsException('Location services are turned off on this device.');
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied) {
        throw const LocationsGpsException('Location permission was denied.');
      }
      if (permission == LocationPermission.deniedForever) {
        throw const LocationsGpsException('Location permission is blocked. Enable it in system settings.');
      }
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 12)),
      );
    } on LocationsGpsException {
      rethrow;
    } catch (_) {
      throw const LocationsGpsException('Location unavailable. Check your permission and signal.');
    }
  }

  static double haversineMeters(double lat1, double lng1, double lat2, double lng2) {
    double rad(double d) => d * pi / 180;
    const r = 6371000.0;
    final dLat = rad(lat2 - lat1);
    final dLng = rad(lng2 - lng1);
    final a = pow(sin(dLat / 2), 2) + cos(rad(lat1)) * cos(rad(lat2)) * pow(sin(dLng / 2), 2);
    return 2 * r * asin(sqrt(a));
  }

  Future<void> _event(String visitId, String action, String detail, {double? lat, double? lng}) async {
    try {
      await _client.from('site_visit_events').insert({
        'site_visit_id': visitId,
        'user_id': currentUserId,
        'action': action,
        'detail': detail,
        'lat': lat,
        'lng': lng,
      });
    } catch (_) {}
  }

  /// Starts a visit. Returns the created visit. Verification = within the
  /// project's radius (default 300 m) of its pin.
  Future<LocationsVisit> checkIn({
    LocationsLeadHit? lead,
    LocationsProjectOption? project,
    String projectName = '',
    String note = '',
    double? lat,
    double? lng,
  }) async {
    final uid = currentUserId;
    if (uid == null) throw Exception('Not signed in');

    double? distance;
    var within = false;
    if (lat != null && lng != null && project?.latitude != null && project?.longitude != null) {
      distance = haversineMeters(lat, lng, project!.latitude!, project.longitude!);
      within = distance <= project.radiusM;
    }
    final now = DateTime.now().toUtc().toIso8601String();
    final res = await _client
        .from('site_visits')
        .insert({
          'user_id': uid,
          'project_id': project?.id,
          'project_name': project?.name ?? projectName,
          'lead_id': lead?.id,
          'lead_name': lead?.name ?? '',
          'lead_phone': lead?.phone ?? '',
          'status': 'in_progress',
          'check_in_at': now,
          'check_in_lat': lat,
          'check_in_lng': lng,
          'distance_m': distance,
          'verified': within,
          'within_radius': within,
          'visit_type': 'In-person',
          'note': note,
        })
        .select('*, agent:user_profiles(id, full_name)')
        .single();
    final visit = LocationsVisit.fromJson(res);
    await _event(visit.id, 'Check-in', 'Check-in${within ? ' — verified on-site' : ' — outside allowed radius'}',
        lat: lat, lng: lng);
    if (lead != null && lead.id.isNotEmpty) {
      try {
        await _client
            .from('leads')
            .update({'crm_status': 'Meeting', 'lead_status': 'Site Visit Scheduled'}).eq('id', lead.id);
      } catch (_) {}
    }
    return visit;
  }

  Future<void> checkOut(LocationsVisit visit, {required String outcome, String note = '', double? lat, double? lng}) async {
    final now = DateTime.now().toUtc();
    await _client.from('site_visits').update({
      'check_out_at': now.toIso8601String(),
      'check_out_lat': lat,
      'check_out_lng': lng,
      'status': 'completed',
      'outcome': outcome,
      'next_action': '',
      'note': note,
    }).eq('id', visit.id);

    await _event(visit.id, 'Check-out', 'Check-out captured${outcome.isNotEmpty ? ' — outcome: $outcome' : ''}',
        lat: lat, lng: lng);

    final leadId = visit.leadId;
    if (leadId != null && leadId.isNotEmpty) {
      try {
        await _client.from('leads').update({
          'crm_status': outcome == 'Not Interested' ? 'Not Interested' : 'Following Up',
          'lead_status': outcome == 'Sold' ? 'Won' : outcome == 'Lost' ? 'Lost' : 'Contacted',
        }).eq('id', leadId);
      } catch (_) {}
      try {
        final secs = visit.checkInAt == null ? 0 : now.difference(visit.checkInAt!.toUtc()).inSeconds;
        await _client.from('call_logs').insert({
          'user_id': currentUserId,
          'entity_type': 'lead',
          'entity_id': leadId,
          'contact_name': visit.leadName,
          'contact_phone': '',
          'channel': 'Site Visit',
          'direction': 'outgoing',
          'duration_seconds': secs < 0 ? 0 : secs,
          'outcome': outcome.isEmpty ? 'Completed' : outcome,
          'notes': '$note${outcome.isNotEmpty ? ' Outcome: $outcome.' : ''}',
        });
      } catch (_) {}
    }
  }

  /// "Share location": a project-less check-in labelled "My Location".
  Future<LocationsVisit> shareLocation(double lat, double lng) => checkIn(
        projectName: 'My Location',
        note: 'Location shared from the Locations page',
        lat: lat,
        lng: lng,
      );
}
