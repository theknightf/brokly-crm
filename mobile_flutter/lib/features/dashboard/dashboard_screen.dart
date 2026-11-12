import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/whatsapp_utils.dart';
import '../../data/models/dashboard_summary_model.dart';
import '../../data/models/follow_up_model.dart';
import '../../data/models/lead_model.dart';
import '../../data/services/dashboard_service.dart';
import '../../data/services/follow_ups_service.dart';
import '../../state/leads_provider.dart';
import '../calculator/unit_calculator_screen.dart';
import '../leads/add_lead_screen.dart';
import '../leads/lead_detail_screen.dart';
import '../leads/widgets/log_call_dialog.dart';
import 'widgets/activity_card.dart';
import 'widgets/dashboard_header.dart';
import 'widgets/kpi_grid.dart';
import 'widgets/leaderboard_card.dart';
import 'widgets/leads_by_stage_section.dart';
import 'widgets/pipeline_overview.dart';
import 'widgets/priority_followup_card.dart';
import 'widgets/quick_tools.dart';
import 'widgets/tasks_card.dart';

class DashboardScreen extends StatefulWidget {
  final ValueChanged<int>? onNavigateTab;

  const DashboardScreen({super.key, this.onNavigateTab});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final DashboardService _dashboardService = DashboardService();
  final FollowUpsService _followUpsService = FollowUpsService();

  DashboardSummaryModel _summary = const DashboardSummaryModel();
  bool _loaded = false;
  bool _failed = false;
  List<DashboardTaskItem> _tasks = [];

  static const double _gap = 16;

  @override
  void initState() {
    super.initState();
    _loadDashboard();
  }

  Future<void> _loadDashboard() async {
    if (mounted) {
      context.read<LeadsProvider>().fetchLeads(silent: true);
    }
    try {
      final data = await _dashboardService.getSummary();
      if (!mounted) return;
      setState(() {
        _summary = data;
        _tasks = List<DashboardTaskItem>.from(data.actionTasks);
        _loaded = true;
        _failed = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loaded = true;
        _failed = true;
      });
    }
  }

