import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/premium.dart';
import '../../../data/models/dashboard_summary_model.dart';
import 'dash_kit.dart';

/// Today's action tasks with a completion bar. Rows are 48dp+ tall.
class TasksCard extends StatelessWidget {
  final List<DashboardTaskItem> tasks;
  final ValueChanged<int> onToggle;
  final ValueChanged<String> onOpenLead;

  const TasksCard({
    super.key,
    required this.tasks,
    required this.onToggle,
    required this.onOpenLead,
  });

  @override
  Widget build(BuildContext context) {
    final done = tasks.where((t) => t.isCompleted).length;
    final accent = Surf.accent(context);

    return DashCard(
      icon: LucideIcons.listChecks,
      title: "Today's Action Tasks",
      trailing: StatusPill('Done $done/${tasks.length}', color: accent),
      child: tasks.isEmpty
          ? Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: DashColors.inset(context),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(
                children: [
                  Icon(LucideIcons.checkCheck, size: 20, color: accent),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'All assigned tasks and due follow-ups for today are complete!',
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Surf.text(context)),
                    ),
                  ),
                ],
              ),
            )
          : Column(
              children: [
                GrowBar(
                  value: tasks.isEmpty ? 0 : done / tasks.length,
                  color: accent,
                  height: 5,
                ),
                const SizedBox(height: 12),
                for (var i = 0; i < tasks.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _TaskRow(
                      item: tasks[i],
                      onToggle: () => onToggle(i),
                      onOpenLead: onOpenLead,
                    ),
                  ),
              ],
            ),
    );
  }
}

class _TaskRow extends StatelessWidget {
  final DashboardTaskItem item;
  final VoidCallback onToggle;
  final ValueChanged<String> onOpenLead;
  const _TaskRow(
      {required this.item, required this.onToggle, required this.onOpenLead});

  @override
  Widget build(BuildContext context) {
    final accent = Surf.accent(context);
    final dark = Surf.dark(context);
    final done = item.isCompleted;
    final pColor = item.priority == 'High'
        ? AppColors.alertRed
        : (item.priority == 'Medium' ? AppColors.amber : DashColors.green);
    final leadId = item.leadId;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      decoration: BoxDecoration(
        color: DashColors.inset(context),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
            color: done ? accent.withAlpha(100) : Surf.border(context)),
      ),
      child: Row(
        children: [
          Semantics(
            checked: done,
            label: 'Mark task ${done ? 'not done' : 'done'}',
            child: InkWell(
              onTap: onToggle,
              borderRadius: BorderRadius.circular(14),
              child: SizedBox(
                width: 52,
                height: 52,
                child: Center(
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 160),
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      color: done ? accent : Colors.transparent,
                      borderRadius: BorderRadius.circular(7),
                      border: Border.all(
                          color: done ? accent : DashColors.slate, width: 1.8),
                    ),
                    child: done
                        ? Icon(LucideIcons.check,
                            size: 15,
                            color: dark ? DashColors.onLime : Colors.white)
                        : null,
                  ),
                ),
              ),
            ),
          ),
          Expanded(
            child: InkWell(
              onTap: () {
                if (leadId != null && leadId.isNotEmpty) {
                  onOpenLead(leadId);
                } else {
                  onToggle();
                }
              },
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 52),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          item.title,
                          style: TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w700,
                            decoration: done ? TextDecoration.lineThrough : null,
                            color: done
                                ? Surf.subtext(context)
                                : Surf.text(context),
                          ),
                        ),
                        if (item.subtitle.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(item.subtitle,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  fontSize: 11.5,
                                  color: Surf.subtext(context))),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          StatusPill(item.priority, color: pColor),
          const SizedBox(width: 10),
        ],
      ),
    );
  }
}
