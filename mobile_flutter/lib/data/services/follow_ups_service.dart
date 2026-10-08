import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/follow_up_model.dart';
import 'supabase_service.dart';
import 'users_service.dart';

class FollowUpsService {
  final SupabaseClient _client = SupabaseService().client;
  final UsersService _usersService = UsersService();

  /// Fetch all follow-ups with strict role-based data isolation
  Future<List<FollowUpModel>> getAll() async {
    final authIds = await _usersService.getAuthorizedUserIds();
    final currentUserId = _client.auth.currentUser?.id;

    try {
      var query = _client.from('follow_ups').select('*');

      if (authIds != null) {
        if (authIds.length == 1) {
          final uid = authIds.first;
          // Get IDs of leads belonging to user
          List<String> leadIds = [];
          try {
            final leadsRes = await _client
                .from('leads')
                .select('id')
                .or('assigned_to.eq.$uid,created_by.eq.$uid');
            leadIds = (leadsRes as List<dynamic>)
                .map((e) => e['id']?.toString())
                .whereType<String>()
                .toList();
          } catch (_) {}

          if (leadIds.isNotEmpty) {
            query = query.or('created_by.eq.$uid,lead_id.in.(${leadIds.join(',')})');
          } else {
            query = query.eq('created_by', uid);
          }
        } else {
          // Team Leader
          final idsStr = authIds.join(',');
          List<String> leadIds = [];
          try {
            final leadsRes = await _client
                .from('leads')
                .select('id')
                .or('assigned_to.in.($idsStr),created_by.in.($idsStr)');
            leadIds = (leadsRes as List<dynamic>)
                .map((e) => e['id']?.toString())
                .whereType<String>()
                .toList();
          } catch (_) {}

          if (leadIds.isNotEmpty) {
            query = query.or('created_by.in.($idsStr),lead_id.in.(${leadIds.join(',')})');
          } else {
            query = query.inFilter('created_by', authIds);
          }
        }
      }

      final res = await query.order('due_date', ascending: true).limit(500);
      final list = res as List<dynamic>;
      final followUps = list.map((e) => FollowUpModel.fromJson(e as Map<String, dynamic>)).toList();

      // If follow_ups table is empty or missing rows for leads with follow_up_due, reconcile from leads
      final existingLeadIds = followUps.map((f) => f.leadId).whereType<String>().toSet();
      try {
        var leadsQuery = _client.from('leads').select('*').not('follow_up_due', 'is', null);
        if (authIds != null) {
          if (authIds.length == 1) {
            leadsQuery = leadsQuery.or('assigned_to.eq.${authIds.first},created_by.eq.${authIds.first}');
          } else {
            final idsStr = authIds.join(',');
            leadsQuery = leadsQuery.or('assigned_to.in.($idsStr),created_by.in.($idsStr)');
          }
        }
        final leadsRes = await leadsQuery.limit(200);
        for (final l in leadsRes as List<dynamic>) {
          final leadId = l['id']?.toString();
          final due = l['follow_up_due']?.toString();
          final crmStatus = (l['crm_status'] ?? l['lead_status'] ?? '').toString();
          final isTerminal = [
            'done deal',
            'not interested',
            'cancellation',
            'duplicate leads',
            'wrong number',
            'closed number',
            'low budget',
            'won',
            'lost'
          ].contains(crmStatus.toLowerCase());

          if (leadId != null && due != null && !isTerminal && !existingLeadIds.contains(leadId)) {
            followUps.add(
              FollowUpModel(
                id: 'lead-$leadId',
                leadId: leadId,
                title: 'Follow up: ${l['name'] ?? ''}',
                contactName: l['name']?.toString() ?? 'Lead',
                contactPhone: l['phone']?.toString(),
                contactEmail: l['email']?.toString(),
                propertyInterest: l['property_type']?.toString() ?? l['project']?.toString(),
                dueDate: due,
                dueTime: '09:00',
                status: 'Pending',
                priority: l['priority']?.toString() ?? 'Medium',
                agent: l['agent']?.toString(),
                agentInitials: l['agent_initials']?.toString(),
                notes: l['notes']?.toString(),
                createdBy: l['assigned_to']?.toString() ?? l['created_by']?.toString() ?? currentUserId,
              ),
            );
          }
        }
      } catch (_) {}

      // Sort by dueDate then dueTime
      followUps.sort((a, b) {
        final cmp = a.dueDate.compareTo(b.dueDate);
        if (cmp != 0) return cmp;
        return (a.dueTime ?? '').compareTo(b.dueTime ?? '');
      });

      return followUps;
    } catch (_) {
      return [];
    }
  }

  /// Get overdue active follow-ups
  Future<List<FollowUpModel>> getOverdue({int limit = 10}) async {
    final all = await getAll();
    return all.where((f) => f.isActive && f.isOverdue).take(limit).toList();
  }

  /// Get active follow-ups due today
  Future<List<FollowUpModel>> getToday({int limit = 10}) async {
    final all = await getAll();
    return all.where((f) => f.isActive && f.isDueToday).take(limit).toList();
  }

  /// Get active follow-ups due upcoming
  Future<List<FollowUpModel>> getUpcoming({int limit = 10}) async {
    final all = await getAll();
    return all.where((f) => f.isActive && f.isUpcoming).take(limit).toList();
  }

  /// Get today and overdue active follow-ups for home dashboard
  Future<List<FollowUpModel>> getTodayAndOverdue({int limit = 10}) async {
    final all = await getAll();
    final active = all.where((f) => f.isActive && (f.isDueToday || f.isOverdue)).toList();
    // Overdue first, then today
    active.sort((a, b) {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return (a.dueTime ?? '').compareTo(b.dueTime ?? '');
    });
    return active.take(limit).toList();
  }

  /// Get dashboard counts
  Future<Map<String, int>> getCounts() async {
    final all = await getAll();
    int overdue = 0;
    int today = 0;
    int upcoming = 0;

    for (final f in all) {
      if (!f.isActive) continue;
      if (f.isOverdue) {
        overdue++;
      } else if (f.isDueToday) {
        today++;
      } else if (f.isUpcoming) {
        upcoming++;
      }
    }

    return {
      'overdue': overdue,
      'today': today,
      'upcoming': upcoming,
      'total': overdue + today + upcoming,
    };
  }

  /// Mark follow-up as completed
  Future<void> markComplete(String id, {String? leadId}) async {
    final now = DateTime.now().toUtc().toIso8601String();
    if (!id.startsWith('lead-')) {
      try {
        await _client.from('follow_ups').update({
          'follow_up_status': 'Completed',
          'completed_at': now,
        }).eq('id', id);
      } catch (_) {}
    }

    // Also update lead's action taken if linked
    final targetLeadId = leadId ?? (id.startsWith('lead-') ? id.replaceFirst('lead-', '') : null);
    if (targetLeadId != null) {
      try {
        await _client.from('leads').update({
          'last_action_at': now,
        }).eq('id', targetLeadId);
      } catch (_) {}
    }
  }

  /// Create a new follow-up
  Future<FollowUpModel> create(FollowUpModel followUp) async {
    final user = _client.auth.currentUser;
    final row = followUp.toJson(currentUserId: user?.id);

    final res = await _client.from('follow_ups').insert(row).select().single();
    return FollowUpModel.fromJson(res);
  }
}
