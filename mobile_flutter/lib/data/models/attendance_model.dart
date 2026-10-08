/// Attendance Model mirroring the Brokly CRM attendance table
class AttendanceModel {
  final String id;
  final String userId;
  final String attendanceDate; // YYYY-MM-DD
  final String? checkInTime; // ISO
  final String? checkOutTime; // ISO
  final double? checkInLat;
  final double? checkInLng;
  final double? checkOutLat;
  final double? checkOutLng;
  final String source; // 'gps' | 'manual'
  final int delayMinutes;
  final bool isLate;
  final String? userName;

  AttendanceModel({
    required this.id,
    required this.userId,
    required this.attendanceDate,
    this.checkInTime,
    this.checkOutTime,
    this.checkInLat,
    this.checkInLng,
    this.checkOutLat,
    this.checkOutLng,
    this.source = 'manual',
    this.delayMinutes = 0,
    this.isLate = false,
    this.userName,
  });

  bool get isCheckedIn => checkInTime != null;
  bool get isCheckedOut => checkOutTime != null;
  bool get hasGps => checkInLat != null && checkInLng != null;

  int get durationMinutes {
    if (checkInTime == null) return 0;
    final inTime = DateTime.tryParse(checkInTime!);
    if (inTime == null) return 0;
    final outTime = checkOutTime != null ? DateTime.tryParse(checkOutTime!) : DateTime.now();
    if (outTime == null) return 0;
    return outTime.difference(inTime).inMinutes;
  }

  factory AttendanceModel.fromJson(Map<String, dynamic> json) {
    return AttendanceModel(
      id: json['id']?.toString() ?? '',
      userId: json['user_id']?.toString() ?? '',
      attendanceDate: json['attendance_date']?.toString() ?? '',
      checkInTime: json['check_in_time']?.toString(),
      checkOutTime: json['check_out_time']?.toString(),
      checkInLat: (json['check_in_lat'] as num?)?.toDouble(),
      checkInLng: (json['check_in_lng'] as num?)?.toDouble(),
      checkOutLat: (json['check_out_lat'] as num?)?.toDouble(),
      checkOutLng: (json['check_out_lng'] as num?)?.toDouble(),
      source: json['source']?.toString() ?? 'manual',
      delayMinutes: (json['delay_minutes'] as num?)?.toInt() ?? 0,
      isLate: json['is_late'] == true,
      userName: json['user_profiles'] is Map
          ? json['user_profiles']['full_name']?.toString()
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'user_id': userId,
      'attendance_date': attendanceDate,
      'check_in_time': checkInTime,
      'check_out_time': checkOutTime,
      'check_in_lat': checkInLat,
      'check_in_lng': checkInLng,
      'check_out_lat': checkOutLat,
      'check_out_lng': checkOutLng,
      'source': source,
      'delay_minutes': delayMinutes,
      'is_late': isLate,
    };
  }
}
