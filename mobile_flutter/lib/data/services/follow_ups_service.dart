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
      final List<FollowUpModel> followUps = [];
      final seen = <String>{};
      void addRows(dynamic res) {
        for (final e in res as List<dynamic>) {
          final row = e as Map<String, dynamic>;
          final id = row['id']?.toString();
          if (id == null || !seen.add(id)) continue;
          followUps.add(FollowUpModel.fromJson(row));
        }
      }

      // A follow-up is live only while its lead still carries that date (the website uses the same rule).
      final liveLeads = <String, Map<String, String>>{};
      void rememberLeads(dynamic res) {
        for (final e in res as List<dynamic>) {
          final id = e['id']?.toString();
          if (id == null) continue;
          liveLeads[id] = {
            'due': (e['follow_up_due']?.toString() ?? '').split('T').first,
            'status': (e['crm_status']?.toString() ?? '').toLowerCase().trim(),
          };
        }
      }

      if (authIds == null) {
        addRows(await _client.from('follow_ups').select('*').order('due_date', ascending: true));
        try {
          rememberLeads(await _client.from('leads').select('id, follow_up_due, crm_status').not('follow_up_due', 'is', null).limit(5000));
        } catch (_) {}
      } else {
        // Rows created by the user (or their team), plus rows of their leads. The lead ids go in small batches:
        // one `lead_id IN (...)` with hundreds of ids made the request URL too long, so agents with many leads
        // (400+) got an empty list. Only leads that carry a follow-up date can have a live follow-up.
        addRows(await _client
            .from('follow_ups')
            .select('*')
            .inFilter('created_by', authIds)
            .order('due_date', ascending: true));

        final idsStr = authIds.join(',');
        List<String> leadIds = [];
        try {
          final leadsRes = await _client
              .from('leads')
              .select('id, follow_up_due, crm_status')
              .or('assigned_to.in.($idsStr),created_by.in.($idsStr)')
              .not('follow_up_due', 'is', null)
              .limit(5000);
          rememberLeads(leadsRes);
          leadIds = (leadsRes as List<dynamic>)
              .map((e) => e['id']?.toString())
              .whereType<String>()
              .toList();
        } catch (_) {}

        for (var i = 0; i < leadIds.length; i += 80) {
          final chunk = leadIds.sublist(i, i + 80 > leadIds.length ? leadIds.length : i + 80);
          try {
            addRows(await _client
                .from('follow_ups')
                .select('*')
                .inFilter('lead_id', chunk)
                .order('due_date', ascending: true));
          } catch (_) {}
        }
      }

      // Drop stale rows: a pending follow-up of a lead that no longer has that date (the agent already worked it),
      // or whose lead moved to a closed stage. One live row per lead. Counts then match the website and the leads list.
      const closedStages = {
        'done deal',
        'won',
        'lost',
        'cancellation',
        'not interested',
        'duplicate leads',
        'wrong number',
        'closed number',
        'low budget',
      };
      final liveSeen = <String>{};
      followUps.removeWhere((f) {
        final lid = f.leadId;
        if (!f.isActive || lid == null) return false;
        final lead = liveLeads[lid];
        if (lead == null) return true;
        final rowDue = f.dueDate.split('T').first;
        if (lead['due'] != rowDue) return true;
        if (closedStages.contains(lead['status'])) return true;
        return !liveSeen.add(lid);
      });

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
        final leadsRes = await leadsQuery;
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
        // Clear the lead's follow-up date too: it is the source of truth, and the database would otherwise
        // re-open the follow-up the next time the lead is edited.
        await _client.from('leads').update({
          'last_action_at': now,
          'follow_up_due': null,
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
