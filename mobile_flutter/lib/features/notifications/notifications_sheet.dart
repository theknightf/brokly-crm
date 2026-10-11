import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/date_utils.dart';
import '../../data/models/app_notification_model.dart';
import '../../state/leads_provider.dart';
import '../../state/notifications_provider.dart';
import '../leads/lead_detail_screen.dart';

/// Helper to navigate directly to the relevant LeadDetailScreen when clicking any notification
void openNotificationTarget(
  BuildContext context,
  AppNotificationModel notification, {
  VoidCallback? onNavigateFallbackTab,
}) {
  context.read<NotificationsProvider>().markAsRead(notification.id);

  String? targetLeadId = notification.leadId;

  // Fallback resolution against loaded leads if leadId wasn't directly stored
  if (targetLeadId == null || targetLeadId.isEmpty) {
    if (notification.entityType == 'lead' && notification.entityId.isNotEmpty) {
      targetLeadId = notification.entityId;
    } else {
      final leads = context.read<LeadsProvider>().leads;
      final bodyLower = notification.body.toLowerCase();
      for (final lead in leads) {
        if (lead.name.trim().isNotEmpty &&
            bodyLower.contains(lead.name.trim().toLowerCase())) {
          targetLeadId = lead.id;
          break;
        }
      }
      if ((targetLeadId == null || targetLeadId.isEmpty) && leads.isNotEmpty) {
        targetLeadId = leads.first.id;
      }
    }
  }

  if (targetLeadId != null && targetLeadId.isNotEmpty) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => LeadDetailScreen(leadId: targetLeadId!),
      ),
    );
  } else {
    onNavigateFallbackTab?.call();
  }
}

/// Host widget that listens to NotificationsProvider.alertStream and displays
/// a floating push-style banner at the top of the screen for new lead assignments
/// and upcoming/overdue follow-up reminders. Tapping opens LeadDetailScreen directly.
class RealTimeNotificationBannerHost extends StatefulWidget {
  final Widget child;

  const RealTimeNotificationBannerHost({
    super.key,
    required this.child,
  });

  @override
  State<RealTimeNotificationBannerHost> createState() =>
      _RealTimeNotificationBannerHostState();
}

