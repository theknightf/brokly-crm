import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../state/auth_provider.dart';

class AppDrawer extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onSelectTab;

  const AppDrawer({
    super.key,
    required this.selectedIndex,
    required this.onSelectTab,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final auth = context.watch<AuthProvider>();
    final profile = auth.profile;

    return Drawer(
      backgroundColor: isDark ? AppColors.darkBackground : Colors.white,
      child: SafeArea(
        child: Column(
          children: [
            // Drawer Header: "Brokly" brand title with arrow
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
              child: Row(
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: AppColors.neonLime,
                      borderRadius: BorderRadius.circular(10),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.neonLime.withAlpha(80),
                          blurRadius: 8,
                        ),
                      ],
                    ),
                    child: const Center(
                      child: Icon(LucideIcons.building2, color: Color(0xFF142407), size: 20),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Brokly',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.5,
                        color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: Icon(
                      LucideIcons.arrowRight,
                      size: 20,
                      color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                    ),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),
            Divider(
              height: 1,
              color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
            ),

            // Navigation Links
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                children: [
                  // ── PIPELINE SECTION ──────────────────────────────────
                  _buildSectionHeader('PIPELINE', isDark),
                  _buildDrawerItem(
                    icon: LucideIcons.layoutGrid,
                    label: 'Workspace',
                    isSelected: selectedIndex == 0,
                    onTap: () {
                      onSelectTab(0);
                      Navigator.pop(context);
                    },
                    isDark: isDark,
                  ),
                  _buildDrawerItem(
                    icon: LucideIcons.users,
                    label: 'Leads',
                    isSelected: selectedIndex == 1,
                    onTap: () {
                      onSelectTab(1);
                      Navigator.pop(context);
                    },
                    isDark: isDark,
                  ),
                  _buildDrawerItem(
                    icon: LucideIcons.userCheck,
                    label: 'Customers',
                    isSelected: selectedIndex == 5,
                    onTap: () {
                      onSelectTab(5);
                      Navigator.pop(context);
                    },
                    isDark: isDark,
                  ),
                  _buildDrawerItem(
                    icon: LucideIcons.calendarClock,
                    label: 'Follow-ups',
                    isSelected: selectedIndex == 3,
                    onTap: () {
                      onSelectTab(3);
                      Navigator.pop(context);
                    },
                    isDark: isDark,
                  ),
                  _buildDrawerItem(
                    icon: LucideIcons.bookmarkCheck,
                    label: 'Reservations',
                    isSelected: false,
                    onTap: () {
                      Navigator.pop(context);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Reservations management active')),
                      );
                    },
                    isDark: isDark,
                  ),
                  _buildDrawerItem(
                    icon: LucideIcons.badgeDollarSign,
                    label: 'Deals',
                    isSelected: false,
                    onTap: () {
                      Navigator.pop(context);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Deals pipeline active')),
                      );
                    },
                    isDark: isDark,
                  ),
                  _buildDrawerItem(
                    icon: LucideIcons.phone,
                    label: 'Call Logs',
                    isSelected: selectedIndex == 4,
                    onTap: () {
                      onSelectTab(4);
                      Navigator.pop(context);
                    },
                    isDark: isDark,
                  ),
                  _buildDrawerItem(
                    icon: LucideIcons.calendar,
                    label: 'Calendar',
                    isSelected: false,
                    onTap: () {
                      Navigator.pop(context);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Calendar events synced')),
                      );
                    },
                    isDark: isDark,
                  ),

                  const SizedBox(height: 16),

                  // ── MANAGEMENT SECTION ────────────────────────────────
                  _buildSectionHeader('MANAGEMENT', isDark),

                  // Unit Calculator (active neon-green highlight capsule)
                  Container(
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.neonLime,
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.neonLime.withAlpha(100),
                          blurRadius: 10,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: ListTile(
                      dense: true,
                      leading: const Icon(
                        LucideIcons.calculator,
                        size: 19,
                        color: Color(0xFF142407),
                      ),
                      title: const Text(
                        'Unit Calculator',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF142407),
                        ),
                      ),
                      trailing: const Icon(
                        LucideIcons.sparkles,
                        size: 16,
                        color: Color(0xFF142407),
                      ),
                      onTap: () {
                        onSelectTab(7);
                        Navigator.pop(context);
                      },
                    ),
                  ),

                  _buildDrawerItem(
                    icon: LucideIcons.mapPin,
                    label: 'Locations',
                    isSelected: false,
                    onTap: () {
                      Navigator.pop(context);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Cairo Locations Directory')),
                      );
                    },
                    isDark: isDark,
                  ),
                  _buildDrawerItem(
                    icon: LucideIcons.building2,
                    label: 'Projects',
                    isSelected: false,
                    onTap: () {
                      Navigator.pop(context);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Real Estate Projects Catalog')),
                      );
                    },
                    isDark: isDark,
                  ),
                  _buildDrawerItem(
                    icon: LucideIcons.chartColumn,
                    label: 'Reports',
                    isSelected: false,
                    onTap: () {
                      Navigator.pop(context);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Analytics & Performance Reports')),
                      );
                    },
                    isDark: isDark,
                  ),
                  _buildDrawerItem(
                    icon: LucideIcons.home,
                    label: 'Units',
                    isSelected: false,
                    onTap: () {
                      Navigator.pop(context);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Inventory Units Listing')),
                      );
                    },
                    isDark: isDark,
                  ),
                ],
              ),
            ),

            // Profile & Sign out action at bottom
            Divider(
              height: 1,
              color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 18,
                    backgroundColor: AppColors.neonLime,
                    child: Text(
                      profile != null && profile.fullName.trim().isNotEmpty
                          ? profile.fullName.trim()[0].toUpperCase()
                          : 'U',
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF142407),
                        fontSize: 14,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          profile?.fullName ?? 'Agent',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          profile?.role ?? 'Broker',
                          style: TextStyle(
                            fontSize: 11,
                            color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(LucideIcons.logOut, color: Color(0xFFEF4444), size: 19),
                    tooltip: 'Sign Out',
                    onPressed: () {
                      Navigator.pop(context);
                      auth.signOut();
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title, bool isDark) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.6,
          color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
        ),
      ),
    );
  }

  Widget _buildDrawerItem({
    required IconData icon,
    required String label,
    required bool isSelected,
    required VoidCallback onTap,
    required bool isDark,
  }) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 2),
      decoration: BoxDecoration(
        color: isSelected
            ? (isDark ? const Color(0xFF16250F) : AppColors.secondary)
            : Colors.transparent,
        borderRadius: BorderRadius.circular(10),
      ),
      child: ListTile(
        dense: true,
        leading: Icon(
          icon,
          size: 19,
          color: isSelected
              ? AppColors.neonLime
              : (isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground),
        ),
        title: Text(
          label,
          style: TextStyle(
            fontSize: 14,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            color: isSelected
                ? (isDark ? AppColors.neonLime : AppColors.primary)
                : (isDark ? AppColors.darkForeground : AppColors.lightForeground),
          ),
        ),
        onTap: onTap,
      ),
    );
  }
}
