import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../../core/constants/lead_stages.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/premium.dart';
import '../../../state/leads_provider.dart';
import 'dash_kit.dart';

class _StageGroup {
  final String title;
  final String hint;
  final IconData icon;
  final Color color;
  final List<String> stages;
  const _StageGroup(this.title, this.hint, this.icon, this.color, this.stages);
}

const List<_StageGroup> _groups = [
  _StageGroup('Inflow', 'New and first-contact leads', LucideIcons.inbox,
      Color(0xFF84CC16), ['Fresh Leads', 'Cold Calls', 'Pending Leads']),
  _StageGroup(
      'Active engagement',
      'Leads in conversation',
      LucideIcons.messagesSquare,
      Color(0xFF0284C7), [
    'Following Up',
    'Meeting',
    'Follow Up After Meeting',
    'Interested',
    'No Answer',
    'No Answer At All',
    'Reschedule Meeting',
  ]),
  _StageGroup(
      'Conversion & outcome',
      'Reservations, deals and losses',
      LucideIcons.trophy,
      Color(0xFF10B981), [
    'Reservation',
    'Done Deal',
    'Not Interested',
    'Cancellation',
    'Low Budget',
  ]),
  _StageGroup(
      'Data quality',
      'Numbers and records to clean up',
      LucideIcons.shieldAlert,
      Color(0xFF64748B), [
    'Wrong Number',
    'Closed Number',
    'Data Rotation',
    'Duplicate Leads',
  ]),
];

/// Pipeline stages grouped like the website (Inflow / Active engagement /
/// Conversion & outcome / Data quality) with a total row. Tapping a stage sets
/// the shared stage filter (same behaviour as the stage chips below).
class PipelineOverview extends StatelessWidget {
  const PipelineOverview({super.key});

  @override
  Widget build(BuildContext context) {
    final counts = context.select<LeadsProvider, Map<String, int>>(
        (p) => p.stageCounts);
    final total = context.select<LeadsProvider, int>((p) => p.allLeads.length);
    final selected =
        context.select<LeadsProvider, String>((p) => p.statusFilter);
    final provider = context.read<LeadsProvider>();

    return DashCard(
      icon: LucideIcons.chartNoAxesColumn,
      title: 'Pipeline overview',
      subtitle: 'Tap a stage to filter the leads below',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final g in _groups) ...[
            _GroupBlock(
              group: g,
              counts: counts,
              total: total,
              selected: selected,
              onTap: (s) =>
                  provider.setStatusFilter(selected == s ? 'All Leads' : s),
            ),
            const SizedBox(height: 14),
          ],
          Divider(height: 1, color: Surf.border(context)),
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Row(
              children: [
                Expanded(
                  child: Text('Total leads',
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: Surf.subtext(context))),
                ),
                CountUp(
                  total,
                  style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: Surf.text(context)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _GroupBlock extends StatelessWidget {
  final _StageGroup group;
  final Map<String, int> counts;
  final int total;
  final String selected;
  final ValueChanged<String> onTap;

  const _GroupBlock({
    required this.group,
    required this.counts,
    required this.total,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final sum = group.stages.fold<int>(0, (a, s) => a + (counts[s] ?? 0));
    final share = total > 0 ? sum / total : 0.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(group.icon, size: 15, color: group.color),
            const SizedBox(width: 8),
            Expanded(
              child: Text(group.title,
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: Surf.text(context))),
            ),
            Text(
              '$sum  -  ${(share * 100).toStringAsFixed(0)}%',
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  fontFeatures: kTabular,
                  color: Surf.subtext(context)),
            ),
          ],
        ),
        const SizedBox(height: 6),
        GrowBar(value: share, color: group.color, height: 5),
        const SizedBox(height: 8),
        LayoutBuilder(builder: (context, c) {
          final w = (c.maxWidth - 8) / 2;
          return Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final s in group.stages)
                SizedBox(
                  width: w,
                  child: _StageTile(
                    stage: s,
                    count: counts[s] ?? 0,
                    selected: selected == s,
                    onTap: () => onTap(s),
                  ),
                ),
            ],
          );
        }),
      ],
    );
  }
}

class _StageTile extends StatelessWidget {
  final String stage;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  const _StageTile({
    required this.stage,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final dark = Surf.dark(context);
    final sc = AppColors.getStatusColors(stage, isDark: dark);
    final empty = count == 0;
    return Semantics(
      button: true,
      selected: selected,
      label: '$stage, $count leads',
      child: Material(
        color: selected ? sc.bg : DashColors.inset(context),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            constraints: const BoxConstraints(minHeight: 52),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                  color: selected ? sc.text : Surf.border(context)),
            ),
            child: Row(
              children: [
                Icon(LeadStages.iconFor(stage),
                    size: 15, color: empty ? Surf.subtext(context) : sc.text),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    stage,
                    style: TextStyle(
                      fontSize: 12,
                      height: 1.2,
                      fontWeight: FontWeight.w600,
                      color: empty ? Surf.subtext(context) : Surf.text(context),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  '$count',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    fontFeatures: kTabular,
                    color: empty ? Surf.subtext(context) : sc.text,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
