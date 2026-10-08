import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/currency_formatter.dart';
import '../../core/utils/date_utils.dart';
import '../../data/models/lead_model.dart';
import '../../data/services/call_logs_service.dart';
import '../../data/services/leads_service.dart';
import '../../state/leads_provider.dart';
import 'edit_lead_screen.dart';
import 'widgets/log_call_dialog.dart';
import 'widgets/quick_note_dialog.dart';
import 'widgets/status_change_sheet.dart';

class LeadDetailScreen extends StatefulWidget {
  final String leadId;

  const LeadDetailScreen({super.key, required this.leadId});

  @override
  State<LeadDetailScreen> createState() => _LeadDetailScreenState();
}

class _LeadDetailScreenState extends State<LeadDetailScreen> with SingleTickerProviderStateMixin {
  final LeadsService _leadsService = LeadsService();
  final CallLogsService _callLogsService = CallLogsService();

  LeadModel? _lead;
  bool _isLoading = true;
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadLead();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadLead() async {
    setState(() => _isLoading = true);
    final data = await _leadsService.getById(widget.leadId);
    if (mounted) {
      setState(() {
        _lead = data;
        _isLoading = false;
      });
    }
  }

  Future<void> _makeCall() async {
    if (_lead == null) return;
    final uri = Uri.parse('tel:${_lead!.phone.replaceAll(RegExp(r'\s+'), '')}');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
      if (mounted) {
        LogCallDialog.show(context, lead: _lead!, initialChannel: 'Call');
      }
    }
  }

  Future<void> _openWhatsApp() async {
    if (_lead == null) return;
    final uri = Uri.parse('https://wa.me/${_lead!.phone.replaceAll(RegExp(r'\D'), '')}');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (mounted) {
        LogCallDialog.show(context, lead: _lead!, initialChannel: 'WhatsApp');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    if (_isLoading) {
      return Scaffold(
        appBar: AppBar(title: const Text('Lead Details')),
        body: const Center(child: CircularProgressIndicator(color: AppColors.primary)),
      );
    }

    if (_lead == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Lead Details')),
        body: const Center(child: Text('Lead not found')),
      );
    }

    final lead = _lead!;
    final statusColors = AppColors.getStatusColors(lead.status, isDark: isDark);

    return Scaffold(
      appBar: AppBar(
        title: Text(lead.name.isNotEmpty ? lead.name : 'Lead Profile'),
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.edit2, size: 18),
            onPressed: () async {
              final updated = await Navigator.push<bool>(
                context,
                MaterialPageRoute(builder: (_) => EditLeadScreen(lead: lead)),
              );
              if (updated == true) _loadLead();
            },
          ),
          IconButton(
            icon: const Icon(LucideIcons.trash2, size: 18, color: Color(0xFFEF4444)),
            onPressed: () => _confirmDelete(),
          ),
        ],
      ),
      body: NestedScrollView(
        headerSliverBuilder: (context, _) => [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Hero Info Card
                  Container(
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
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    lead.name,
                                    style: TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.w800,
                                      color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    lead.phone,
                                    style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                      color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            GestureDetector(
                              onTap: () {
                                StatusChangeSheet.show(
                                  context,
                                  currentStatus: lead.status,
                                  onSelectStatus: (newStatus) async {
                                    await context.read<LeadsProvider>().updateStatus(lead.id, newStatus);
                                    _loadLead();
                                  },
                                );
                              },
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                                decoration: BoxDecoration(
                                  color: statusColors.bg,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      lead.status,
                                      style: TextStyle(
                                        color: statusColors.text,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    const SizedBox(width: 4),
                                    Icon(LucideIcons.chevronDown, size: 12, color: statusColors.text),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),

                        // Action Buttons Bar
                        Row(
                          children: [
                            Expanded(
                              child: ElevatedButton.icon(
                                icon: const Icon(LucideIcons.phone, size: 16),
                                label: const Text('Call'),
                                onPressed: _makeCall,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.primary,
                                  foregroundColor: Colors.white,
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: ElevatedButton.icon(
                                icon: const Icon(LucideIcons.messageCircle, size: 16),
                                label: const Text('WhatsApp'),
                                onPressed: _openWhatsApp,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF25D366),
                                  foregroundColor: Colors.white,
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            IconButton.filledTonal(
                              icon: const Icon(LucideIcons.plusCircle, size: 18),
                              onPressed: () => LogCallDialog.show(context, lead: lead),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          SliverPersistentHeader(
            pinned: true,
            delegate: _SliverAppBarDelegate(
              TabBar(
                controller: _tabController,
                indicatorColor: AppColors.primary,
                labelColor: AppColors.primary,
                unselectedLabelColor: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                tabs: const [
                  Tab(text: 'Details'),
                  Tab(text: 'Notes'),
                  Tab(text: 'Calls'),
                ],
              ),
              isDark ? AppColors.darkCard : Colors.white,
            ),
          ),
        ],
        body: TabBarView(
          controller: _tabController,
          children: [
            // Tab 1: Details
            _buildDetailsTab(lead, isDark),
            // Tab 2: Notes
            _buildNotesTab(lead, isDark),
            // Tab 3: Calls
            _buildCallsTab(lead, isDark),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailsTab(LeadModel lead, bool isDark) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _buildInfoTile('Project', lead.project ?? '—', LucideIcons.building2, isDark),
        _buildInfoTile('Budget', CurrencyFormatter.formatRange(lead.budgetMin, lead.budgetMax), LucideIcons.coins, isDark),
        _buildInfoTile('Property Type', lead.propertyType ?? '—', LucideIcons.home, isDark),
        _buildInfoTile('Lead Source', lead.source ?? '—', LucideIcons.compass, isDark),
        _buildInfoTile('Assigned Agent', lead.assignedToName ?? lead.agent ?? 'Unassigned', LucideIcons.user, isDark),
        _buildInfoTile('Priority', lead.priority, LucideIcons.flag, isDark),
        _buildInfoTile('Follow-up Due', AppDateUtils.formatDate(lead.followUpDue), LucideIcons.calendarClock, isDark),
        _buildInfoTile('Created On', AppDateUtils.formatDate(lead.createdAt), LucideIcons.clock, isDark),
      ],
    );
  }

  Widget _buildNotesTab(LeadModel lead, bool isDark) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Notes & Activity',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                ),
              ),
              TextButton.icon(
                icon: const Icon(LucideIcons.plus, size: 16),
                label: const Text('Add Note'),
                onPressed: () {
                  QuickNoteDialog.show(
                    context,
                    leadName: lead.name,
                    onSaveNote: (note) async {
                      await context.read<LeadsProvider>().addNote(lead.id, note);
                      _loadLead();
                    },
                  );
                },
              ),
            ],
          ),
          const SizedBox(height: 12),
          Expanded(
            child: lead.notes != null && lead.notes!.isNotEmpty
                ? Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: isDark ? AppColors.darkCard : Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                      ),
                    ),
                    child: SingleChildScrollView(
                      child: Text(
                        lead.notes!,
                        style: TextStyle(
                          fontSize: 14,
                          height: 1.5,
                          color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                        ),
                      ),
                    ),
                  )
                : Center(
                    child: Text(
                      'No notes logged yet',
                      style: TextStyle(
                        fontSize: 13,
                        color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildCallsTab(LeadModel lead, bool isDark) {
    return FutureBuilder(
      future: _callLogsService.getAll(entityId: lead.id),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator(color: AppColors.primary));
        }

        final calls = snapshot.data!;
        if (calls.isEmpty) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  LucideIcons.phoneCall,
                  size: 40,
                  color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                ),
                const SizedBox(height: 12),
                Text(
                  'No calls recorded for this lead',
                  style: TextStyle(
                    fontSize: 14,
                    color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                  ),
                ),
                const SizedBox(height: 12),
                ElevatedButton.icon(
                  icon: const Icon(LucideIcons.plus, size: 16),
                  label: const Text('Log First Touchpoint'),
                  onPressed: () => LogCallDialog.show(context, lead: lead),
                ),
              ],
            ),
          );
        }

        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: calls.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (context, index) {
            final call = calls[index];
            final outcomeColor = AppColors.getOutcomeColor(call.outcome);

            return Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: isDark ? AppColors.darkCard : Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    call.direction == 'incoming' ? LucideIcons.phoneIncoming : LucideIcons.phoneOutgoing,
                    size: 18,
                    color: AppColors.primary,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              call.channel,
                              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: outcomeColor.withAlpha(25),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                call.outcome,
                                style: TextStyle(
                                  color: outcomeColor,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ],
                        ),
                        if (call.notes != null && call.notes!.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(
                              call.notes!,
                              style: TextStyle(
                                fontSize: 12,
                                color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  Text(
                    AppDateUtils.formatDuration(call.durationSeconds),
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildInfoTile(String label, String value, IconData icon, bool isDark) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
        ),
      ),
      child: Row(
        children: [
          Icon(icon, size: 16, color: AppColors.primary),
          const SizedBox(width: 12),
          Text(
            label,
            style: TextStyle(
              fontSize: 13,
              color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
            ),
          ),
          const Spacer(),
          Text(
            value,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
            ),
          ),
        ],
      ),
    );
  }

  void _confirmDelete() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Lead'),
        content: Text('Are you sure you want to delete ${_lead?.name}?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await context.read<LeadsProvider>().deleteLead(widget.leadId);
              if (mounted) Navigator.pop(context);
            },
            child: const Text('Delete', style: TextStyle(color: Color(0xFFEF4444))),
          ),
        ],
      ),
    );
  }
}

class _SliverAppBarDelegate extends SliverPersistentHeaderDelegate {
  final TabBar _tabBar;
  final Color backgroundColor;

  _SliverAppBarDelegate(this._tabBar, this.backgroundColor);

  @override
  double get minExtent => _tabBar.preferredSize.height;
  @override
  double get maxExtent => _tabBar.preferredSize.height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      color: backgroundColor,
      child: _tabBar,
    );
  }

  @override
  bool shouldRebuild(_SliverAppBarDelegate oldDelegate) {
    return false;
  }
}