class _RealTimeNotificationBannerHostState
    extends State<RealTimeNotificationBannerHost> {
  StreamSubscription<AppNotificationModel>? _sub;
  AppNotificationModel? _activeAlert;
  Timer? _dismissTimer;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_sub == null) {
      final provider = context.read<NotificationsProvider>();
      _sub = provider.alertStream.listen(_showBanner);
    }
  }

  void _showBanner(AppNotificationModel alert) {
    if (!mounted) return;
    _dismissTimer?.cancel();
    setState(() => _activeAlert = alert);
    _dismissTimer = Timer(const Duration(seconds: 7), () {
      if (mounted) {
        setState(() => _activeAlert = null);
      }
    });
  }

  void _dismissBanner() {
    _dismissTimer?.cancel();
    if (mounted) {
      setState(() => _activeAlert = null);
    }
  }

  @override
  void dispose() {
    _dismissTimer?.cancel();
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final alert = _activeAlert;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Stack(
      children: [
        widget.child,
        if (alert != null)
          Positioned(
            top: MediaQuery.of(context).padding.top + 10,
            left: 12,
            right: 12,
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: () {
                  final target = alert;
                  _dismissBanner();
                  openNotificationTarget(context, target);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF1A202C) : Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: _colorForType(alert.type).withAlpha(140),
                      width: 1.5,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withAlpha(65),
                        blurRadius: 16,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: _colorForType(alert.type).withAlpha(30),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(
                          _iconForType(alert.type),
                          size: 20,
                          color: _colorForType(alert.type),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              alert.title,
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w800,
                                color: isDark ? Colors.white : const Color(0xFF0F172A),
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              alert.body,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 12,
                                color: isDark
                                    ? const Color(0xFFCBD5E1)
                                    : const Color(0xFF475569),
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Tap to open lead details →',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: _colorForType(alert.type),
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(LucideIcons.x, size: 16),
                        onPressed: _dismissBanner,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class NotificationsSheet extends StatefulWidget {
  const NotificationsSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const NotificationsSheet(),
    );
  }

  @override
  State<NotificationsSheet> createState() => _NotificationsSheetState();
}

class _NotificationsSheetState extends State<NotificationsSheet> {
  String _filter = 'all'; // 'all' | 'leads' | 'reminders'

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        context.read<NotificationsProvider>().refresh();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final provider = context.watch<NotificationsProvider>();
    final allItems = provider.items;

    final filtered = allItems.where((n) {
      if (_filter == 'leads') return n.type == 'assignment';
      if (_filter == 'reminders') {
        return n.type == 'overdue_reminder' || n.type == 'upcoming_reminder';
      }
      return true;
    }).toList();

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.82,
      ),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 12),
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: isDark ? Colors.white24 : Colors.black12,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 16, 10),
            child: Row(
              children: [
                const Icon(LucideIcons.bellRing, size: 20, color: AppColors.neonLime),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Notifications & Alerts (${provider.unreadCount} unread)',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: isDark ? Colors.white : const Color(0xFF0F172A),
                    ),
                  ),
                ),
                TextButton.icon(
                  onPressed: () => provider.markAllAsRead(),
                  icon: const Icon(LucideIcons.checkCheck, size: 15),
                  label: const Text(
                    'Mark all read',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
          ),

          // Filter Chips
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: [
                _buildFilterChip('all', 'All (${allItems.length})', isDark),
                const SizedBox(width: 8),
                _buildFilterChip(
                  'leads',
                  'Assigned Leads (${allItems.where((i) => i.type == 'assignment').length})',
                  isDark,
                ),
                const SizedBox(width: 8),
                _buildFilterChip(
                  'reminders',
                  'Follow-ups (${allItems.where((i) => i.type == 'overdue_reminder' || i.type == 'upcoming_reminder').length})',
                  isDark,
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Divider(
            height: 1,
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
          ),

          // Notification List
          Expanded(
            child: provider.isLoading && allItems.isEmpty
                ? const Center(
                    child: CircularProgressIndicator(color: AppColors.primary),
                  )
                : filtered.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              LucideIcons.bellOff,
                              size: 40,
                              color: isDark
                                  ? AppColors.darkMutedForeground
                                  : AppColors.lightMutedForeground,
                            ),
                            const SizedBox(height: 10),
                            Text(
                              "You're all caught up!",
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: isDark
                                    ? AppColors.darkMutedForeground
                                    : AppColors.lightMutedForeground,
                              ),
                            ),
                          ],
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        itemCount: filtered.length,
                        separatorBuilder: (_, __) => Divider(
                          height: 1,
                          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                        ),
                        itemBuilder: (context, index) {
                          final n = filtered[index];
                          final color = _colorForType(n.type);
                          final icon = _iconForType(n.type);

                          return InkWell(
                            onTap: () {
                              Navigator.pop(context);
                              openNotificationTarget(context, n);
                            },
                            child: Container(
                              color: !n.isRead
                                  ? color.withAlpha(isDark ? 18 : 12)
                                  : Colors.transparent,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 20,
                                vertical: 14,
                              ),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Container(
                                    width: 38,
                                    height: 38,
                                    decoration: BoxDecoration(
                                      color: color.withAlpha(28),
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: Icon(icon, size: 18, color: color),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Expanded(
                                              child: Text(
                                                n.title,
                                                style: TextStyle(
                                                  fontSize: 13.5,
                                                  fontWeight: !n.isRead
                                                      ? FontWeight.w800
                                                      : FontWeight.w600,
                                                  color: isDark
                                                      ? Colors.white
                                                      : const Color(0xFF0F172A),
                                                ),
                                              ),
                                            ),
                                            if (!n.isRead)
                                              Container(
                                                width: 8,
                                                height: 8,
                                                decoration: BoxDecoration(
                                                  color: color,
                                                  shape: BoxShape.circle,
                                                ),
                                              ),
                                          ],
                                        ),
                                        const SizedBox(height: 3),
                                        Text(
                                          n.body,
                                          style: TextStyle(
                                            fontSize: 12.5,
                                            color: isDark
                                                ? const Color(0xFFCBD5E1)
                                                : const Color(0xFF475569),
                                          ),
                                        ),
                                        const SizedBox(height: 5),
                                        Row(
                                          children: [
                                            Text(
                                              AppDateUtils.timeAgo(n.createdAt),
                                              style: TextStyle(
                                                fontSize: 11,
                                                color: isDark
                                                    ? AppColors.darkMutedForeground
                                                    : AppColors.lightMutedForeground,
                                              ),
                                            ),
                                            const SizedBox(width: 8),
                                            Text(
                                              '• Open Lead Details →',
                                              style: TextStyle(
                                                fontSize: 11,
                                                fontWeight: FontWeight.w700,
                                                color: color,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String key, String label, bool isDark) {
    final selected = _filter == key;
    return InkWell(
      onTap: () => setState(() => _filter = key),
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
        decoration: BoxDecoration(
          color: selected
              ? AppColors.neonLime
              : (isDark ? Colors.white.withAlpha(12) : const Color(0xFFF1F5F9)),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: selected
                ? const Color(0xFF142407)
                : (isDark ? Colors.white70 : const Color(0xFF475569)),
          ),
        ),
      ),
    );
  }
}

Color _colorForType(String type) {
  switch (type) {
    case 'assignment':
      return AppColors.neonLime;
    case 'overdue_reminder':
      return const Color(0xFFEF4444);
    case 'upcoming_reminder':
      return const Color(0xFFF59E0B);
    case 'deduction':
      return const Color(0xFFEF4444);
    default:
      return AppColors.primary;
  }
}

IconData _iconForType(String type) {
  switch (type) {
    case 'assignment':
      return LucideIcons.userPlus;
    case 'overdue_reminder':
      return LucideIcons.alarmClockOff;
    case 'upcoming_reminder':
      return LucideIcons.calendarClock;
    case 'deduction':
      return LucideIcons.wallet;
    default:
      return LucideIcons.bellRing;
  }
}