  Future<void> _callFollowUpOrLead({
    required String? phone,
    LeadModel? lead,
    FollowUpModel? followUp,
  }) async {
    if (phone == null || phone.trim().isEmpty) return;
    final targetLead = lead ??
        (followUp != null
            ? LeadModel(
                id: followUp.leadId ?? '',
                name: followUp.contactName,
                phone: phone,
                project: followUp.propertyInterest,
                priority: followUp.priority,
              )
            : null);

    if (targetLead != null && targetLead.id.isNotEmpty) {
      await LogCallDialog.dialAndTrack(
        context,
        lead: targetLead,
        onCompleted: _loadDashboard,
      );
    } else {
      final uri = Uri.parse('tel:${phone.replaceAll(RegExp(r'\s+'), '')}');
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri);
      }
    }
  }

  Future<void> _openWhatsAppForLead({
    required String? phone,
    LeadModel? lead,
    FollowUpModel? followUp,
  }) async {
    if (phone == null || phone.trim().isEmpty) return;
    final launched = await WhatsAppUtils.openWhatsAppChat(
      context,
      phone: phone,
    );
    if (launched && mounted) {
      final targetLead = lead ??
          (followUp != null &&
                  followUp.leadId != null &&
                  followUp.leadId!.isNotEmpty
              ? LeadModel(
                  id: followUp.leadId!,
                  name: followUp.contactName,
                  phone: phone,
                  project: followUp.propertyInterest,
                )
              : null);
      if (targetLead != null) {
        await LogCallDialog.show(
          context,
          lead: targetLead,
          initialChannel: 'WhatsApp',
        );
        _loadDashboard();
      }
    }
  }

  Future<void> _toggleTaskItem(int index) async {
    if (index < 0 || index >= _tasks.length) return;
    final current = _tasks[index];
    final nextState = !current.isCompleted;

    setState(() {
      _tasks[index] = current.copyWith(isCompleted: nextState);
    });

    await _dashboardService.toggleTaskCompletion(current, nextState);
    if (mounted) {
      context.read<LeadsProvider>().fetchLeads(silent: true);
    }
  }

  void _openLead(String leadId) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => LeadDetailScreen(leadId: leadId)),
    ).then((_) => _loadDashboard());
  }

  void _openUnitCalculator() {
    if (widget.onNavigateTab != null) {
      widget.onNavigateTab!(7);
    } else {
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const UnitCalculatorScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final leadsCount =
        context.select<LeadsProvider, int>((p) => p.allLeads.length);
    final s = _summary;

    return RefreshIndicator(
      onRefresh: _loadDashboard,
      color: AppColors.neonLime,
      child: (!_loaded && leadsCount == 0)
          ? const DashboardSkeleton()
          : ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 36),
              children: [
                DashboardHeader(
                  onAttendanceTap: () => widget.onNavigateTab?.call(2),
                ),
                const SizedBox(height: 18),
                if (_failed && leadsCount == 0) ...[
                  DashboardError(onRetry: _loadDashboard),
                  const SizedBox(height: _gap),
                ],
                KpiGrid(
                  totalLeads: leadsCount > 0 ? leadsCount : s.totalLeads,
                  newLeadsThisMonth: s.newLeadsThisMonth,
                  activeFollowUps: s.activeFollowUps,
                  overdueFollowUps: s.overdueFollowUps,
                  siteVisits: s.scheduledVisits + s.completedVisits,
                  scheduledVisits: s.scheduledVisits,
                  wonDeals: s.wonDeals,
                  conversionRate: s.conversionRate,
                  onNavigateTab: widget.onNavigateTab,
                ),
                const SizedBox(height: _gap),
                if (s.nextPriorityFollowUp != null) ...[
                  PriorityFollowUpCard(
                    followUp: s.nextPriorityFollowUp!,
                    onCall: () => _callFollowUpOrLead(
                      phone: s.nextPriorityFollowUp!.contactPhone,
                      followUp: s.nextPriorityFollowUp,
                    ),
                    onWhatsApp: () => _openWhatsAppForLead(
                      phone: s.nextPriorityFollowUp!.contactPhone,
                      followUp: s.nextPriorityFollowUp,
                    ),
                    onDone: () async {
                      final f = s.nextPriorityFollowUp!;
                      await _followUpsService.markComplete(
                        f.id,
                        leadId: f.leadId,
                      );
                      _loadDashboard();
                    },
                  ),
                  const SizedBox(height: _gap),
                ],
                const PipelineOverview(),
                const SizedBox(height: _gap),
                LeadsByStageSection(
                  onCall: (l) => _callFollowUpOrLead(phone: l.phone, lead: l),
                  onWhatsApp: (l) =>
                      _openWhatsAppForLead(phone: l.phone, lead: l),
                  onOpen: (l) => _openLead(l.id),
                  onAdvance: (l, next) async {
                    await context
                        .read<LeadsProvider>()
                        .updateStatus(l.id, next);
                    await _loadDashboard();
                  },
                  onViewAllLeads: () => widget.onNavigateTab?.call(1),
                ),
                const SizedBox(height: _gap),
                TasksCard(
                  tasks: _tasks,
                  onToggle: _toggleTaskItem,
                  onOpenLead: _openLead,
                ),
                const SizedBox(height: _gap),
                ActivityCard(
                  callsToday: s.callsToday,
                  targetCalls: s.targetCallsToday,
                  callsThisMonth: s.callsThisMonth,
                  slaScorePct: s.slaScorePct,
                  overdueFollowUps: s.overdueFollowUps,
                  rank: s.currentUserRank,
                  online: s.onlineUsersCount,
                ),
                const SizedBox(height: _gap),
                LeaderboardCard(entries: s.leaderboard),
                const SizedBox(height: 8),
                QuickTools(
                  onAddLead: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const AddLeadScreen()),
                    ).then((_) => _loadDashboard());
                  },
                  onCalculator: _openUnitCalculator,
                  onFollowUps: () => widget.onNavigateTab?.call(3),
                  onCallLogs: () => widget.onNavigateTab?.call(4),
                ),
              ],
            ),
    );
  }
}
