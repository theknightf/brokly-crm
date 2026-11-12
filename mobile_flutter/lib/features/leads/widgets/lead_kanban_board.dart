import 'package:flutter/material.dart';
import '../../../core/constants/lead_stages.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/premium.dart';
import '../../../data/models/lead_model.dart';
import 'lead_card.dart';

class LeadKanbanBoard extends StatelessWidget {
  final List<LeadModel> leads;
  final ValueChanged<LeadModel> onLeadTap;

  static const List<String> kanbanColumns = LeadStages.allStatuses;
  static const List<String> _visibleColumns = [
    ...LeadStages.pipelineStages,
    ...LeadStages.outcomeStages,
  ];

  const LeadKanbanBoard({
    super.key,
    required this.leads,
    required this.onLeadTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Surf.dark(context);

    // Bucket once per build instead of filtering the full list per column.
    final buckets = <String, List<LeadModel>>{for (final s in _visibleColumns) s: <LeadModel>[]};
    for (final l in leads) {
      final key = buckets.containsKey(l.status) ? l.status : LeadStages.normalize(l.status);
      buckets[key]?.add(l);
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final colWidth = (constraints.maxWidth * 0.84).clamp(260.0, 320.0);
        return ListView.separated(
          scrollDirection: Axis.horizontal,
          physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
          padding: const EdgeInsets.fromLTRB(16, 6, 16, 16),
          itemCount: _visibleColumns.length,
          separatorBuilder: (_, __) => const SizedBox(width: 12),
          itemBuilder: (context, colIndex) {
            final stage = _visibleColumns[colIndex];
            return _KanbanColumn(
              key: ValueKey(stage),
              stage: stage,
              leads: buckets[stage] ?? const <LeadModel>[],
              width: colWidth,
              isDark: isDark,
              onLeadTap: onLeadTap,
            );
          },
        );
      },
    );
  }
}

class _KanbanColumn extends StatelessWidget {
  final String stage;
  final List<LeadModel> leads;
  final double width;
  final bool isDark;
  final ValueChanged<LeadModel> onLeadTap;

  const _KanbanColumn({
    super.key,
    required this.stage,
    required this.leads,
    required this.width,
    required this.isDark,
    required this.onLeadTap,
  });

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.getStatusColors(stage, isDark: isDark);
    final sub = Surf.subtext(context);

    return Container(
      width: width,
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF12151B) : const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Surf.border(context)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: colors.bg.withAlpha(isDark ? 110 : 180),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(19)),
            ),
            child: Row(
              children: [
                Icon(LeadStages.iconFor(stage), size: 16, color: colors.text),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        stage,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: Surf.text(context), fontSize: 13.5, fontWeight: FontWeight.w800),
                      ),
                      Text(
                        LeadStages.categoryLabel(stage),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 10.5, color: sub),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(
                    color: colors.text.withAlpha(30),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '${leads.length}',
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w800,
                      color: colors.text,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: leads.isEmpty
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(LeadStages.iconFor(stage), size: 26, color: sub.withAlpha(120)),
                        const SizedBox(height: 8),
                        Text(
                          'No leads in $stage',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: sub),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(10),
                    itemCount: leads.length,
                    itemBuilder: (context, i) {
                      final lead = leads[i];
                      return LeadCard(
                        key: ValueKey(lead.id),
                        lead: lead,
                        margin: const EdgeInsets.only(bottom: 10),
                        onTap: () => onLeadTap(lead),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
