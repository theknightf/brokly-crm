import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../state/call_logs_provider.dart';

class NativeCallSyncSheet extends StatelessWidget {
  const NativeCallSyncSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => const NativeCallSyncSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final provider = context.watch<CallLogsProvider>();

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: isDark ? AppColors.secondaryDark : AppColors.secondary,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Center(
                  child: Icon(LucideIcons.refreshCw, color: AppColors.primary, size: 20),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Sync Device Call History',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                  ),
                ),
              ),
              IconButton(
                icon: const Icon(LucideIcons.x, size: 20),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            'Brokly CRM will read your recent phone call logs from this device and automatically match incoming/outgoing numbers with your leads in the CRM database.',
            style: TextStyle(
              fontSize: 13,
              height: 1.5,
              color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
            ),
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: provider.isSyncing
                ? null
                : () async {
                    final count = await provider.syncDeviceCallLogs();
                    if (context.mounted) {
                      Navigator.pop(context);
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            count > 0
                                ? 'Successfully synced $count call logs from device'
                                : 'Call logs are already up to date',
                          ),
                          backgroundColor: AppColors.primary,
                        ),
                      );
                    }
                  },
            child: provider.isSyncing
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text('Start Device Sync'),
          ),
        ],
      ),
    );
  }
}
