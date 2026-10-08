/// Call Log Model mirroring the Brokly CRM call_logs table & API schema
class CallLogModel {
  final String id;
  final String? userId;
  final String? entityType;
  final String? entityId;
  final String? contactName;
  final String contactPhone;
  final String channel;
  final String direction;
  final int durationSeconds;
  final String outcome;
  final String? notes;
  final String? clientRef;
  final String? projectName;
  final String? agentName;
  final String? createdAt;

  CallLogModel({
    required this.id,
    this.userId,
    this.entityType = 'lead',
    this.entityId,
    this.contactName,
    required this.contactPhone,
    this.channel = 'Call',
    this.direction = 'outgoing',
    this.durationSeconds = 0,
    this.outcome = 'Connected',
    this.notes,
    this.clientRef,
    this.projectName,
    this.agentName,
    this.createdAt,
  });

  factory CallLogModel.fromJson(Map<String, dynamic> json) {
    return CallLogModel(
      id: json['id']?.toString() ?? '',
      userId: json['user_id']?.toString(),
      entityType: json['entity_type']?.toString() ?? 'lead',
      entityId: json['entity_id']?.toString(),
      contactName: json['contact_name']?.toString(),
      contactPhone: json['contact_phone']?.toString() ?? '',
      channel: json['channel']?.toString() ?? 'Call',
      direction: json['direction']?.toString() ?? 'outgoing',
      durationSeconds: (json['duration_seconds'] as num?)?.toInt() ?? 0,
      outcome: json['outcome']?.toString() ?? 'Connected',
      notes: json['notes']?.toString(),
      clientRef: json['client_ref']?.toString(),
      projectName: json['project_name']?.toString(),
      agentName: json['agent_name']?.toString(),
      createdAt: json['created_at']?.toString(),
    );
  }

  Map<String, dynamic> toJson({String? currentUserId}) {
    return {
      if (currentUserId != null) 'user_id': currentUserId,
      'entity_type': entityType,
      'entity_id': entityId,
      'contact_name': contactName,
      'contact_phone': contactPhone,
      'channel': channel,
      'direction': direction,
      'duration_seconds': durationSeconds,
      'outcome': outcome,
      'notes': notes,
      'client_ref': clientRef,
      'project_name': projectName,
    };
  }
}
