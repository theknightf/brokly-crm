import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
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

  DashboardSummaryModel _summary = const DashboardSummaryModel();
  bool _isLoading = true;

  // Interactive UI states
  String _selectedPipelineStage = 'All';
  int _selectedLeaderboardTab = 0; // 0: Dials, 1: Site Tours
  List<DashboardTaskItem> _tasks = [];

  @override
  void initState() {
    super.initState();
    _loadDashboard();
  }

  Future<void> _loadDashboard() async {
    setState(() => _isLoading = true);
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
          (followUp != null && followUp.leadId != null && followUp.leadId!.isNotEmpty
              ? LeadModel(
                  id: followUp.leadId!,
                  name: followUp.contactName,
                  phone: phone,
                  project: followUp.propertyInterest,
                )
              : null);
      if (targetLead != null) {
        await LogCallDialog.show(context, lead: targetLead, initialChannel: 'WhatsApp');
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
    final profile = auth.profile;
    final firstName = (profile != null && profile.fullName.trim().isNotEmpty)
        ? profile.fullName.trim().split(' ').first
        : (auth.user?.email?.split('@').first ?? 'Agent');

    return RefreshIndicator(
      onRefresh: _loadDashboard,
      color: AppColors.neonLime,
      child: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.neonLime))
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
                              color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Here is your real-time brokerage workspace',
                            style: TextStyle(
                              fontSize: 13,
                              color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    GestureDetector(
                      onTap: () => widget.onNavigateTab?.call(2),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                        decoration: BoxDecoration(
                          color: attendance.isCheckedIn
                              ? (isDark ? const Color(0xFF142918) : AppColors.secondary)
                              : (isDark ? AppColors.darkCard : Colors.white),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: attendance.isCheckedIn
                                ? AppColors.neonLime.withAlpha(120)
                                : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
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
                                color: attendance.isCheckedIn ? AppColors.neonLime : const Color(0xFF94A3B8),
                                boxShadow: attendance.isCheckedIn
                                    ? [
                                        BoxShadow(
                                          color: AppColors.neonLime.withAlpha(180),
                                          blurRadius: 6,
                                        ),
                                      ]
                                    : null,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              attendance.isCheckedIn ? 'Checked In' : 'Check In',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: attendance.isCheckedIn
                                    ? (isDark ? AppColors.neonLime : AppColors.primary)
                                    : (isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground),
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
                      value: _summary.totalLeads.toString(),
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
                      badge: _summary.overdueFollowUps > 0 ? '${_summary.overdueFollowUps} Late' : 'On Track',
                      badgeColor: _summary.overdueFollowUps > 0 ? AppColors.alertRed : AppColors.neonLime,
                      icon: LucideIcons.calendarClock,
                      iconColor: AppColors.amber,
                      isDark: isDark,
                      onTap: () => widget.onNavigateTab?.call(3),
                    ),
                    const SizedBox(width: 8),
                    _buildCompactKpiCard(
                      label: 'SITE VISITS',
                      value: (_summary.scheduledVisits + _summary.completedVisits).toString(),
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
                  _buildPriorityFollowUpCard(_summary.nextPriorityFollowUp!, isDark),
                  const SizedBox(height: 20),
                ],

                // ── 4. Lead Pipeline Breakdown ────────────────────────────────
                _buildPipelineSection(isDark),
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

                // ── 8. Recent Leads Feed ──────────────────────────────────────
                _buildRecentLeadsList(isDark),
                const SizedBox(height: 20),

                // ── 9. Broker Quick Toolbox ───────────────────────────────────
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
                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
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
                  color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 8.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.3,
                  color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
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
    final interestText = (followUp.propertyInterest != null && followUp.propertyInterest!.trim().isNotEmpty)
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
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
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
                        isOverdue ? 'PRIORITY FOLLOW-UP • OVERDUE' : 'PRIORITY FOLLOW-UP • TODAY',
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
                    color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
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
                    followUp.contactName.isNotEmpty ? followUp.contactName[0].toUpperCase() : 'L',
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
                                color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
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
                          color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
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
                    icon: const Icon(LucideIcons.phoneCall, size: 15, color: Color(0xFF142407)),
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
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
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
                    icon: const Icon(LucideIcons.messageCircle, size: 15, color: Color(0xFF25D366)),
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
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
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
                    side: BorderSide(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  icon: const Icon(LucideIcons.check, size: 18, color: AppColors.neonLime),
                  onPressed: () async {
                    await _followUpsService.markComplete(followUp.id, leadId: followUp.leadId);
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

  // ── 4. Lead Pipeline Breakdown ──────────────────────────────────────────────
  Widget _buildPipelineSection(bool isDark) {
    final stages = [
      'All',
      'Fresh Leads',
      'Following Up',
      'Interested',
      'Meeting',
      'Done Deal',
    ];

    final Map<String, int> breakdown = _summary.statusBreakdown;
    final total = _summary.totalLeads > 0 ? _summary.totalLeads : 1;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.layers, size: 16, color: AppColors.neonLime),
                  const SizedBox(width: 8),
                  Text(
                    'Lead Pipeline Breakdown',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                    ),
                  ),
                ],
              ),
              GestureDetector(
                onTap: () => widget.onNavigateTab?.call(1),
                child: const Text(
                  'Full Funnel →',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.neonLime,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          SizedBox(
            height: 32,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: stages.length,
              separatorBuilder: (_, __) => const SizedBox(width: 6),
              itemBuilder: (context, index) {
                final st = stages[index];
                final isSelected = _selectedPipelineStage == st;
                final count = st == 'All' ? _summary.totalLeads : (breakdown[st] ?? 0);

                return GestureDetector(
                  onTap: () => setState(() => _selectedPipelineStage = st),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? AppColors.neonLime
                          : (isDark ? AppColors.darkBackground : AppColors.lightMuted),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: isSelected
                            ? AppColors.neonLime
                            : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
                      ),
                    ),
                    child: Text(
                      '$st ($count)',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: isSelected
                            ? const Color(0xFF142407)
                            : (isDark ? AppColors.darkForeground : AppColors.lightForeground),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 16),

          ...stages.where((s) => s != 'All').map((stageName) {
            if (_selectedPipelineStage != 'All' && _selectedPipelineStage != stageName) {
              return const SizedBox.shrink();
            }
            final count = breakdown[stageName] ?? 0;
            final ratio = (count / total).clamp(0.0, 1.0);
            final statusColor = AppColors.getStatusColors(stageName, isDark: isDark);

            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: statusColor.text,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            stageName,
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                              color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                            ),
                          ),
                        ],
                      ),
                      Text(
                        '$count leads (${(ratio * 100).toStringAsFixed(0)}%)',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: LinearProgressIndicator(
                      value: ratio > 0 ? ratio : 0.03,
                      minHeight: 7,
                      backgroundColor: isDark ? AppColors.darkBackground : AppColors.lightMuted,
                      valueColor: AlwaysStoppedAnimation<Color>(statusColor.text),
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

  // ── 5. Today's Action Tasks (Synced with Supabase `tasks` & `follow_ups`) ───
  Widget _buildTodayActionTasks(bool isDark) {
    final completedCount = _tasks.where((t) => t.isCompleted).length;
    final totalCount = _tasks.length;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.listChecks, size: 16, color: AppColors.neonLime),
                  const SizedBox(width: 8),
                  Text(
                    "Today's Action Tasks",
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
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
                  const Icon(LucideIcons.checkCircle2, size: 20, color: AppColors.neonLime),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'All assigned tasks and due follow-ups for today are complete!',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
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
                  : (priority == 'Medium' ? AppColors.amber : const Color(0xFF10B981));

              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: isDark ? AppColors.darkBackground : AppColors.lightMuted,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isDone
                        ? AppColors.neonLime.withAlpha(90)
                        : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
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
                          color: isDone ? AppColors.neonLime : Colors.transparent,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                            color: isDone ? AppColors.neonLime : const Color(0xFF94A3B8),
                            width: 1.8,
                          ),
                        ),
                        child: isDone
                            ? const Icon(LucideIcons.check, size: 14, color: Color(0xFF142407))
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
                                builder: (_) => LeadDetailScreen(leadId: item.leadId!),
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
                                decoration: isDone ? TextDecoration.lineThrough : null,
                                color: isDone
                                    ? (isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground)
                                    : (isDark ? AppColors.darkForeground : AppColors.lightForeground),
                              ),
                            ),
                            if (item.subtitle.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(
                                item.subtitle,
                                style: TextStyle(
                                  fontSize: 11,
                                  color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
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
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
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
    final targetCalls = _summary.targetCallsToday > 0 ? _summary.targetCallsToday : 30;
    final callsDone = _summary.callsToday;
    final progress = (callsDone / targetCalls).clamp(0.0, 1.0);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.activity, size: 16, color: AppColors.neonLime),
                  const SizedBox(width: 8),
                  Text(
                    'Daily Activity & SLA Score',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
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
                  color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
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
              backgroundColor: isDark ? AppColors.darkBackground : AppColors.lightMuted,
              valueColor: const AlwaysStoppedAnimation<Color>(AppColors.neonLime),
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
        border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
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
              color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
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
              color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
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
        border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.award, size: 16, color: AppColors.amber),
                  const SizedBox(width: 8),
                  Text(
                    'Action Leaderboard',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(
                  color: isDark ? AppColors.darkBackground : AppColors.lightMuted,
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
                    color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
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
              final displayName = b.isCurrentUser ? '${b.fullName} (You)' : b.fullName;

              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: b.isCurrentUser
                      ? (isDark ? const Color(0xFF16250F) : AppColors.secondary)
                      : (isDark ? AppColors.darkBackground : AppColors.lightMuted),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: b.isCurrentUser
                        ? AppColors.neonLime.withAlpha(100)
                        : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
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
                          backgroundColor: b.isCurrentUser ? AppColors.neonLime : const Color(0xFF3B82F6),
                          child: Text(
                            b.initials,
                            style: TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w800,
                              color: b.isCurrentUser ? const Color(0xFF142407) : Colors.white,
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
                                  color: isDark ? AppColors.darkCard : Colors.white,
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
                              fontWeight: b.isCurrentUser ? FontWeight.w800 : FontWeight.w600,
                              color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            '${b.leadsCount} leads • ${b.score} pts',
                            style: TextStyle(
                              fontSize: 10.5,
                              color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
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
                : (isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground),
          ),
        ),
      ),
    );
  }

  // ── 8. Recent Leads Feed ────────────────────────────────────────────────────
  Widget _buildRecentLeadsList(bool isDark) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.userPlus, size: 16, color: AppColors.neonLime),
                  const SizedBox(width: 8),
                  Text(
                    'Recent Leads Feed',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                    ),
                  ),
                ],
              ),
              GestureDetector(
                onTap: () => widget.onNavigateTab?.call(1),
                child: const Text(
                  'See All →',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.neonLime,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          if (_summary.recentLeads.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Center(
                child: Text(
                  'No leads added yet',
                  style: TextStyle(
                    fontSize: 13,
                    color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                  ),
                ),
              ),
            )
          else
            ..._summary.recentLeads.take(4).map((LeadModel lead) {
              final statusColors = AppColors.getStatusColors(lead.status, isDark: isDark);
              return InkWell(
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => LeadDetailScreen(leadId: lead.id)),
                  ).then((_) => _loadDashboard());
                },
                child: Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: isDark ? AppColors.darkBackground : AppColors.lightMuted,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
                  ),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 18,
                        backgroundColor: statusColors.bg,
                        child: Text(
                          lead.name.isNotEmpty ? lead.name[0].toUpperCase() : 'L',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: statusColors.text,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              lead.name.isNotEmpty ? lead.name : 'Unnamed Lead',
                              style: TextStyle(
                                fontSize: 13.5,
                                fontWeight: FontWeight.w700,
                                color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              lead.project ?? lead.propertyType ?? lead.phone,
                              style: TextStyle(
                                fontSize: 11.5,
                                color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        visualDensity: VisualDensity.compact,
                        icon: const Icon(LucideIcons.phone, size: 15, color: AppColors.neonLime),
                        onPressed: () => _callFollowUpOrLead(phone: lead.phone, lead: lead),
                      ),
                      IconButton(
                        visualDensity: VisualDensity.compact,
                        icon: const Icon(LucideIcons.messageCircle, size: 15, color: Color(0xFF25D366)),
                        onPressed: () => _openWhatsAppForLead(phone: lead.phone, lead: lead),
                      ),
                    ],
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }

  // ── 9. Broker Quick Toolbox ─────────────────────────────────────────────────
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
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: isDark ? AppColors.darkCard : Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
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
                        child: Icon(t['icon'] as IconData, size: 16, color: color),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        t['label'] as String,
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
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
