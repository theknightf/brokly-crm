import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../data/models/lead_model.dart';
import '../../state/leads_provider.dart';
import 'lead_detail_screen.dart';
import 'widgets/lead_card.dart';
import 'widgets/lead_kanban_board.dart';
import 'widgets/leads_filter_sheet.dart';

class LeadsScreen extends StatefulWidget {
  const LeadsScreen({super.key});

  @override
  State<LeadsScreen> createState() => _LeadsScreenState();
}

class _LeadsScreenState extends State<LeadsScreen> {
  String _selectedProject = 'All Projects';
  String _selectedPropertyType = 'All Types';
  String _activeTag = 'All Leads';

  final List<String> _projectOptions = [
    'All Projects',
    'Mountain View iCity',
    'Badya Palm Hills',
    'Villette Sodic',
    'Zed Towers',
    'Mivida Emaar',
    'Swan Lake',
  ];

  final List<String> _propertyTypeOptions = [
    'All Types',
    'Villa & Penthouse',
    'Apartment',
    'Townhouse',
    'Twin House',
    'Duplex',
    'Commercial',
  ];

  final List<Map<String, dynamic>> _quickFilterTags = const [
    {'name': 'All Leads', 'color': null},
    {'name': 'Action Today', 'color': Color(0xFFF59E0B)},
    {'name': 'Called', 'color': Color(0xFF10B981)},
    {'name': 'Not Called', 'color': Color(0xFFF43F5E)},
  ];

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final provider = context.watch<LeadsProvider>();

    // Apply secondary filters on top of provider leads
    List<LeadModel> displayedLeads = provider.leads;

    if (_selectedProject != 'All Projects') {
      displayedLeads = displayedLeads.where((l) => l.project == _selectedProject).toList();
    }
    if (_selectedPropertyType != 'All Types') {
      if (_selectedPropertyType == 'Villa & Penthouse') {
        displayedLeads = displayedLeads
            .where((l) =>
                (l.propertyType?.toLowerCase().contains('villa') ?? false) ||
                (l.propertyType?.toLowerCase().contains('penthouse') ?? false))
            .toList();
      } else {
        displayedLeads = displayedLeads.where((l) => l.propertyType == _selectedPropertyType).toList();
      }
    }

    if (_activeTag == 'Action Today') {
      displayedLeads = displayedLeads.where((l) => l.actionTakenToday).toList();
    } else if (_activeTag == 'Called') {
      displayedLeads = displayedLeads.where((l) => l.status != 'Fresh Leads').toList();
    } else if (_activeTag == 'Not Called') {
      displayedLeads = displayedLeads.where((l) => l.status == 'Fresh Leads' || l.status == 'Cold Calls').toList();
    }

