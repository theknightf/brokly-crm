import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../state/auth_provider.dart';
import '../../state/theme_provider.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final auth = context.watch<AuthProvider>();
    final theme = context.watch<ThemeProvider>();
    final profile = auth.profile;

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              'Settings',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
              ),
            ),
            const SizedBox(height: 16),

            // Profile Card
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: isDark ? AppColors.darkCard : Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                ),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: isDark ? AppColors.secondaryDark : AppColors.secondary,
                    child: Text(
                      profile?.initials ?? 'U',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: AppColors.primary,
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          profile?.fullName ?? 'User Profile',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          profile?.email ?? '',
                          style: TextStyle(
                            fontSize: 13,
                            color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: isDark ? AppColors.secondaryDark : AppColors.secondary,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            (profile?.role ?? 'Agent').toUpperCase(),
                            style: const TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: AppColors.primary,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            _buildSectionHeader('PREFERENCES', isDark),
            const SizedBox(height: 10),

            // Theme Switcher Tile
            Container(
              decoration: BoxDecoration(
                color: isDark ? AppColors.darkCard : Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                ),
              ),
              child: SwitchListTile(
                title: Text(
                  'Dark Mode',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                  ),
                ),
                subtitle: Text(
                  theme.isDark ? 'Dark Slate & Neon Lime theme' : 'Clean Light theme',
                  style: TextStyle(
                    fontSize: 12,
                    color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                  ),
                ),
                secondary: Icon(
                  theme.isDark ? LucideIcons.moon : LucideIcons.sun,
                  color: AppColors.primary,
                ),
                value: theme.isDark,
                activeThumbColor: AppColors.primary,
                onChanged: (_) => theme.toggleTheme(),
              ),
            ),
            const SizedBox(height: 24),

            _buildSectionHeader('APPLICATION & SYSTEM', isDark),
            const SizedBox(height: 10),

            _buildSettingTile(
              icon: LucideIcons.building,
              title: 'Work Location & Shifts',
              subtitle: 'Cairo HQ (800m GPS radius) • Shift 12:00–20:00',
              isDark: isDark,
            ),
            const SizedBox(height: 8),

            _buildSettingTile(
              icon: LucideIcons.shieldCheck,
              title: 'Database Security',
              subtitle: 'Postgres RLS & Supabase Auth PKCE active',
              isDark: isDark,
            ),
            const SizedBox(height: 8),

            _buildSettingTile(
              icon: LucideIcons.info,
              title: 'Brokly CRM Mobile',
              subtitle: 'Version 1.0.0+1 • 100% PWA Parity',
              isDark: isDark,
            ),
            const SizedBox(height: 32),

            // Sign out button
            ElevatedButton.icon(
              icon: const Icon(LucideIcons.logOut, size: 18),
              label: const Text('Sign Out of Account'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFEF4444),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () => auth.signOut(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title, bool isDark) {
    return Text(
      title,
      style: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.5,
        color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
      ),
    );
  }

  Widget _buildSettingTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required bool isDark,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
        ),
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.primary),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 12,
                    color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
