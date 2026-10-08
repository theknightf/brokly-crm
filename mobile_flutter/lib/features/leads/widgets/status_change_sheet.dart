import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../core/theme/app_colors.dart';

class StatusChangeSheet extends StatelessWidget {
  final String currentStatus;
  final ValueChanged<String> onSelectStatus;

  static const List<String> pipelineStages = [
    'Fresh Leads',
    'Cold Calls',
    'Pending Leads',
    'Following Up',
    'Meeting',
    'Interested',
    'Reservation',
    'Done Deal',
  ];

  static const List<String> outcomeStages = [
    'Not Interested',
    'Cancellation',
    'Duplicate Leads',
    'Wrong Number',
    'Data Rotation',
    'Closed Number',
    'No Answer',
    'No Answer At All',
    'Low Budget',
    'Reschedule Meeting',
  ];

  const StatusChangeSheet({
    super.key,
    required this.currentStatus,
    required this.onSelectStatus,
  });

  static Future<void> show(
    BuildContext context, {
    required String currentStatus,
    required ValueChanged<String> onSelectStatus,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => StatusChangeSheet(
        currentStatus: currentStatus,
        onSelectStatus: onSelectStatus,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.75,
      ),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Change Lead Stage',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                ),
              ),
              IconButton(
                icon: const Icon(LucideIcons.x, size: 20),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Expanded(
            child: ListView(
              children: [
                _buildHeader('PIPELINE STAGES', isDark),
                const SizedBox(height: 6),
                ...pipelineStages.map((stage) => _buildStageItem(stage, context, isDark)),
                const SizedBox(height: 16),
                _buildHeader('OUTCOME & OTHER STAGES', isDark),
                const SizedBox(height: 6),
                ...outcomeStages.map((stage) => _buildStageItem(stage, context, isDark)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(String title, bool isDark) {
    return Text(
      title,
      style: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.5,
        color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
      ),
    );
  }

  Widget _buildStageItem(String stage, BuildContext context, bool isDark) {
    final isSelected = stage == currentStatus;
    final colors = AppColors.getStatusColors(stage, isDark: isDark);

    return InkWell(
      onTap: () {
        Navigator.pop(context);
        onSelectStatus(stage);
      },
      borderRadius: BorderRadius.circular(10),
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 3),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: isSelected
              ? (isDark ? AppColors.secondaryDark : AppColors.secondary)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
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
            const Spacer(),
            if (isSelected)
              const Icon(LucideIcons.check, size: 18, color: AppColors.primary),
          ],
        ),
      ),
    );
  }
}
