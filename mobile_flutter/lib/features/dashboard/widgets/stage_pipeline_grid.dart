import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../core/theme/app_colors.dart';

class StagePipelineGrid extends StatelessWidget {
  final Map<String, int> statusCounts;
  final int totalLeads;
  final ValueChanged<String>? onStageTap;

  const StagePipelineGrid({
    super.key,
    required this.statusCounts,
    required this.totalLeads,
    this.onStageTap,
  });

  static const List<Map<String, dynamic>> pipelineStages = [
    {
      'name': 'Fresh Leads',
      'icon': LucideIcons.sparkles,
      'color': Color(0xFF84CC16), // Lime
      'bg': Color(0xFF1F2E1E),
    },
    {
      'name': 'Cold Calls',
      'icon': LucideIcons.phone,
      'color': Color(0xFF4ADE80), // Green
      'bg': Color(0xFF202738),
    },
    {
      'name': 'Pending Leads',
      'icon': LucideIcons.hourglass,
      'color': Color(0xFFE8B577), // Amber
      'bg': Color(0xFF2A2520),
    },
    {
      'name': 'Following Up',
      'icon': LucideIcons.refreshCw,
      'color': Color(0xFF74C0FC), // Sky
      'bg': Color(0xFF1B2B36),
    },
    {
      'name': 'Meeting',
      'icon': LucideIcons.handshake,
      'color': Color(0xFFFCC419), // Yellow
      'bg': Color(0xFF2E2619),
    },
    {
      'name': 'Interested',
      'icon': LucideIcons.star,
      'color': Color(0xFFFFE066), // Gold
      'bg': Color(0xFF2E2816),
    },
    {
      'name': 'Done Deal',
      'icon': LucideIcons.checkCheck,
      'color': Color(0xFFA3E635), // Primary Lime Neon
      'bg': Color(0xFF183318),
      'highlight': true,
    },
    {
      'name': 'Reservation',
      'icon': LucideIcons.badgeCheck,
      'color': Color(0xFF20C997), // Teal
      'bg': Color(0xFF182729),
    },
    {
      'name': 'Not Interested',
      'icon': LucideIcons.x,
      'color': Color(0xFFFF6B6B), // Red
      'bg': Color(0xFF351A1A),
    },
    {
      'name': 'Cancellation',
      'icon': LucideIcons.ban,
      'color': Color(0xFFFA5252), // Bright Red
      'bg': Color(0xFF341D1D),
    },
    {
      'name': 'Duplicate Leads',
      'icon': LucideIcons.copy,
      'color': Color(0xFFCED4DA), // Gray
      'bg': Color(0xFF27262C),
    },
    {
      'name': 'Wrong Number',
      'icon': LucideIcons.phoneOff,
      'color': Color(0xFFFF8787), // Pink-Red
      'bg': Color(0xFF351F22),
    },
    {
      'name': 'Data Rotation',
      'icon': LucideIcons.arrowLeftRight,
      'color': Color(0xFF4DABF7), // Blue
      'bg': Color(0xFF1B2B36),
    },
    {
      'name': 'Closed Number',
      'icon': LucideIcons.lock,
      'color': Color(0xFFFFD43B), // Yellow
      'bg': Color(0xFF2A241B),
    },
    {
      'name': 'No Answer',
      'icon': LucideIcons.phoneMissed,
      'color': Color(0xFFFF922B), // Orange
      'bg': Color(0xFF2E2316),
    },
    {
      'name': 'Low Budget',
      'icon': LucideIcons.wallet,
      'color': Color(0xFFFAB005), // Amber
      'bg': Color(0xFF27261A),
    },
  ];

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final total = totalLeads > 0 ? totalLeads : 1;

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 1.35,
      ),
      itemCount: pipelineStages.length,
      itemBuilder: (context, index) {
        final stage = pipelineStages[index];
        final name = stage['name'] as String;
        final icon = stage['icon'] as IconData;
        final color = stage['color'] as Color;
        final bg = stage['bg'] as Color;
        final isHighlight = stage['highlight'] == true;

        final count = statusCounts[name] ?? 0;
        final percent = ((count / total) * 100).toStringAsFixed(1);

        return Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () => onStageTap?.call(name),
            borderRadius: BorderRadius.circular(20),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF141820) : Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: isHighlight
                      ? AppColors.neonLime.withAlpha(120)
                      : (isDark ? const Color(0xFF272C38) : AppColors.lightBorder),
                  width: isHighlight ? 1.5 : 1,
                ),
                boxShadow: isHighlight
                    ? [
                        BoxShadow(
                          color: AppColors.neonLime.withAlpha(40),
                          blurRadius: 14,
                          spreadRadius: 1,
                        ),
                      ]
                    : (isDark
                        ? [
                            BoxShadow(
                              color: Colors.black.withAlpha(70),
                              blurRadius: 8,
                              offset: const Offset(0, 2),
                            ),
                          ]
                        : [
                            BoxShadow(
                              color: Colors.black.withAlpha(10),
                              blurRadius: 6,
                              offset: const Offset(0, 2),
                            ),
                          ]),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  // Top Row: Icon circle + Percentage pill
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: isDark ? bg : color.withAlpha(30),
                        ),
                        child: Center(
                          child: Icon(icon, size: 18, color: color),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2.5),
                        decoration: BoxDecoration(
                          color: count > 0 && isHighlight
                              ? AppColors.neonLime.withAlpha(40)
                              : (isDark ? const Color(0xFF222733) : const Color(0xFFF1F5F9)),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: count > 0 && isHighlight
                                ? AppColors.neonLime.withAlpha(80)
                                : (isDark ? const Color(0xFF2E3545) : const Color(0xFFE2E8F0)),
                          ),
                        ),
                        child: Text(
                          '$percent%',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: count > 0 && isHighlight
                                ? AppColors.neonLime
                                : (isDark ? AppColors.darkForeground : AppColors.lightForeground),
                          ),
                        ),
                      ),
                    ],
                  ),

                  // Middle: Count
                  Text(
                    count.toString(),
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                    ),
                  ),

                  // Bottom: Stage name + curved arrow ↗
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          name,
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                            color: isDark ? const Color(0xFFCAD0DD) : AppColors.lightForeground,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const Text(
                        '↗',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w300,
                          color: AppColors.mutedText,
                          height: 1,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
