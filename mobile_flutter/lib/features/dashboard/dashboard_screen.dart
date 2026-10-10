import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/app_colors.dart';
import '../../data/models/dashboard_summary_model.dart';
import '../../data/models/follow_up_model.dart';
import '../../data/services/dashboard_service.dart';
import '../../data/services/follow_ups_service.dart';
import '../../state/attendance_provider.dart';
import '../../state/auth_provider.dart';
import '../../state/leads_provider.dart';
import '../attendance/widgets/attendance_hero_card.dart';
import 'widgets/stage_pipeline_grid.dart';

class DashboardScreen extends StatefulWidget {
  final ValueChanged<int>? onNavigateTab;

  const DashboardScreen({super.key, this.onNavigateTab});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final DashboardService _service = DashboardService();
  final FollowUpsService _followUpsService = FollowUpsService();

  DashboardSummaryModel _summary = DashboardSummaryModel();
  List<FollowUpModel> _followUps = [];
  Map<String, int> _followUpCounts = {'today': 0, 'overdue': 0, 'upcoming': 0, 'total': 0};
  bool _isLoading = true;
  bool _isLoadingFollowUps = true;

  // Today's Action Checklist interactive states
  final Set<int> _completedTaskIndices = {2}; // Pre-check mock index 2 for realistic progress (e.g., 2 of 4 done)
  String _activeLeaderboardTab = 'dials';

  @override
  void initState() {
    super.initState();
    _loadDashboard();
  }

  Future<void> _loadDashboard() async {
    setState(() {
      _isLoading = true;
      _isLoadingFollowUps = true;
    });

    try {
      final results = await Future.wait([
        _service.getSummary(),
        _followUpsService.getTodayAndOverdue(limit: 5),
        _followUpsService.getCounts(),
      ]);

      if (mounted) {
        setState(() {
          _summary = results[0] as DashboardSummaryModel;
          _followUps = results[1] as List<FollowUpModel>;
          _followUpCounts = results[2] as Map<String, int>;
          _isLoading = false;
          _isLoadingFollowUps = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _isLoadingFollowUps = false;
        });
      }
    }
  }

