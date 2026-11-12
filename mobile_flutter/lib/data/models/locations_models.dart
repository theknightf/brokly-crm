/// One row of site_visits (+ agent name from the user_profiles join).
class LocationsVisit {
  final String id;
  final String userId;
  final String? projectId;
  final String projectName;
  final String? leadId;
  final String leadName;
  final String status; // in_progress | scheduled | completed | no_show | cancelled
  final DateTime? checkInAt;
  final DateTime? checkOutAt;
  final double? lat;
  final double? lng;
  final double? distanceM;
  final bool verified;
  final String note;
  final String outcome;
  final String agentName;

  const LocationsVisit({
    required this.id,
    required this.userId,
    this.projectId,
    this.projectName = '',
    this.leadId,
    this.leadName = '',
    this.status = '',
    this.checkInAt,
    this.checkOutAt,
    this.lat,
    this.lng,
    this.distanceM,
    this.verified = false,
    this.note = '',
    this.outcome = '',
    this.agentName = '',
  });

  bool get hasCoord => lat != null && lng != null;
  bool get isActive => status == 'in_progress' && checkOutAt == null;
  bool get isDone => checkOutAt != null;

  /// Seconds between check-in and check-out (or now while still active).
  int? durationSeconds(DateTime now) {
    final a = checkInAt;
    if (a == null) return null;
    final b = checkOutAt ?? now;
    if (b.isBefore(a)) return null;
    return b.difference(a).inSeconds;
  }

  factory LocationsVisit.fromJson(Map<String, dynamic> v) {
    final agent = v['agent'];
    return LocationsVisit(
      id: v['id']?.toString() ?? '',
      userId: v['user_id']?.toString() ?? '',
      projectId: v['project_id']?.toString(),
      projectName: v['project_name']?.toString() ?? '',
      leadId: v['lead_id']?.toString(),
      leadName: v['lead_name']?.toString() ?? '',
      status: v['status']?.toString() ?? '',
      checkInAt: DateTime.tryParse(v['check_in_at']?.toString() ?? '')?.toLocal(),
      checkOutAt: DateTime.tryParse(v['check_out_at']?.toString() ?? '')?.toLocal(),
      lat: (v['check_in_lat'] as num?)?.toDouble(),
      lng: (v['check_in_lng'] as num?)?.toDouble(),
      distanceM: (v['distance_m'] as num?)?.toDouble(),
      verified: v['verified'] == true,
      note: v['note']?.toString() ?? '',
      outcome: v['outcome']?.toString() ?? '',
      agentName: agent is Map ? (agent['full_name']?.toString() ?? '') : '',
    );
  }
}

/// Lead hit in the check-in lead picker.
class LocationsLeadHit {
  final String id;
  final String name;
  final String phone;
  final String email;
  final String project;
  final String unit;
  final String propertyType;

  const LocationsLeadHit({
    required this.id,
    required this.name,
    this.phone = '',
    this.email = '',
    this.project = '',
    this.unit = '',
    this.propertyType = '',
  });

  factory LocationsLeadHit.fromJson(Map<String, dynamic> r) => LocationsLeadHit(
        id: r['id']?.toString() ?? '',
        name: r['name']?.toString() ?? '',
        phone: r['phone']?.toString() ?? '',
        email: r['email']?.toString() ?? '',
        project: r['project']?.toString() ?? '',
        unit: r['unit']?.toString() ?? '',
        propertyType: r['property_type']?.toString() ?? '',
      );
}

/// Minimal project info needed by the check-in sheet.
class LocationsProjectOption {
  final String id;
  final String name;
  final double? latitude;
  final double? longitude;
  final int radiusM;

  const LocationsProjectOption({
    required this.id,
    required this.name,
    this.latitude,
    this.longitude,
    this.radiusM = 300,
  });
}

class LocationsGpsException implements Exception {
  final String message;
  const LocationsGpsException(this.message);
  @override
  String toString() => message;
}
