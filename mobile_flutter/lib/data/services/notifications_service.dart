import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/app_notification_model.dart';
import 'follow_ups_service.dart';
import 'supabase_service.dart';

class NotificationsService {
  final SupabaseClient _client = SupabaseService().client;
  final FollowUpsService _followUpsService = FollowUpsService();

  /// Fetch all relevant notifications for the currently signed-in user:
  /// 1) Newly assigned leads (from `leads` table & `activity_log` 'Lead Assigned' events)
  /// 2) Overdue & upcoming scheduled follow-ups (from `follow_ups` and `leads.follow_up_due`)
  /// 3) System / deduction alerts from `notifications` table
  Future<List<AppNotificationModel>> fetchNotifications({
    Set<String> readIds = const {},
  }) async {
    final user = _client.auth.currentUser;
    if (user == null) return [];

    final List<AppNotificationModel> items = [];
    final Set<String> addedNotificationIds = {};
    final now = DateTime.now();
    final todayStr = DateFormat('yyyy-MM-dd').format(now);
    final tomorrowStr =
        DateFormat('yyyy-MM-dd').format(now.add(const Duration(days: 1)));

    // Keep a map of user's leads by phone/name so follow-ups without lead_id still resolve to a leadId
    final Map<String, String> phoneToLeadId = {};
    final Map<String, String> nameToLeadId = {};
    final Set<String> assignedLeadIdsSeen = {};
    List<dynamic> assignedLeadsRows = [];

    // 1A) Assigned Leads directly from `leads` table (isolated try/catch, using select('*'))
    try {
      final assignedRes = await _client
          .from('leads')
          .select('*')
          .eq('assigned_to', user.id)
          .order('created_at', ascending: false)
          .limit(80);

      assignedLeadsRows = assignedRes as List<dynamic>;

      for (final raw in assignedLeadsRows) {
        final row = raw as Map<String, dynamic>;
        final leadId = row['id']?.toString() ?? '';
        if (leadId.isEmpty) continue;
        assignedLeadIdsSeen.add(leadId);

        final leadName = row['name']?.toString().trim().isNotEmpty == true
            ? row['name'].toString().trim()
            : (row['phone']?.toString() ?? 'Lead');
        final phone =
            (row['phone']?.toString() ?? '').replaceAll(RegExp(r'\D'), '');
        if (phone.length >= 8) {
          phoneToLeadId[phone.substring(phone.length - 8)] = leadId;
        }
        if (leadName.isNotEmpty) {
          nameToLeadId[leadName.toLowerCase()] = leadId;
        }

        final timestampStr = row['updated_at']?.toString() ??
            row['last_action_at']?.toString() ??
            row['created_at']?.toString() ??
            now.toIso8601String();
        final createdAt = DateTime.tryParse(timestampStr)?.toLocal() ?? now;

        // Include leads assigned or updated within the last 14 days (or top 25 assigned leads)
        final ageDays = now.difference(createdAt).inDays;
        if (ageDays <= 14 || items.where((i) => i.type == 'assignment').length < 15) {
          final project = row['project']?.toString() ??
              row['property_type']?.toString() ??
              '';
          final status = row['crm_status']?.toString() ??
              row['lead_status']?.toString() ??
              'Fresh Leads';
          final notifId = 'ass-lead-$leadId';

          if (addedNotificationIds.add(notifId)) {
            items.add(
              AppNotificationModel(
                id: notifId,
                type: 'assignment',
                title: 'New Lead Assigned to You',
                body: project.isNotEmpty
                    ? '$leadName • $project ($status)'
                    : '$leadName ($status)',
                leadId: leadId,
                entityType: 'lead',
                entityId: leadId,
                createdAt: createdAt,
                isRead: readIds.contains(notifId),
              ),
            );
          }
        }
      }
    } catch (_) {}

    // 1B) Also check `activity_log` for explicit 'Lead Assigned' events (from Web Admin assignment / rotation)
    try {
      final actRes = await _client
          .from('activity_log')
          .select('id, action_type, entity_type, entity_id, detail, created_at')
          .eq('user_id', user.id)
          .eq('action_type', 'Lead Assigned')
          .order('created_at', ascending: false)
          .limit(25);

      for (final raw in (actRes as List<dynamic>)) {
        final a = raw as Map<String, dynamic>;
        final entityId = a['entity_id']?.toString() ?? '';
        final actId = a['id']?.toString() ?? '';
        if (entityId.isEmpty && actId.isEmpty) continue;

        final notifId = entityId.isNotEmpty ? 'ass-lead-$entityId' : 'ass-act-$actId';
        if (!addedNotificationIds.add(notifId)) continue;

        final detail = a['detail']?.toString().trim() ?? '';
        final createdAt =
            DateTime.tryParse(a['created_at']?.toString() ?? '')?.toLocal() ?? now;

        items.add(
          AppNotificationModel(
            id: notifId,
            type: 'assignment',
            title: 'New Lead Assigned to You',
            body: detail.isNotEmpty ? detail : 'A new lead has been assigned to you',
            leadId: entityId.isNotEmpty ? entityId : null,
            entityType: 'lead',
            entityId: entityId.isNotEmpty ? entityId : actId,
            createdAt: createdAt,
            isRead: readIds.contains(notifId),
          ),
        );
      }
    } catch (_) {}

    // 2) Follow-up reminders (scheduled & overdue) via FollowUpsService + direct fallback
    try {
      final allFollowUps = await _followUpsService.getAll();
      for (final f in allFollowUps) {
        if (!f.isActive) continue;

        final dueDate = f.dueDate.trim().split('T').first;
        if (dueDate.isEmpty) continue;

        final isOverdue = dueDate.compareTo(todayStr) < 0;
        final isToday = dueDate == todayStr;
        final isTomorrow = dueDate == tomorrowStr;
        if (!isOverdue && !isToday && !isTomorrow) continue;

        // Resolve leadId directly or via phone/name lookup
        String? resolvedLeadId = f.leadId;
        if (resolvedLeadId == null || resolvedLeadId.isEmpty) {
          if (f.id.startsWith('lead-')) {
            resolvedLeadId = f.id.replaceFirst('lead-', '');
          }
        }
        if (resolvedLeadId == null || resolvedLeadId.isEmpty) {
          final fPhone = (f.contactPhone ?? '').replaceAll(RegExp(r'\D'), '');
          if (fPhone.length >= 8) {
            resolvedLeadId = phoneToLeadId[fPhone.substring(fPhone.length - 8)];
          }
        }
        if (resolvedLeadId == null || resolvedLeadId.isEmpty) {
          final cName = f.contactName.trim().toLowerCase();
          if (cName.isNotEmpty) {
            resolvedLeadId = nameToLeadId[cName];
          }
        }

        final dueTime = (f.dueTime != null && f.dueTime!.trim().isNotEmpty)
            ? f.dueTime!.trim()
            : '10:00';
        final contactName =
            f.contactName.trim().isNotEmpty ? f.contactName.trim() : 'Lead';
        final titleText = f.title.trim().isNotEmpty
            ? f.title.trim()
            : 'Follow up with $contactName';
        final notifId = 'rem-${f.id}-$dueDate';

        if (!addedNotificationIds.add(notifId)) continue;

        final dueDateTime = f.dueDateTime ??
            DateTime.tryParse('${dueDate}T$dueTime') ??
            DateTime.tryParse(dueDate) ??
            now;

        final bool timePassedToday = isToday && dueDateTime.isBefore(now);
        final bool treatAsOverdue = isOverdue || timePassedToday;

        items.add(
          AppNotificationModel(
            id: notifId,
            type: treatAsOverdue ? 'overdue_reminder' : 'upcoming_reminder',
            title: treatAsOverdue
                ? 'Overdue Follow-up Reminder'
                : (isToday
                    ? 'Upcoming Follow-up Today ($dueTime)'
                    : 'Scheduled Follow-up Tomorrow ($dueTime)'),
            body: f.propertyInterest != null && f.propertyInterest!.trim().isNotEmpty
                ? '$titleText • $contactName (${f.propertyInterest})'
                : '$titleText • $contactName',
            leadId: resolvedLeadId,
            entityType: resolvedLeadId != null && resolvedLeadId.isNotEmpty
                ? 'lead'
                : 'follow_up',
            entityId: resolvedLeadId != null && resolvedLeadId.isNotEmpty
                ? resolvedLeadId
                : f.id,
            createdAt: treatAsOverdue ? now : dueDateTime,
            dueTime: '$dueDate $dueTime',
            isRead: readIds.contains(notifId),
          ),
        );
      }
    } catch (_) {}

    // 3) Direct fallback check on `leads.follow_up_due` for any assigned leads not yet covered
    try {
      for (final raw in assignedLeadsRows) {
        final row = raw as Map<String, dynamic>;
        final leadId = row['id']?.toString() ?? '';
        if (leadId.isEmpty) continue;

        final followUpDue = row['follow_up_due']?.toString() ?? '';
        if (followUpDue.isEmpty) continue;

        final status = (row['crm_status']?.toString() ??
                row['lead_status']?.toString() ??
                '')
            .toLowerCase();
        if (status == 'done deal' ||
            status == 'won' ||
            status == 'lost' ||
            status == 'not interested' ||
            status == 'cancellation') {
          continue;
        }

        final datePart = followUpDue.split('T').first;
        final isOverdue = datePart.compareTo(todayStr) < 0;
        final isToday = datePart == todayStr;
        final isTomorrow = datePart == tomorrowStr;
        if (!isOverdue && !isToday && !isTomorrow) continue;

        final notifId = 'rem-lead-$leadId-$datePart';
        if (items.any((n) =>
            n.leadId == leadId &&
            (n.type == 'overdue_reminder' || n.type == 'upcoming_reminder'))) {
          continue;
        }
        if (!addedNotificationIds.add(notifId)) continue;

        final leadName = row['name']?.toString() ?? 'Lead';
        final project =
            row['project']?.toString() ?? row['property_type']?.toString() ?? '';

        items.add(
          AppNotificationModel(
            id: notifId,
            type: isOverdue ? 'overdue_reminder' : 'upcoming_reminder',
            title: isOverdue
                ? 'Overdue Lead Follow-up'
                : (isToday ? 'Follow-up Due Today' : 'Follow-up Due Tomorrow'),
            body: project.isNotEmpty
                ? 'Follow up with $leadName ($project) — Due $datePart'
                : 'Follow up with $leadName — Due $datePart',
            leadId: leadId,
            entityType: 'lead',
            entityId: leadId,
            createdAt: DateTime.tryParse(followUpDue)?.toLocal() ?? now,
            dueTime: datePart,
            isRead: readIds.contains(notifId),
          ),
        );
      }
    } catch (_) {}

    // 4) Deduction / system alerts from `notifications` table
    try {
      final sysRes = await _client
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', ascending: false)
          .limit(15);

      for (final raw in (sysRes as List<dynamic>)) {
        final n = raw as Map<String, dynamic>;
        final nId = n['id']?.toString() ?? '';
        if (nId.isEmpty) continue;
        final notifId = 'ded-$nId';
        if (!addedNotificationIds.add(notifId)) continue;

        final amount = (n['amount'] as num?)?.toDouble();
        final reason =
            n['reason']?.toString() ?? n['message']?.toString() ?? '';
        final createdAt =
            DateTime.tryParse(n['created_at']?.toString() ?? '')?.toLocal() ??
                now;

        items.add(
          AppNotificationModel(
            id: notifId,
            type: 'deduction',
            title: n['title']?.toString() ?? 'System Alert',
            body: amount != null && amount > 0
                ? '$reason • $amount EGP'
                : reason,
            entityType: 'deduction',
            entityId: nId,
            createdAt: createdAt,
            amount: amount,
            isRead: (n['is_read'] == true) || readIds.contains(notifId),
          ),
        );
      }
    } catch (_) {}

    // Sort: unread first, overdue reminders & new assignments prioritized, then by createdAt descending
    items.sort((a, b) {
      if (a.isRead != b.isRead) {
        return a.isRead ? 1 : -1;
      }
      int priorityWeight(String type) {
        if (type == 'overdue_reminder') return 0;
        if (type == 'upcoming_reminder') return 1;
        if (type == 'assignment') return 2;
        return 3;
      }

      final pwA = priorityWeight(a.type);
      final pwB = priorityWeight(b.type);
      if (pwA != pwB) return pwA.compareTo(pwB);
      return b.createdAt.compareTo(a.createdAt);
    });

    return items;
  }

