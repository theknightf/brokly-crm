import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/constants/lead_stages.dart';
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
  final TextEditingController _searchController = TextEditingController();
  final Set<String> _collapsedStages = {};

  final List<String> _propertyTypeOptions = const [
    'All Types',
    'Villa & Penthouse',
    'Apartment',
    'Townhouse',
    'Twin House',
    'Duplex',
    'Commercial',
  ];

  final List<Map<String, dynamic>> _quickActivityTags = const [
    {'name': 'All Leads', 'color': null},
    {'name': 'Action Today', 'color': Color(0xFFF59E0B)},
    {'name': 'Called', 'color': Color(0xFF10B981)},
    {'name': 'Not Called', 'color': Color(0xFFF43F5E)},
    {'name': 'Overdue', 'color': Color(0xFFEF4444)},
  ];

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final provider = context.watch<LeadsProvider>();

    if (_searchController.text != provider.searchQuery) {
      _searchController.value = TextEditingValue(
        text: provider.searchQuery,
        selection:
            TextSelection.collapsed(offset: provider.searchQuery.length),
      );
    }

    final displayedLeads = provider.leads;
    final stageCounts = provider.stageCounts;
    final totalCount = provider.allLeads.length;
    final projectDropdownItems = provider.availableProjects;
    final sourceDropdownItems = provider.availableSources;

    final selectedProject =
        projectDropdownItems.contains(provider.projectFilter)
            ? provider.projectFilter
            : 'All Projects';
    final selectedSource = sourceDropdownItems.contains(provider.sourceFilter)
        ? provider.sourceFilter
        : 'All Sources';
    final selectedPropertyType =
        _propertyTypeOptions.contains(provider.propertyTypeFilter)
            ? provider.propertyTypeFilter
            : 'All Types';

    return Scaffold(
      backgroundColor:
          isDark ? const Color(0xFF0B0D10) : const Color(0xFFF8FAFC),
      body: SafeArea(
        child: Column(
          children: [
            // ── 1. Header Summary Strip (Leads Hub Title, Count Badge, 3-Way View Mode Toggle)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(
                              LucideIcons.layers,
                              size: 12,
                              color: isDark
                                  ? const Color(0xFF64748B)
                                  : const Color(0xFF94A3B8),
                            ),
                            const SizedBox(width: 4),
                            Flexible(
                              child: Text(
                                provider.statusFilter == LeadStages.allLeads
                                    ? 'Workspace / All Pipeline Stages'
                                    : 'Stage / ${provider.statusFilter}',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: isDark
                                      ? const Color(0xFF94A3B8)
                                      : const Color(0xFF64748B),
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
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
                                fontSize: 21,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -0.5,
                                color: isDark
                                    ? Colors.white
                                    : const Color(0xFF0F172A),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 2.5),
                              decoration: BoxDecoration(
                                color: AppColors.neonLime.withAlpha(25),
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: AppColors.neonLime.withAlpha(80),
                                ),
                              ),
                              child: Text(
                                '${displayedLeads.length} / $totalCount',
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
                  ),

                  // 3-Way View Toggle: Stage Cards | List | Kanban
                  Container(
                    padding: const EdgeInsets.all(2),
                    decoration: BoxDecoration(
                      color: isDark
                          ? const Color(0xFF1E222B)
                          : const Color(0xFFF1F5F9),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: isDark
                            ? const Color(0xFF282D38)
                            : const Color(0xFFE2E8F0),
                      ),
                    ),
                    child: Row(
                      children: [
                        _buildViewModeButton(
                          mode: 'stages',
                          icon: LucideIcons.layers,
                          tooltip: 'Stage Cards View',
                          currentMode: provider.viewMode,
                          onTap: () => provider.setViewMode('stages'),
                          isDark: isDark,
                        ),
                        _buildViewModeButton(
                          mode: 'list',
                          icon: LucideIcons.list,
                          tooltip: 'List View',
                          currentMode: provider.viewMode,
                          onTap: () => provider.setViewMode('list'),
                          isDark: isDark,
                        ),
                        _buildViewModeButton(
                          mode: 'kanban',
                          icon: LucideIcons.columns,
                          tooltip: 'Kanban Board',
                          currentMode: provider.viewMode,
                          onTap: () => provider.setViewMode('kanban'),
                          isDark: isDark,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // ── 2. Search Input with Filter Modal Button & Reset Pill ──────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Container(
                height: 44,
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF161920) : Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: isDark
                        ? const Color(0xFF282D38)
                        : AppColors.lightBorder,
                  ),
                ),
                child: Row(
                  children: [
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 12),
                      child: Icon(LucideIcons.search,
                          size: 16, color: Color(0xFF94A3B8)),
                    ),
                    Expanded(
                      child: TextField(
                        controller: _searchController,
                        onChanged: (q) => provider.setSearchQuery(q),
                        style: TextStyle(
                          fontSize: 13,
                          color: isDark
                              ? AppColors.darkForeground
                              : AppColors.lightForeground,
                        ),
                        decoration: InputDecoration(
                          hintText: 'Search name, phone, project, stage...',
                          hintStyle: TextStyle(
                            fontSize: 12.5,
                            color: isDark
                                ? const Color(0xFF64748B)
                                : const Color(0xFF94A3B8),
                          ),
                          border: InputBorder.none,
                          enabledBorder: InputBorder.none,
                          focusedBorder: InputBorder.none,
                          isDense: true,
                          contentPadding:
                              const EdgeInsets.symmetric(vertical: 10),
                        ),
                      ),
                    ),
                    if (provider.hasActiveFilters)
                      IconButton(
                        visualDensity: VisualDensity.compact,
                        tooltip: 'Reset Filters',
                        icon: const Icon(LucideIcons.xCircle,
                            size: 15, color: AppColors.alertRed),
                        onPressed: () => provider.clearFilters(),
                      ),
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: InkWell(
                        onTap: () => LeadsFilterSheet.show(context),
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 9, vertical: 5),
                          decoration: BoxDecoration(
                            color: provider.hasActiveFilters
                                ? AppColors.neonLime
                                : (isDark
                                    ? const Color(0xFF0D0F12)
                                    : const Color(0xFFF1F5F9)),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: provider.hasActiveFilters
                                  ? AppColors.neonLime
                                  : (isDark
                                      ? const Color(0xFF282D38)
                                      : const Color(0xFFE2E8F0)),
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                LucideIcons.slidersHorizontal,
                                size: 12,
                                color: provider.hasActiveFilters
                                    ? const Color(0xFF142407)
                                    : (isDark
                                        ? const Color(0xFF94A3B8)
                                        : const Color(0xFF64748B)),
                              ),
                              const SizedBox(width: 4),
                              Text(
                                provider.activeFilterCount > 0
                                    ? 'Filters (${provider.activeFilterCount})'
                                    : 'Filter',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: provider.hasActiveFilters
                                      ? const Color(0xFF142407)
                                      : (isDark
                                          ? const Color(0xFF94A3B8)
                                          : const Color(0xFF64748B)),
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

            // ── 3. Stage Filter Chips Bar (All 18 Canonical Stages + Live Counts) ──
            SizedBox(
              height: 36,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: LeadStages.allFilterOptions.length,
                separatorBuilder: (_, __) => const SizedBox(width: 6),
                itemBuilder: (context, index) {
                  final stage = LeadStages.allFilterOptions[index];
                  final isSelected = provider.statusFilter == stage;
                  final count = stageCounts[stage] ?? 0;
                  final isAll = stage == LeadStages.allLeads;
                  final stageColors = isAll
                      ? (
                          text: isDark ? Colors.white : const Color(0xFF0F172A),
                          bg: isDark
                              ? const Color(0xFF161920)
                              : Colors.white,
                        )
                      : AppColors.getStatusColors(stage, isDark: isDark);

                  return InkWell(
                    onTap: () => provider.setStatusFilter(stage),
                    borderRadius: BorderRadius.circular(18),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 11, vertical: 6),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? AppColors.neonLime
                            : (isDark ? const Color(0xFF161920) : Colors.white),
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(
                          color: isSelected
                              ? AppColors.neonLime
                              : stageColors.text.withAlpha(isDark ? 90 : 70),
                          width: isSelected ? 1.5 : 1,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            LeadStages.iconFor(stage),
                            size: 12,
                            color: isSelected
                                ? const Color(0xFF142407)
                                : stageColors.text,
                          ),
                          const SizedBox(width: 5),
                          Text(
                            stage,
                            style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: isSelected
                                  ? FontWeight.w800
                                  : FontWeight.w600,
                              color: isSelected
                                  ? const Color(0xFF142407)
                                  : (isDark
                                      ? const Color(0xFFE2E8F0)
                                      : const Color(0xFF334155)),
                            ),
                          ),
                          const SizedBox(width: 5),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 5, vertical: 1),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? const Color(0xFF142407).withAlpha(30)
                                  : stageColors.bg,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              '$count',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                color: isSelected
                                    ? const Color(0xFF142407)
                                    : stageColors.text,
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
            const SizedBox(height: 6),

            // ── 4. Secondary Filter Row: Activity Chips + Project / Type / Source Dropdowns ──
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    ..._quickActivityTags.map((tag) {
                      final name = tag['name'] as String;
                      final dotColor = tag['color'] as Color?;
                      final isSelected = provider.activityFilter == name;

                      return Container(
                        margin: const EdgeInsets.only(right: 6),
                        child: InkWell(
                          onTap: () => provider.setActivityFilter(name),
                          borderRadius: BorderRadius.circular(10),
                          child: Container(
                            height: 30,
                            padding: const EdgeInsets.symmetric(horizontal: 10),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? AppColors.neonLime.withAlpha(35)
                                  : (isDark
                                      ? const Color(0xFF161920)
                                      : Colors.white),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: isSelected
                                    ? AppColors.neonLime
                                    : (isDark
                                        ? const Color(0xFF282D38)
                                        : AppColors.lightBorder),
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
                                      color: dotColor,
                                    ),
                                  ),
                                  const SizedBox(width: 5),
                                ],
                                Text(
                                  name == 'All Leads' ? 'All Activity' : name,
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: isSelected
                                        ? FontWeight.w800
                                        : FontWeight.w600,
                                    color: isSelected
                                        ? AppColors.neonLime
                                        : (isDark
                                            ? const Color(0xFFCBD5E1)
                                            : const Color(0xFF475569)),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    }),
                    _buildDropdown(
                      label: 'Project:',
                      value: selectedProject,
                      items: projectDropdownItems,
                      onChanged: (val) =>
                          provider.setProjectFilter(val ?? 'All Projects'),
                      isDark: isDark,
                    ),
                    const SizedBox(width: 6),
                    _buildDropdown(
                      label: 'Type:',
                      value: selectedPropertyType,
                      items: _propertyTypeOptions,
                      onChanged: (val) =>
                          provider.setPropertyTypeFilter(val ?? 'All Types'),
                      isDark: isDark,
                    ),
                    const SizedBox(width: 6),
                    _buildDropdown(
                      label: 'Source:',
                      value: selectedSource,
                      items: sourceDropdownItems,
                      onChanged: (val) =>
                          provider.setSourceFilter(val ?? 'All Sources'),
                      isDark: isDark,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 6),

            // ── 5. Main Leads Content (Stage-Based Cards, List View, or Kanban Board) ──
            Expanded(
              child: provider.isLoading
                  ? const Center(
                      child: CircularProgressIndicator(
                          color: AppColors.neonLime),
                    )
                  : RefreshIndicator(
                      onRefresh: () => provider.fetchLeads(),
                      color: AppColors.neonLime,
                      backgroundColor:
                          isDark ? const Color(0xFF161920) : Colors.white,
                      child: displayedLeads.isEmpty
                          ? _buildEmptyState(provider, isDark)
                          : provider.isKanban
                              ? LeadKanbanBoard(
                                  leads: displayedLeads,
                                  onLeadTap: (lead) => _openLeadDetail(lead),
                                )
                              : provider.isStagesView
                                  ? _buildStageGroupedList(
                                      provider, displayedLeads, isDark)
                                  : ListView.builder(
                                      padding: const EdgeInsets.fromLTRB(
                                          16, 6, 16, 80),
                                      itemCount: displayedLeads.length,
                                      itemBuilder: (context, index) {
                                        final lead = displayedLeads[index];
                                        return LeadCard(
                                          lead: lead,
                                          onTap: () => _openLeadDetail(lead),
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

  void _openLeadDetail(LeadModel lead) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => LeadDetailScreen(leadId: lead.id),
      ),
    );
  }

  Widget _buildViewModeButton({
    required String mode,
    required IconData icon,
    required String tooltip,
    required String currentMode,
    required VoidCallback onTap,
    required bool isDark,
  }) {
    final active = currentMode == mode;
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: active ? AppColors.neonLime : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(
            icon,
            size: 15,
            color: active
                ? const Color(0xFF142407)
                : (isDark
                    ? const Color(0xFF94A3B8)
                    : const Color(0xFF64748B)),
          ),
        ),
      ),
    );
  }

  /// Stage-Based Standalone Containers View
  Widget _buildStageGroupedList(
    LeadsProvider provider,
    List<LeadModel> displayedLeads,
    bool isDark,
  ) {
    final byStage = provider.leadsByStage;
    final stagesToShow = provider.statusFilter != LeadStages.allLeads
        ? <String>[provider.statusFilter]
        : LeadStages.allStatuses
            .where((s) =>
                (byStage[s]?.isNotEmpty ?? false) ||
                LeadStages.pipelineStages.contains(s))
            .toList();

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 84),
      itemCount: stagesToShow.length,
      itemBuilder: (context, idx) {
        final stage = stagesToShow[idx];
        final stageLeads = byStage[LeadStages.normalize(stage)] ?? [];
        final colors = AppColors.getStatusColors(stage, isDark: isDark);
        final isCollapsed = _collapsedStages.contains(stage);

        return Container(
          margin: const EdgeInsets.only(bottom: 14),
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkCard : Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: colors.text.withAlpha(isDark ? 80 : 60),
              width: 1.2,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Standalone Stage Container Header
              InkWell(
                borderRadius: BorderRadius.vertical(
                  top: const Radius.circular(17),
                  bottom: isCollapsed ? const Radius.circular(17) : Radius.zero,
                ),
                onTap: () {
                  setState(() {
                    if (isCollapsed) {
                      _collapsedStages.remove(stage);
                    } else {
                      _collapsedStages.add(stage);
                    }
                  });
                },
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: colors.bg.withAlpha(isDark ? 120 : 190),
                    borderRadius: BorderRadius.vertical(
                      top: const Radius.circular(17),
                      bottom:
                          isCollapsed ? const Radius.circular(17) : Radius.zero,
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 34,
                        height: 34,
                        decoration: BoxDecoration(
                          color: colors.text.withAlpha(28),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(
                          LeadStages.iconFor(stage),
                          size: 16,
                          color: colors.text,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              stage,
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w800,
                                color: isDark
                                    ? Colors.white
                                    : const Color(0xFF0F172A),
                              ),
                            ),
                            Text(
                              LeadStages.categoryLabel(stage),
                              style: TextStyle(
                                fontSize: 11,
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
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: colors.text.withAlpha(28),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          '${stageLeads.length} ${stageLeads.length == 1 ? "Lead" : "Leads"}',
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w800,
                            color: colors.text,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Icon(
                        isCollapsed
                            ? LucideIcons.chevronDown
                            : LucideIcons.chevronUp,
                        size: 16,
                        color: isDark
                            ? AppColors.darkMutedForeground
                            : AppColors.lightMutedForeground,
                      ),
                    ],
                  ),
                ),
              ),

              if (!isCollapsed) ...[
                Divider(
                  height: 1,
                  color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                ),
                if (stageLeads.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(
                        vertical: 20, horizontal: 16),
                    child: Center(
                      child: Text(
                        'No leads currently in $stage',
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
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
                    child: Column(
                      children: stageLeads
                          .map(
                            (lead) => LeadCard(
                              lead: lead,
                              onTap: () => _openLeadDetail(lead),
                            ),
                          )
                          .toList(),
                    ),
                  ),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _buildEmptyState(LeadsProvider provider, bool isDark) {
    return ListView(
      padding: const EdgeInsets.all(32),
      children: [
        const SizedBox(height: 48),
        Icon(
          LucideIcons.users,
          size: 48,
          color: isDark
              ? AppColors.darkMutedForeground
              : AppColors.lightMutedForeground,
        ),
        const SizedBox(height: 12),
        Center(
          child: Text(
            provider.statusFilter != LeadStages.allLeads
                ? 'No leads in "${provider.statusFilter}"'
                : 'No leads match your filters',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: isDark
                  ? AppColors.darkForeground
                  : AppColors.lightForeground,
            ),
          ),
        ),
        const SizedBox(height: 6),
        Center(
          child: Text(
            'Try selecting another pipeline stage or resetting your active filters.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              color: isDark
                  ? AppColors.darkMutedForeground
                  : AppColors.lightMutedForeground,
            ),
          ),
        ),
        if (provider.hasActiveFilters) ...[
          const SizedBox(height: 16),
          Center(
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.neonLime,
                foregroundColor: const Color(0xFF142407),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              onPressed: () => provider.clearFilters(),
              icon: const Icon(LucideIcons.rotateCcw, size: 15),
              label: const Text(
                'Reset All Filters',
                style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800),
              ),
            ),
          ),
        ],
      ],
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
      height: 30,
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
              color:
                  isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
            ),
          ),
          isDense: true,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color:
                isDark ? AppColors.darkForeground : AppColors.lightForeground,
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
                      color: isDark
                          ? const Color(0xFF64748B)
                          : const Color(0xFF94A3B8),
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
