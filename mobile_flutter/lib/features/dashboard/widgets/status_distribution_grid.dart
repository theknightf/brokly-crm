import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';

class StatusDistributionGrid extends StatelessWidget {
  final Map<String, int> statusCounts;
  final ValueChanged<String>? onStatusTap;

  const StatusDistributionGrid({
    super.key,
    required this.statusCounts,
    this.onStatusTap,
  });

  static const List<String> primaryStatuses = [
    'Fresh Leads',
    'Cold Calls',
    'Following Up',
    'Meeting',
    'Interested',
    'Done Deal',
    'Not Interested',
    'No Answer',
  ];

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: primaryStatuses.map((st) {
        final count = statusCounts[st] ?? 0;
        final colors = AppColors.getStatusColors(st, isDark: isDark);

        return InkWell(
          onTap: () => onStatusTap?.call(st),
          borderRadius: BorderRadius.circular(10),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkCard : Colors.white,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: colors.text,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  st,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(
                    color: colors.bg,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    count.toString(),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: colors.text,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}
