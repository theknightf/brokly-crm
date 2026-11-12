import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../../core/constants/lead_stages.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/premium.dart';
import '../../../state/leads_provider.dart';

class LeadsFilterSheet extends StatelessWidget {
  const LeadsFilterSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
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

  static const Color _onNeon = Color(0xFF142407);

  @override
  Widget build(BuildContext context) {
    final isDark = Surf.dark(context);
    final provider = context.watch<LeadsProvider>();
    final counts = provider.stageCounts;
    final shown = provider.leads.length;

    return Container(
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.88),
      decoration: BoxDecoration(
        color: Surf.card(context),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border.all(color: Surf.border(context)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 10),
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: Surf.border(context), borderRadius: BorderRadius.circular(4)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 8, 0),
            child: Row(
              children: [
                Icon(LucideIcons.slidersHorizontal, size: 18, color: Surf.accent(context)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    provider.activeFilterCount > 0 ? 'Filters (${provider.activeFilterCount})' : 'Filters',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Surf.text(context)),
                  ),
                ),
                if (provider.hasActiveFilters)
                  TextButton.icon(
                    style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
                    onPressed: provider.clearFilters,
                    icon: const Icon(LucideIcons.rotateCcw, size: 14),
                    label: const Text('Reset all'),
                  ),
                IconButton(
                  tooltip: 'Close',
                  icon: const Icon(LucideIcons.x, size: 20),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: Surf.border(context)),
          Flexible(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 16),
              children: [
                _section(context, 'SALES PIPELINE STAGES'),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final stage in [LeadStages.allLeads, ...LeadStages.pipelineStages])
                      _stageChip(context, provider, stage, counts[stage] ?? 0, isDark),
                  ],
                ),
                const SizedBox(height: 20),
                _section(context, 'OUTCOME & TERMINAL STAGES'),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final stage in LeadStages.outcomeStages)
                      _stageChip(context, provider, stage, counts[stage] ?? 0, isDark),
                  ],
                ),
                const SizedBox(height: 20),
                _section(context, 'CALL & ACTIVITY STATUS'),
                _optionWrap(context, activityOptions, provider.activityFilter, provider.setActivityFilter),
                const SizedBox(height: 20),
                _section(context, 'PROJECT INTEREST'),
                _optionWrap(context, provider.availableProjects, provider.projectFilter, provider.setProjectFilter),
                const SizedBox(height: 20),
                _section(context, 'PROPERTY TYPE'),
                _optionWrap(context, propertyTypes, provider.propertyTypeFilter, provider.setPropertyTypeFilter),
                const SizedBox(height: 20),
                _section(context, 'LEAD SOURCE'),
                _optionWrap(context, provider.availableSources, provider.sourceFilter, provider.setSourceFilter),
              ],
            ),
          ),
          Container(
            padding: EdgeInsets.fromLTRB(20, 10, 20, 12 + MediaQuery.of(context).padding.bottom),
            decoration: BoxDecoration(border: Border(top: BorderSide(color: Surf.border(context)))),
            child: SizedBox(
              height: 52,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.neonLime,
                  foregroundColor: _onNeon,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                onPressed: () => Navigator.pop(context),
                icon: const Icon(LucideIcons.check, size: 18),
                label: Text(
                  'Show $shown ${shown == 1 ? 'lead' : 'leads'}',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _section(BuildContext context, String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.6,
          color: Surf.subtext(context),
        ),
      ),
    );
  }

  Widget _optionWrap(
    BuildContext context,
    List<String> options,
    String selected,
    ValueChanged<String> onSelect,
  ) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final o in options)
          _OptionChip(
            key: ValueKey(o),
            label: o,
            selected: selected == o,
            onTap: () => onSelect(o),
          ),
      ],
    );
  }

  Widget _stageChip(BuildContext context, LeadsProvider provider, String stage, int count, bool isDark) {
    final selected = provider.statusFilter == stage;
    final colors = stage == LeadStages.allLeads
        ? (text: Surf.text(context), bg: Surf.muted(context))
        : AppColors.getStatusColors(stage, isDark: isDark);

    return InkWell(
      key: ValueKey(stage),
      onTap: () => provider.setStatusFilter(stage),
      borderRadius: BorderRadius.circular(12),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
        constraints: const BoxConstraints(minHeight: 44),
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: selected ? AppColors.neonLime : colors.bg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? AppColors.neonLime : colors.text.withAlpha(isDark ? 90 : 70),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(LeadStages.iconFor(stage), size: 14, color: selected ? _onNeon : colors.text),
            const SizedBox(width: 6),
            Text(
              stage,
              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: selected ? _onNeon : colors.text),
            ),
            const SizedBox(width: 8),
            Text(
              '$count',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: selected ? _onNeon : colors.text.withAlpha(200),
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OptionChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _OptionChip({super.key, required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
        constraints: const BoxConstraints(minHeight: 44),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? AppColors.neonLime : Surf.muted(context),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: selected ? AppColors.neonLime : Surf.border(context)),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w700,
            color: selected ? LeadsFilterSheet._onNeon : Surf.text(context),
          ),
        ),
      ),
    );
  }
}
