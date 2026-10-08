import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/currency_formatter.dart';
import '../../data/models/dashboard_summary_model.dart';
import '../../data/models/follow_up_model.dart';
import '../../data/services/dashboard_service.dart';
import '../../data/services/follow_ups_service.dart';
import '../../state/auth_provider.dart';
import '../../state/leads_provider.dart';
import '../attendance/widgets/attendance_hero_card.dart';

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

    final firstName = profile != null && profile.fullName.trim().isNotEmpty
        ? profile.fullName.trim().split(' ')[0]
        : 'Faris';

    final formattedDate = DateFormat('EEEE, d MMMM').format(DateTime.now());

    // Follow-ups counts loaded from FollowUpsService with timezone and status normalization
    final overdueCount = _followUpCounts['overdue'] ?? 0;
    final dueTodayCount = _followUpCounts['today'] ?? 0;
    final upcomingCount = _followUpCounts['upcoming'] ?? 0;

    return Scaffold(
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : RefreshIndicator(
              onRefresh: _loadDashboard,
              color: AppColors.primary,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // ── 1. Greeting Banner ──────────────────────────────
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${_getGreeting()}, $firstName ☀️',
                                style: TextStyle(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w800,
                                  fontFamily: 'serif',
                                  color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                                ),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                formattedDate,
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                  color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                                ),
                              ),
                            ],
                          ),
                        ),
                        // "Last 30 days" filter tag
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: isDark ? AppColors.darkCard : Colors.white,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                'Last 30 days',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                                ),
                              ),
                              const SizedBox(width: 4),
                              Icon(
                                LucideIcons.chevronDown,
                                size: 12,
                                color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Attendance Hero (Quick Check-In / Check-Out)
                    const AttendanceHeroCard(),
                    const SizedBox(height: 20),

                    // ── 2. Scheduled Follow-ups Section ────────────────
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Scheduled Follow-ups',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            fontFamily: 'serif',
                            color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                          ),
                        ),
                        Row(
                          children: [
                            _buildQueueBadge('Today', dueTodayCount, AppColors.amber, isDark),
                            const SizedBox(width: 6),
                            _buildQueueBadge('Overdue', overdueCount, AppColors.alertRed, isDark),
                            const SizedBox(width: 6),
                            _buildQueueBadge('Upcoming', upcomingCount, AppColors.tealCyan, isDark),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // Follow-ups card or empty state
                    if (_isLoadingFollowUps)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(24),
                        decoration: BoxDecoration(
                          color: isDark ? AppColors.darkCard : Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                          ),
                        ),
                        child: const Center(
                          child: SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.neonLime),
                          ),
                        ),
                      )
                    else if (_followUps.isEmpty)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: isDark ? AppColors.darkCard : Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                          ),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 40,
                              height: 40,
                              decoration: BoxDecoration(
                                color: isDark ? const Color(0xFF142407) : const Color(0xFFF0FCD8),
                                shape: BoxShape.circle,
                              ),
                              child: const Center(
                                child: Icon(
                                  LucideIcons.circleCheck,
                                  size: 22,
                                  color: AppColors.neonLime,
                                ),
                              ),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'All caught up for today!',
                                    style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700,
                                      color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    'No pending follow-ups scheduled for today.',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            TextButton(
                              onPressed: () => widget.onNavigateTab?.call(3), // Switch to Follow-ups
                              child: const Text(
                                'View all',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.neonLime,
                                ),
                              ),
                            ),
                          ],
                        ),
                      )
                    else
                      Column(
                        children: [
                          ..._followUps.map((item) {
                            return Container(
                              margin: const EdgeInsets.only(bottom: 10),
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: isDark ? AppColors.darkCard : Colors.white,
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(
                                  color: item.isOverdue
                                      ? AppColors.alertRed.withAlpha(80)
                                      : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
                                ),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      // Initials Avatar
                                      CircleAvatar(
                                        radius: 17,
                                        backgroundColor: isDark ? const Color(0xFF1E2632) : const Color(0xFFF1F5F9),
                                        child: Text(
                                          item.contactName.trim().isNotEmpty
                                              ? (item.contactName.trim().split(' ').length > 1
                                                  ? '${item.contactName.trim().split(' ')[0][0]}${item.contactName.trim().split(' ')[1][0]}'.toUpperCase()
                                                  : item.contactName.trim()[0].toUpperCase())
                                              : 'C',
                                          style: TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w700,
                                            color: isDark ? AppColors.neonLime : const Color(0xFF166534),
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              item.contactName,
                                              style: TextStyle(
                                                fontSize: 13,
                                                fontWeight: FontWeight.w700,
                                                color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                                              ),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                            if (item.propertyInterest != null && item.propertyInterest!.isNotEmpty)
                                              Text(
                                                item.propertyInterest!,
                                                style: TextStyle(
                                                  fontSize: 11,
                                                  color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                                                ),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                          ],
                                        ),
                                      ),
                                      // Due pill
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                        decoration: BoxDecoration(
                                          color: item.isOverdue
                                              ? AppColors.alertRed.withAlpha(25)
                                              : AppColors.amber.withAlpha(25),
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Icon(
                                              item.isOverdue ? LucideIcons.alertTriangle : LucideIcons.clock,
                                              size: 11,
                                              color: item.isOverdue ? AppColors.alertRed : AppColors.amber,
                                            ),
                                            const SizedBox(width: 4),
                                            Text(
                                              item.isOverdue
                                                  ? 'Overdue'
                                                  : (item.dueTime != null && item.dueTime!.isNotEmpty
                                                      ? 'Today • ${item.dueTime}'
                                                      : 'Today'),
                                              style: TextStyle(
                                                fontSize: 10,
                                                fontWeight: FontWeight.w700,
                                                color: item.isOverdue ? AppColors.alertRed : AppColors.amber,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                  if (item.notes != null && item.notes!.trim().isNotEmpty) ...[
                                    const SizedBox(height: 8),
                                    Text(
                                      item.notes!.trim(),
                                      style: TextStyle(
                                        fontSize: 12,
                                        fontStyle: FontStyle.italic,
                                        color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                                      ),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ],
                                  const SizedBox(height: 10),
                                  Divider(
                                    height: 1,
                                    color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                                  ),
                                  const SizedBox(height: 8),
                                  // Actions Row
                                  Row(
                                    children: [
                                      // Call
                                      InkWell(
                                        onTap: () => _makeCall(item.contactPhone),
                                        borderRadius: BorderRadius.circular(8),
                                        child: Padding(
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                          child: Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              const Icon(LucideIcons.phone, size: 14, color: AppColors.neonLime),
                                              const SizedBox(width: 5),
                                              Text(
                                                'Call',
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
                                      const SizedBox(width: 8),
                                      // WhatsApp
                                      InkWell(
                                        onTap: () => _openWhatsApp(item.contactPhone),
                                        borderRadius: BorderRadius.circular(8),
                                        child: Padding(
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                          child: Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              const Icon(LucideIcons.messageCircle, size: 14, color: Color(0xFF25D366)),
                                              const SizedBox(width: 5),
                                              Text(
                                                'WhatsApp',
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
                                      const Spacer(),
                                      // Complete button
                                      InkWell(
                                        onTap: () => _completeFollowUp(item),
                                        borderRadius: BorderRadius.circular(8),
                                        child: Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                          decoration: BoxDecoration(
                                            color: isDark ? const Color(0xFF142407) : const Color(0xFFF0FCD8),
                                            borderRadius: BorderRadius.circular(8),
                                            border: Border.all(
                                              color: AppColors.neonLime.withAlpha(100),
                                            ),
                                          ),
                                          child: const Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              Icon(LucideIcons.circleCheck, size: 13, color: AppColors.neonLime),
                                              SizedBox(width: 4),
                                              Text(
                                                'Complete',
                                                style: TextStyle(
                                                  fontSize: 11,
                                                  fontWeight: FontWeight.w700,
                                                  color: AppColors.neonLime,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            );
                          }),
                          const SizedBox(height: 4),
                          InkWell(
                            onTap: () => widget.onNavigateTab?.call(3),
                            borderRadius: BorderRadius.circular(12),
                            child: Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(vertical: 10),
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: isDark ? AppColors.darkCard : Colors.white,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                                ),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    'View all follow-ups (${_followUpCounts['total'] ?? _followUps.length})',
                                    style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.neonLime,
                                    ),
                                  ),
                                  const SizedBox(width: 4),
                                  const Icon(LucideIcons.arrowRight, size: 14, color: AppColors.neonLime),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    const SizedBox(height: 24),

                    // ── 3. Metrics Grid (2 columns) ─────────────────────
                    Text(
                      'Overview & Targets',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        fontFamily: 'serif',
                        color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Row 1: "My targets" & "My tasks"
                    Row(
                      children: [
                        // Card 1: My targets (Daily calls progress bar)
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.all(14),
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
                                    Text(
                                      'MY TARGETS',
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w800,
                                        letterSpacing: 0.5,
                                        color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                                      ),
                                    ),
                                    const Icon(LucideIcons.target, size: 16, color: AppColors.neonLime),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                Text(
                                  '${_summary.todayCalls} / 30 calls',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w800,
                                    color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(4),
                                  child: LinearProgressIndicator(
                                    value: (_summary.todayCalls / 30).clamp(0.0, 1.0),
                                    backgroundColor: isDark ? const Color(0xFF21262D) : const Color(0xFFE5E7EB),
                                    valueColor: const AlwaysStoppedAnimation<Color>(AppColors.neonLime),
                                    minHeight: 6,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  '${((_summary.todayCalls / 30) * 100).toInt()}% completed',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),

                        // Card 2: My tasks
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.all(14),
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
                                    Text(
                                      'MY TASKS',
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w800,
                                        letterSpacing: 0.5,
                                        color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                                      ),
                                    ),
                                    const Icon(LucideIcons.clipboardCheck, size: 16, color: Color(0xFF38BDF8)),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                Text(
                                  '${dueTodayCount + overdueCount} Pending',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w800,
                                    color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: overdueCount > 0
                                        ? AppColors.alertRed.withAlpha(20)
                                        : AppColors.tealCyan.withAlpha(20),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    overdueCount > 0 ? '$overdueCount High priority' : 'On schedule',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: overdueCount > 0 ? AppColors.alertRed : AppColors.tealCyan,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  'Action required today',
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // Row 2: Total Leads & Pipeline Value
                    Row(
                      children: [
                        // Card 3: Total Leads
                        Expanded(
                          child: InkWell(
                            onTap: () => widget.onNavigateTab?.call(1),
                            borderRadius: BorderRadius.circular(16),
                            child: Container(
                              padding: const EdgeInsets.all(14),
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
                                      Text(
                                        'TOTAL LEADS',
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w800,
                                          letterSpacing: 0.5,
                                          color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                                        ),
                                      ),
                                      const Icon(LucideIcons.users, size: 16, color: AppColors.neonLime),
                                    ],
                                  ),
                                  const SizedBox(height: 10),
                                  Text(
                                    _summary.totalLeads.toString(),
                                    style: TextStyle(
                                      fontSize: 20,
                                      fontWeight: FontWeight.w800,
                                      color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    '${_summary.freshLeads} fresh new',
                                    style: const TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.neonLime,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),

                        // Card 4: Pipeline Value
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.all(14),
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
                                    Text(
                                      'PIPELINE VALUE',
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w800,
                                        letterSpacing: 0.5,
                                        color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                                      ),
                                    ),
                                    const Icon(LucideIcons.wallet, size: 16, color: Color(0xFFF59E0B)),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                Text(
                                  CurrencyFormatter.format(_summary.totalPipelineValue),
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w800,
                                    color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  '${_summary.wonDeals} deals closed',
                                  style: const TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: Color(0xFF10B981),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),

                    // ── 4. Stage Count Cards (2 columns with percentages)
                    Text(
                      'Pipeline Stages',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        fontFamily: 'serif',
                        color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                      ),
                    ),
                    const SizedBox(height: 12),

                    _buildStageGrid(isDark, leadsProvider),
                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildQueueBadge(String label, int count, Color color, bool isDark) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withAlpha(isDark ? 30 : 20),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withAlpha(80)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
          const SizedBox(width: 4),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              count.toString(),
              style: const TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w800,
                color: Colors.black,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStageGrid(bool isDark, LeadsProvider leadsProvider) {
    final stages = [
      {'name': 'Fresh Leads', 'color': const Color(0xFF84CC16)},
      {'name': 'Cold Calls', 'color': const Color(0xFF22C55E)},
      {'name': 'Pending Leads', 'color': const Color(0xFF64748B)},
      {'name': 'Following Up', 'color': const Color(0xFF0284C7)},
      {'name': 'Meeting', 'color': const Color(0xFF10B981)},
      {'name': 'Interested', 'color': const Color(0xFF14B8A6)},
      {'name': 'Done Deal', 'color': const Color(0xFF4D7C0F)},
      {'name': 'Not Interested', 'color': const Color(0xFF6B7280)},
    ];

    final total = _summary.totalLeads > 0 ? _summary.totalLeads : 1;

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 2.1,
      ),
      itemCount: stages.length,
      itemBuilder: (context, index) {
        final stage = stages[index];
        final name = stage['name'] as String;
        final color = stage['color'] as Color;
        final count = _summary.statusCounts[name] ?? 0;
        final percent = ((count / total) * 100).toInt();

        return InkWell(
          onTap: () {
            leadsProvider.setStatusFilter(name);
            widget.onNavigateTab?.call(1); // Jump to Leads
          },
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkCard : Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 4,
                  height: double.infinity,
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        name,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          Text(
                            count.toString(),
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                            decoration: BoxDecoration(
                              color: color.withAlpha(isDark ? 40 : 25),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              '$percent%',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: color,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