  /// Resolve a target lead ID from a notification if not already populated
  Future<String?> resolveLeadId(AppNotificationModel notification) async {
    if (notification.leadId != null && notification.leadId!.isNotEmpty) {
      return notification.leadId;
    }
    if (notification.entityType == 'lead' && notification.entityId.isNotEmpty) {
      return notification.entityId;
    }
    if (notification.entityId.startsWith('lead-')) {
      return notification.entityId.replaceFirst('lead-', '');
    }

    // Check follow_ups table by entityId
    if (notification.entityId.isNotEmpty) {
      try {
        final fRow = await _client
            .from('follow_ups')
            .select('lead_id, contact_phone, contact_name')
            .eq('id', notification.entityId)
            .maybeSingle();
        if (fRow != null) {
          final directLeadId = fRow['lead_id']?.toString();
          if (directLeadId != null && directLeadId.isNotEmpty) {
            return directLeadId;
          }
          final phone = (fRow['contact_phone']?.toString() ?? '')
              .replaceAll(RegExp(r'\D'), '');
          if (phone.length >= 8) {
            final suffix = phone.substring(phone.length - 8);
            final leadMatch = await _client
                .from('leads')
                .select('id')
                .ilike('phone', '%$suffix%')
                .limit(1)
                .maybeSingle();
            if (leadMatch != null && leadMatch['id'] != null) {
              return leadMatch['id'].toString();
            }
          }
          final contactName = fRow['contact_name']?.toString().trim() ?? '';
          if (contactName.isNotEmpty) {
            final nameMatch = await _client
                .from('leads')
                .select('id')
                .ilike('name', '%$contactName%')
                .limit(1)
                .maybeSingle();
            if (nameMatch != null && nameMatch['id'] != null) {
              return nameMatch['id'].toString();
            }
          }
        }
      } catch (_) {}
    }

    return null;
  }

