class AppNotificationModel {
  final String id;
  final String type; // 'assignment' | 'overdue_reminder' | 'upcoming_reminder' | 'deduction' | 'duplicate'
  final String title;
  final String body;
  final String? leadId;
  final String entityType;
  final String entityId;
  final DateTime createdAt;
  final String? dueTime;
  final double? amount;
  final bool isRead;

  const AppNotificationModel({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    this.leadId,
    required this.entityType,
    required this.entityId,
    required this.createdAt,
    this.dueTime,
    this.amount,
    this.isRead = false,
  });

  AppNotificationModel copyWith({
    bool? isRead,
  }) {
    return AppNotificationModel(
      id: id,
      type: type,
      title: title,
      body: body,
      leadId: leadId,
      entityType: entityType,
      entityId: entityId,
      createdAt: createdAt,
      dueTime: dueTime,
      amount: amount,
      isRead: isRead ?? this.isRead,
    );
  }
}
