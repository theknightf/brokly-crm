import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/dashboard_summary_model.dart';
import '../models/follow_up_model.dart';
import '../models/lead_model.dart';
import 'follow_ups_service.dart';
import 'leads_service.dart';
import 'supabase_service.dart';
import 'users_service.dart';

class DashboardService {
  final SupabaseClient _client = SupabaseService().client;
  final LeadsService _leadsService = LeadsService();
  final FollowUpsService _followUpsService = FollowUpsService();
  final UsersService _usersService = UsersService();

  /// Toggle completion of a dashboard task in Supabase
  Future<void> toggleTaskCompletion(DashboardTaskItem task, bool completed) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) return;

    if (task.sourceType == 'task') {
      try {
        if (completed) {
          await _client.from('task_completions').insert({
            'task_id': task.id,
            'user_id': userId,
          });
        } else {
          await _client
              .from('task_completions')
              .delete()
              .eq('task_id', task.id)
              .eq('user_id', userId);
        }
      } catch (_) {}
    } else if (task.sourceType == 'follow_up') {
      if (completed) {
        await _followUpsService.markComplete(task.id, leadId: task.leadId);
      } else if (!task.id.startsWith('lead-')) {
        try {
          await _client.from('follow_ups').update({
            'follow_up_status': 'Pending',
            'completed_at': null,
          }).eq('id', task.id);
        } catch (_) {}
      }
    }
  }

  /// Fetch complete synchronized dashboard metrics for the current user / role
  Future<DashboardSummaryModel> getSummary() async {
    final authIds = await _usersService.getAuthorizedUserIds();
    final currentUser = _client.auth.currentUser;
    final currentUserId = currentUser?.id ?? '';
    final profile = await _usersService.getCurrentUserProfile();
    final userRole = (profile?.role ?? 'agent').toLowerCase().trim();

    // 1. Fetch leads & follow-ups in parallel
    final results = await Future.wait([
      _leadsService.getAll(),
      _followUpsService.getAll(),
    ]);

    final leads = results[0] as List<LeadModel>;
    final allFollowUps = results[1] as List<FollowUpModel>;

    final now = DateTime.now();
    final monthStart = DateTime(now.year, now.month, 1);
    final todayStart = DateTime(now.year, now.month, now.day);

    int newLeadsThisMonth = 0;
    int wonDeals = 0;
    int actionedLeadsToday = 0;
    final Map<String, int> statusBreakdown = {};

    for (final l in leads) {
      statusBreakdown[l.status] = (statusBreakdown[l.status] ?? 0) + 1;

      if (l.status == 'Done Deal' || l.status == 'Won') {
        wonDeals++;
      }

      if (l.actionTakenToday) {
        actionedLeadsToday++;
      }

      if (l.createdAt != null) {
        try {
          final created = DateTime.parse(l.createdAt!).toLocal();
          if (!created.isBefore(monthStart)) {
            newLeadsThisMonth++;
          }
        } catch (_) {}
      }
    }

    // 2. Follow-up counts & priority items
    int overdue = 0;
    int today = 0;
    int upcoming = 0;
    int completedFollowUpsToday = 0;
    final priorityFollowUps = <FollowUpModel>[];

    for (final f in allFollowUps) {
      if (!f.isActive) {
        if (f.isDueToday) completedFollowUpsToday++;
        continue;
      }
      if (f.isOverdue) {
        overdue++;
        priorityFollowUps.add(f);
      } else if (f.isDueToday) {
        today++;
        priorityFollowUps.add(f);
      } else if (f.isUpcoming) {
        upcoming++;
      }
    }

    priorityFollowUps.sort((a, b) {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return (a.dueTime ?? '').compareTo(b.dueTime ?? '');
    });

    // 3. Call logs counts (today & this month)
    int callsToday = 0;
    int callsThisMonth = 0;
    try {
      var callQuery = _client
          .from('call_logs')
          .select('created_at, channel')
          .gte('created_at', monthStart.toUtc().toIso8601String());

      if (authIds != null) {
        if (authIds.length == 1) {
          callQuery = callQuery.eq('user_id', authIds.first);
        } else {
          callQuery = callQuery.inFilter('user_id', authIds);
        }
      }

      final callRows = await callQuery;
      final list = callRows as List<dynamic>;
      callsThisMonth = list.length;

      for (final row in list) {
        final createdAt = row['created_at'] as String?;
        if (createdAt != null) {
          final dt = DateTime.parse(createdAt).toLocal();
          if (!dt.isBefore(todayStart)) {
            callsToday++;
          }
        }
      }
    } catch (_) {}

    // 4. Site visits counts
    int scheduledVisits = 0;
    int completedVisits = 0;
    try {
      final schedRes = await _client
          .from('site_visits')
          .select('id')
          .inFilter('status', ['scheduled', 'in_progress']);
      final compRes = await _client
          .from('site_visits')
          .select('id')
          .eq('status', 'completed');

      scheduledVisits = (schedRes as List).length;
      completedVisits = (compRes as List).length;
    } catch (_) {}

    // 5. Fetch KPI Target for current user's role (from kpi_targets table)
    int targetCallsToday = 30;
    try {
      final kpiRes = await _client
          .from('kpi_targets')
          .select('*')
          .eq('is_active', true)
          .inFilter('role', [userRole, 'all', 'sales', 'agent'])
          .order('created_at', ascending: false)
          .limit(1)
          .maybeSingle();
      if (kpiRes != null) {
        final tCalls = (kpiRes['target_calls'] as num?)?.toInt() ?? 0;
        if (tCalls > 0) {
          targetCallsToday = tCalls > 100 ? (tCalls / 22).ceil() : tCalls;
        }
      }
    } catch (_) {}

    // 6. Fetch Real Assigned Tasks (from `tasks` + `task_completions` + today/overdue `follow_ups`)
    final actionTasks = <DashboardTaskItem>[];
    try {
      final tasksRes = await _client
          .from('tasks')
          .select('*')
          .eq('is_active', true)
          .order('due_date', ascending: true);

      Set<String> completedTaskIds = {};
      if (currentUserId.isNotEmpty) {
        try {
          final compRes = await _client
              .from('task_completions')
              .select('task_id')
              .eq('user_id', currentUserId);
          completedTaskIds = (compRes as List<dynamic>)
              .map((r) => r['task_id']?.toString() ?? '')
              .where((id) => id.isNotEmpty)
              .toSet();
        } catch (_) {}
      }

      for (final row in tasksRes as List<dynamic>) {
        final targetRole = (row['target_role']?.toString() ?? 'all').toLowerCase().trim();
        final isForUser = targetRole == 'all' ||
            targetRole == userRole ||
            (userRole == 'agent' && targetRole == 'sales') ||
            (userRole == 'sales' && targetRole == 'agent') ||
            userRole == 'admin' ||
            userRole == 'owner';

        if (!isForUser) continue;

        final taskId = row['id']?.toString() ?? '';
        final title = row['title']?.toString() ?? 'Assigned Task';
        final desc = row['description']?.toString() ?? '';
        final due = row['due_date']?.toString();
        final isDone = completedTaskIds.contains(taskId);

        actionTasks.add(
          DashboardTaskItem(
            id: taskId,
            title: title,
            subtitle: desc.isNotEmpty
                ? desc
                : (due != null && due.isNotEmpty ? 'Due: $due' : 'Assigned team task'),
            priority: due != null && due.compareTo(todayStart.toIso8601String().split('T').first) <= 0
                ? 'High'
                : 'Medium',
            dueDate: due,
            isCompleted: isDone,
            sourceType: 'task',
          ),
        );
      }
    } catch (_) {}

    // Also include the agent's live due/overdue follow-up tasks from the site
    for (final fu in allFollowUps.where((f) => f.isOverdue || f.isDueToday).take(6)) {
      actionTasks.add(
        DashboardTaskItem(
          id: fu.id,
          title: fu.title.isNotEmpty ? fu.title : 'Follow up with ${fu.contactName}',
          subtitle: [
            if (fu.contactPhone != null && fu.contactPhone!.isNotEmpty) fu.contactPhone!,
            if (fu.propertyInterest != null && fu.propertyInterest!.isNotEmpty) fu.propertyInterest!,
            fu.isOverdue ? 'Overdue (${fu.dueDate})' : 'Due Today (${fu.dueTime ?? "09:00"})',
          ].join(' • '),
          priority: fu.isOverdue ? 'High' : fu.priority,
          dueDate: fu.dueDate,
          isCompleted: !fu.isActive,
          sourceType: 'follow_up',
          leadId: fu.leadId,
        ),
      );
    }

    // 7. Fetch Live Leaderboard Data across active users (matching web Leaderboard & /api/admin/analytics)
    final leaderboard = <LeaderboardEntryModel>[];
    int onlineUsersCount = 0;
    int currentUserRank = 1;

    try {
      final usersRes = await _client
          .from('user_profiles')
          .select('id, full_name, email, role, is_active')
          .order('full_name', ascending: true);
      final userRows = (usersRes as List<dynamic>)
          .where((u) => u['is_active'] != false)
          .toList();

      // Fetch month call_logs, month leads, site_visits, and active user_sessions
      final monthStartIso = monthStart.toUtc().toIso8601String();
      final fiveMinAgoIso = DateTime.now().subtract(const Duration(minutes: 5)).toUtc().toIso8601String();

      List<dynamic> allMonthCalls = [];
      List<dynamic> allMonthLeads = [];
      List<dynamic> allSiteVisits = [];
      Set<String> onlineUserIds = {};

      await Future.wait([
        () async {
          try {
            final res = await _client
                .from('call_logs')
                .select('user_id, channel, outcome')
                .gte('created_at', monthStartIso);
            allMonthCalls = res as List<dynamic>;
          } catch (_) {}
        }(),
        () async {
          try {
            final res = await _client
                .from('leads')
                .select('id, assigned_to, created_by, last_action_by, crm_status')
                .gte('created_at', monthStartIso);
            allMonthLeads = res as List<dynamic>;
          } catch (_) {}
        }(),
        () async {
          try {
            final res = await _client
                .from('site_visits')
                .select('user_id, status')
                .gte('created_at', monthStartIso);
            allSiteVisits = res as List<dynamic>;
          } catch (_) {}
        }(),
        () async {
          try {
            final res = await _client
                .from('user_sessions')
                .select('user_id')
                .eq('is_active', true)
                .gte('last_heartbeat_at', fiveMinAgoIso);
            for (final s in res as List<dynamic>) {
              final uid = s['user_id']?.toString();
              if (uid != null) onlineUserIds.add(uid);
            }
          } catch (_) {}
        }(),
      ]);

      if (currentUserId.isNotEmpty) {
        onlineUserIds.add(currentUserId);
      }
      onlineUsersCount = onlineUserIds.length;

      final entries = <LeaderboardEntryModel>[];
      for (final u in userRows) {
        final uid = u['id']?.toString() ?? '';
        if (uid.isEmpty) continue;

        final rawName = u['full_name']?.toString().trim() ?? '';
        final email = u['email']?.toString().trim() ?? '';
        final name = rawName.isNotEmpty
            ? rawName
            : (email.isNotEmpty ? email.split('@').first : 'Agent');
        final role = u['role']?.toString() ?? 'agent';

        int uDials = 0;
        int uTours = 0;
        for (final c in allMonthCalls) {
          if (c['user_id']?.toString() == uid) {
            uDials++;
            final ch = c['channel']?.toString() ?? '';
            final out = c['outcome']?.toString() ?? '';
            if (ch == 'Site Visit' ||
                ch == 'Meeting' ||
                out == 'Site Visit' ||
                out == 'Schedule Meeting' ||
                out == 'Meeting') {
              uTours++;
            }
          }
        }

        for (final sv in allSiteVisits) {
          if (sv['user_id']?.toString() == uid) {
            uTours++;
          }
        }

        int uLeads = 0;
        int uActions = 0;
        for (final l in allMonthLeads) {
          if (l['assigned_to']?.toString() == uid || l['created_by']?.toString() == uid) {
            uLeads++;
          }
          if (l['last_action_by']?.toString() == uid) {
            uActions++;
          }
        }

        final score = (uLeads * 40) + (uDials * 15) + (uTours * 25) + (uActions * 2);

        entries.add(
          LeaderboardEntryModel(
            userId: uid,
            fullName: name,
            role: role,
            isCurrentUser: uid == currentUserId,
            isOnline: onlineUserIds.contains(uid),
            dialsCount: uDials,
            siteToursCount: uTours,
            leadsCount: uLeads,
            actionsCount: uActions,
            score: score,
          ),
        );
      }

      entries.sort((a, b) {
        final cmp = b.score.compareTo(a.score);
        if (cmp != 0) return cmp;
        return b.dialsCount.compareTo(a.dialsCount);
      });

      for (int i = 0; i < entries.length; i++) {
        final e = entries[i];
        final rank = i + 1;
        if (e.isCurrentUser) {
          currentUserRank = rank;
        }
        leaderboard.add(
          LeaderboardEntryModel(
            userId: e.userId,
            fullName: e.fullName,
            role: e.role,
            isCurrentUser: e.isCurrentUser,
            isOnline: e.isOnline,
            rank: rank,
            dialsCount: e.dialsCount,
            siteToursCount: e.siteToursCount,
            leadsCount: e.leadsCount,
            actionsCount: e.actionsCount,
            score: e.score,
          ),
        );
      }
    } catch (_) {}

    // If RLS restricts user_profiles to current user only, ensure current user is on leaderboard
    if (leaderboard.isEmpty && currentUserId.isNotEmpty) {
      leaderboard.add(
        LeaderboardEntryModel(
          userId: currentUserId,
          fullName: profile?.fullName.isNotEmpty == true ? profile!.fullName : 'Agent',
          role: userRole,
          isCurrentUser: true,
          isOnline: true,
          rank: 1,
          dialsCount: callsThisMonth,
          siteToursCount: scheduledVisits + completedVisits,
          leadsCount: leads.length,
          actionsCount: actionedLeadsToday,
          score: (leads.length * 40) + (callsThisMonth * 15),
        ),
      );
    }

    // 8. Compute Real SLA Score %
    final totalDueItems = overdue + today + completedFollowUpsToday + actionedLeadsToday;
    final handledItems = completedFollowUpsToday + actionedLeadsToday + callsToday;
    final double slaScorePct = totalDueItems == 0
        ? 100.0
        : ((handledItems / (totalDueItems + (overdue > 0 ? overdue : 0))) * 100.0).clamp(0.0, 100.0);

    return DashboardSummaryModel(
      totalLeads: leads.length,
      newLeadsThisMonth: newLeadsThisMonth,
      wonDeals: wonDeals,
      activeFollowUps: overdue + today + upcoming,
      overdueFollowUps: overdue,
      todayFollowUps: today,
      callsToday: callsToday,
      callsThisMonth: callsThisMonth,
      scheduledVisits: scheduledVisits,
      completedVisits: completedVisits,
      statusBreakdown: statusBreakdown,
      recentLeads: leads.take(5).toList(),
      priorityFollowUps: priorityFollowUps.take(5).toList(),
      actionTasks: actionTasks,
      leaderboard: leaderboard,
      slaScorePct: slaScorePct,
      currentUserRank: currentUserRank,
      onlineUsersCount: onlineUsersCount > 0 ? onlineUsersCount : 1,
      targetCallsToday: targetCallsToday,
    );
  }
}
