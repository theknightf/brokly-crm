import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../state/auth_provider.dart';
import '../assistant/assistant_chat_screen.dart';
import 'shell_destinations.dart';

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
                  _buildDrawerItem(
                    icon: LucideIcons.house,
                    label: 'Home',
                    isSelected: selectedIndex == Pg.home,
                    onTap: () {
                      onSelectTab(Pg.home);
                      Navigator.pop(context);
                    },
                    isDark: isDark,
                  ),
                  _buildDrawerItem(
                    icon: LucideIcons.calendarCheck2,
                    label: 'Attendance',
                    isSelected: selectedIndex == Pg.attendance,
                    onTap: () {
                      onSelectTab(Pg.attendance);
                      Navigator.pop(context);
                    },
                    isDark: isDark,
                  ),
                  for (final section in drawerSections) ...[
                    if (section.entries.any((e) => e.visible(profile))) ...[
                      const SizedBox(height: 12),
                      _buildSectionHeader(section.title, isDark),
                      for (final e in section.entries.where((e) => e.visible(profile)))
                        _buildDrawerItem(
                          icon: e.icon,
                          label: e.label,
                          isSelected: selectedIndex == e.page,
                          onTap: () {
                            onSelectTab(e.page);
                            Navigator.pop(context);
                          },
                          isDark: isDark,
                        ),
                      if (section.title == 'MANAGEMENT') ...[_buildCopilotItem(), _buildCalculatorItem(isDark)],
                    ],
                  ],
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

  Widget _buildCopilotItem() {
    return Builder(builder: (context) =>
      // Brokly AI Copilot (Obsidian / Neon-Lime luxury card)
      Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF142407), Color(0xFF0F141D)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.neonLime.withAlpha(120), width: 1.2),
          boxShadow: [
            BoxShadow(
              color: AppColors.neonLime.withAlpha(50),
              blurRadius: 10,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: ListTile(
          dense: true,
          leading: Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: AppColors.neonLime,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Center(
              child: Icon(LucideIcons.sparkles, size: 16, color: Color(0xFF142407)),
            ),
          ),
          title: const Text(
            'Brokly AI Copilot',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
          subtitle: const Text(
            'مساعد المبيعات الذكي (Groq)',
            style: TextStyle(
              fontSize: 11,
              color: AppColors.neonLime,
            ),
          ),
          trailing: Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: AppColors.neonLime.withAlpha(30),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Text(
              'AI',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                color: AppColors.neonLime,
                fontFamily: 'monospace',
              ),
            ),
          ),
          onTap: () {
            Navigator.pop(context);
            AssistantChatScreen.showAsModal(context);
          },
        ),
      )
    );
  }

  Widget _buildCalculatorItem(bool isDark) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.neonLime,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [BoxShadow(color: AppColors.neonLime.withAlpha(100), blurRadius: 10, offset: const Offset(0, 2))],
      ),
      child: Builder(
        builder: (context) => ListTile(
          dense: true,
          leading: const Icon(LucideIcons.calculator, size: 19, color: Color(0xFF142407)),
          title: const Text('Unit Calculator', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Color(0xFF142407))),
          trailing: const Icon(LucideIcons.sparkles, size: 16, color: Color(0xFF142407)),
          onTap: () {
            onSelectTab(Pg.calculator);
            Navigator.pop(context);
          },
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
