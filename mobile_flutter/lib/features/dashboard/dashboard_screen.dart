import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/constants/lead_stages.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/date_utils.dart';
import '../../core/utils/whatsapp_utils.dart';
import '../../data/models/dashboard_summary_model.dart';
import '../../data/models/follow_up_model.dart';
import '../../data/models/lead_model.dart';
import '../../data/services/dashboard_service.dart';
import '../../data/services/follow_ups_service.dart';
import '../../state/auth_provider.dart';
import '../../state/attendance_provider.dart';
import '../../state/leads_provider.dart';
import '../calculator/unit_calculator_screen.dart';
import '../leads/add_lead_screen.dart';
import '../leads/lead_detail_screen.dart';
import '../leads/widgets/leads_filter_sheet.dart';
import '../leads/widgets/log_call_dialog.dart';

class DashboardScreen extends StatefulWidget {
  final ValueChanged<int>? onNavigateTab;

  const DashboardScreen({super.key, this.onNavigateTab});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final DashboardService _dashboardService = DashboardService();
  final FollowUpsService _followUpsService = FollowUpsService();
  final TextEditingController _searchController = TextEditingController();

  DashboardSummaryModel _summary = const DashboardSummaryModel();
  bool _isLoading = true;

  // Interactive UI states
  // 'horizontal' (swipable stage cards) or 'vertical' (stacked stage cards) or 'list' (filtered list view)
  String _stageLayoutMode = 'horizontal';
  bool _showEmptyStages = false;
  final Set<String> _expandedStages = {};
  int _selectedLeaderboardTab = 0; // 0: Dials, 1: Site Tours
  List<DashboardTaskItem> _tasks = [];

