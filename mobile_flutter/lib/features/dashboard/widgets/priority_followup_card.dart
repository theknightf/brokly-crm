import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/date_utils.dart';
import '../../../core/widgets/premium.dart';
import '../../../data/models/follow_up_model.dart';
import 'dash_kit.dart';

/// Hero card for the next priority follow-up (Call / WhatsApp / Mark done).
class PriorityFollowUpCard extends StatelessWidget {
  final FollowUpModel followUp;
  final VoidCallback onCall;
  final VoidCallback onWhatsApp;
  final VoidCallback onDone;

  const PriorityFollowUpCard({
    super.key,
    required this.followUp,
    required this.onCall,
    required this.onWhatsApp,
    required this.onDone,
  });

  @override
  Widget build(BuildContext context) {
    final dark = Surf.dark(context);
    final overdue = followUp.isOverdue;
    final tone = overdue ? AppColors.alertRed : AppColors.amber;
    final interest = (followUp.propertyInterest?.trim().isNotEmpty ?? false)
        ? followUp.propertyInterest!.trim()
        : ((followUp.notes?.trim().isNotEmpty ?? false)
            ? followUp.notes!.trim()
            : followUp.title);
    final due = followUp.dueTime != null
        ? '${AppDateUtils.formatDate(followUp.dueDate)} - ${followUp.dueTime}'
        : AppDateUtils.formatDate(followUp.dueDate);

    return PremiumCard(
      margin: EdgeInsets.zero,
      tint: dark ? const Color(0xFF171316) : const Color(0xFFFFFBEB),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 10,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              StatusPill(
                overdue ? 'Priority follow-up - Overdue' : 'Priority follow-up - Today',
                color: tone,
                icon: LucideIcons.flame,
              ),
              Text(
                due,
                style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: Surf.subtext(context)),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: tone.withAlpha(36),
                child: Text(
                  followUp.contactName.isNotEmpty
                      ? followUp.contactName[0].toUpperCase()
                      : 'L',
                  style: TextStyle(
                      fontWeight: FontWeight.w800, color: tone, fontSize: 16),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      followUp.contactName,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.2,
                          color: Surf.text(context)),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      interest,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 12.5, color: Surf.subtext(context)),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              StatusPill('${followUp.priority} priority',
                  color: Surf.accent(context)),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                flex: 3,
                child: SizedBox(
                  height: 48,
                  child: FilledButton.icon(
                    onPressed: onCall,
                    icon: const Icon(LucideIcons.phoneCall, size: 16),
                    label: const Text('Call now'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.neonLime,
                      foregroundColor: DashColors.onLime,
                      textStyle: const TextStyle(
                          fontSize: 13.5, fontWeight: FontWeight.w800),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 3,
                child: SizedBox(
                  height: 48,
                  child: OutlinedButton.icon(
                    onPressed: onWhatsApp,
                    icon: const Icon(LucideIcons.messageCircle, size: 16),
                    label: const Text('WhatsApp'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: DashColors.whatsapp,
                      side: const BorderSide(color: DashColors.whatsapp),
                      textStyle: const TextStyle(
                          fontSize: 13.5, fontWeight: FontWeight.w700),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                width: 48,
                height: 48,
                child: IconButton(
                  tooltip: 'Mark Done',
                  onPressed: onDone,
                  style: IconButton.styleFrom(
                    backgroundColor: Surf.card(context),
                    side: BorderSide(color: Surf.border(context)),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14)),
                  ),
                  icon: Icon(LucideIcons.check,
                      size: 18, color: Surf.accent(context)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
