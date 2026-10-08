import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/date_utils.dart';
import '../../../data/models/attendance_model.dart';

class AttendanceHistoryList extends StatelessWidget {
  final List<AttendanceModel> history;

  const AttendanceHistoryList({super.key, required this.history});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    if (history.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 40),
          child: Column(
            children: [
              Icon(
                LucideIcons.calendarCheck2,
                size: 40,
                color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
              ),
              const SizedBox(height: 12),
              Text(
                'No attendance records found',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: history.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        final item = history[index];
        final isLate = item.isLate;

        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkCard : Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: item.isCheckedIn
                      ? (isDark ? AppColors.secondaryDark : AppColors.secondary)
                      : (isDark ? AppColors.darkMuted : AppColors.lightMuted),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Center(
                  child: Icon(
                    item.isCheckedIn ? LucideIcons.check : LucideIcons.x,
                    size: 18,
                    color: item.isCheckedIn
                        ? AppColors.primary
                        : (isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          AppDateUtils.formatDate(item.attendanceDate),
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                          ),
                        ),
                        if (isLate) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFEF3C7),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              'Late ${item.delayMinutes}m',
                              style: const TextStyle(
                                color: Color(0xFFD97706),
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'In: ${AppDateUtils.formatTime(item.checkInTime)} · Out: ${AppDateUtils.formatTime(item.checkOutTime)}',
                      style: TextStyle(
                        fontSize: 12,
                        color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
              if (item.hasGps)
                const Icon(
                  LucideIcons.mapPin,
                  size: 16,
                  color: AppColors.primary,
                ),
            ],
          ),
        );
      },
    );
  }
}
