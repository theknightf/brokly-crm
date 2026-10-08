import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/utils/date_utils.dart';
import '../models/dashboard_summary_model.dart';
import 'supabase_service.dart';
import 'users_service.dart';

class DashboardService {
  final SupabaseClient _client = SupabaseService().client;
  final UsersService _usersService = UsersService();

  Future<DashboardSummaryModel> getSummary() async {
    try {
      final authIds = await _usersService.getAuthorizedUserIds();

      var leadsQuery = _client.from('leads').select('crm_status, lead_status, budget_max');
      var callsQuery = _client.from('call_logs').select('id, created_at');

      if (authIds != null) {
        if (authIds.length == 1) {
          final uid = authIds.first;
          leadsQuery = leadsQuery.or('assigned_to.eq.$uid,created_by.eq.$uid');
          callsQuery = callsQuery.eq('user_id', uid);
        } else {
          final idsStr = authIds.join(',');
          leadsQuery = leadsQuery.or('assigned_to.in.($idsStr),created_by.in.($idsStr)');
          callsQuery = callsQuery.inFilter('user_id', authIds);
        }
      }

      final leadsRes = await leadsQuery;
      final callsRes = await callsQuery;

      final leads = leadsRes as List<dynamic>;
      final calls = callsRes as List<dynamic>;

      final statusCounts = <String, int>{};
      double totalPipelineValue = 0;
      int freshLeads = 0;
      int followingUp = 0;
      int meetings = 0;
      int interested = 0;
      int wonDeals = 0;

      for (final l in leads) {
        final status = (l['crm_status'] ?? l['lead_status'] ?? 'Fresh Leads').toString();
        statusCounts[status] = (statusCounts[status] ?? 0) + 1;

        final budget = (l['budget_max'] as num?)?.toDouble() ?? 0.0;
        totalPipelineValue += budget;

        switch (status) {
          case 'Fresh Leads':
          case 'New':
            freshLeads++;
            break;
          case 'Following Up':
            followingUp++;
            break;
          case 'Meeting':
          case 'Site Visit Scheduled':
            meetings++;
            break;
          case 'Interested':
          case 'Qualified':
            interested++;
            break;
          case 'Done Deal':
          case 'Won':
            wonDeals++;
            break;
        }
      }

      final todayStr = AppDateUtils.todayDateString();
      int todayCalls = 0;
      for (final c in calls) {
        final createdAt = c['created_at']?.toString();
        if (createdAt != null && createdAt.startsWith(todayStr)) {
          todayCalls++;
        }
      }

      return DashboardSummaryModel(
        totalLeads: leads.length,
        freshLeads: freshLeads,
        followingUp: followingUp,
        meetings: meetings,
        interested: interested,
        wonDeals: wonDeals,
        totalCalls: calls.length,
        todayCalls: todayCalls,
        totalPipelineValue: totalPipelineValue,
        statusCounts: statusCounts,
      );
    } catch (_) {
      return DashboardSummaryModel();
    }
  }
}
