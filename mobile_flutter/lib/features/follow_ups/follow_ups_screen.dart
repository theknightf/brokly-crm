import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/currency_formatter.dart';
import '../../data/models/lead_model.dart';
import '../../state/leads_provider.dart';
import '../leads/lead_detail_screen.dart';
import '../leads/widgets/log_call_dialog.dart';
import '../leads/widgets/quick_note_dialog.dart';

class FollowUpsScreen extends StatefulWidget {
  const FollowUpsScreen({super.key});

  @override
  State<FollowUpsScreen> createState() => _FollowUpsScreenState();
}

class _FollowUpsScreenState extends State<FollowUpsScreen> {
  // 0: Late (Overdue), 1: Today, 2: Coming, 3: All
  int _activeSegment = 0;
  String _activeChip = 'all'; // 'all', 're-engagement', 'vip', 'hot'
  String _searchQuery = '';

  Future<void> _makeCall(BuildContext context, LeadModel lead) async {
    final cleanPhone = lead.phone.replaceAll(RegExp(r'\s+'), '');
    final uri = Uri.parse('tel:$cleanPhone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
      if (context.mounted) {
        LogCallDialog.show(context, lead: lead, initialChannel: 'Call');
      }
    }
  }

  Future<void> _openWhatsApp(BuildContext context, LeadModel lead) async {
    final cleanPhone = lead.phone.replaceAll(RegExp(r'\D'), '');
    final uri = Uri.parse('https://wa.me/$cleanPhone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (context.mounted) {
        LogCallDialog.show(context, lead: lead, initialChannel: 'WhatsApp');
      }
    }
  }

  void _markDone(BuildContext context, LeadModel lead) {
    context.read<LeadsProvider>().addNote(
      lead.id,
      'Follow-up marked completed on ${DateFormat('dd/MM/yyyy HH:mm').format(DateTime.now())}',
    );
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Follow-up marked done for ${lead.name}'),
        backgroundColor: AppColors.neonLime,
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final provider = context.watch<LeadsProvider>();
    final allLeads = provider.leads;

    // Filter leads with follow-up timestamps
    final followUpLeads = allLeads.where((l) {
      if (l.followUpDue == null || l.followUpDue!.trim().isEmpty) return false;
      final st = l.status.toLowerCase().trim();
      return st != 'done deal' &&
          st != 'won' &&
          st != 'lost' &&
          st != 'cancellation';
    }).toList();

    final now = DateTime.now();
    final todayStart = DateTime(now.year, now.month, now.day);
    final todayEnd = DateTime(now.year, now.month, now.day, 23, 59, 59);

    final overdueLeads = followUpLeads.where((l) {
      final d = l.followUpDateTime?.toLocal();
      return d != null && d.isBefore(todayStart);
    }).toList();

    final todayLeads = followUpLeads.where((l) {
      final d = l.followUpDateTime?.toLocal();
      return d != null && !d.isBefore(todayStart) && !d.isAfter(todayEnd);
    }).toList();

    final comingLeads = followUpLeads.where((l) {
      final d = l.followUpDateTime?.toLocal();
      return d != null && d.isAfter(todayEnd);
    }).toList();

    // Segment filtering
    List<LeadModel> displayed;
    switch (_activeSegment) {
      case 0:
        displayed = overdueLeads;
        break;
      case 1:
        displayed = todayLeads;
        break;
      case 2:
        displayed = comingLeads;
        break;
      default:
        displayed = followUpLeads;
        break;
    }

    // Secondary chip filtering
    if (_activeChip == 'vip') {
      displayed = displayed.where((l) => (l.budgetMax ?? 0) >= 3000000 || (l.budgetMin ?? 0) >= 2000000).toList();
    } else if (_activeChip == 'hot') {
      displayed = displayed.where((l) => l.status == 'Meeting' || l.status == 'Interested').toList();
    } else if (_activeChip == 're-engagement') {
      displayed = displayed.where((l) => l.status == 'Not Interested' || l.status == 'Pending Leads').toList();
    }

    // Search query
    if (_searchQuery.trim().isNotEmpty) {
      final q = _searchQuery.toLowerCase().trim();
      displayed = displayed.where((l) {
        return l.name.toLowerCase().contains(q) ||
            l.phone.contains(q) ||
            (l.project?.toLowerCase().contains(q) ?? false);
      }).toList();
    }

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0B0E14) : const Color(0xFFF8FAFC),
      body: SafeArea(
        child: Column(
          children: [
            // ── 1. Page Header & Live Queue Banner ───────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            'PIPELINE ENGINE',
                            style: TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.8,
                              color: isDark ? const Color(0xFF8B949E) : const Color(0xFF64748B),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.neonLime.withAlpha(25),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: AppColors.neonLime.withAlpha(80)),
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                SizedBox(
                                  width: 5,
                                  height: 5,
                                  child: DecoratedBox(
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: AppColors.neonLime,
                                    ),
                                  ),
                                ),
                                SizedBox(width: 5),
                                Text(
                                  'Live queue',
                                  style: TextStyle(
                                    fontSize: 9.5,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.neonLime,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 3),
                      Text(
                        'Follow-ups',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.5,
                          color: isDark ? Colors.white : const Color(0xFF0F172A),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${todayLeads.length + overdueLeads.length} actionable interactions pending today',
                        style: TextStyle(
                          fontSize: 11.5,
                          color: isDark ? const Color(0xFF8B949E) : const Color(0xFF64748B),
                        ),
                      ),
                    ],
                  ),
                  // Refresh Button
                  InkWell(
                    onTap: () => provider.fetchLeads(),
                    borderRadius: BorderRadius.circular(20),
                    child: Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: isDark ? const Color(0xFF161B22) : Colors.white,
                        border: Border.all(
                          color: isDark ? const Color(0xFF282D38) : AppColors.lightBorder,
                        ),
                      ),
                      child: const Center(
                        child: Icon(LucideIcons.refreshCw, size: 16, color: AppColors.neonLime),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // ── 2. Curved KPI Pill Cards Strip (Total, Overdue, Today, Coming)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Row(
                children: [
                  Expanded(
                    child: _buildKpiPill(
                      title: 'TOTAL',
                      count: followUpLeads.length,
                      color: isDark ? Colors.white : const Color(0xFF0F172A),
                      isDark: isDark,
                      onTap: () => setState(() => _activeSegment = 3),
                      isActive: _activeSegment == 3,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: _buildKpiPill(
                      title: 'OVERDUE',
                      count: overdueLeads.length,
                      color: AppColors.alertRed,
                      isDark: isDark,
                      onTap: () => setState(() => _activeSegment = 0),
                      isActive: _activeSegment == 0,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: _buildKpiPill(
                      title: 'TODAY',
                      count: todayLeads.length,
                      color: AppColors.amber,
                      isDark: isDark,
                      onTap: () => setState(() => _activeSegment = 1),
                      isActive: _activeSegment == 1,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: _buildKpiPill(
                      title: 'COMING',
                      count: comingLeads.length,
                      color: const Color(0xFF38BDF8),
                      isDark: isDark,
                      onTap: () => setState(() => _activeSegment = 2),
                      isActive: _activeSegment == 2,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 6),

            // ── 3. Search Bar ─────────────────────────────────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Container(
                height: 40,
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF12161D) : Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: isDark ? const Color(0xFF282D38) : AppColors.lightBorder,
                  ),
                ),
                child: Row(
                  children: [
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 12),
                      child: Icon(LucideIcons.search, size: 16, color: Color(0xFF8B949E)),
                    ),
                    Expanded(
                      child: TextField(
                        onChanged: (val) => setState(() => _searchQuery = val),
                        style: TextStyle(
                          fontSize: 12.5,
                          color: isDark ? Colors.white : Colors.black,
                        ),
                        decoration: const InputDecoration(
                          hintText: 'Search follow-ups, leads, projects...',
                          hintStyle: TextStyle(fontSize: 12, color: Color(0xFF8B949E)),
                          border: InputBorder.none,
                          isDense: true,
                          contentPadding: EdgeInsets.symmetric(vertical: 10),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),

            // ── 4. Segmented Time Tabs (Rounded-full Pill Bar) ─────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Container(
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF12161D) : const Color(0xFFE2E8F0),
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(
                    color: isDark ? const Color(0xFF21262D) : const Color(0xFFCBD5E1),
                  ),
                ),
                child: Row(
                  children: [
                    _buildSegmentTab(
                      index: 0,
                      label: 'Late',
                      count: overdueLeads.length,
                      color: AppColors.alertRed,
                      isDark: isDark,
                    ),
                    _buildSegmentTab(
                      index: 1,
                      label: 'Today',
                      count: todayLeads.length,
                      color: AppColors.amber,
                      isDark: isDark,
                    ),
                    _buildSegmentTab(
                      index: 2,
                      label: 'Coming',
                      count: comingLeads.length,
                      color: const Color(0xFF38BDF8),
                      isDark: isDark,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),

            // ── 5. Secondary Filter Chips (Horizontal Scroll) ─────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _buildFilterChip(
                      id: 'all',
                      label: 'All Items',
                      icon: LucideIcons.layers,
                      color: AppColors.neonLime,
                      isDark: isDark,
                    ),
                    const SizedBox(width: 6),
                    _buildFilterChip(
                      id: 'vip',
                      label: 'High Priority VIP',
                      icon: LucideIcons.badgeCheck,
                      color: AppColors.neonLime,
                      isDark: isDark,
                    ),
                    const SizedBox(width: 6),
                    _buildFilterChip(
                      id: 'hot',
                      label: 'Hot Buyers',
                      icon: LucideIcons.flame,
                      color: AppColors.alertRed,
                      isDark: isDark,
                    ),
                    const SizedBox(width: 6),
                    _buildFilterChip(
                      id: 're-engagement',
                      label: 'Re-engagement (Cold)',
                      icon: LucideIcons.history,
                      color: AppColors.amber,
                      isDark: isDark,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),

            // ── 6. Follow-up Cards List ───────────────────────────
            Expanded(
              child: displayed.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            LucideIcons.calendarCheck,
                            size: 44,
                            color: isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'No follow-ups in this queue',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'All scheduled tasks in this section are clear.',
                            style: TextStyle(
                              fontSize: 12,
                              color: isDark ? const Color(0xFF8B949E) : const Color(0xFF64748B),
                            ),
                          ),
                        ],
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 80),
                      itemCount: displayed.length,
                      itemBuilder: (context, index) {
                        final lead = displayed[index];
                        return _buildFollowUpQueueCard(context, lead, isDark);
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Sub-widget: KPI Pill
  Widget _buildKpiPill({
    required String title,
    required int count,
    required Color color,
    required bool isDark,
    required VoidCallback onTap,
    required bool isActive,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF161B22) : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isActive ? color.withAlpha(160) : (isDark ? const Color(0xFF282D38) : AppColors.lightBorder),
            width: isActive ? 1.5 : 1,
          ),
        ),
        child: Column(
          children: [
            Text(
              title,
              style: TextStyle(
                fontSize: 9.5,
                fontWeight: FontWeight.w800,
                color: isDark ? const Color(0xFF8B949E) : const Color(0xFF64748B),
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              count.toString(),
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Sub-widget: Segment Tab
  Widget _buildSegmentTab({
    required int index,
    required String label,
    required int count,
    required Color color,
    required bool isDark,
  }) {
    final isSelected = _activeSegment == index;

    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _activeSegment = index),
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 7),
          decoration: BoxDecoration(
            color: isSelected ? color.withAlpha(isDark ? 40 : 25) : Colors.transparent,
            borderRadius: BorderRadius.circular(20),
            border: isSelected ? Border.all(color: color.withAlpha(80)) : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (isSelected) ...[
                Container(
                  width: 5,
                  height: 5,
                  decoration: BoxDecoration(shape: BoxShape.circle, color: color),
                ),
                const SizedBox(width: 5),
              ],
              Text(
                label,
                style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                  color: isSelected
                      ? color
                      : (isDark ? const Color(0xFF8B949E) : const Color(0xFF64748B)),
                ),
              ),
              const SizedBox(width: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                decoration: BoxDecoration(
                  color: isSelected ? color : (isDark ? const Color(0xFF282D38) : const Color(0xFFCBD5E1)),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  count.toString(),
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    color: isSelected ? Colors.black : (isDark ? Colors.white : Colors.black),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Sub-widget: Filter Chip
  Widget _buildFilterChip({
    required String id,
    required String label,
    required IconData icon,
    required Color color,
    required bool isDark,
  }) {
    final isSelected = _activeChip == id;

    return InkWell(
      onTap: () => setState(() => _activeChip = id),
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: isSelected
              ? color.withAlpha(isDark ? 35 : 20)
              : (isDark ? const Color(0xFF161B22) : Colors.white),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected ? color.withAlpha(90) : (isDark ? const Color(0xFF282D38) : AppColors.lightBorder),
          ),
        ),
        child: Row(
          children: [
            Icon(icon, size: 12, color: isSelected ? color : (isDark ? const Color(0xFF8B949E) : const Color(0xFF64748B))),
            const SizedBox(width: 5),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.w800 : FontWeight.w500,
                color: isSelected ? color : (isDark ? const Color(0xFFCBD5E1) : const Color(0xFF475569)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Sub-widget: Follow-up Queue Card (Harmonized Action Suite)
  Widget _buildFollowUpQueueCard(BuildContext context, LeadModel lead, bool isDark) {
    final initials = lead.name.trim().isNotEmpty
        ? (lead.name.trim().split(' ').length > 1
            ? '${lead.name.trim().split(' ')[0][0]}${lead.name.trim().split(' ')[1][0]}'.toUpperCase()
            : lead.name.trim()[0].toUpperCase())
        : 'L';

    final isOverdue = lead.followUpDateTime?.isBefore(DateTime.now()) ?? false;
    final isVip = (lead.budgetMax ?? 0) >= 3000000;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF161B22) : Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: isOverdue
              ? AppColors.alertRed.withAlpha(80)
              : (isDark ? const Color(0xFF282D38) : AppColors.lightBorder),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(isDark ? 70 : 12),
            blurRadius: 14,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Top subtle urgent line
          if (isOverdue)
            Container(
              height: 2.5,
              margin: const EdgeInsets.symmetric(horizontal: 20),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Colors.transparent,
                    AppColors.alertRed.withAlpha(180),
                    Colors.transparent,
                  ],
                ),
              ),
            ),

          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 1. Header: Avatar + Lead info + Urgency badge
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Avatar Circle
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: isDark ? const Color(0xFF12161D) : const Color(0xFFF1F5F9),
                        border: Border.all(
                          color: isOverdue ? AppColors.alertRed : AppColors.neonLime,
                          width: 1.5,
                        ),
                      ),
                      child: Center(
                        child: Text(
                          initials,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: isOverdue ? AppColors.alertRed : AppColors.neonLime,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),

                    // Name + VIP Pill + View Profile link
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  lead.name,
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w800,
                                    color: isDark ? Colors.white : const Color(0xFF0F172A),
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              if (isVip) ...[
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1.5),
                                  decoration: BoxDecoration(
                                    color: AppColors.neonLime.withAlpha(25),
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(color: AppColors.neonLime.withAlpha(70)),
                                  ),
                                  child: const Text(
                                    'VIP BUYER',
                                    style: TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w800,
                                      color: AppColors.neonLime,
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                          const SizedBox(height: 2),
                          InkWell(
                            onTap: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => LeadDetailScreen(leadId: lead.id),
                                ),
                              );
                            },
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  'View Profile',
                                  style: TextStyle(fontSize: 10.5, color: Color(0xFF8B949E)),
                                ),
                                SizedBox(width: 2),
                                Icon(LucideIcons.arrowRight, size: 10, color: Color(0xFF8B949E)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),

                    // Urgency Pill
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: isOverdue
                            ? AppColors.alertRed.withAlpha(25)
                            : AppColors.neonLime.withAlpha(25),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: isOverdue
                              ? AppColors.alertRed.withAlpha(70)
                              : AppColors.neonLime.withAlpha(70),
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            isOverdue ? LucideIcons.alarmClock : LucideIcons.clock,
                            size: 11,
                            color: isOverdue ? AppColors.alertRed : AppColors.neonLime,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            isOverdue ? 'Overdue' : 'Due Today',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: isOverdue ? AppColors.alertRed : AppColors.neonLime,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),

                // 2. Project & Budget Details
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF0E1217) : const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          const Icon(LucideIcons.building, size: 13, color: AppColors.neonLime),
                          const SizedBox(width: 6),
                          Text(
                            lead.project?.isNotEmpty == true ? lead.project! : 'Private Residential Unit',
                            style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w600,
                              color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155),
                            ),
                          ),
                        ],
                      ),
                      if (lead.budgetMax != null || lead.budgetMin != null)
                        Text(
                          CurrencyFormatter.formatRange(lead.budgetMin, lead.budgetMax),
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w800,
                            color: isDark ? Colors.white : Colors.black,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),

                // 3. Dual Action Buttons: Call Lead & WhatsApp (Stitch Curved Pill style)
                Row(
                  children: [
                    Expanded(
                      child: InkWell(
                        onTap: () => _makeCall(context, lead),
                        borderRadius: BorderRadius.circular(24),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          decoration: BoxDecoration(
                            color: AppColors.neonLime,
                            borderRadius: BorderRadius.circular(24),
                            boxShadow: [
                              BoxShadow(
                                color: AppColors.neonLime.withAlpha(90),
                                blurRadius: 8,
                                offset: const Offset(0, 2),
                              ),
                            ],
                          ),
                          child: const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(LucideIcons.phone, size: 14, color: Color(0xFF0E1601)),
                              SizedBox(width: 6),
                              Text(
                                'Call Lead',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                  color: Color(0xFF0E1601),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: InkWell(
                        onTap: () => _openWhatsApp(context, lead),
                        borderRadius: BorderRadius.circular(24),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          decoration: BoxDecoration(
                            color: isDark ? const Color(0xFF13231B) : const Color(0xFFDCFCE7),
                            borderRadius: BorderRadius.circular(24),
                            border: Border.all(
                              color: const Color(0xFF22C55E).withAlpha(120),
                            ),
                          ),
                          child: const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(LucideIcons.messageCircle, size: 14, color: Color(0xFF22C55E)),
                              SizedBox(width: 6),
                              Text(
                                'WhatsApp',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFF22C55E),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),

                // 4. Footer Actions (Reschedule, Add Note, Mark Done)
                Container(
                  padding: const EdgeInsets.only(top: 8),
                  decoration: BoxDecoration(
                    border: Border(
                      top: BorderSide(
                        color: isDark ? const Color(0xFF21262D) : AppColors.lightBorder,
                      ),
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      // Reschedule
                      InkWell(
                        onTap: () {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Reschedule flow')),
                          );
                        },
                        borderRadius: BorderRadius.circular(8),
                        child: Row(
                          children: [
                            const Icon(LucideIcons.calendar, size: 12, color: Color(0xFF8B949E)),
                            const SizedBox(width: 4),
                            Text(
                              'Reschedule',
                              style: TextStyle(
                                fontSize: 11,
                                color: isDark ? const Color(0xFF8B949E) : const Color(0xFF64748B),
                              ),
                            ),
                          ],
                        ),
                      ),
                      // Add Note
                      InkWell(
                        onTap: () {
                          QuickNoteDialog.show(
                            context,
                            leadName: lead.name,
                            onSaveNote: (note) => context.read<LeadsProvider>().addNote(lead.id, note),
                          );
                        },
                        borderRadius: BorderRadius.circular(8),
                        child: Row(
                          children: [
                            const Icon(LucideIcons.fileText, size: 12, color: Color(0xFF8B949E)),
                            const SizedBox(width: 4),
                            Text(
                              'Add Note',
                              style: TextStyle(
                                fontSize: 11,
                                color: isDark ? const Color(0xFF8B949E) : const Color(0xFF64748B),
                              ),
                            ),
                          ],
                        ),
                      ),
                      // Mark Done
                      InkWell(
                        onTap: () => _markDone(context, lead),
                        borderRadius: BorderRadius.circular(8),
                        child: const Row(
                          children: [
                            Icon(LucideIcons.checkCircle2, size: 13, color: AppColors.neonLime),
                            SizedBox(width: 4),
                            Text(
                              'Mark Done',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: AppColors.neonLime,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
