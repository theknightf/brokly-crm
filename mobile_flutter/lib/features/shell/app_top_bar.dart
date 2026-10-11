import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../state/auth_provider.dart';
import '../../state/notifications_provider.dart';
import '../../state/theme_provider.dart';
import '../leads/add_lead_screen.dart';
import '../notifications/notifications_sheet.dart';

class AppTopBar extends StatelessWidget implements PreferredSizeWidget {
  final VoidCallback? onOpenDrawer;
  final ValueChanged<String>? onSearchChanged;
  final VoidCallback? onSearchTap;
  final String title;

  const AppTopBar({
    super.key,
    this.onOpenDrawer,
    this.onSearchChanged,
    this.onSearchTap,
    this.title = 'Brokly CRM',
  });

  @override
  Size get preferredSize => const Size.fromHeight(64);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final auth = context.watch<AuthProvider>();
    final theme = context.watch<ThemeProvider>();
    final notifications = context.watch<NotificationsProvider>();
    final unreadCount = notifications.unreadCount;
    final profile = auth.profile;

    final initials = profile != null && profile.fullName.trim().isNotEmpty
        ? profile.fullName
            .trim()
            .split(' ')
            .take(2)
            .map((e) => e.isNotEmpty ? e[0].toUpperCase() : '')
            .join()
        : 'FM';

    return AppBar(
      elevation: 0,
      scrolledUnderElevation: 0,
      backgroundColor: isDark ? AppColors.darkCard : Colors.white,
      leadingWidth: 48,
      leading: IconButton(
        icon: const Icon(Icons.menu, size: 22),
        tooltip: 'Menu',
        onPressed: onOpenDrawer ?? () => Scaffold.of(context).openDrawer(),
      ),
      titleSpacing: 0,
      title: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: InkWell(
          onTap: onSearchTap,
          borderRadius: BorderRadius.circular(24),
          child: Container(
            height: 38,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkBackground : AppColors.lightMuted,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                width: 1,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  LucideIcons.search,
                  size: 16,
                  color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Search...',
                    style: TextStyle(
                      fontSize: 13,
                      color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        // Quick Add Button (+) with Neon Lime badge
        Padding(
          padding: const EdgeInsets.only(left: 2, right: 2),
          child: InkWell(
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const AddLeadScreen()),
              );
            },
            borderRadius: BorderRadius.circular(20),
            child: Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppColors.neonLime,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: AppColors.neonLime.withAlpha(80),
                    blurRadius: 6,
                    spreadRadius: 1,
                  ),
                ],
              ),
              child: const Icon(
                LucideIcons.plus,
                size: 18,
                color: Color(0xFF142407),
              ),
            ),
          ),
        ),

        // Theme Switcher (sun/moon)
        IconButton(
          constraints: const BoxConstraints(maxWidth: 36),
          padding: EdgeInsets.zero,
          icon: Icon(
            theme.isDark ? LucideIcons.sun : LucideIcons.moon,
            size: 19,
          ),
          tooltip: 'Toggle Theme',
          onPressed: () => theme.toggleTheme(),
        ),

        // Language Selector (Globe)
        IconButton(
          constraints: const BoxConstraints(maxWidth: 36),
          padding: EdgeInsets.zero,
          icon: const Icon(LucideIcons.globe, size: 19),
          tooltip: 'Language (EN / AR)',
          onPressed: () {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Language switched / تم تبديل اللغة (English / العربية)'),
                duration: Duration(seconds: 2),
              ),
            );
          },
        ),

        // Notification Bell with Live Unread Badge
        Stack(
          alignment: Alignment.center,
          children: [
            IconButton(
              constraints: const BoxConstraints(maxWidth: 38),
              padding: EdgeInsets.zero,
              icon: const Icon(LucideIcons.bell, size: 19),
              tooltip: 'Notifications',
              onPressed: () => NotificationsSheet.show(context),
            ),
            if (unreadCount > 0)
              Positioned(
                top: 8,
                right: 4,
                child: IgnorePointer(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                    constraints: const BoxConstraints(minWidth: 15, minHeight: 15),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEF4444),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Center(
                      child: Text(
                        unreadCount > 9 ? '9+' : '$unreadCount',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),

        // User Avatar Circle with "FM" on Neon Green Badge
        Padding(
          padding: const EdgeInsets.only(left: 4, right: 12),
          child: Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.neonLime,
              border: Border.all(color: AppColors.neonLime, width: 1.5),
              boxShadow: [
                BoxShadow(
                  color: AppColors.neonLime.withAlpha(70),
                  blurRadius: 6,
                ),
              ],
            ),
            child: Center(
              child: Text(
                initials,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF142407),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
