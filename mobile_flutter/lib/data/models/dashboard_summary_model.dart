import 'follow_up_model.dart';
import 'lead_model.dart';

class DashboardTaskItem {
  final String id;
  final String title;
  final String subtitle;
  final String priority; // 'High', 'Medium', 'Low'
  final String? dueDate;
  final bool isCompleted;
  final String sourceType; // 'task' (from tasks table) or 'follow_up'
  final String? leadId;

  const DashboardTaskItem({
    required this.id,
    required this.title,
    required this.subtitle,
    this.priority = 'Medium',
    this.dueDate,
    this.isCompleted = false,
    this.sourceType = 'task',
    this.leadId,
  });

  DashboardTaskItem copyWith({bool? isCompleted}) {
    return DashboardTaskItem(
      id: id,
      title: title,
      subtitle: subtitle,
      priority: priority,
      dueDate: dueDate,
      isCompleted: isCompleted ?? this.isCompleted,
      sourceType: sourceType,
      leadId: leadId,
    );
  }
}

class LeaderboardEntryModel {
  final String userId;
  final String fullName;
  final String role;
  final bool isCurrentUser;
  final bool isOnline;
  final int rank;
  final int dialsCount;
  final int siteToursCount;
  final int leadsCount;
  final int actionsCount;
  final int score;

  const LeaderboardEntryModel({
    required this.userId,
    required this.fullName,
    this.role = 'agent',
    this.isCurrentUser = false,
    this.isOnline = false,
    this.rank = 1,
    this.dialsCount = 0,
    this.siteToursCount = 0,
    this.leadsCount = 0,
    this.actionsCount = 0,
    this.score = 0,
  });

  String get initials {
    final parts = fullName.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return 'AG';
    if (parts.length == 1) {
      return parts.first.substring(0, parts.first.length >= 2 ? 2 : 1).toUpperCase();
    }
    return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
  }
}

class DashboardSummaryModel {
  final int totalLeads;
  final int newLeadsThisMonth;
  final int wonDeals;
  final int activeFollowUps;
  final int overdueFollowUps;
  final int todayFollowUps;
  final int callsToday;
  final int callsThisMonth;
  final int scheduledVisits;
  final int completedVisits;
  final Map<String, int> statusBreakdown;
  final List<LeadModel> recentLeads;
  final List<FollowUpModel> priorityFollowUps;
  final List<DashboardTaskItem> actionTasks;
  final List<LeaderboardEntryModel> leaderboard;
  final double slaScorePct;
  final int currentUserRank;
  final int onlineUsersCount;
  final int targetCallsToday;

  const DashboardSummaryModel({
    this.totalLeads = 0,
    this.newLeadsThisMonth = 0,
    this.wonDeals = 0,
    this.activeFollowUps = 0,
    this.overdueFollowUps = 0,
    this.todayFollowUps = 0,
    this.callsToday = 0,
    this.callsThisMonth = 0,
    this.scheduledVisits = 0,
    this.completedVisits = 0,
    this.statusBreakdown = const {},
    this.recentLeads = const [],
    this.priorityFollowUps = const [],
    this.actionTasks = const [],
    this.leaderboard = const [],
    this.slaScorePct = 100.0,
    this.currentUserRank = 1,
    this.onlineUsersCount = 1,
    this.targetCallsToday = 30,
  });

  /// Next high-priority or overdue follow-up for the Hero Alert Card
  FollowUpModel? get nextPriorityFollowUp {
    if (priorityFollowUps.isEmpty) return null;
    return priorityFollowUps.first;
  }

  /// Conversion percentage
  double get conversionRate {
    if (totalLeads == 0) return 0.0;
    return (wonDeals / totalLeads) * 100;
  }
}
