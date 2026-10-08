import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../data/models/lead_model.dart';
import 'lead_card.dart';

class LeadKanbanBoard extends StatelessWidget {
  final List<LeadModel> leads;
  final ValueChanged<LeadModel> onLeadTap;

  static const List<String> kanbanColumns = [
    'Fresh Leads',
    'Cold Calls',
    'Following Up',
    'Meeting',
    'Interested',
    'Done Deal',
  ];

  const LeadKanbanBoard({
    super.key,
    required this.leads,
    required this.onLeadTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.72,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: kanbanColumns.length,
        separatorBuilder: (_, __) => const SizedBox(width: 14),
        itemBuilder: (context, colIndex) {
          final stage = kanbanColumns[colIndex];
          final stageLeads = leads.where((l) => l.status == stage).toList();
          final colors = AppColors.getStatusColors(stage, isDark: isDark);

          return Container(
            width: 280,
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF14171D) : const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Column Header
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: colors.bg,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          stage,
                          style: TextStyle(
                            color: colors.text,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: isDark ? AppColors.darkMuted : AppColors.lightMuted,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          stageLeads.length.toString(),
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const Divider(height: 1),

                // Cards in Column
                Expanded(
                  child: stageLeads.isEmpty
                      ? Center(
                          child: Text(
                            'No leads in this stage',
                            style: TextStyle(
                              fontSize: 12,
                              color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                            ),
                          ),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.all(10),
                          itemCount: stageLeads.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 10),
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
