/// Canonical Follow-Up Model matching Brokly CRM follow_ups table & schema
class FollowUpModel {
  final String id;
  final String title;
  final String contactName;
  final String? contactType;
  final String? contactPhone;
  final String? contactEmail;
  final String followUpType;
  final String status; // 'Pending' | 'Completed' | 'Cancelled'
  final String priority;
  final String dueDate; // 'YYYY-MM-DD'
  final String? dueTime; // 'HH:mm'
  final String? agent;
  final String? agentInitials;
  final String? notes;
  final String? propertyInterest;
  final String? relationshipStatus;
  final String? leadId;
  final String? createdBy;
  final String? createdAt;
  final String? completedAt;

  FollowUpModel({
    required this.id,
    this.title = '',
    required this.contactName,
    this.contactType = 'Lead',
    this.contactPhone,
    this.contactEmail,
    this.followUpType = 'Call',
    this.status = 'Pending',
    this.priority = 'Medium',
    required this.dueDate,
    this.dueTime = '09:00',
    this.agent,
    this.agentInitials,
    this.notes,
    this.propertyInterest,
    this.relationshipStatus = 'New',
    this.leadId,
    this.createdBy,
    this.createdAt,
    this.completedAt,
  });

  /// Status checks (case-insensitive)
  bool get isCompleted => status.toLowerCase().trim() == 'completed';
  bool get isCancelled => status.toLowerCase().trim() == 'cancelled';
  bool get isActive => !isCompleted && !isCancelled;

  /// Parsed local DateTime without timezone mismatch
  DateTime? get dueDateTime {
    if (dueDate.trim().isEmpty) return null;
    try {
      final parts = dueDate.trim().split('-');
      if (parts.length == 3) {
        final year = int.parse(parts[0]);
        final month = int.parse(parts[1]);
        final day = int.parse(parts[2]);

        int hour = 9;
        int minute = 0;
        if (dueTime != null && dueTime!.contains(':')) {
          final timeParts = dueTime!.split(':');
          hour = int.tryParse(timeParts[0]) ?? 9;
          minute = int.tryParse(timeParts[1]) ?? 0;
        }
        return DateTime(year, month, day, hour, minute);
      }
      return DateTime.tryParse(dueDate)?.toLocal();
    } catch (_) {
      return null;
    }
  }

  /// Due date relative to today (local wall-clock date)
  bool get isDueToday {
    final d = dueDateTime;
    if (d == null) return false;
    final now = DateTime.now();
    return d.year == now.year && d.month == now.month && d.day == now.day;
  }

  bool get isOverdue {
    final d = dueDateTime;
    if (d == null) return false;
    final now = DateTime.now();
    final todayStart = DateTime(now.year, now.month, now.day);
    return d.isBefore(todayStart);
  }

  bool get isUpcoming {
    final d = dueDateTime;
    if (d == null) return false;
    final now = DateTime.now();
    final todayEnd = DateTime(now.year, now.month, now.day, 23, 59, 59);
    return d.isAfter(todayEnd);
  }

  factory FollowUpModel.fromJson(Map<String, dynamic> json) {
    return FollowUpModel(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      contactName: json['contact_name']?.toString() ?? json['name']?.toString() ?? 'Contact',
      contactType: json['contact_type']?.toString(),
      contactPhone: json['contact_phone']?.toString() ?? json['phone']?.toString(),
      contactEmail: json['contact_email']?.toString() ?? json['email']?.toString(),
      followUpType: json['follow_up_type']?.toString() ?? 'Call',
      status: json['follow_up_status']?.toString() ?? json['status']?.toString() ?? 'Pending',
      priority: json['priority']?.toString() ?? 'Medium',
      dueDate: json['due_date']?.toString() ?? json['dueDate']?.toString() ?? '',
      dueTime: json['due_time']?.toString() ?? json['dueTime']?.toString() ?? '09:00',
      agent: json['agent']?.toString(),
      agentInitials: json['agent_initials']?.toString(),
      notes: json['notes']?.toString(),
      propertyInterest: json['property_interest']?.toString() ?? json['propertyInterest']?.toString(),
      relationshipStatus: json['relationship_status']?.toString(),
      leadId: json['lead_id']?.toString() ?? json['leadId']?.toString(),
      createdBy: json['created_by']?.toString() ?? json['createdBy']?.toString(),
      createdAt: json['created_at']?.toString() ?? json['createdAt']?.toString(),
      completedAt: json['completed_at']?.toString() ?? json['completedAt']?.toString(),
    );
  }

  Map<String, dynamic> toJson({String? currentUserId}) {
    return {
      'title': title,
      'contact_name': contactName,
      'contact_type': contactType,
      'contact_phone': contactPhone,
      'contact_email': contactEmail,
      'follow_up_type': followUpType,
      'follow_up_status': status,
      'priority': priority,
      'due_date': dueDate,
      'due_time': dueTime,
      'agent': agent,
      'agent_initials': agentInitials,
      'notes': notes,
      'property_interest': propertyInterest,
      'relationship_status': relationshipStatus,
      if (leadId != null && leadId!.isNotEmpty) 'lead_id': leadId,
      if (currentUserId != null) 'created_by': currentUserId,
      if (completedAt != null) 'completed_at': completedAt,
    };
  }

  FollowUpModel copyWith({
    String? id,
    String? title,
    String? contactName,
    String? contactType,
    String? contactPhone,
    String? contactEmail,
    String? followUpType,
    String? status,
    String? priority,
    String? dueDate,
    String? dueTime,
    String? agent,
    String? agentInitials,
    String? notes,
    String? propertyInterest,
    String? relationshipStatus,
    String? leadId,
    String? createdBy,
    String? createdAt,
    String? completedAt,
  }) {
    return FollowUpModel(
      id: id ?? this.id,
      title: title ?? this.title,
      contactName: contactName ?? this.contactName,
      contactType: contactType ?? this.contactType,
      contactPhone: contactPhone ?? this.contactPhone,
      contactEmail: contactEmail ?? this.contactEmail,
      followUpType: followUpType ?? this.followUpType,
      status: status ?? this.status,
      priority: priority ?? this.priority,
      dueDate: dueDate ?? this.dueDate,
      dueTime: dueTime ?? this.dueTime,
      agent: agent ?? this.agent,
      agentInitials: agentInitials ?? this.agentInitials,
      notes: notes ?? this.notes,
      propertyInterest: propertyInterest ?? this.propertyInterest,
      relationshipStatus: relationshipStatus ?? this.relationshipStatus,
      leadId: leadId ?? this.leadId,
      createdBy: createdBy ?? this.createdBy,
      createdAt: createdAt ?? this.createdAt,
      completedAt: completedAt ?? this.completedAt,
    );
  }
}
