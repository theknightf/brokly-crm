import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/premium.dart';
import 'dash_kit.dart';

class _Tool {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  const _Tool(this.label, this.icon, this.color, this.onTap);
}

/// Broker quick tools: 2-column grid of 56dp tiles.
class QuickTools extends StatelessWidget {
  final VoidCallback onAddLead;
  final VoidCallback onCalculator;
  final VoidCallback onFollowUps;
  final VoidCallback onCallLogs;

  const QuickTools({
    super.key,
    required this.onAddLead,
    required this.onCalculator,
    required this.onFollowUps,
    required this.onCallLogs,
  });

  @override
  Widget build(BuildContext context) {
    final tools = [
      _Tool('Add Lead', LucideIcons.userPlus, Surf.accent(context), onAddLead),
      _Tool('Unit Calculator', LucideIcons.calculator, DashColors.blue,
          onCalculator),
      _Tool('Follow-ups', LucideIcons.calendarClock, AppColors.amber,
          onFollowUps),
      _Tool('Call Logs', LucideIcons.phoneCall, DashColors.green, onCallLogs),
    ];
    Widget tile(_Tool t) => Expanded(
          child: PremiumCard(
            margin: EdgeInsets.zero,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            onTap: t.onTap,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 36),
              child: Row(
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: t.color.withAlpha(Surf.dark(context) ? 38 : 26),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(t.icon, size: 17, color: t.color),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      t.label,
                      style: TextStyle(
                          fontSize: 13,
                          height: 1.2,
                          fontWeight: FontWeight.w700,
                          color: Surf.text(context)),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Broker Quick Tools'),
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [tile(tools[0]), const SizedBox(width: 10), tile(tools[1])],
          ),
        ),
        const SizedBox(height: 10),
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [tile(tools[2]), const SizedBox(width: 10), tile(tools[3])],
          ),
        ),
      ],
    );
  }
}