  Future<void> _makeCall(String? phone) async {
    if (phone == null || phone.trim().isEmpty) return;
    final clean = phone.replaceAll(RegExp(r'\s+'), '');
    final uri = Uri.parse('tel:$clean');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Future<void> _openWhatsApp(String? phone) async {
    if (phone == null || phone.trim().isEmpty) return;
    final clean = phone.replaceAll(RegExp(r'\D'), '');
    final uri = Uri.parse('https://wa.me/$clean');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _completeFollowUp(FollowUpModel item) async {
    setState(() {
      _followUps.removeWhere((f) => f.id == item.id);
      final todayCount = _followUpCounts['today'] ?? 0;
      final overdueCount = _followUpCounts['overdue'] ?? 0;
      if (item.isOverdue && overdueCount > 0) {
        _followUpCounts['overdue'] = overdueCount - 1;
      } else if (item.isDueToday && todayCount > 0) {
        _followUpCounts['today'] = todayCount - 1;
      }
    });

    try {
      await _followUpsService.markComplete(item.id, leadId: item.leadId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Follow-up with ${item.contactName} completed!'),
            backgroundColor: AppColors.neonLime,
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 2),
          ),
        );
      }
    } catch (_) {}
  }

  String _getGreeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final auth = context.watch<AuthProvider>();
    final profile = auth.profile;
    final leadsProvider = context.watch<LeadsProvider>();
    final attendanceProvider = context.watch<AttendanceProvider>();

    final firstName = profile != null && profile.fullName.trim().isNotEmpty
        ? profile.fullName.trim().split(' ')[0]
        : 'Sarah';

    final formattedDate = DateFormat('EEEE, MMM d').format(DateTime.now());

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0B0E14) : const Color(0xFFF8FAFC),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.neonLime))
          : RefreshIndicator(
              onRefresh: _loadDashboard,
              color: AppColors.neonLime,
              backgroundColor: isDark ? const Color(0xFF161B22) : Colors.white,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // ── 1. Greeting & Date Banner ──────────────────────
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Text(
                                    '${_getGreeting()}, $firstName',
                                    style: TextStyle(
                                      fontSize: 22,
                                      fontWeight: FontWeight.w700,
                                      letterSpacing: -0.3,
                                      color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  const Text('☀️', style: TextStyle(fontSize: 18)),
                                ],
                              ),
                              const SizedBox(height: 3),
                              Text(
                                'Here is your daily action pipeline — $formattedDate',
                                style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w500,
                                  color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),

                    // ── 2. GPS Verified Clock-In Strip ──────────────────
                    _buildShiftReadinessStrip(isDark, attendanceProvider),
                    const SizedBox(height: 18),

                    // ── 3. Urgent Priority Follow-up Queue ──────────────
                    _buildPriorityFollowUpQueue(isDark),
                    const SizedBox(height: 18),

                    // ── 4. Today's Action Tasks ─────────────────────────
                    _buildTodayActionTasks(isDark),
                    const SizedBox(height: 18),

                    // ── 5. Daily Activity & SLA Stats ───────────────────
                    _buildDailyActivityStats(isDark),
                    const SizedBox(height: 22),

                    // ── 6. Authentic Brokly Stage Status Cards (Curved & Rounded Grid)
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Text(
                              'LEAD STAGES & PIPELINE',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.8,
                                color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                              ),
                            ),
                          ],
                        ),
                        InkWell(
                          onTap: () => widget.onNavigateTab?.call(1),
                          child: const Row(
                            children: [
                              Text(
                                'Overview',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.neonLime,
                                ),
                              ),
                              SizedBox(width: 3),
                              Icon(LucideIcons.arrowRight, size: 13, color: AppColors.neonLime),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    StagePipelineGrid(
                      statusCounts: _summary.statusCounts,
                      totalLeads: _summary.totalLeads,
                      onStageTap: (stage) {
                        leadsProvider.setStatusFilter(stage);
                        widget.onNavigateTab?.call(1); // Jump to leads screen
                      },
                    ),
                    const SizedBox(height: 22),

                    // ── 7. Action-Based Leaderboard ─────────────────────
                    _buildActionLeaderboard(isDark),
                    const SizedBox(height: 20),

                    // ── 8. Broker Quick Toolbox ─────────────────────────
                    _buildQuickToolbox(isDark),
                    const SizedBox(height: 28),
                  ],
                ),
              ),
            ),
    );
  }

  // ── Sub-component 1: Shift Readiness Strip
  Widget _buildShiftReadinessStrip(bool isDark, AttendanceProvider attendance) {
    final isCheckedIn = attendance.isCheckedIn;
    final isCheckedOut = attendance.isCheckedOut;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF141820) : Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isDark ? const Color(0xFF242A38) : AppColors.lightBorder,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(isDark ? 60 : 10),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          // Glowing Pulse Dot
          Container(
            width: 9,
            height: 9,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isCheckedIn && !isCheckedOut ? AppColors.neonLime : const Color(0xFF64748B),
              boxShadow: isCheckedIn && !isCheckedOut
                  ? [
                      BoxShadow(
                        color: AppColors.neonLime.withAlpha(180),
                        blurRadius: 8,
                        spreadRadius: 2,
                      ),
                    ]
                  : null,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isCheckedOut
                      ? 'Shift Completed'
                      : isCheckedIn
                          ? 'Clocked In'
                          : 'Shift Ready (Not clocked in)',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  isCheckedIn
                      ? 'GPS Verified (Office HQ)'
                      : 'Tap to punch attendance record',
                  style: TextStyle(
                    fontSize: 11,
                    color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                  ),
                ),
              ],
            ),
          ),
          // Action button
          InkWell(
            onTap: () {
              showModalBottomSheet(
                context: context,
                backgroundColor: Colors.transparent,
                builder: (_) => const Padding(
                  padding: EdgeInsets.all(16),
                  child: AttendanceHeroCard(),
                ),
              );
            },
            borderRadius: BorderRadius.circular(20),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF202634) : const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: isDark ? const Color(0xFF2E3648) : const Color(0xFFE2E8F0),
                ),
              ),
              child: const Text(
                'Details',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: AppColors.neonLime,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Sub-component 2: Priority Follow-up Queue
  Widget _buildPriorityFollowUpQueue(bool isDark) {
    final overdueCount = _followUpCounts['overdue'] ?? 0;
    final topFollowUp = _followUps.isNotEmpty ? _followUps.first : null;

    return Column(
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
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.neonLime,
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.neonLime,
                        blurRadius: 6,
                        spreadRadius: 1,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                const Text(
                  'PRIORITY FOLLOW-UP QUEUE',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.8,
                    color: AppColors.neonLime,
                  ),
                ),
              ],
            ),
            if (overdueCount > 0)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.alertRed.withAlpha(35),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.alertRed.withAlpha(90)),
                ),
                child: Text(
                  '$overdueCount Overdue',
                  style: const TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.alertRed,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 10),

        // Urgent Card
        if (_isLoadingFollowUps)
          Container(
            height: 140,
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF141820) : Colors.white,
              borderRadius: BorderRadius.circular(22),
            ),
            child: const Center(
              child: SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.neonLime),
              ),
            ),
          )
        else if (topFollowUp != null)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF141820) : Colors.white,
              borderRadius: BorderRadius.circular(22),
              border: Border.all(
                color: topFollowUp.isOverdue
                    ? AppColors.alertRed.withAlpha(100)
                    : AppColors.neonLime.withAlpha(100),
                width: 1.2,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withAlpha(isDark ? 80 : 15),
                  blurRadius: 16,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  topFollowUp.contactName,
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w800,
                                    color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                decoration: BoxDecoration(
                                  color: isDark ? const Color(0xFF222834) : const Color(0xFFF1F5F9),
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: isDark ? const Color(0xFF2E3748) : const Color(0xFFE2E8F0),
                                  ),
                                ),
                                child: const Text(
                                  'VIP Buyer',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.neonLime,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 5),
                          Row(
                            children: [
                              const Icon(LucideIcons.building, size: 13, color: AppColors.neonLime),
                              const SizedBox(width: 5),
                              Expanded(
                                child: Text(
                                  topFollowUp.propertyInterest?.isNotEmpty == true
                                      ? topFollowUp.propertyInterest!
                                      : 'Downtown Villa (Tour Requested)',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 5),
                          Row(
                            children: [
                              Icon(
                                LucideIcons.alarmClock,
                                size: 12,
                                color: topFollowUp.isOverdue ? AppColors.alertRed : AppColors.amber,
                              ),
                              const SizedBox(width: 5),
                              Text(
                                topFollowUp.isOverdue
                                    ? 'Callback was scheduled recently (Overdue)'
                                    : (topFollowUp.dueTime != null ? 'Due today at ${topFollowUp.dueTime}' : 'Due today'),
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: topFollowUp.isOverdue ? AppColors.alertRed : AppColors.amber,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: topFollowUp.isOverdue
                            ? AppColors.alertRed.withAlpha(30)
                            : AppColors.neonLime.withAlpha(30),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: topFollowUp.isOverdue
                              ? AppColors.alertRed.withAlpha(90)
                              : AppColors.neonLime.withAlpha(90),
                        ),
                      ),
                      child: Text(
                        topFollowUp.isOverdue ? 'URGENT' : 'TODAY',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: topFollowUp.isOverdue ? AppColors.alertRed : AppColors.neonLime,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                // Pill Action Buttons (Call Now & WhatsApp)
                Row(
                  children: [
                    Expanded(
                      child: InkWell(
                        onTap: () => _makeCall(topFollowUp.contactPhone),
                        borderRadius: BorderRadius.circular(24),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 9),
                          decoration: BoxDecoration(
                            color: AppColors.neonLime,
                            borderRadius: BorderRadius.circular(24),
                            boxShadow: [
                              BoxShadow(
                                color: AppColors.neonLime.withAlpha(100),
                                blurRadius: 10,
                                offset: const Offset(0, 2),
                              ),
                            ],
                          ),
                          child: const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(LucideIcons.phone, size: 15, color: Color(0xFF142407)),
                              SizedBox(width: 6),
                              Text(
                                'Call Now',
                                style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w800,
                                  color: Color(0xFF142407),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: InkWell(
                        onTap: () => _openWhatsApp(topFollowUp.contactPhone),
                        borderRadius: BorderRadius.circular(24),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 9),
                          decoration: BoxDecoration(
                            color: isDark ? const Color(0xFF222834) : const Color(0xFFF1F5F9),
                            borderRadius: BorderRadius.circular(24),
                            border: Border.all(
                              color: isDark ? const Color(0xFF2E3748) : const Color(0xFFE2E8F0),
                            ),
                          ),
                          child: const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(LucideIcons.messageCircle, size: 15, color: Color(0xFF25D366)),
                              SizedBox(width: 6),
                              Text(
                                'WhatsApp',
                                style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.neonLime,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    // Complete check button
                    InkWell(
                      onTap: () => _completeFollowUp(topFollowUp),
                      borderRadius: BorderRadius.circular(24),
                      child: Container(
                        padding: const EdgeInsets.all(9),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF1A2A14) : const Color(0xFFF0FCD8),
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: AppColors.neonLime.withAlpha(120),
                          ),
                        ),
                        child: const Icon(LucideIcons.check, size: 15, color: AppColors.neonLime),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          )
        else
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF141820) : Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: isDark ? const Color(0xFF242A38) : AppColors.lightBorder,
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: const BoxDecoration(
                    color: Color(0xFF142407),
                    shape: BoxShape.circle,
                  ),
                  child: const Center(
                    child: Icon(LucideIcons.circleCheck, color: AppColors.neonLime, size: 20),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Priority queue clear',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'No urgent follow-up callbacks pending right now.',
                        style: TextStyle(
                          fontSize: 11,
                          color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                        ),
                      ),
                    ],
                  ),
                ),
                TextButton(
                  onPressed: () => widget.onNavigateTab?.call(3),
                  child: const Text(
                    'View all',
                    style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppColors.neonLime),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  // ── Sub-component 3: Today's Action Tasks
  Widget _buildTodayActionTasks(bool isDark) {
    final tasks = [
      {
        'title': 'Upload inspection notes for Downtown Villa',
        'badge': 'Due in 45m',
        'badgeColor': AppColors.alertRed,
        'subtitle': 'Client: Omar Al-Sayed · 3 photos needed',
        'tag': 'Site Tour',
        'action': 'Attach Notes',
      },
      {
        'title': 'Complete 30 scheduled outbound dials',
        'badge': '${_summary.todayCalls} / 30 Dials',
        'badgeColor': const Color(0xFFFAB005),
        'subtitle': 'Shift target: 120 calls before 06:00 PM',
        'progress': (_summary.todayCalls / 30).clamp(0.0, 1.0),
        'action': 'Open Auto-Dialer',
      },
      {
        'title': 'Prep contract dossier for VIP viewing',
        'badge': 'Done',
        'badgeColor': AppColors.neonLime,
        'subtitle': 'Delivered to Concierge Desk',
        'tag': 'Contract',
        'action': '',
      },
    ];

    final doneCount = _completedTaskIndices.length;
    final totalCount = tasks.length;
    final percent = ((doneCount / totalCount) * 100).toInt();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                const Icon(LucideIcons.listTodo, size: 16, color: AppColors.neonLime),
                const SizedBox(width: 8),
                Text(
                  "TODAY'S ACTION TASKS",
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.8,
                    color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                  ),
                ),
              ],
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: AppColors.neonLime.withAlpha(25),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.neonLime.withAlpha(70)),
              ),
              child: Text(
                '$doneCount of $totalCount Done ($percent%)',
                style: const TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  color: AppColors.neonLime,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),

        // Task Cards List
        ...tasks.asMap().entries.map((entry) {
          final index = entry.key;
          final task = entry.value;
          final isDone = _completedTaskIndices.contains(index);

          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF141820) : Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: isDone
                    ? (isDark ? const Color(0xFF1E2430) : const Color(0xFFE2E8F0))
                    : (isDark ? const Color(0xFF262C3A) : AppColors.lightBorder),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Checkbox toggle button
                InkWell(
                  onTap: () {
                    setState(() {
                      if (isDone) {
                        _completedTaskIndices.remove(index);
                      } else {
                        _completedTaskIndices.add(index);
                      }
                    });
                  },
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    width: 22,
                    height: 22,
                    margin: const EdgeInsets.only(top: 2, right: 10),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: isDone ? AppColors.neonLime : Colors.transparent,
                      border: Border.all(
                        color: isDone ? AppColors.neonLime : (isDark ? const Color(0xFF4A5568) : const Color(0xFFCBD5E1)),
                        width: 1.8,
                      ),
                    ),
                    child: isDone
                        ? const Center(
                            child: Icon(LucideIcons.check, size: 14, color: Color(0xFF142407)),
                          )
                        : null,
                  ),
                ),

                // Content
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              task['title'] as String,
                              style: TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                                decoration: isDone ? TextDecoration.lineThrough : null,
                                color: isDone
                                    ? (isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground)
                                    : (isDark ? AppColors.darkForeground : AppColors.lightForeground),
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: (task['badgeColor'] as Color).withAlpha(25),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: (task['badgeColor'] as Color).withAlpha(70),
                              ),
                            ),
                            child: Text(
                              task['badge'] as String,
                              style: TextStyle(
                                fontSize: 9.5,
                                fontWeight: FontWeight.w700,
                                color: task['badgeColor'] as Color,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 3),
                      Text(
                        task['subtitle'] as String,
                        style: TextStyle(
                          fontSize: 11,
                          color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                        ),
                      ),
                      if (task.containsKey('progress')) ...[
                        const SizedBox(height: 6),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: task['progress'] as double,
                            backgroundColor: isDark ? const Color(0xFF222734) : const Color(0xFFE2E8F0),
                            valueColor: const AlwaysStoppedAnimation<Color>(AppColors.neonLime),
                            minHeight: 4,
                          ),
                        ),
                      ],
                      if ((task['action'] as String).isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            Text(
                              task['action'] as String,
                              style: const TextStyle(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w700,
                                color: AppColors.neonLime,
                              ),
                            ),
                            const SizedBox(width: 3),
                            const Icon(LucideIcons.arrowRight, size: 11, color: AppColors.neonLime),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  // ── Sub-component 4: Daily Activity & SLA Stats (3 Columns)
  Widget _buildDailyActivityStats(bool isDark) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'DAILY ACTIVITY & SLA',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.8,
                color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
              ),
            ),
            const Row(
              children: [
                Icon(LucideIcons.award, size: 14, color: AppColors.neonLime),
                SizedBox(width: 4),
                Text(
                  'Top Performer #1',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: AppColors.neonLime,
                  ),
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 10),

        Row(
          children: [
            // Dials
            Expanded(
              child: _buildMetricTile(
                title: 'DIALS',
                value: '${_summary.todayCalls}',
                target: '/120',
                progress: (_summary.todayCalls / 120).clamp(0.0, 1.0),
                progressColor: AppColors.neonLime,
                isDark: isDark,
              ),
            ),
            const SizedBox(width: 8),
            // Site Tours
            Expanded(
              child: _buildMetricTile(
                title: 'SITE TOURS',
                value: '${_summary.wonDeals}',
                target: ' Done',
                progress: 0.75,
                progressColor: const Color(0xFF22C55E),
                isDark: isDark,
              ),
            ),
            const SizedBox(width: 8),
            // SLA Score
            Expanded(
              child: _buildMetricTile(
                title: 'SLA SCORE',
                value: '98.4%',
                target: '',
                progress: 0.984,
                progressColor: AppColors.neonLime,
                isDark: isDark,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildMetricTile({
    required String title,
    required String value,
    required String target,
    required double progress,
    required Color progressColor,
    required bool isDark,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF141820) : Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: isDark ? const Color(0xFF262C3A) : AppColors.lightBorder,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 9.5,
              fontWeight: FontWeight.w700,
              color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                value,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                ),
              ),
              if (target.isNotEmpty)
                Text(
                  target,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w500,
                    color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress,
              backgroundColor: isDark ? const Color(0xFF222734) : const Color(0xFFE2E8F0),
              valueColor: AlwaysStoppedAnimation<Color>(progressColor),
              minHeight: 4,
            ),
          ),
        ],
      ),
    );
  }

  // ── Sub-component 5: Action-Based Leaderboard
  Widget _buildActionLeaderboard(bool isDark) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                const Icon(LucideIcons.trophy, size: 16, color: AppColors.neonLime),
                const SizedBox(width: 8),
                Text(
                  'ACTION-BASED LEADERBOARD',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.8,
                    color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                  ),
                ),
              ],
            ),
            Text(
              'Live Shift Standings',
              style: TextStyle(
                fontSize: 11,
                color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),

        // Filter Pills
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _buildLeaderboardTab('dials', 'Dials / Calls', isDark),
              const SizedBox(width: 6),
              _buildLeaderboardTab('tours', 'Site Tours', isDark),
              const SizedBox(width: 6),
              _buildLeaderboardTab('meetings', 'Meetings Held', isDark),
              const SizedBox(width: 6),
              _buildLeaderboardTab('followups', 'Follow-ups', isDark),
            ],
          ),
        ),
        const SizedBox(height: 10),

        // Ranking Cards Container
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF141820) : Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: isDark ? const Color(0xFF242A38) : AppColors.lightBorder,
            ),
          ),
          child: Column(
            children: [
              // Rank 1 (You)
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF1E2533) : const Color(0xFFF0FDF4),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.neonLime.withAlpha(100)),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 22,
                      height: 22,
                      decoration: const BoxDecoration(
                        color: AppColors.neonLime,
                        shape: BoxShape.circle,
                      ),
                      child: const Center(
                        child: Text(
                          '1',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF142407)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.neonLime.withAlpha(50),
                      ),
                      child: const Center(
                        child: Text(
                          'SM',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.neonLime),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  'Sarah Mansour (You)',
                                  style: TextStyle(
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w800,
                                    color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                decoration: BoxDecoration(
                                  color: AppColors.neonLime.withAlpha(30),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Text(
                                  'TOP #1',
                                  style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: AppColors.neonLime),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 2),
                          const Text(
                            '🔥 Daily Pacesetter',
                            style: TextStyle(fontSize: 10.5, color: Color(0xFFFF922B)),
                          ),
                        ],
                      ),
                    ),
                    const Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          '84',
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.neonLime),
                        ),
                        Text('Dials today', style: TextStyle(fontSize: 9, color: AppColors.mutedText)),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),

              // Rank 2
              _buildLeaderboardRow(
                rank: '2',
                initials: 'TK',
                name: 'Tariq Khalid',
                sub: '⚡ Speed Dial Champion',
                value: '79',
                isDark: isDark,
              ),
              const SizedBox(height: 8),

              // Rank 3
              _buildLeaderboardRow(
                rank: '3',
                initials: 'ER',
                name: 'Elena Rostova',
                sub: 'Sustained Outbound',
                value: '71',
                isDark: isDark,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildLeaderboardTab(String id, String label, bool isDark) {
    final isSelected = _activeLeaderboardTab == id;

    return InkWell(
      onTap: () => setState(() => _activeLeaderboardTab = id),
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.neonLime
              : (isDark ? const Color(0xFF141820) : Colors.white),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected
                ? AppColors.neonLime
                : (isDark ? const Color(0xFF282F3E) : AppColors.lightBorder),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
            color: isSelected
                ? const Color(0xFF142407)
                : (isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground),
          ),
        ),
      ),
    );
  }

  Widget _buildLeaderboardRow({
    required String rank,
    required String initials,
    required String name,
    required String sub,
    required String value,
    required bool isDark,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF181C26) : const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Container(
            width: 22,
            height: 22,
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF282F3E) : const Color(0xFFE2E8F0),
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                rank,
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isDark ? const Color(0xFF222834) : const Color(0xFFE2E8F0),
            ),
            child: Center(
              child: Text(
                initials,
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                  ),
                ),
                Text(
                  sub,
                  style: TextStyle(
                    fontSize: 10,
                    color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                value,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                ),
              ),
              const Text('Dials today', style: TextStyle(fontSize: 9, color: AppColors.mutedText)),
            ],
          ),
        ],
      ),
    );
  }

  // ── Sub-component 6: Broker Quick Toolbox
  Widget _buildQuickToolbox(bool isDark) {
    final tools = [
      {'icon': LucideIcons.calculator, 'label': 'Unit Calculator'},
      {'icon': LucideIcons.share2, 'label': 'Send Brochure'},
      {'icon': LucideIcons.building2, 'label': 'Search Inventory'},
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'BROKER QUICK TOOLS',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
          ),
        ),
        const SizedBox(height: 10),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: tools.map((tool) {
              return Container(
                margin: const EdgeInsets.only(right: 8),
                child: InkWell(
                  onTap: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('${tool['label']} selected'),
                        duration: const Duration(seconds: 1),
                      ),
                    );
                  },
                  borderRadius: BorderRadius.circular(20),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF141820) : Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: isDark ? const Color(0xFF262C3A) : AppColors.lightBorder,
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(tool['icon'] as IconData, size: 16, color: AppColors.neonLime),
                        const SizedBox(width: 8),
                        Text(
                          tool['label'] as String,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ),
      ],
    );
  }
}
