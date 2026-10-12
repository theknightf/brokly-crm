import 'package:flutter/material.dart';
import '../../../core/constants/lead_stages.dart';
import '../../../core/theme/app_colors.dart';
import '../../../data/models/lead_model.dart';
import 'lead_card.dart';

class LeadKanbanBoard extends StatelessWidget {
  final List<LeadModel> leads;
  final ValueChanged<LeadModel> onLeadTap;

  static const List<String> kanbanColumns = LeadStages.allStatuses;

  const LeadKanbanBoard({
    super.key,
    required this.leads,
    required this.onLeadTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    // Show all forward pipeline stages plus any outcome stages that have leads (or all stages)
    final visibleColumns = <String>[
      ...LeadStages.pipelineStages,
      ...LeadStages.outcomeStages,
    ];

    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.72,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: visibleColumns.length,
        separatorBuilder: (_, __) => const SizedBox(width: 14),
        itemBuilder: (context, colIndex) {
          final stage = visibleColumns[colIndex];
          final stageLeads = leads
              .where((l) =>
                  l.status == stage || LeadStages.normalize(l.status) == stage)
              .toList();
          final colors = AppColors.getStatusColors(stage, isDark: isDark);

          return Container(
            width: 300,
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF14171D) : const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: colors.text.withAlpha(isDark ? 70 : 50),
                width: 1.2,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Column Header
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: colors.bg.withAlpha(isDark ? 120 : 180),
                    borderRadius:
                        const BorderRadius.vertical(top: Radius.circular(17)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Row(
                          children: [
                            Icon(
                              LeadStages.iconFor(stage),
                              size: 15,
                              color: colors.text,
                            ),
                            const SizedBox(width: 8),
                            Flexible(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    stage,
                                    style: TextStyle(
                                      color: colors.text,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w800,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  Text(
                                    LeadStages.categoryLabel(stage),
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w600,
                                      color: isDark
                                          ? AppColors.darkMutedForeground
                                          : AppColors.lightMutedForeground,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 9, vertical: 3),
                        decoration: BoxDecoration(
                          color: colors.text.withAlpha(30),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          '${stageLeads.length}',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: colors.text,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                Divider(
                  height: 1,
                  color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                ),

                // Cards in Column
                Expanded(
                  child: stageLeads.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                LeadStages.iconFor(stage),
                                size: 28,
                                color: (isDark
                                        ? AppColors.darkMutedForeground
                                        : AppColors.lightMutedForeground)
                                    .withAlpha(110),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'No leads in $stage',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: isDark
                                      ? AppColors.darkMutedForeground
                                      : AppColors.lightMutedForeground,
                                ),
                              ),
                            ],
                          ),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.all(10),
                          itemCount: stageLeads.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 10),
                          itemBuilder: (context, cardIndex) {
                            return LeadCard(
                              lead: stageLeads[cardIndex],
                              onTap: () => onLeadTap(stageLeads[cardIndex]),
                            );
                          },
                        ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
