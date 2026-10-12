import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../../core/constants/lead_stages.dart';
import '../../../core/theme/app_colors.dart';
import '../../../state/leads_provider.dart';

class LeadsFilterSheet extends StatelessWidget {
  const LeadsFilterSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const LeadsFilterSheet(),
    );
  }

  static const List<String> allFilters = LeadStages.allFilterOptions;

  static const List<String> activityOptions = [
    'All Leads',
    'Action Today',
    'Called',
    'Not Called',
    'Overdue',
  ];

  static const List<String> propertyTypes = [
    'All Types',
    'Villa & Penthouse',
    'Apartment',
    'Townhouse',
    'Twin House',
    'Duplex',
    'Commercial',
  ];

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final provider = context.watch<LeadsProvider>();
    final counts = provider.stageCounts;

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: isDark ? Colors.white24 : Colors.black12,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.slidersHorizontal,
                      size: 18, color: AppColors.neonLime),
                  const SizedBox(width: 8),
                  Text(
                    'Filter Leads & Stages',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: isDark
                          ? AppColors.darkForeground
                          : AppColors.lightForeground,
                    ),
                  ),
                ],
              ),
              Row(
                children: [
                  if (provider.hasActiveFilters)
                    TextButton.icon(
                      onPressed: () {
                        provider.clearFilters();
                      },
                      icon: const Icon(LucideIcons.rotateCcw, size: 14),
                      label: const Text('Reset All'),
                    ),
                  IconButton(
                    icon: const Icon(LucideIcons.x, size: 18),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 8),
          Divider(
            height: 1,
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.only(top: 14, bottom: 16),
              children: [
                // ── 1. Sales Pipeline Stages (Chips) ─────────────────────────
                _buildSectionHeader('SALES PIPELINE STAGES', isDark),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _buildStageFilterChip(
                      context,
                      stage: LeadStages.allLeads,
                      count: counts[LeadStages.allLeads] ?? 0,
                      selected: provider.statusFilter == LeadStages.allLeads,
                      isDark: isDark,
                      onTap: () => provider.setStatusFilter(LeadStages.allLeads),
                    ),
                    ...LeadStages.pipelineStages.map((stage) {
                      return _buildStageFilterChip(
                        context,
                        stage: stage,
                        count: counts[stage] ?? 0,
                        selected: provider.statusFilter == stage,
                        isDark: isDark,
                        onTap: () => provider.setStatusFilter(stage),
                      );
                    }),
                  ],
                ),
                const SizedBox(height: 18),

                // ── 2. Outcome & Follow-up Stages (Chips) ───────────────────
                _buildSectionHeader('OUTCOME & TERMINAL STAGES', isDark),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: LeadStages.outcomeStages.map((stage) {
                    return _buildStageFilterChip(
                      context,
                      stage: stage,
                      count: counts[stage] ?? 0,
                      selected: provider.statusFilter == stage,
                      isDark: isDark,
                      onTap: () => provider.setStatusFilter(stage),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 18),

                // ── 3. Activity Status ──────────────────────────────────────
                _buildSectionHeader('CALL & ACTIVITY STATUS', isDark),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: activityOptions.map((act) {
                    final isSelected = provider.activityFilter == act;
                    return InkWell(
                      onTap: () => provider.setActivityFilter(act),
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? AppColors.neonLime
                              : (isDark
                                  ? AppColors.darkBackground
                                  : AppColors.lightMuted),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: isSelected
                                ? AppColors.neonLime
                                : (isDark
                                    ? AppColors.darkBorder
                                    : AppColors.lightBorder),
                          ),
                        ),
                        child: Text(
                          act,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: isSelected
                                ? const Color(0xFF142407)
                                : (isDark
                                    ? AppColors.darkForeground
                                    : AppColors.lightForeground),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 18),

                // ── 4. Project Filter ───────────────────────────────────────
                _buildSectionHeader('PROJECT INTEREST', isDark),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: provider.availableProjects.map((proj) {
                    final isSelected = provider.projectFilter == proj;
                    return InkWell(
                      onTap: () => provider.setProjectFilter(proj),
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 7),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? AppColors.neonLime
                              : (isDark
                                  ? AppColors.darkBackground
                                  : AppColors.lightMuted),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: isSelected
                                ? AppColors.neonLime
                                : (isDark
                                    ? AppColors.darkBorder
                                    : AppColors.lightBorder),
                          ),
                        ),
                        child: Text(
                          proj,
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w700,
                            color: isSelected
                                ? const Color(0xFF142407)
                                : (isDark
                                    ? AppColors.darkForeground
                                    : AppColors.lightForeground),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 18),

                // ── 5. Property Type Filter ─────────────────────────────────
                _buildSectionHeader('PROPERTY TYPE', isDark),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: propertyTypes.map((pt) {
                    final isSelected = provider.propertyTypeFilter == pt;
                    return InkWell(
                      onTap: () => provider.setPropertyTypeFilter(pt),
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 7),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? AppColors.neonLime
                              : (isDark
                                  ? AppColors.darkBackground
                                  : AppColors.lightMuted),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: isSelected
                                ? AppColors.neonLime
                                : (isDark
                                    ? AppColors.darkBorder
                                    : AppColors.lightBorder),
                          ),
                        ),
                        child: Text(
                          pt,
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w700,
                            color: isSelected
                                ? const Color(0xFF142407)
                                : (isDark
                                    ? AppColors.darkForeground
                                    : AppColors.lightForeground),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 18),

                // ── 6. Lead Source Filter ───────────────────────────────────
                _buildSectionHeader('LEAD SOURCE', isDark),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: provider.availableSources.map((src) {
                    final isSelected = provider.sourceFilter == src;
                    return InkWell(
                      onTap: () => provider.setSourceFilter(src),
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 7),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? AppColors.neonLime
                              : (isDark
                                  ? AppColors.darkBackground
                                  : AppColors.lightMuted),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: isSelected
                                ? AppColors.neonLime
                                : (isDark
                                    ? AppColors.darkBorder
                                    : AppColors.lightBorder),
                          ),
                        ),
                        child: Text(
                          src,
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w700,
                            color: isSelected
                                ? const Color(0xFF142407)
                                : (isDark
                                    ? AppColors.darkForeground
                                    : AppColors.lightForeground),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ],
            ),
          ),

          // Apply Button
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.neonLime,
              foregroundColor: const Color(0xFF142407),
              padding: const EdgeInsets.symmetric(vertical: 13),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            onPressed: () => Navigator.pop(context),
            icon: const Icon(LucideIcons.check, size: 16),
            label: Text(
              'Show ${provider.leads.length} Matching Leads',
              style: const TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title, bool isDark) {
    return Text(
      title,
      style: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w800,
        letterSpacing: 0.6,
        color: isDark
            ? AppColors.darkMutedForeground
            : AppColors.lightMutedForeground,
      ),
    );
  }

  Widget _buildStageFilterChip(
    BuildContext context, {
    required String stage,
    required int count,
    required bool selected,
    required bool isDark,
    required VoidCallback onTap,
  }) {
    final isAll = stage == LeadStages.allLeads;
    final colors = isAll
        ? (
            text: isDark ? Colors.white : const Color(0xFF0F172A),
            bg: isDark ? AppColors.darkBackground : AppColors.lightMuted,
          )
        : AppColors.getStatusColors(stage, isDark: isDark);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? AppColors.neonLime : colors.bg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected
                ? AppColors.neonLime
                : colors.text.withAlpha(isDark ? 90 : 70),
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              LeadStages.iconFor(stage),
              size: 13,
              color: selected ? const Color(0xFF142407) : colors.text,
            ),
            const SizedBox(width: 6),
            Text(
              stage,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: selected ? const Color(0xFF142407) : colors.text,
              ),
            ),
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1.5),
              decoration: BoxDecoration(
                color: selected
                    ? const Color(0xFF142407).withAlpha(35)
                    : (isDark
                        ? Colors.black.withAlpha(70)
                        : Colors.white.withAlpha(180)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '$count',
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w800,
                  color: selected ? const Color(0xFF142407) : colors.text,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
