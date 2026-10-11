import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/app_notification_model.dart';
import 'supabase_service.dart';

class NotificationsService {
  final SupabaseClient _client = SupabaseService().client;

  /// Fetch all relevant notifications for the currently signed-in user:
  /// 1) Newly assigned leads (last 7 days)
  /// 2) Overdue & upcoming scheduled follow-ups (from follow_ups and leads.follow_up_due)
  /// 3) System / deduction alerts from notifications table
  Future<List<AppNotificationModel>> fetchNotifications({
    Set<String> readIds = const {},
  }) async {
    final user = _client.auth.currentUser;
    if (user == null) return [];

    final List<AppNotificationModel> items = [];
    final now = DateTime.now();
    final todayStr = DateFormat('yyyy-MM-dd').format(now);
    final tomorrowStr = DateFormat('yyyy-MM-dd').format(now.add(const Duration(days: 1)));
    final sevenDaysAgoIso = now.subtract(const Duration(days: 7)).toUtc().toIso8601String();

    String userFullName = '';
    try {
      final profile = await _client
          .from('user_profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();
      userFullName = profile?['full_name']?.toString() ?? '';
    } catch (_) {}

    // Keep a map of user's leads by phone/name so follow-ups without lead_id still resolve to a leadId
    final Map<String, String> phoneToLeadId = {};
    final Map<String, String> nameToLeadId = {};
    final Set<String> followUpCoveredLeadIds = {};

    // 1) Assigned Leads
    try {
      final assignedRes = await _client
          .from('leads')
          .select(
              'id, name, phone, crm_status, lead_status, project_interested, follow_up_due, updated_at, created_at, assigned_to')
          .eq('assigned_to', user.id)
          .order('updated_at', ascending: false)
          .limit(60);

      for (final raw in (assignedRes as List<dynamic>)) {
        final row = raw as Map<String, dynamic>;
        final leadId = row['id']?.toString() ?? '';
        if (leadId.isEmpty) continue;
        final leadName = row['name']?.toString() ?? 'Lead';
        final phone = (row['phone']?.toString() ?? '').replaceAll(RegExp(r'\D'), '');
        if (phone.length >= 8) {
          phoneToLeadId[phone.substring(phone.length - 8)] = leadId;
        }
        if (leadName.trim().isNotEmpty) {
          nameToLeadId[leadName.trim().toLowerCase()] = leadId;
        }

        final updatedStr =
            row['updated_at']?.toString() ?? row['created_at']?.toString() ?? now.toIso8601String();
        if (updatedStr.compareTo(sevenDaysAgoIso) >= 0) {
          final createdAt = DateTime.tryParse(updatedStr)?.toLocal() ?? now;
          final project = row['project_interested']?.toString();
          final status = row['crm_status']?.toString() ?? row['lead_status']?.toString() ?? 'Fresh Lead';
          final notifId = 'ass-lead-$leadId';

          items.add(
            AppNotificationModel(
              id: notifId,
              type: 'assignment',
              title: 'New Lead Assigned to You',
              body: project != null && project.isNotEmpty
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

      // 2) Follow-up reminders from follow_ups table
      try {
        final fRes = await _client
            .from('follow_ups')
            .select(
                'id, lead_id, title, contact_name, contact_phone, due_date, due_time, follow_up_status, agent, created_by')
            .lte('due_date', tomorrowStr)
            .not('follow_up_status', 'in', '("Completed","Cancelled")')
            .order('due_date', ascending: true)
            .limit(100);

        for (final raw in (fRes as List<dynamic>)) {
          final f = raw as Map<String, dynamic>;
          final createdBy = f['created_by']?.toString() ?? '';
          final agentName = f['agent']?.toString() ?? '';
          final isMine = createdBy == user.id ||
              (userFullName.isNotEmpty &&
                  agentName.toLowerCase().trim() == userFullName.toLowerCase().trim());
          if (!isMine) continue;

          final fId = f['id']?.toString() ?? '';
          final dueDate = f['due_date']?.toString() ?? '';
          if (fId.isEmpty || dueDate.isEmpty) continue;

          final isOverdue = dueDate.compareTo(todayStr) < 0;
          final isToday = dueDate == todayStr;
          final isTomorrow = dueDate == tomorrowStr;
          if (!isOverdue && !isToday && !isTomorrow) continue;

          // Resolve leadId directly or via phone/name lookup
          String? resolvedLeadId = f['lead_id']?.toString();
          if (resolvedLeadId == null || resolvedLeadId.isEmpty) {
            final fPhone = (f['contact_phone']?.toString() ?? '').replaceAll(RegExp(r'\D'), '');
            if (fPhone.length >= 8) {
              resolvedLeadId = phoneToLeadId[fPhone.substring(fPhone.length - 8)];
            }
          }
          if (resolvedLeadId == null || resolvedLeadId.isEmpty) {
            final cName = (f['contact_name']?.toString() ?? '').trim().toLowerCase();
            if (cName.isNotEmpty) {
              resolvedLeadId = nameToLeadId[cName];
            }
          }

          if (resolvedLeadId != null && resolvedLeadId.isNotEmpty) {
            followUpCoveredLeadIds.add(resolvedLeadId);
          }

          final dueTime = f['due_time']?.toString() ?? '10:00';
          final contactName = f['contact_name']?.toString() ?? 'Lead';
          final titleText = f['title']?.toString() ?? 'Follow up with $contactName';
          final notifId = 'rem-$fId-$dueDate';

          final dueDateTime = DateTime.tryParse('${dueDate}T$dueTime') ??
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
                  : (isToday ? 'Upcoming Follow-up Today ($dueTime)' : 'Follow-up Tomorrow ($dueTime)'),
              body: '$titleText • $contactName',
              leadId: resolvedLeadId,
              entityType: 'follow_up',
              entityId: fId,
              createdAt: treatAsOverdue ? now : dueDateTime,
              dueTime: '$dueDate $dueTime',
              isRead: readIds.contains(notifId),
            ),
          );
        }
      } catch (_) {}

      // 3) Also check leads.follow_up_due for assigned leads not already covered in follow_ups table
      for (final raw in (assignedRes as List<dynamic>)) {
        final row = raw as Map<String, dynamic>;
        final leadId = row['id']?.toString() ?? '';
        if (leadId.isEmpty || followUpCoveredLeadIds.contains(leadId)) continue;

        final followUpDue = row['follow_up_due']?.toString() ?? '';
        if (followUpDue.isEmpty) continue;

        final status = (row['crm_status']?.toString() ?? row['lead_status']?.toString() ?? '')
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
        if (!isOverdue && !isToday) continue;

        final leadName = row['name']?.toString() ?? 'Lead';
        final project = row['project_interested']?.toString() ?? '';
        final notifId = 'lead-rem-$leadId-$datePart';

        items.add(
          AppNotificationModel(
            id: notifId,
            type: isOverdue ? 'overdue_reminder' : 'upcoming_reminder',
            title: isOverdue ? 'Overdue Lead Follow-up' : 'Follow-up Due Today',
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

    // 4) Deduction / system alerts from notifications table
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
        final amount = (n['amount'] as num?)?.toDouble();
        final reason = n['reason']?.toString() ?? n['message']?.toString() ?? '';
        final createdAt =
            DateTime.tryParse(n['created_at']?.toString() ?? '')?.toLocal() ?? now;

        items.add(
          AppNotificationModel(
            id: notifId,
            type: 'deduction',
            title: n['title']?.toString() ?? 'System Alert',
            body: amount != null && amount > 0 ? '$reason • $amount EGP' : reason,
            entityType: 'deduction',
            entityId: nId,
            createdAt: createdAt,
            amount: amount,
            isRead: (n['is_read'] == true) || readIds.contains(notifId),
          ),
        );
      }
    } catch (_) {}

    // Sort: overdue & unread assignments first, then by createdAt descending
    items.sort((a, b) {
      if (a.isRead != b.isRead) {
        return a.isRead ? 1 : -1;
      }
      return b.createdAt.compareTo(a.createdAt);
    });

    return items;
  }

  /// Subscribe to realtime lead assignments and follow-up reminders
  RealtimeChannel subscribeToRealtimeAlerts({
    required void Function(AppNotificationModel? immediateAlert) onEvent,
  }) {
    final user = _client.auth.currentUser;
    final channel = _client.channel('mobile-notifications-realtime');

    channel
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'leads',
          callback: (payload) {
            final newRow = payload.newRecord;
            if (user != null && newRow['assigned_to']?.toString() == user.id) {
              final leadId = newRow['id']?.toString() ?? '';
              final name = newRow['name']?.toString() ?? 'New Lead';
              final project = newRow['project_interested']?.toString() ?? '';
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
            final newRow = payload.newRecord;
            final oldRow = payload.oldRecord;
            final newAssigned = newRow['assigned_to']?.toString();
            final oldAssigned = oldRow['assigned_to']?.toString();
            if (user != null && newAssigned == user.id && oldAssigned != user.id) {
              final leadId = newRow['id']?.toString() ?? '';
              final name = newRow['name']?.toString() ?? 'Lead';
              final project = newRow['project_interested']?.toString() ?? '';
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
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'follow_ups',
          callback: (_) => onEvent(null),
        )
        .subscribe();

    return channel;
  }
}