  /// Subscribe to realtime lead assignments, activity_log assignments, and follow-up reminders
  RealtimeChannel subscribeToRealtimeAlerts({
    required void Function(AppNotificationModel? immediateAlert) onEvent,
  }) {
    final channelName =
        'mobile-notifications-${DateTime.now().millisecondsSinceEpoch}';
    final channel = _client.channel(channelName);

    channel
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'leads',
          callback: (payload) {
            final currentUser = _client.auth.currentUser;
            final newRow = payload.newRecord;
            if (currentUser != null &&
                newRow['assigned_to']?.toString() == currentUser.id) {
              final leadId = newRow['id']?.toString() ?? '';
              final name = newRow['name']?.toString().trim().isNotEmpty == true
                  ? newRow['name'].toString()
                  : (newRow['phone']?.toString() ?? 'New Lead');
              final project = newRow['project']?.toString() ??
                  newRow['property_type']?.toString() ??
                  '';
              onEvent(
                AppNotificationModel(
                  id: 'ass-lead-$leadId',
                  type: 'assignment',
                  title: 'New Lead Assigned to You!',
                  body: project.isNotEmpty ? '$name • $project' : name,
                  leadId: leadId,
                  entityType: 'lead',
                  entityId: leadId,
                  createdAt: DateTime.now(),
                ),
              );
            } else {
              onEvent(null);
            }
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'leads',
          callback: (payload) {
            final currentUser = _client.auth.currentUser;
            final newRow = payload.newRecord;
            final oldRow = payload.oldRecord;
            final newAssigned = newRow['assigned_to']?.toString();
            final oldAssigned = oldRow['assigned_to']?.toString();
            if (currentUser != null &&
                newAssigned == currentUser.id &&
                oldAssigned != currentUser.id) {
              final leadId = newRow['id']?.toString() ?? '';
              final name = newRow['name']?.toString().trim().isNotEmpty == true
                  ? newRow['name'].toString()
                  : (newRow['phone']?.toString() ?? 'Lead');
              final project = newRow['project']?.toString() ??
                  newRow['property_type']?.toString() ??
                  '';
              onEvent(
                AppNotificationModel(
                  id: 'ass-lead-$leadId-${DateTime.now().millisecondsSinceEpoch}',
                  type: 'assignment',
                  title: 'New Lead Assigned to You!',
                  body: project.isNotEmpty ? '$name • $project' : name,
                  leadId: leadId,
                  entityType: 'lead',
                  entityId: leadId,
                  createdAt: DateTime.now(),
                ),
              );
            } else {
              onEvent(null);
            }
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'activity_log',
          callback: (payload) {
            final currentUser = _client.auth.currentUser;
            final newRow = payload.newRecord;
            if (currentUser != null &&
                newRow['user_id']?.toString() == currentUser.id &&
                newRow['action_type']?.toString() == 'Lead Assigned') {
              final leadId = newRow['entity_id']?.toString() ?? '';
              final detail = newRow['detail']?.toString() ?? 'A lead was assigned to you';
              onEvent(
                AppNotificationModel(
                  id: 'ass-lead-${leadId.isNotEmpty ? leadId : newRow['id']}',
                  type: 'assignment',
                  title: 'New Lead Assigned to You!',
                  body: detail,
                  leadId: leadId.isNotEmpty ? leadId : null,
                  entityType: 'lead',
                  entityId: leadId,
                  createdAt: DateTime.now(),
                ),
              );
            } else {
              onEvent(null);
            }
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'follow_ups',
          callback: (payload) {
            final currentUser = _client.auth.currentUser;
            final newRow = payload.newRecord;
            if (currentUser != null &&
                newRow['created_by']?.toString() == currentUser.id) {
              final fId = newRow['id']?.toString() ?? '';
              final leadId = newRow['lead_id']?.toString();
              final contactName = newRow['contact_name']?.toString() ?? 'Lead';
              final dueDate = newRow['due_date']?.toString() ?? '';
              final dueTime = newRow['due_time']?.toString() ?? '';
              final title = newRow['title']?.toString() ?? 'Follow-up scheduled';
              onEvent(
                AppNotificationModel(
                  id: 'rem-$fId-$dueDate',
                  type: 'upcoming_reminder',
                  title: 'Follow-up Reminder Scheduled',
                  body: '$title • $contactName ($dueDate $dueTime)',
                  leadId: leadId,
                  entityType: leadId != null && leadId.isNotEmpty ? 'lead' : 'follow_up',
                  entityId: leadId != null && leadId.isNotEmpty ? leadId : fId,
                  createdAt: DateTime.now(),
                  dueTime: '$dueDate $dueTime',
                ),
              );
            } else {
              onEvent(null);
            }
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'follow_ups',
          callback: (_) => onEvent(null),
        )
        .subscribe();

    return channel;
  }
}
