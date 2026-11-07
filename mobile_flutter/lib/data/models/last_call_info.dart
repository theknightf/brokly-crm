/// The most recent call logged for a lead (from the `lead_last_call` view), shown on the lead card.
class LastCallInfo {
  final DateTime at;
  final String outcome;
  final int durationSeconds;
  final String direction; // incoming | outgoing | missed
  final bool isAuto; // added automatically from the phone's call log

  const LastCallInfo({
    required this.at,
    required this.outcome,
    required this.durationSeconds,
    required this.direction,
    required this.isAuto,
  });

  factory LastCallInfo.fromJson(Map<String, dynamic> json) {
    return LastCallInfo(
      at: DateTime.tryParse(json['created_at']?.toString() ?? '')?.toLocal() ?? DateTime.now(),
      outcome: json['outcome']?.toString() ?? '',
      durationSeconds: (json['duration_seconds'] as num?)?.toInt() ?? 0,
      direction: json['direction']?.toString() ?? 'outgoing',
      isAuto: json['source']?.toString() == 'device_sync',
    );
  }
}