  @override
  void initState() {
    super.initState();
    _loadDashboard();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadDashboard() async {
    setState(() => _isLoading = true);
    if (mounted) {
      context.read<LeadsProvider>().fetchLeads(silent: true);
    }
    final data = await _dashboardService.getSummary();
    if (mounted) {
      setState(() {
        _summary = data;
        _tasks = List<DashboardTaskItem>.from(data.actionTasks);
        _isLoading = false;
      });
    }
  }

  String _getGreeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final auth = context.watch<AuthProvider>();
    final attendance = context.watch<AttendanceProvider>();
    final leadsProvider = context.watch<LeadsProvider>();
    final profile = auth.profile;
    final firstName = (profile != null && profile.fullName.trim().isNotEmpty)
        ? profile.fullName.trim().split(' ').first
        : (auth.user?.email?.split('@').first ?? 'Agent');

    if (_searchController.text != leadsProvider.searchQuery &&
        !FocusScope.of(context).hasFocus) {
      _searchController.text = leadsProvider.searchQuery;
    }

    final liveTotalLeads = leadsProvider.allLeads.isNotEmpty
        ? leadsProvider.allLeads.length
        : _summary.totalLeads;

    return RefreshIndicator(
      onRefresh: _loadDashboard,
      color: AppColors.neonLime,
      child: _isLoading && leadsProvider.allLeads.isEmpty
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.neonLime),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 36),
              children: [
                // ── 1. Greeting & Attendance Status Row ───────────────────────
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${_getGreeting()}, $firstName 👋',
                            style: TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.5,
                              color: isDark
                                  ? AppColors.darkForeground
                                  : AppColors.lightForeground,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Here is your real-time brokerage workspace',
                            style: TextStyle(
                              fontSize: 13,
                              color: isDark
                                  ? AppColors.darkMutedForeground
                                  : AppColors.lightMutedForeground,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    GestureDetector(
                      onTap: () => widget.onNavigateTab?.call(2),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 7,
                        ),
                        decoration: BoxDecoration(
                          color: attendance.isCheckedIn
                              ? (isDark
                                  ? const Color(0xFF142918)
                                  : AppColors.secondary)
                              : (isDark ? AppColors.darkCard : Colors.white),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: attendance.isCheckedIn
                                ? AppColors.neonLime.withAlpha(120)
                                : (isDark
                                    ? AppColors.darkBorder
                                    : AppColors.lightBorder),
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: attendance.isCheckedIn
                                    ? AppColors.neonLime
                                    : const Color(0xFF94A3B8),
                                boxShadow: attendance.isCheckedIn
                                    ? [
                                        BoxShadow(
                                          color:
                                              AppColors.neonLime.withAlpha(180),
                                          blurRadius: 6,
                                        ),
                                      ]
                                    : null,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              attendance.isCheckedIn
                                  ? 'Checked In'
                                  : 'Check In',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: attendance.isCheckedIn
                                    ? (isDark
                                        ? AppColors.neonLime
                                        : AppColors.primary)
                                    : (isDark
                                        ? AppColors.darkMutedForeground
                                        : AppColors.lightMutedForeground),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),

                // ── 2. Top 4 Compact KPI Cards Row ────────────────────────────
                Row(
                  children: [
                    _buildCompactKpiCard(
                      label: 'TOTAL LEADS',
                      value: liveTotalLeads.toString(),
                      badge: '+${_summary.newLeadsThisMonth}',
                      badgeColor: AppColors.neonLime,
                      icon: LucideIcons.users,
                      iconColor: AppColors.neonLime,
                      isDark: isDark,
                      onTap: () => widget.onNavigateTab?.call(1),
                    ),
                    const SizedBox(width: 8),
                    _buildCompactKpiCard(
                      label: 'FOLLOW-UPS',
                      value: _summary.activeFollowUps.toString(),
                      badge: _summary.overdueFollowUps > 0
                          ? '${_summary.overdueFollowUps} Late'
                          : 'On Track',
                      badgeColor: _summary.overdueFollowUps > 0
                          ? AppColors.alertRed
                          : AppColors.neonLime,
                      icon: LucideIcons.calendarClock,
                      iconColor: AppColors.amber,
                      isDark: isDark,
                      onTap: () => widget.onNavigateTab?.call(3),
                    ),
                    const SizedBox(width: 8),
                    _buildCompactKpiCard(
                      label: 'SITE VISITS',
                      value: (_summary.scheduledVisits +
                              _summary.completedVisits)
                          .toString(),
                      badge: '${_summary.scheduledVisits} Sched',
                      badgeColor: const Color(0xFF3B82F6),
                      icon: LucideIcons.mapPin,
                      iconColor: const Color(0xFF3B82F6),
                      isDark: isDark,
                      onTap: () => widget.onNavigateTab?.call(4),
                    ),
                    const SizedBox(width: 8),
                    _buildCompactKpiCard(
                      label: 'DEALS WON',
                      value: _summary.wonDeals.toString(),
                      badge: '${_summary.conversionRate.toStringAsFixed(0)}%',
                      badgeColor: const Color(0xFF10B981),
                      icon: LucideIcons.trophy,
                      iconColor: const Color(0xFF10B981),
                      isDark: isDark,
                      onTap: () => widget.onNavigateTab?.call(5),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                // ── 3. Priority Follow-up Hero Alert Card ─────────────────────
                if (_summary.nextPriorityFollowUp != null) ...[
                  _buildPriorityFollowUpCard(
                    _summary.nextPriorityFollowUp!,
                    isDark,
                  ),
                  const SizedBox(height: 20),
                ],

                // ── 4. Refactored Stage-Based Lead Cards & Stage Filtering ────
                _buildStageBasedLeadsSection(leadsProvider, isDark),
                const SizedBox(height: 20),

                // ── 5. Today's Action Tasks (Live from Supabase) ──────────────
                _buildTodayActionTasks(isDark),
                const SizedBox(height: 20),

                // ── 6. Daily Activity & Live SLA Score ────────────────────────
                _buildDailyActivityStats(isDark),
                const SizedBox(height: 20),

                // ── 7. Real-Time Action Leaderboard ───────────────────────────
                _buildActionLeaderboard(isDark),
                const SizedBox(height: 20),

                // ── 8. Broker Quick Toolbox ───────────────────────────────────
                _buildQuickToolbox(isDark),
              ],
            ),
    );
  }

  // ── 2. Compact KPI Card ─────────────────────────────────────────────────────
  Widget _buildCompactKpiCard({
    required String label,
    required String value,
    required String badge,
    required Color badgeColor,
    required IconData icon,
    required Color iconColor,
    required bool isDark,
    required VoidCallback onTap,
  }) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkCard : Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      color: iconColor.withAlpha(isDark ? 35 : 22),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Center(
                      child: Icon(icon, size: 13, color: iconColor),
                    ),
                  ),
                  Flexible(
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 4,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: badgeColor.withAlpha(isDark ? 35 : 22),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        badge,
                        style: TextStyle(
                          fontSize: 8.5,
                          fontWeight: FontWeight.w800,
                          color: badgeColor,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                value,
                style: TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                  height: 1.0,
                  color: isDark
                      ? AppColors.darkForeground
                      : AppColors.lightForeground,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 8.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.3,
                  color: isDark
                      ? AppColors.darkMutedForeground
                      : AppColors.lightMutedForeground,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── 3. Priority Follow-up Hero Alert Card ───────────────────────────────────
  Widget _buildPriorityFollowUpCard(FollowUpModel followUp, bool isDark) {
    final isOverdue = followUp.isOverdue;
    final accentColor = isOverdue ? AppColors.alertRed : AppColors.amber;
    final interestText = (followUp.propertyInterest != null &&
            followUp.propertyInterest!.trim().isNotEmpty)
        ? followUp.propertyInterest!.trim()
        : (followUp.notes != null && followUp.notes!.trim().isNotEmpty
            ? followUp.notes!.trim()
            : followUp.title);

    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF171316) : const Color(0xFFFFFBEB),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: accentColor.withAlpha(isDark ? 100 : 120),
          width: 1.2,
        ),
        boxShadow: [
          BoxShadow(
            color: accentColor.withAlpha(isDark ? 25 : 15),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: accentColor.withAlpha(isDark ? 45 : 30),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(LucideIcons.flame, size: 12, color: accentColor),
                      const SizedBox(width: 4),
                      Text(
                        isOverdue
                            ? 'PRIORITY FOLLOW-UP • OVERDUE'
                            : 'PRIORITY FOLLOW-UP • TODAY',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.4,
                          color: accentColor,
                        ),
                      ),
                    ],
                  ),
                ),
                Text(
                  followUp.dueTime != null
                      ? '${AppDateUtils.formatDate(followUp.dueDate)} • ${followUp.dueTime}'
                      : AppDateUtils.formatDate(followUp.dueDate),
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: isDark
                        ? AppColors.darkMutedForeground
                        : AppColors.lightMutedForeground,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            Row(
              children: [
                CircleAvatar(
                  radius: 22,
                  backgroundColor: accentColor.withAlpha(35),
                  child: Text(
                    followUp.contactName.isNotEmpty
                        ? followUp.contactName[0].toUpperCase()
                        : 'L',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: accentColor,
                      fontSize: 16,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              followUp.contactName,
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: isDark
                                    ? AppColors.darkForeground
                                    : AppColors.lightForeground,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.neonLime.withAlpha(35),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              '${followUp.priority} Priority',
                              style: const TextStyle(
                                fontSize: 9.5,
                                fontWeight: FontWeight.w800,
                                color: AppColors.neonLime,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        interestText,
                        style: TextStyle(
                          fontSize: 12.5,
                          color: isDark
                              ? AppColors.darkMutedForeground
                              : AppColors.lightMutedForeground,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),

            Row(
              children: [
                Expanded(
                  flex: 2,
                  child: ElevatedButton.icon(
                    icon: const Icon(
                      LucideIcons.phoneCall,
                      size: 15,
                      color: Color(0xFF142407),
                    ),
                    label: const Text(
                      'Call Now',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF142407),
                      ),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.neonLime,
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    onPressed: () => _callFollowUpOrLead(
                      phone: followUp.contactPhone,
                      followUp: followUp,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 2,
                  child: OutlinedButton.icon(
                    icon: const Icon(
                      LucideIcons.messageCircle,
                      size: 15,
                      color: Color(0xFF25D366),
                    ),
                    label: const Text(
                      'WhatsApp',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF25D366),
                      ),
                    ),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      side: const BorderSide(color: Color(0xFF25D366)),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    onPressed: () => _openWhatsAppForLead(
                      phone: followUp.contactPhone,
                      followUp: followUp,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  tooltip: 'Mark Done',
                  style: IconButton.styleFrom(
                    backgroundColor: isDark ? AppColors.darkCard : Colors.white,
                    side: BorderSide(
                      color:
                          isDark ? AppColors.darkBorder : AppColors.lightBorder,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  icon: const Icon(
                    LucideIcons.check,
                    size: 18,
                    color: AppColors.neonLime,
                  ),
                  onPressed: () async {
                    await _followUpsService.markComplete(
                      followUp.id,
                      leadId: followUp.leadId,
                    );
                    _loadDashboard();
                  },
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  // ── 4. Stage-Based Lead Cards & Stage Filtering Section ────────────────────
  Widget _buildStageBasedLeadsSection(
    LeadsProvider leadsProvider,
    bool isDark,
  ) {
    final stageCounts = leadsProvider.stageCounts;
    final groupedLeads = leadsProvider.leadsByStage;
    final filteredLeads = leadsProvider.leads;
    final selectedStatus = leadsProvider.statusFilter;
    final isSpecificStage = selectedStatus != 'All Leads';

    final stagesToDisplay = isSpecificStage
        ? [selectedStatus]
        : LeadStages.allStatuses.where((stage) {
            if (_showEmptyStages) return true;
            if (LeadStages.pipelineStages.contains(stage)) return true;
            return (groupedLeads[stage]?.isNotEmpty ?? false);
          }).toList();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header + Layout View Mode Switcher
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: AppColors.neonLime.withAlpha(isDark ? 35 : 22),
                  borderRadius: BorderRadius.circular(9),
                ),
                child: const Icon(
                  LucideIcons.layers,
                  size: 16,
                  color: AppColors.neonLime,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Leads by Pipeline Stage',
                      style: TextStyle(
                        fontSize: 15.5,
                        fontWeight: FontWeight.w800,
                        color: isDark
                            ? AppColors.darkForeground
                            : AppColors.lightForeground,
                      ),
                    ),
                    Text(
                      '${filteredLeads.length} leads shown • ${stagesToDisplay.length} active stages',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: isDark
                            ? AppColors.darkMutedForeground
                            : AppColors.lightMutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
              // Layout Mode Toggle (Swipe Cards / Stacked Cards / List View)
              Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(
                  color:
                      isDark ? AppColors.darkBackground : AppColors.lightMuted,
                  borderRadius: BorderRadius.circular(9),
                  border: Border.all(
                    color:
                        isDark ? AppColors.darkBorder : AppColors.lightBorder,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _buildLayoutBtn(
                      mode: 'horizontal',
                      icon: LucideIcons.columns3,
                      tooltip: 'Swipable Stage Cards',
                      isDark: isDark,
                    ),
                    _buildLayoutBtn(
                      mode: 'vertical',
                      icon: LucideIcons.layoutGrid,
                      tooltip: 'Stacked Stage Cards',
                      isDark: isDark,
                    ),
                    _buildLayoutBtn(
                      mode: 'list',
                      icon: LucideIcons.list,
                      tooltip: 'Lead List View',
                      isDark: isDark,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Search + Advanced Filter Bar
          Row(
            children: [
              Expanded(
                child: Container(
                  height: 40,
                  decoration: BoxDecoration(
                    color: isDark
                        ? AppColors.darkBackground
                        : AppColors.lightMuted,
                    borderRadius: BorderRadius.circular(11),
                    border: Border.all(
                      color:
                          isDark ? AppColors.darkBorder : AppColors.lightBorder,
                    ),
                  ),
                  child: TextField(
                    controller: _searchController,
                    onChanged: (val) => leadsProvider.setSearchQuery(val),
                    style: TextStyle(
                      fontSize: 12.5,
                      color: isDark
                          ? AppColors.darkForeground
                          : AppColors.lightForeground,
                    ),
                    decoration: InputDecoration(
                      hintText: 'Search leads by name, phone, project...',
                      hintStyle: TextStyle(
                        fontSize: 12,
                        color: isDark
                            ? AppColors.darkMutedForeground
                            : AppColors.lightMutedForeground,
                      ),
                      prefixIcon: Icon(
                        LucideIcons.search,
                        size: 15,
                        color: isDark
                            ? AppColors.darkMutedForeground
                            : AppColors.lightMutedForeground,
                      ),
                      suffixIcon: leadsProvider.searchQuery.isNotEmpty
                          ? IconButton(
                              icon: const Icon(LucideIcons.x, size: 14),
                              onPressed: () {
                                _searchController.clear();
                                leadsProvider.setSearchQuery('');
                              },
                            )
                          : null,
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(vertical: 10),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              // Advanced Filter Modal Button
              InkWell(
                onTap: () => LeadsFilterSheet.show(context),
                borderRadius: BorderRadius.circular(11),
                child: Container(
                  height: 40,
                  padding: const EdgeInsets.symmetric(horizontal: 11),
                  decoration: BoxDecoration(
                    color: leadsProvider.activeFilterCount > 0
                        ? AppColors.neonLime.withAlpha(isDark ? 35 : 25)
                        : (isDark
                            ? AppColors.darkBackground
                            : AppColors.lightMuted),
                    borderRadius: BorderRadius.circular(11),
                    border: Border.all(
                      color: leadsProvider.activeFilterCount > 0
                          ? AppColors.neonLime
                          : (isDark
                              ? AppColors.darkBorder
                              : AppColors.lightBorder),
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        LucideIcons.slidersHorizontal,
                        size: 14,
                        color: leadsProvider.activeFilterCount > 0
                            ? AppColors.neonLime
                            : (isDark
                                ? AppColors.darkForeground
                                : AppColors.lightForeground),
                      ),
                      const SizedBox(width: 5),
                      Text(
                        leadsProvider.activeFilterCount > 0
                            ? 'Filters (${leadsProvider.activeFilterCount})'
                            : 'Filters',
                        style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w700,
                          color: leadsProvider.activeFilterCount > 0
                              ? AppColors.neonLime
                              : (isDark
                                  ? AppColors.darkForeground
                                  : AppColors.lightForeground),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (leadsProvider.hasActiveFilters) ...[
                const SizedBox(width: 6),
                InkWell(
                  onTap: () {
                    _searchController.clear();
                    leadsProvider.clearFilters();
                  },
                  borderRadius: BorderRadius.circular(11),
                  child: Container(
                    height: 40,
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    decoration: BoxDecoration(
                      color: AppColors.alertRed.withAlpha(22),
                      borderRadius: BorderRadius.circular(11),
                      border: Border.all(
                        color: AppColors.alertRed.withAlpha(90),
                      ),
                    ),
                    child: const Center(
                      child: Icon(
                        LucideIcons.rotateCcw,
                        size: 14,
                        color: AppColors.alertRed,
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 12),

          // Stage Filter Chips (All 18 Canonical Stages + All Leads)
          SizedBox(
            height: 36,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: LeadStages.allFilterOptions.length,
              separatorBuilder: (_, __) => const SizedBox(width: 6),
              itemBuilder: (context, index) {
                final stageOption = LeadStages.allFilterOptions[index];
                final isSelected = selectedStatus == stageOption;
                final count = stageCounts[stageOption] ?? 0;
                final statusColors = stageOption == 'All Leads'
                    ? (
                        bg: AppColors.neonLime.withAlpha(25),
                        text: AppColors.neonLime
                      )
                    : AppColors.getStatusColors(stageOption, isDark: isDark);

                return GestureDetector(
                  onTap: () => leadsProvider.setStatusFilter(stageOption),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 160),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 11,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? AppColors.neonLime
                          : (isDark
                              ? AppColors.darkBackground
                              : AppColors.lightMuted),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(
                        color: isSelected
                            ? AppColors.neonLime
                            : (count > 0
                                ? statusColors.text.withAlpha(90)
                                : (isDark
                                    ? AppColors.darkBorder
                                    : AppColors.lightBorder)),
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (stageOption != 'All Leads') ...[
                          Container(
                            width: 7,
                            height: 7,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: isSelected
                                  ? const Color(0xFF142407)
                                  : statusColors.text,
                            ),
                          ),
                          const SizedBox(width: 6),
                        ],
                        Text(
                          stageOption,
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight:
                                isSelected ? FontWeight.w800 : FontWeight.w600,
                            color: isSelected
                                ? const Color(0xFF142407)
                                : (isDark
                                    ? AppColors.darkForeground
                                    : AppColors.lightForeground),
                          ),
                        ),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 5,
                            vertical: 1,
                          ),
                          decoration: BoxDecoration(
                            color: isSelected
                                ? const Color(0xFF142407).withAlpha(28)
                                : statusColors.bg,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            '$count',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: isSelected
                                  ? const Color(0xFF142407)
                                  : statusColors.text,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 10),

          // Quick Activity Sub-Filters + Empty Stage Toggle Row
          Row(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _buildActivityQuickChip(
                        label: 'All Leads',
                        value: 'All Leads',
                        provider: leadsProvider,
                        isDark: isDark,
                      ),
                      const SizedBox(width: 6),
                      _buildActivityQuickChip(
                        label: 'Action Today',
                        value: 'Action Today',
                        provider: leadsProvider,
                        isDark: isDark,
                      ),
                      const SizedBox(width: 6),
                      _buildActivityQuickChip(
                        label: 'Called',
                        value: 'Called',
                        provider: leadsProvider,
                        isDark: isDark,
                      ),
                      const SizedBox(width: 6),
                      _buildActivityQuickChip(
                        label: 'Not Called',
                        value: 'Not Called',
                        provider: leadsProvider,
                        isDark: isDark,
                      ),
                      const SizedBox(width: 6),
                      _buildActivityQuickChip(
                        label: 'Overdue',
                        value: 'Overdue',
                        provider: leadsProvider,
                        isDark: isDark,
                      ),
                    ],
                  ),
                ),
              ),
              if (!isSpecificStage && _stageLayoutMode != 'list') ...[
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: () =>
                      setState(() => _showEmptyStages = !_showEmptyStages),
                  child: Text(
                    _showEmptyStages ? 'Hide 0s' : 'All 18 Stages',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: AppColors.neonLime,
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 14),

          // Loading or Empty or Content States
          if (leadsProvider.isLoading && leadsProvider.allLeads.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.neonLime),
              ),
            )
          else if (filteredLeads.isEmpty)
            _buildEmptyFilteredState(leadsProvider, isDark)
          else if (_stageLayoutMode == 'list')
            _buildFilteredFlatListView(filteredLeads, leadsProvider, isDark)
          else if (_stageLayoutMode == 'horizontal' && !isSpecificStage)
            SizedBox(
              height: 365,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: stagesToDisplay.length,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (context, index) {
                  final stageName = stagesToDisplay[index];
                  final stageLeads = groupedLeads[stageName] ?? [];
                  return SizedBox(
                    width: MediaQuery.of(context).size.width * 0.78,
                    child: _buildStandaloneStageCard(
                      stageName: stageName,
                      stageLeads: stageLeads,
                      totalLeadsCount: leadsProvider.allLeads.isNotEmpty
                          ? leadsProvider.allLeads.length
                          : 1,
                      leadsProvider: leadsProvider,
                      isDark: isDark,
                      isHorizontalCard: true,
                    ),
                  );
                },
              ),
            )
          else
            Column(
              children: stagesToDisplay.map((stageName) {
                final stageLeads = groupedLeads[stageName] ?? [];
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _buildStandaloneStageCard(
                    stageName: stageName,
                    stageLeads: stageLeads,
                    totalLeadsCount: leadsProvider.allLeads.isNotEmpty
                        ? leadsProvider.allLeads.length
                        : 1,
                    leadsProvider: leadsProvider,
                    isDark: isDark,
                    isHorizontalCard: false,
                  ),
                );
              }).toList(),
            ),
        ],
      ),
    );
  }

  Widget _buildLayoutBtn({
    required String mode,
    required IconData icon,
    required String tooltip,
    required bool isDark,
  }) {
    final active = _stageLayoutMode == mode;
    return Tooltip(
      message: tooltip,
      child: GestureDetector(
        onTap: () => setState(() => _stageLayoutMode = mode),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 5),
          decoration: BoxDecoration(
            color: active ? AppColors.neonLime : Colors.transparent,
            borderRadius: BorderRadius.circular(7),
          ),
          child: Icon(
            icon,
            size: 14,
            color: active
                ? const Color(0xFF142407)
                : (isDark
                    ? AppColors.darkMutedForeground
                    : AppColors.lightMutedForeground),
          ),
        ),
      ),
    );
  }

  Widget _buildActivityQuickChip({
    required String label,
    required String value,
    required LeadsProvider provider,
    required bool isDark,
  }) {
    final active = provider.activityFilter == value;
    return GestureDetector(
      onTap: () => provider.setActivityFilter(value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        decoration: BoxDecoration(
          color: active
              ? const Color(0xFF3B82F6).withAlpha(isDark ? 45 : 25)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: active
                ? const Color(0xFF3B82F6)
                : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 10.5,
            fontWeight: active ? FontWeight.w800 : FontWeight.w600,
            color: active
                ? const Color(0xFF3B82F6)
                : (isDark
                    ? AppColors.darkMutedForeground
                    : AppColors.lightMutedForeground),
          ),
        ),
      ),
    );
  }

  // Standalone Stage Container Card showing stage header, count, progress bar, and lead cards
  Widget _buildStandaloneStageCard({
    required String stageName,
    required List<LeadModel> stageLeads,
    required int totalLeadsCount,
    required LeadsProvider leadsProvider,
    required bool isDark,
    required bool isHorizontalCard,
  }) {
    final statusColors = AppColors.getStatusColors(stageName, isDark: isDark);
    final count = stageLeads.length;
    final pct = ((count / (totalLeadsCount > 0 ? totalLeadsCount : 1)) * 100)
        .clamp(0.0, 100.0);
    final isExpanded = _expandedStages.contains(stageName);
    final previewLimit = isHorizontalCard ? 6 : (isExpanded ? count : 3);
    final visibleLeads = stageLeads.take(previewLimit).toList();

    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkBackground : AppColors.lightMuted,
        borderRadius: BorderRadius.circular(15),
        border: Border.all(
          color: count > 0
              ? statusColors.text.withAlpha(isDark ? 95 : 80)
              : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
          width: count > 0 ? 1.2 : 1.0,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: isHorizontalCard ? MainAxisSize.max : MainAxisSize.min,
        children: [
          // Stage Header Row
          InkWell(
            onTap: () {
              if (leadsProvider.statusFilter == stageName) {
                leadsProvider.setStatusFilter('All Leads');
              } else {
                leadsProvider.setStatusFilter(stageName);
              }
            },
            borderRadius: BorderRadius.circular(10),
            child: Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: statusColors.bg,
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: Icon(
                    LeadStages.iconFor(stageName),
                    size: 16,
                    color: statusColors.text,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        stageName,
                        style: TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w800,
                          color: isDark
                              ? AppColors.darkForeground
                              : AppColors.lightForeground,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        '${LeadStages.categoryLabel(stageName)} • ${pct.toStringAsFixed(0)}% of funnel',
                        style: TextStyle(
                          fontSize: 10.5,
                          color: isDark
                              ? AppColors.darkMutedForeground
                              : AppColors.lightMutedForeground,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 9,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: statusColors.bg,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: statusColors.text.withAlpha(70)),
                  ),
                  child: Text(
                    '$count ${count == 1 ? 'Lead' : 'Leads'}',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: statusColors.text,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),

          // Stage Funnel Bar
          ClipRRect(
            borderRadius: BorderRadius.circular(5),
            child: LinearProgressIndicator(
              value: count > 0 ? (pct / 100).clamp(0.06, 1.0) : 0.02,
              minHeight: 5,
              backgroundColor: isDark ? AppColors.darkCard : Colors.white,
              valueColor: AlwaysStoppedAnimation<Color>(statusColors.text),
            ),
          ),
          const SizedBox(height: 10),

          // Associated Lead Cards inside Stage Container
          if (isHorizontalCard)
            Expanded(
              child: stageLeads.isEmpty
                  ? _buildEmptyStagePlaceholder(stageName, isDark)
                  : ListView.separated(
                      padding: EdgeInsets.zero,
                      itemCount: visibleLeads.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (context, idx) => _buildDashboardLeadCard(
                        lead: visibleLeads[idx],
                        stageColor: statusColors,
                        leadsProvider: leadsProvider,
                        isDark: isDark,
                      ),
                    ),
            )
          else if (stageLeads.isEmpty)
            _buildEmptyStagePlaceholder(stageName, isDark)
          else ...[
            ...visibleLeads.map(
              (lead) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _buildDashboardLeadCard(
                  lead: lead,
                  stageColor: statusColors,
                  leadsProvider: leadsProvider,
                  isDark: isDark,
                ),
              ),
            ),
            if (stageLeads.length > 3)
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: () {
                    setState(() {
                      if (isExpanded) {
                        _expandedStages.remove(stageName);
                      } else {
                        _expandedStages.add(stageName);
                      }
                    });
                  },
                  icon: Icon(
                    isExpanded
                        ? LucideIcons.chevronUp
                        : LucideIcons.chevronDown,
                    size: 14,
                    color: AppColors.neonLime,
                  ),
                  label: Text(
                    isExpanded
                        ? 'Show Less'
                        : 'Show All ${stageLeads.length} Leads in $stageName',
                    style: const TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                      color: AppColors.neonLime,
                    ),
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _buildEmptyStagePlaceholder(String stageName, bool isDark) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 12),
      alignment: Alignment.center,
      child: Text(
        'No leads currently in $stageName',
        style: TextStyle(
          fontSize: 11.5,
          color: isDark
              ? AppColors.darkMutedForeground
              : AppColors.lightMutedForeground,
        ),
        textAlign: TextAlign.center,
      ),
    );
  }

  Widget _buildDashboardLeadCard({
    required LeadModel lead,
    required ({Color bg, Color text}) stageColor,
    required LeadsProvider leadsProvider,
    required bool isDark,
  }) {
    final nextStage = LeadStages.nextPipelineStage(lead.status);
    final subtitleParts = <String>[
      if (lead.project != null && lead.project!.trim().isNotEmpty)
        lead.project!.trim(),
      if (lead.propertyType != null && lead.propertyType!.trim().isNotEmpty)
        lead.propertyType!.trim(),
      if (lead.source != null && lead.source!.trim().isNotEmpty)
        lead.source!.trim(),
    ];
    final subtitle =
        subtitleParts.isNotEmpty ? subtitleParts.join(' • ') : lead.phone;

    return InkWell(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => LeadDetailScreen(leadId: lead.id)),
        ).then((_) => _loadDashboard());
      },
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: isDark ? AppColors.darkCard : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 16,
                  backgroundColor: stageColor.bg,
                  child: Text(
                    lead.name.isNotEmpty ? lead.name[0].toUpperCase() : 'L',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: stageColor.text,
                    ),
                  ),
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        lead.name.isNotEmpty ? lead.name : 'Unnamed Lead',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: isDark
                              ? AppColors.darkForeground
                              : AppColors.lightForeground,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 1),
                      Text(
                        subtitle,
                        style: TextStyle(
                          fontSize: 11,
                          color: isDark
                              ? AppColors.darkMutedForeground
                              : AppColors.lightMutedForeground,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                // Call Button
                IconButton(
                  visualDensity: VisualDensity.compact,
                  tooltip: 'Call Now',
                  icon: const Icon(
                    LucideIcons.phoneCall,
                    size: 14,
                    color: AppColors.neonLime,
                  ),
                  onPressed: () =>
                      _callFollowUpOrLead(phone: lead.phone, lead: lead),
                ),
                // WhatsApp Button
                IconButton(
                  visualDensity: VisualDensity.compact,
                  tooltip: 'WhatsApp',
                  icon: const Icon(
                    LucideIcons.messageCircle,
                    size: 14,
                    color: Color(0xFF25D366),
                  ),
                  onPressed: () =>
                      _openWhatsAppForLead(phone: lead.phone, lead: lead),
                ),
                // Quick Advance Stage Button
                if (nextStage != null)
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    tooltip: 'Move to $nextStage',
                    icon: Icon(
                      LucideIcons.arrowRightCircle,
                      size: 14,
                      color: stageColor.text,
                    ),
                    onPressed: () async {
                      await leadsProvider.updateStatus(lead.id, nextStage);
                      _loadDashboard();
                    },
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilteredFlatListView(
    List<LeadModel> leads,
    LeadsProvider leadsProvider,
    bool isDark,
  ) {
    final visible = leads.take(12).toList();
    return Column(
      children: [
        ...visible.map((lead) {
          final statusColors =
              AppColors.getStatusColors(lead.status, isDark: isDark);
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _buildDashboardLeadCard(
              lead: lead,
              stageColor: statusColors,
              leadsProvider: leadsProvider,
              isDark: isDark,
            ),
          );
        }),
        if (leads.length > 12)
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: () => widget.onNavigateTab?.call(1),
              icon: const Icon(
                LucideIcons.arrowRight,
                size: 14,
                color: AppColors.neonLime,
              ),
              label: Text(
                'View all ${leads.length} filtered leads in Leads tab',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.neonLime,
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildEmptyFilteredState(LeadsProvider leadsProvider, bool isDark) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkBackground : AppColors.lightMuted,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        children: [
          Icon(
            LucideIcons.searchX,
            size: 28,
            color: isDark
                ? AppColors.darkMutedForeground
                : AppColors.lightMutedForeground,
          ),
          const SizedBox(height: 10),
          Text(
            'No leads match the selected stage or filters',
            style: TextStyle(
              fontSize: 13.5,
              fontWeight: FontWeight.w700,
              color:
                  isDark ? AppColors.darkForeground : AppColors.lightForeground,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 4),
          Text(
            'Try selecting another stage chip or clearing active filters.',
            style: TextStyle(
              fontSize: 11.5,
              color: isDark
                  ? AppColors.darkMutedForeground
                  : AppColors.lightMutedForeground,
            ),
            textAlign: TextAlign.center,
          ),
          if (leadsProvider.hasActiveFilters) ...[
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () {
                _searchController.clear();
                leadsProvider.clearFilters();
              },
              icon: const Icon(
                LucideIcons.rotateCcw,
                size: 14,
                color: AppColors.neonLime,
              ),
              label: const Text(
                'Reset All Filters',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.neonLime,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ── 5. Today's Action Tasks (Synced with Supabase `tasks` & `follow_ups`) ───
  Widget _buildTodayActionTasks(bool isDark) {
    final completedCount = _tasks.where((t) => t.isCompleted).length;
    final totalCount = _tasks.length;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(
                    LucideIcons.listChecks,
                    size: 16,
                    color: AppColors.neonLime,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    "Today's Action Tasks",
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: isDark
                          ? AppColors.darkForeground
                          : AppColors.lightForeground,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.neonLime.withAlpha(30),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  'Done $completedCount/$totalCount',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: AppColors.neonLime,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          if (_tasks.isEmpty)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 12),
              decoration: BoxDecoration(
                color: isDark ? AppColors.darkBackground : AppColors.lightMuted,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Icon(
                    LucideIcons.checkCircle2,
                    size: 20,
                    color: AppColors.neonLime,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'All assigned tasks and due follow-ups for today are complete!',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: isDark
                            ? AppColors.darkForeground
                            : AppColors.lightForeground,
                      ),
                    ),
                  ),
                ],
              ),
            )
          else
            ...List.generate(_tasks.length, (index) {
              final item = _tasks[index];
              final isDone = item.isCompleted;
              final priority = item.priority;
              final pColor = priority == 'High'
                  ? AppColors.alertRed
                  : (priority == 'Medium'
                      ? AppColors.amber
                      : const Color(0xFF10B981));

              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color:
                      isDark ? AppColors.darkBackground : AppColors.lightMuted,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isDone
                        ? AppColors.neonLime.withAlpha(90)
                        : (isDark
                            ? AppColors.darkBorder
                            : AppColors.lightBorder),
                  ),
                ),
                child: Row(
                  children: [
                    GestureDetector(
                      onTap: () => _toggleTaskItem(index),
                      child: Container(
                        width: 22,
                        height: 22,
                        decoration: BoxDecoration(
                          color:
                              isDone ? AppColors.neonLime : Colors.transparent,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                            color: isDone
                                ? AppColors.neonLime
                                : const Color(0xFF94A3B8),
                            width: 1.8,
                          ),
                        ),
                        child: isDone
                            ? const Icon(
                                LucideIcons.check,
                                size: 14,
                                color: Color(0xFF142407),
                              )
                            : null,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: InkWell(
                        onTap: () {
                          if (item.leadId != null && item.leadId!.isNotEmpty) {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) =>
                                    LeadDetailScreen(leadId: item.leadId!),
                              ),
                            ).then((_) => _loadDashboard());
                          } else {
                            _toggleTaskItem(index);
                          }
                        },
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.title,
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                decoration:
                                    isDone ? TextDecoration.lineThrough : null,
                                color: isDone
                                    ? (isDark
                                        ? AppColors.darkMutedForeground
                                        : AppColors.lightMutedForeground)
                                    : (isDark
                                        ? AppColors.darkForeground
                                        : AppColors.lightForeground),
                              ),
                            ),
                            if (item.subtitle.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(
                                item.subtitle,
                                style: TextStyle(
                                  fontSize: 11,
                                  color: isDark
                                      ? AppColors.darkMutedForeground
                                      : AppColors.lightMutedForeground,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: pColor.withAlpha(30),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        priority,
                        style: TextStyle(
                          fontSize: 9.5,
                          fontWeight: FontWeight.w800,
                          color: pColor,
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }

  // ── 6. Daily Activity & Live SLA Score ──────────────────────────────────────
  Widget _buildDailyActivityStats(bool isDark) {
    final targetCalls =
        _summary.targetCallsToday > 0 ? _summary.targetCallsToday : 30;
    final callsDone = _summary.callsToday;
    final progress = (callsDone / targetCalls).clamp(0.0, 1.0);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(
                    LucideIcons.activity,
                    size: 16,
                    color: AppColors.neonLime,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Daily Activity & SLA Score',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: isDark
                          ? AppColors.darkForeground
                          : AppColors.lightForeground,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xFF10B981).withAlpha(30),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'Rank #${_summary.currentUserRank} • ${_summary.onlineUsersCount} Online',
                  style: const TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF10B981),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          Row(
            children: [
              Expanded(
                child: _buildStatMiniBox(
                  title: 'CALLS LOGGED',
                  value: '$callsDone / $targetCalls',
                  sub: '${_summary.callsThisMonth} this month',
                  color: AppColors.neonLime,
                  isDark: isDark,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildStatMiniBox(
                  title: 'SLA SCORE',
                  value: '${_summary.slaScorePct.toStringAsFixed(1)}%',
                  sub: _summary.overdueFollowUps == 0
                      ? 'All due items on track'
                      : '${_summary.overdueFollowUps} overdue follow-ups',
                  color: const Color(0xFF3B82F6),
                  isDark: isDark,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Daily Call Quota Progress',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: isDark
                      ? AppColors.darkMutedForeground
                      : AppColors.lightMutedForeground,
                ),
              ),
              Text(
                '${(progress * 100).toStringAsFixed(0)}%',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: AppColors.neonLime,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: progress > 0 ? progress : 0.08,
              minHeight: 8,
              backgroundColor:
                  isDark ? AppColors.darkBackground : AppColors.lightMuted,
              valueColor:
                  const AlwaysStoppedAnimation<Color>(AppColors.neonLime),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatMiniBox({
    required String title,
    required String value,
    required String sub,
    required Color color,
    required bool isDark,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkBackground : AppColors.lightMuted,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 9.5,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.4,
              color: isDark
                  ? AppColors.darkMutedForeground
                  : AppColors.lightMutedForeground,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            sub,
            style: TextStyle(
              fontSize: 10.5,
              color: isDark
                  ? AppColors.darkMutedForeground
                  : AppColors.lightMutedForeground,
            ),
          ),
        ],
      ),
    );
  }

  // ── 7. Real-Time Action Leaderboard (Synced with Supabase) ──────────────────
  Widget _buildActionLeaderboard(bool isDark) {
    final entries = List<LeaderboardEntryModel>.from(_summary.leaderboard);
    if (_selectedLeaderboardTab == 0) {
      entries.sort((a, b) {
        final cmp = b.dialsCount.compareTo(a.dialsCount);
        return cmp != 0 ? cmp : b.score.compareTo(a.score);
      });
    } else {
      entries.sort((a, b) {
        final cmp = b.siteToursCount.compareTo(a.siteToursCount);
        return cmp != 0 ? cmp : b.score.compareTo(a.score);
      });
    }

    final topEntries = entries.take(6).toList();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(
                    LucideIcons.award,
                    size: 16,
                    color: AppColors.amber,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Action Leaderboard',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: isDark
                          ? AppColors.darkForeground
                          : AppColors.lightForeground,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(
                  color:
                      isDark ? AppColors.darkBackground : AppColors.lightMuted,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    _buildLeaderboardTabBtn('Dials', 0, isDark),
                    _buildLeaderboardTabBtn('Site Tours', 1, isDark),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          if (topEntries.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Center(
                child: Text(
                  'No active leaderboard records yet',
                  style: TextStyle(
                    fontSize: 12,
                    color: isDark
                        ? AppColors.darkMutedForeground
                        : AppColors.lightMutedForeground,
                  ),
                ),
              ),
            )
          else
            ...List.generate(topEntries.length, (i) {
              final b = topEntries[i];
              final displayRank = '#${i + 1}';
              final metricVal = _selectedLeaderboardTab == 0
                  ? '${b.dialsCount} Dials'
                  : '${b.siteToursCount} Tours';
              final displayName =
                  b.isCurrentUser ? '${b.fullName} (You)' : b.fullName;

              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: b.isCurrentUser
                      ? (isDark ? const Color(0xFF16250F) : AppColors.secondary)
                      : (isDark
                          ? AppColors.darkBackground
                          : AppColors.lightMuted),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: b.isCurrentUser
                        ? AppColors.neonLime.withAlpha(100)
                        : (isDark
                            ? AppColors.darkBorder
                            : AppColors.lightBorder),
                  ),
                ),
                child: Row(
                  children: [
                    Text(
                      displayRank,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: i == 0 ? AppColors.amber : AppColors.neonLime,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Stack(
                      children: [
                        CircleAvatar(
                          radius: 15,
                          backgroundColor: b.isCurrentUser
                              ? AppColors.neonLime
                              : const Color(0xFF3B82F6),
                          child: Text(
                            b.initials,
                            style: TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w800,
                              color: b.isCurrentUser
                                  ? const Color(0xFF142407)
                                  : Colors.white,
                            ),
                          ),
                        ),
                        if (b.isOnline)
                          Positioned(
                            right: 0,
                            bottom: 0,
                            child: Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                color: const Color(0xFF10B981),
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color:
                                      isDark ? AppColors.darkCard : Colors.white,
                                  width: 1.5,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            displayName,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: b.isCurrentUser
                                  ? FontWeight.w800
                                  : FontWeight.w600,
                              color: isDark
                                  ? AppColors.darkForeground
                                  : AppColors.lightForeground,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            '${b.leadsCount} leads • ${b.score} pts',
                            style: TextStyle(
                              fontSize: 10.5,
                              color: isDark
                                  ? AppColors.darkMutedForeground
                                  : AppColors.lightMutedForeground,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.neonLime.withAlpha(25),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        metricVal,
                        style: const TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w800,
                          color: AppColors.neonLime,
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _buildLeaderboardTabBtn(String title, int index, bool isDark) {
    final active = _selectedLeaderboardTab == index;
    return GestureDetector(
      onTap: () => setState(() => _selectedLeaderboardTab = index),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: active ? AppColors.neonLime : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          title,
          style: TextStyle(
            fontSize: 10.5,
            fontWeight: FontWeight.w800,
            color: active
                ? const Color(0xFF142407)
                : (isDark
                    ? AppColors.darkMutedForeground
                    : AppColors.lightMutedForeground),
          ),
        ),
      ),
    );
  }

  // ── 8. Broker Quick Toolbox ─────────────────────────────────────────────────
  Widget _buildQuickToolbox(bool isDark) {
    final tools = [
      {
        'label': 'Add Lead',
        'icon': LucideIcons.userPlus,
        'color': AppColors.neonLime,
        'onTap': () {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const AddLeadScreen()),
          ).then((_) => _loadDashboard());
        },
      },
      {
        'label': 'Unit Calculator',
        'icon': LucideIcons.calculator,
        'color': const Color(0xFF3B82F6),
        'onTap': _openUnitCalculator,
      },
      {
        'label': 'Follow-ups',
        'icon': LucideIcons.calendarClock,
        'color': AppColors.amber,
        'onTap': () => widget.onNavigateTab?.call(3),
      },
      {
        'label': 'Call Logs',
        'icon': LucideIcons.phoneCall,
        'color': const Color(0xFF10B981),
        'onTap': () => widget.onNavigateTab?.call(4),
      },
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Broker Quick Tools',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w800,
            color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
          ),
        ),
        const SizedBox(height: 12),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: tools.length,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 2.6,
          ),
          itemBuilder: (context, index) {
            final t = tools[index];
            final color = t['color'] as Color;
            final onTap = t['onTap'] as VoidCallback;

            return InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(14),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: isDark ? AppColors.darkCard : Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color:
                        isDark ? AppColors.darkBorder : AppColors.lightBorder,
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: color.withAlpha(isDark ? 35 : 22),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Center(
                        child: Icon(
                          t['icon'] as IconData,
                          size: 16,
                          color: color,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        t['label'] as String,
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: isDark
                              ? AppColors.darkForeground
                              : AppColors.lightForeground,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}
