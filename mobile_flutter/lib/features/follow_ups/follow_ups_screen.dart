import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../data/models/lead_model.dart';
import '../../state/leads_provider.dart';
import '../leads/lead_detail_screen.dart';
import '../leads/widgets/lead_card.dart';

class FollowUpsScreen extends StatefulWidget {
  const FollowUpsScreen({super.key});

  @override
  State<FollowUpsScreen> createState() => _FollowUpsScreenState();
}

class _FollowUpsScreenState extends State<FollowUpsScreen> {
  int _activeTab = 0; // 0: All, 1: Overdue, 2: Today, 3: Upcoming
  bool _filtersExpanded = false;
  String _selectedPriority = 'All Priorities';
  String _selectedChannel = 'All Channels';

  final List<String> _tabs = ['All', 'Overdue', 'Today', 'Upcoming'];

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final provider = context.watch<LeadsProvider>();
    final allLeads = provider.leads;

    // Filter active leads that have follow-ups (exclude terminal / closed stages)
    final followUpLeads = allLeads.where((l) {
      if (l.followUpDue == null || l.followUpDue!.trim().isEmpty) return false;
      final st = l.status.toLowerCase().trim();
      return st != 'done deal' &&
          st != 'won' &&
          st != 'lost' &&
          st != 'not interested' &&
          st != 'cancelled' &&
          st != 'cancellation' &&
          st != 'duplicate leads';
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

    final upcomingLeads = followUpLeads.where((l) {
      final d = l.followUpDateTime?.toLocal();
      return d != null && d.isAfter(todayEnd);
    }).toList();
    final completedCount = allLeads.where((l) => l.actionTakenToday).length;

    // Filter by tab
    List<LeadModel> displayed;
    switch (_activeTab) {
      case 1:
        displayed = overdueLeads;
        break;
      case 2:
        displayed = todayLeads;
        break;
      case 3:
        displayed = upcomingLeads;
        break;
      default:
        displayed = followUpLeads;
    }

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            // ── 1. Header: "Follow-ups" + "+ Schedule Follow-up" Button
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Follow-ups',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      fontFamily: 'serif',
                      color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                    ),
                  ),
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.neonLime,
                      foregroundColor: const Color(0xFF142407),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      minimumSize: Size.zero,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      elevation: 3,
                    ),
                    icon: const Icon(LucideIcons.plus, size: 16),
                    label: const Text(
                      '+ Schedule Follow-up',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    onPressed: () => _showScheduleDialog(context, allLeads),
                  ),
                ],
              ),
            ),

            // ── 2. 4-Card Summary: Total, Overdue, Due Today, Completed
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  Expanded(
                    child: _buildSummaryCard(
                      title: 'Total',
                      count: followUpLeads.length,
                      color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                      isDark: isDark,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _buildSummaryCard(
                      title: 'Overdue',
                      count: overdueLeads.length,
                      color: AppColors.alertRed,
                      isDark: isDark,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _buildSummaryCard(
                      title: 'Due Today',
                      count: todayLeads.length,
                      color: AppColors.amber,
                      isDark: isDark,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _buildSummaryCard(
                      title: 'Completed',
                      count: completedCount,
                      color: const Color(0xFF22C55E),
                      isDark: isDark,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // ── 3. Tab Switcher & Filter Toggle Button
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  Expanded(
                    child: Container(
                      height: 38,
                      padding: const EdgeInsets.all(3),
                      decoration: BoxDecoration(
                        color: isDark ? AppColors.darkCard : Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                        ),
                      ),
                      child: Row(
                        children: List.generate(_tabs.length, (idx) {
                          final isSelected = _activeTab == idx;
                          return Expanded(
                            child: InkWell(
                              onTap: () => setState(() => _activeTab = idx),
                              borderRadius: BorderRadius.circular(8),
                              child: Container(
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: isSelected
                                      ? AppColors.neonLime
                                      : Colors.transparent,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  _tabs[idx],
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: isSelected ? FontWeight.w800 : FontWeight.w500,
                                    color: isSelected
                                        ? const Color(0xFF142407)
                                        : (isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground),
                                  ),
                                ),
                              ),
                            ),
                          );
                        }),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  // Filter Expand Toggle
                  IconButton.filledTonal(
                    icon: Icon(
                      _filtersExpanded ? LucideIcons.chevronUp : LucideIcons.slidersHorizontal,
                      size: 18,
                      color: _filtersExpanded ? AppColors.neonLime : null,
                    ),
                    style: IconButton.styleFrom(
                      backgroundColor: isDark ? AppColors.darkCard : Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(
                          color: _filtersExpanded
                              ? AppColors.neonLime
                              : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
                        ),
                      ),
                    ),
                    onPressed: () => setState(() => _filtersExpanded = !_filtersExpanded),
                  ),
                ],
              ),
            ),

            // ── 4. Expandable Filter Panel with Multi-Select Dropdowns
            AnimatedCrossFade(
              duration: const Duration(milliseconds: 200),
              crossFadeState: _filtersExpanded ? CrossFadeState.showSecond : CrossFadeState.showFirst,
              firstChild: const SizedBox(height: 8),
              secondChild: Container(
                margin: const EdgeInsets.fromLTRB(16, 10, 16, 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: isDark ? AppColors.darkCard : Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                  ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        initialValue: _selectedPriority,
                        decoration: InputDecoration(
                          labelText: 'Priority',
                          contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                          isDense: true,
                        ),
                        items: ['All Priorities', 'High', 'Normal', 'Low']
                            .map((p) => DropdownMenuItem(value: p, child: Text(p, style: const TextStyle(fontSize: 12))))
                            .toList(),
                        onChanged: (val) => setState(() => _selectedPriority = val!),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        initialValue: _selectedChannel,
                        decoration: InputDecoration(
                          labelText: 'Channel',
                          contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                          isDense: true,
                        ),
                        items: ['All Channels', 'Call', 'WhatsApp', 'Meeting']
                            .map((c) => DropdownMenuItem(value: c, child: Text(c, style: const TextStyle(fontSize: 12))))
                            .toList(),
                        onChanged: (val) => setState(() => _selectedChannel = val!),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // ── 5. Follow-ups List
            Expanded(
              child: displayed.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            LucideIcons.calendarCheck,
                            size: 44,
                            color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'No follow-ups found for "${_tabs[_activeTab]}"',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'All scheduled tasks in this category are completed.',
                            style: TextStyle(
                              fontSize: 12,
                              color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                            ),
                          ),
                        ],
                      ),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 6, 16, 80),
                      itemCount: displayed.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                      itemBuilder: (context, index) {
                        final lead = displayed[index];
                        return LeadCard(
                          lead: lead,
                          onTap: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => LeadDetailScreen(leadId: lead.id),
                              ),
                            );
                          },
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSummaryCard({
    required String title,
    required int count,
    required Color color,
    required bool isDark,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
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
          Text(
            title,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Text(
            count.toString(),
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w900,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  void _showScheduleDialog(BuildContext context, List<LeadModel> leads) {
    if (leads.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No leads available to schedule follow-up')),
      );
      return;
    }

    String selectedLeadId = leads.first.id;
    DateTime selectedDate = DateTime.now().add(const Duration(days: 1));
    final notesController = TextEditingController();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).brightness == Brightness.dark ? AppColors.darkCard : Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 20,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Schedule Follow-up',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                      ),
                      IconButton(
                        icon: const Icon(LucideIcons.x, size: 20),
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    initialValue: selectedLeadId,
                    decoration: const InputDecoration(labelText: 'Select Lead'),
                    items: leads.map((l) {
                      return DropdownMenuItem(
                        value: l.id,
                        child: Text('${l.name} (${l.phone})', overflow: TextOverflow.ellipsis),
                      );
                    }).toList(),
                    onChanged: (val) => setModalState(() => selectedLeadId = val!),
                  ),
                  const SizedBox(height: 12),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Due Date & Time', style: TextStyle(fontSize: 13)),
                    subtitle: Text(
                      '${selectedDate.day}/${selectedDate.month}/${selectedDate.year} at ${selectedDate.hour}:${selectedDate.minute.toString().padLeft(2, '0')}',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    trailing: const Icon(LucideIcons.calendar, color: AppColors.neonLime),
                    onTap: () async {
                      final pickedDate = await showDatePicker(
                        context: context,
                        initialDate: selectedDate,
                        firstDate: DateTime.now(),
                        lastDate: DateTime.now().add(const Duration(days: 365)),
                      );
                      if (pickedDate != null && context.mounted) {
                        final pickedTime = await showTimePicker(
                          context: context,
                          initialTime: TimeOfDay.fromDateTime(selectedDate),
                        );
                        if (pickedTime != null) {
                          setModalState(() {
                            selectedDate = DateTime(
                              pickedDate.year,
                              pickedDate.month,
                              pickedDate.day,
                              pickedTime.hour,
                              pickedTime.minute,
                            );
                          });
                        }
                      }
                    },
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: notesController,
                    decoration: const InputDecoration(labelText: 'Follow-up Notes / Task Objective'),
                    maxLines: 2,
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.neonLime,
                        foregroundColor: const Color(0xFF142407),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: () async {
                        Navigator.pop(ctx);
                        final provider = context.read<LeadsProvider>();
                        await provider.updateLead(
                          selectedLeadId,
                          {
                            'follow_up_due': selectedDate.toIso8601String(),
                            if (notesController.text.isNotEmpty)
                              'notes': notesController.text.trim(),
                          },
                        );
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Follow-up scheduled successfully!')),
                          );
                        }
                      },
                      child: const Text('Save Follow-up', style: TextStyle(fontWeight: FontWeight.w800)),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}
