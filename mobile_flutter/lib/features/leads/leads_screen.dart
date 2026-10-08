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
  String _selectedPropertyType = 'All Property Types';
  String _selectedAction = 'All Actions';
  String _activeTag = 'All Leads'; // 'All Leads', 'Action Taken', 'Called', 'Not Called'

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
    'All Property Types',
    'Apartment',
    'Villa',
    'Townhouse',
    'Twin House',
    'Duplex',
    'Commercial',
  ];

  final List<String> _actionOptions = [
    'All Actions',
    'Action Required',
    'No Action',
    'Completed',
  ];

  final List<String> _filterTags = [
    'All Leads',
    'Action Taken',
    'Called',
    'Not Called',
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
    if (_selectedPropertyType != 'All Property Types') {
      displayedLeads = displayedLeads.where((l) => l.propertyType == _selectedPropertyType).toList();
    }
    if (_activeTag == 'Action Taken') {
      displayedLeads = displayedLeads.where((l) => l.actionTakenToday).toList();
    } else if (_activeTag == 'Called') {
      displayedLeads = displayedLeads.where((l) => l.status != 'Fresh Leads').toList();
    } else if (_activeTag == 'Not Called') {
      displayedLeads = displayedLeads.where((l) => l.status == 'Fresh Leads' || l.status == 'Cold Calls').toList();
    }

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            // ── 1. Search Bar & Controls ─────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
              child: Row(
                children: [
                  Expanded(
                    child: Container(
                      height: 42,
                      decoration: BoxDecoration(
                        color: isDark ? AppColors.darkCard : Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                        ),
                      ),
                      child: TextField(
                        onChanged: (q) => provider.setSearchQuery(q),
                        decoration: InputDecoration(
                          hintText: 'Search leads by name, phone, project…',
                          hintStyle: TextStyle(
                            fontSize: 13,
                            color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                          ),
                          prefixIcon: const Icon(LucideIcons.search, size: 18),
                          border: InputBorder.none,
                          enabledBorder: InputBorder.none,
                          focusedBorder: InputBorder.none,
                          contentPadding: const EdgeInsets.symmetric(vertical: 10),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),

                  // Comprehensive Filter Sheet
                  IconButton.filledTonal(
                    icon: Icon(
                      LucideIcons.slidersHorizontal,
                      size: 18,
                      color: provider.statusFilter != 'All Leads' ? AppColors.neonLime : null,
                    ),
                    style: IconButton.styleFrom(
                      backgroundColor: isDark ? AppColors.darkCard : Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(
                          color: provider.statusFilter != 'All Leads'
                              ? AppColors.neonLime
                              : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
                        ),
                      ),
                    ),
                    onPressed: () => LeadsFilterSheet.show(context),
                  ),
                  const SizedBox(width: 8),

                  // View Mode Toggle (List vs Kanban Board)
                  IconButton.filledTonal(
                    icon: Icon(
                      provider.isKanban ? LucideIcons.list : LucideIcons.columns,
                      size: 18,
                      color: AppColors.neonLime,
                    ),
                    tooltip: provider.isKanban ? 'Switch to List' : 'Switch to Kanban',
                    style: IconButton.styleFrom(
                      backgroundColor: isDark ? AppColors.darkCard : Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(
                          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                        ),
                      ),
                    ),
                    onPressed: () => provider.toggleViewMode(),
                  ),
                ],
              ),
            ),

            // ── 2. Dropdown Selectors (All Projects, All Property Types, All Actions)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _buildDropdown(
                      value: _selectedProject,
                      items: _projectOptions,
                      onChanged: (val) => setState(() => _selectedProject = val!),
                      isDark: isDark,
                    ),
                    const SizedBox(width: 8),
                    _buildDropdown(
                      value: _selectedPropertyType,
                      items: _propertyTypeOptions,
                      onChanged: (val) => setState(() => _selectedPropertyType = val!),
                      isDark: isDark,
                    ),
                    const SizedBox(width: 8),
                    _buildDropdown(
                      value: _selectedAction,
                      items: _actionOptions,
                      onChanged: (val) => setState(() => _selectedAction = val!),
                      isDark: isDark,
                    ),
                  ],
                ),
              ),
            ),

            // ── 3. Horizontal Filter Tags (All Leads, Action Taken, Called, Not Called)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: _filterTags.map((tag) {
                    final isSelected = _activeTag == tag;
                    return Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: InkWell(
                        onTap: () => setState(() => _activeTag = tag),
                        borderRadius: BorderRadius.circular(20),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 150),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: isSelected
                                ? AppColors.neonLime
                                : (isDark ? AppColors.darkCard : Colors.white),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: isSelected
                                  ? AppColors.neonLime
                                  : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
                            ),
                          ),
                          child: Text(
                            tag,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: isSelected ? FontWeight.w800 : FontWeight.w500,
                              color: isSelected
                                  ? const Color(0xFF142407)
                                  : (isDark ? AppColors.darkForeground : AppColors.lightForeground),
                            ),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),

            // ── 4. Main Leads Content (List or Kanban) ───────────
            Expanded(
              child: provider.isLoading
                  ? const Center(
                      child: CircularProgressIndicator(color: AppColors.neonLime),
                    )
                  : RefreshIndicator(
                      onRefresh: () => provider.fetchLeads(),
                      color: AppColors.neonLime,
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
                              : ListView.separated(
                                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 80),
                                  itemCount: displayedLeads.length,
                                  separatorBuilder: (_, __) => const SizedBox(height: 12),
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
    required String value,
    required List<String> items,
    required ValueChanged<String?> onChanged,
    required bool isDark,
  }) {
    return Container(
      height: 34,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
        ),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value,
          icon: const Icon(LucideIcons.chevronDown, size: 14),
          isDense: true,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
          ),
          dropdownColor: isDark ? AppColors.darkCard : Colors.white,
          items: items.map((e) {
            return DropdownMenuItem<String>(
              value: e,
              child: Text(e),
            );
          }).toList(),
          onChanged: onChanged,
        ),
      ),
    );
  }
}
