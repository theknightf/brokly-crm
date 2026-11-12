import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/follow_up_model.dart';
import 'follow_ups_service.dart';
import 'supabase_service.dart';

enum WorkspaceDate { any, late, today, tomorrow, custom }

enum WorkspaceStatus { any, notCompleted, completed }

/// Filter state of the Workspace follow-up list (same shape as the web one).
class WorkspaceFilters {
  final String agent;
  final WorkspaceStatus status;
  final String priority; // '' = any
  final WorkspaceDate date;
  final String from; // yyyy-MM-dd
  final String to;

  const WorkspaceFilters({
    this.agent = '',
    this.status = WorkspaceStatus.any,
    this.priority = '',
    this.date = WorkspaceDate.any,
    this.from = '',
    this.to = '',
  });

  WorkspaceFilters copyWith({
    String? agent,
    WorkspaceStatus? status,
    String? priority,
    WorkspaceDate? date,
    String? from,
    String? to,
  }) =>
      WorkspaceFilters(
        agent: agent ?? this.agent,
        status: status ?? this.status,
        priority: priority ?? this.priority,
        date: date ?? this.date,
        from: from ?? this.from,
        to: to ?? this.to,
      );

  static const all = WorkspaceFilters();
  static const today = WorkspaceFilters(status: WorkspaceStatus.notCompleted, date: WorkspaceDate.today);
  static const late = WorkspaceFilters(status: WorkspaceStatus.notCompleted, date: WorkspaceDate.late);
  static const tomorrow = WorkspaceFilters(status: WorkspaceStatus.notCompleted, date: WorkspaceDate.tomorrow);
  static const uncompleted = WorkspaceFilters(status: WorkspaceStatus.notCompleted);
}

/// Workspace = the follow-up work list. Reads reuse [FollowUpsService.getAll]
/// (which already applies the app's role isolation: admins see everything, team
/// leaders their team, agents their own) and filters client-side exactly like
/// the web screen.
class WorkspaceService {
  final SupabaseClient _client = SupabaseService().client;
  final FollowUpsService _followUps = FollowUpsService();

  static String dateStr(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<List<FollowUpModel>> fetchAll() => _followUps.getAll();

  static List<FollowUpModel> apply(List<FollowUpModel> all, WorkspaceFilters f, {DateTime? now}) {
    final n = now ?? DateTime.now();
    final today = dateStr(n);
    final tomorrow = dateStr(n.add(const Duration(days: 1)));
    var list = all;
    if (f.status == WorkspaceStatus.notCompleted) {
      list = list.where((x) => x.isActive).toList();
    } else if (f.status == WorkspaceStatus.completed) {
      list = list.where((x) => x.isCompleted).toList();
    }
    if (f.priority.isNotEmpty) list = list.where((x) => x.priority == f.priority).toList();
    if (f.agent.isNotEmpty) list = list.where((x) => (x.agent ?? '') == f.agent).toList();
    switch (f.date) {
      case WorkspaceDate.late:
        list = list.where((x) => x.dueDate.compareTo(today) < 0).toList();
      case WorkspaceDate.today:
        list = list.where((x) => x.dueDate == today).toList();
      case WorkspaceDate.tomorrow:
        list = list.where((x) => x.dueDate == tomorrow).toList();
      case WorkspaceDate.custom:
        if (f.from.isNotEmpty) list = list.where((x) => x.dueDate.compareTo(f.from) >= 0).toList();
        if (f.to.isNotEmpty) list = list.where((x) => x.dueDate.compareTo(f.to) <= 0).toList();
      case WorkspaceDate.any:
        break;
    }
    final sorted = [...list]..sort((a, b) {
        final c = a.dueDate.compareTo(b.dueDate);
        return c != 0 ? c : (a.dueTime ?? '').compareTo(b.dueTime ?? '');
      });
    return sorted;
  }

  static List<String> agentsOf(List<FollowUpModel> all) {
    final s = all.map((x) => (x.agent ?? '').trim()).where((a) => a.isNotEmpty).toSet().toList()..sort();
    return s;
  }

  /// Toggle done / pending. Synthetic `lead-…` rows (follow-ups derived from a
  /// lead's follow_up_due) can only be completed, via the existing service.
  Future<void> setDone(FollowUpModel item, bool done) async {
    if (item.id.startsWith('lead-')) {
      if (done) await _followUps.markComplete(item.id, leadId: item.leadId);
      return;
    }
    await _client.from('follow_ups').update({
      'follow_up_status': done ? 'Completed' : 'Pending',
      'completed_at': done ? DateTime.now().toUtc().toIso8601String() : null,
    }).eq('id', item.id);
  }
}