    final totalCount = provider.leads.length;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0B0D10) : const Color(0xFFF8FAFC),
      body: SafeArea(
        child: Column(
          children: [
            // ── 1. Luxury Header Summary Strip (Breadcrumb, Leads Hub Title, Count badge, View toggle)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(LucideIcons.chevronLeft, size: 12, color: isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8)),
                          const SizedBox(width: 4),
                          Text(
                            'Workspace',
                            style: TextStyle(
                              fontSize: 11,
                              color: isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
                            ),
                          ),
                          Text(
                            ' / ',
                            style: TextStyle(
                              fontSize: 11,
                              color: isDark ? const Color(0xFF475569) : const Color(0xFFCBD5E1),
                            ),
                          ),
                          Text(
                            'Active Pipeline',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: isDark ? const Color(0xFFE2E8F0) : const Color(0xFF334155),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 3),
                      Row(
                        children: [
                          Text(
                            'Leads Hub',
                            style: TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.5,
                              color: isDark ? Colors.white : const Color(0xFF0F172A),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2.5),
                            decoration: BoxDecoration(
                              color: AppColors.neonLime.withAlpha(25),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: AppColors.neonLime.withAlpha(80),
                              ),
                            ),
                            child: Text(
                              '$totalCount Total',
                              style: const TextStyle(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w800,
                                color: AppColors.neonLime,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),

                  // View Toggle & Actions (Export, List vs Kanban)
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(2),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF1E222B) : const Color(0xFFF1F5F9),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: isDark ? const Color(0xFF282D38) : const Color(0xFFE2E8F0),
                          ),
                        ),
                        child: Row(
                          children: [
                            InkWell(
                              onTap: () {
                                if (provider.isKanban) provider.toggleViewMode();
                              },
                              borderRadius: BorderRadius.circular(8),
                              child: Container(
                                padding: const EdgeInsets.all(6),
                                decoration: BoxDecoration(
                                  color: !provider.isKanban ? AppColors.neonLime : Colors.transparent,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Icon(
                                  LucideIcons.list,
                                  size: 15,
                                  color: !provider.isKanban
                                      ? const Color(0xFF142407)
                                      : (isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B)),
                                ),
                              ),
                            ),
                            InkWell(
                              onTap: () {
                                if (!provider.isKanban) provider.toggleViewMode();
                              },
                              borderRadius: BorderRadius.circular(8),
                              child: Container(
                                padding: const EdgeInsets.all(6),
                                decoration: BoxDecoration(
                                  color: provider.isKanban ? AppColors.neonLime : Colors.transparent,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Icon(
                                  LucideIcons.columns,
                                  size: 15,
                                  color: provider.isKanban
                                      ? const Color(0xFF142407)
                                      : (isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B)),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // ── 2. Search Input with Filter Pill Button ──────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Container(
                height: 44,
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF161920) : Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: isDark ? const Color(0xFF282D38) : AppColors.lightBorder,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withAlpha(isDark ? 50 : 8),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 12),
                      child: Icon(LucideIcons.search, size: 16, color: Color(0xFF94A3B8)),
                    ),
                    Expanded(
                      child: TextField(
                        onChanged: (q) => provider.setSearchQuery(q),
                        style: TextStyle(
                          fontSize: 13,
                          color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                        ),
                        decoration: InputDecoration(
                          hintText: 'Search name, phone, project, unit...',
                          hintStyle: TextStyle(
                            fontSize: 12.5,
                            color: isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
                          ),
                          border: InputBorder.none,
                          enabledBorder: InputBorder.none,
                          focusedBorder: InputBorder.none,
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(vertical: 10),
                        ),
                      ),
                    ),
                    // Quick Filter trigger chip
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: InkWell(
                        onTap: () => LeadsFilterSheet.show(context),
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                          decoration: BoxDecoration(
                            color: provider.statusFilter != 'All Leads'
                                ? AppColors.neonLime
                                : (isDark ? const Color(0xFF0D0F12) : const Color(0xFFF1F5F9)),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: provider.statusFilter != 'All Leads'
                                  ? AppColors.neonLime
                                  : (isDark ? const Color(0xFF282D38) : const Color(0xFFE2E8F0)),
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                LucideIcons.slidersHorizontal,
                                size: 12,
                                color: provider.statusFilter != 'All Leads'
                                    ? const Color(0xFF142407)
                                    : (isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B)),
                              ),
                              const SizedBox(width: 4),
                              Text(
                                'Filter',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: provider.statusFilter != 'All Leads'
                                      ? const Color(0xFF142407)
                                      : (isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B)),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 6),

            // ── 3. Quick Status Filter Pills (Horizontal Scroll) ─
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: _quickFilterTags.map((tag) {
                    final name = tag['name'] as String;
                    final dotColor = tag['color'] as Color?;
                    final isSelected = _activeTag == name;

                    return Container(
                      margin: const EdgeInsets.only(right: 6),
                      child: InkWell(
                        onTap: () => setState(() => _activeTag = name),
                        borderRadius: BorderRadius.circular(20),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: isSelected
                                ? AppColors.neonLime
                                : (isDark ? const Color(0xFF161920) : Colors.white),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: isSelected
                                  ? AppColors.neonLime
                                  : (isDark ? const Color(0xFF282D38) : AppColors.lightBorder),
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (dotColor != null) ...[
                                Container(
                                  width: 6,
                                  height: 6,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: isSelected ? const Color(0xFF142407) : dotColor,
                                  ),
                                ),
                                const SizedBox(width: 6),
                              ],
                              Text(
                                name,
                                style: TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                                  color: isSelected
                                      ? const Color(0xFF142407)
                                      : (isDark ? const Color(0xFFCBD5E1) : const Color(0xFF475569)),
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
            ),
            const SizedBox(height: 6),

            // ── 4. Dropdown Selectors (Project, Type) ─────────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _buildDropdown(
                      label: 'Project:',
                      value: _selectedProject,
                      items: _projectOptions,
                      onChanged: (val) => setState(() => _selectedProject = val!),
                      isDark: isDark,
                    ),
                    const SizedBox(width: 8),
                    _buildDropdown(
                      label: 'Type:',
                      value: _selectedPropertyType,
                      items: _propertyTypeOptions,
                      onChanged: (val) => setState(() => _selectedPropertyType = val!),
                      isDark: isDark,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 6),

            // ── 5. Main Leads Content (List or Kanban) ───────────
            Expanded(
              child: provider.isLoading
                  ? const Center(
                      child: CircularProgressIndicator(color: AppColors.neonLime),
                    )
                  : RefreshIndicator(
                      onRefresh: () => provider.fetchLeads(),
                      color: AppColors.neonLime,
                      backgroundColor: isDark ? const Color(0xFF161920) : Colors.white,
                      child: displayedLeads.isEmpty
                          ? Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    LucideIcons.users,
                                    size: 48,
                                    color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                                  ),
                                  const SizedBox(height: 12),
                                  Text(
                                    'No leads found',
                                    style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                      color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    'Try adjusting your search or filters',
                                    style: TextStyle(
                                      fontSize: 13,
                                      color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                                    ),
                                  ),
                                ],
                              ),
                            )
                          : provider.isKanban
                              ? LeadKanbanBoard(
                                  leads: displayedLeads,
                                  onLeadTap: (lead) {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) => LeadDetailScreen(leadId: lead.id),
                                      ),
                                    );
                                  },
                                )
                              : ListView.builder(
                                  padding: const EdgeInsets.fromLTRB(16, 6, 16, 80),
                                  itemCount: displayedLeads.length,
                                  itemBuilder: (context, index) {
                                    final lead = displayedLeads[index];
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
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDropdown({
    required String label,
    required String value,
    required List<String> items,
    required ValueChanged<String?> onChanged,
    required bool isDark,
  }) {
    return Container(
      height: 32,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF161920) : Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isDark ? const Color(0xFF282D38) : AppColors.lightBorder,
        ),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value,
          icon: Padding(
            padding: const EdgeInsets.only(left: 4),
            child: Icon(
              LucideIcons.chevronDown,
              size: 12,
              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
            ),
          ),
          isDense: true,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
          ),
          dropdownColor: isDark ? const Color(0xFF161920) : Colors.white,
          items: items.map((e) {
            return DropdownMenuItem<String>(
              value: e,
              child: Row(
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 10.5,
                      color: isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
                    ),
                  ),
                  const SizedBox(width: 4),
                  Text(e),
                ],
              ),
            );
          }).toList(),
          onChanged: onChanged,
        ),
      ),
    );
  }
}
