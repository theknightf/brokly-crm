import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/date_utils.dart';
import '../../../data/models/call_log_model.dart';

class CallLogItem extends StatelessWidget {
  final CallLogModel call;

  const CallLogItem({super.key, required this.call});

  Future<void> _callNumber() async {
    final uri = Uri.parse('tel:${call.contactPhone.replaceAll(RegExp(r'\s+'), '')}');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Future<void> _openWhatsApp() async {
    final cleanPhone = call.contactPhone.replaceAll(RegExp(r'\D'), '');
    final uri = Uri.parse('https://wa.me/$cleanPhone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final outcomeColor = AppColors.getOutcomeColor(call.outcome);
    final isIncoming = call.direction == 'incoming';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // Direction Icon
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: isIncoming
                      ? (isDark ? const Color(0xFF11261A) : const Color(0xFFDCFCE7))
                      : (isDark ? AppColors.secondaryDark : AppColors.secondary),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Center(
                  child: Icon(
                    isIncoming ? LucideIcons.phoneIncoming : LucideIcons.phoneOutgoing,
                    size: 16,
                    color: isIncoming ? const Color(0xFF16A34A) : AppColors.primary,
                  ),
                ),
              ),
              const SizedBox(width: 12),

              // Contact Name & Phone
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      call.contactName != null && call.contactName!.isNotEmpty
                          ? call.contactName!
                          : call.contactPhone,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      call.contactPhone,
                      style: TextStyle(
                        fontSize: 12,
                        color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                      ),
                    ),
                  ],
                ),
              ),

              // Outcome Badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: outcomeColor.withAlpha(isDark ? 40 : 25),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  call.outcome,
                  style: TextStyle(
                    color: outcomeColor,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Metadata line: Duration, Channel, Timestamp
          Row(
            children: [
              Icon(
                LucideIcons.clock,
                size: 13,
                color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
              ),
              const SizedBox(width: 4),
              Text(
                AppDateUtils.formatDuration(call.durationSeconds),
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                ),
              ),
              const SizedBox(width: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: isDark ? AppColors.darkMuted : AppColors.lightMuted,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  call.channel,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                  ),
                ),
              ),
              const Spacer(),
              Text(
                AppDateUtils.timeAgo(call.createdAt),
                style: TextStyle(
                  fontSize: 11,
                  color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                ),
              ),
            ],
          ),

          // Optional Notes
          if (call.notes != null && call.notes!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              call.notes!,
              style: TextStyle(
                fontSize: 12,
                color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
          const SizedBox(height: 10),
          const Divider(height: 1),
          const SizedBox(height: 8),

          // Quick call back & WhatsApp action buttons
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton.icon(
                icon: const Icon(LucideIcons.phone, size: 14, color: AppColors.primary),
                label: const Text('Call Back', style: TextStyle(fontSize: 12, color: AppColors.primary)),
                onPressed: _callNumber,
              ),
              const SizedBox(width: 8),
              TextButton.icon(
                icon: const Icon(LucideIcons.messageCircle, size: 14, color: Color(0xFF25D366)),
                label: const Text('WhatsApp', style: TextStyle(fontSize: 12, color: Color(0xFF25D366))),
                onPressed: _openWhatsApp,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
