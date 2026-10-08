import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../state/call_logs_provider.dart';
import 'widgets/call_log_item.dart';
import 'widgets/native_call_sync_sheet.dart';

class CallLogsScreen extends StatelessWidget {
  const CallLogsScreen({super.key});

  static const List<String> channels = ['All', 'Call', 'WhatsApp', 'Meeting', 'Site Visit'];

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final provider = context.watch<CallLogsProvider>();

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            // Header Bar: Search & Sync Action
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Container(
                      height: 44,
                      decoration: BoxDecoration(
                        color: isDark ? AppColors.darkCard : Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                        ),
                      ),
                      child: TextField(
                        onChanged: (q) => provider.setSearchQuery(q),
                        decoration: InputDecoration(
                          hintText: 'Search by contact, phone, outcome…',
                          hintStyle: TextStyle(
                            fontSize: 13,
                            color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                          ),
                          prefixIcon: const Icon(LucideIcons.search, size: 18),
                          border: InputBorder.none,
                          enabledBorder: InputBorder.none,
                          focusedBorder: InputBorder.none,
                          contentPadding: const EdgeInsets.symmetric(vertical: 10),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filledTonal(
                    icon: provider.isSyncing
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
                          )
                        : const Icon(LucideIcons.refreshCw, size: 18),
                    style: IconButton.styleFrom(
                      backgroundColor: isDark ? AppColors.darkCard : Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(
                          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                        ),
                      ),
                    ),
                    onPressed: () => NativeCallSyncSheet.show(context),
                  ),
                ],
              ),
            ),

            // Channel Filter Chips
            SizedBox(
              height: 38,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: channels.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final ch = channels[index];
                  final isSelected = provider.channelFilter == ch;

                  return ChoiceChip(
                    label: Text(ch),
                    selected: isSelected,
                    selectedColor: AppColors.primary,
                    labelStyle: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: isSelected ? Colors.white : (isDark ? Colors.white70 : Colors.black87),
                    ),
                    onSelected: (val) {
                      if (val) provider.setChannelFilter(ch);
                    },
                  );
                },
              ),
            ),
            const SizedBox(height: 8),

            // Call Logs List
            Expanded(
              child: provider.isLoading
                  ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
                  : RefreshIndicator(
                      onRefresh: () => provider.fetchCalls(),
                      color: AppColors.primary,
                      child: provider.calls.isEmpty
                          ? Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    LucideIcons.phoneOff,
                                    size: 44,
                                    color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                                  ),
                                  const SizedBox(height: 12),
                                  Text(
                                    'No call logs recorded',
                                    style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                      color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    'Sync device calls or log calls from lead cards',
                                    style: TextStyle(
                                      fontSize: 13,
                                      color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                                    ),
                                  ),
                                ],
                              ),
                            )
                          : ListView.separated(
                              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                              itemCount: provider.calls.length,
                              separatorBuilder: (_, __) => const SizedBox(height: 10),
                              itemBuilder: (context, index) {
                                return CallLogItem(call: provider.calls[index]);
                              },
                            ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
