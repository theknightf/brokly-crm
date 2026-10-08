import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/theme/app_colors.dart';
import '../attendance/attendance_screen.dart';
import '../call_logs/call_logs_screen.dart';
import '../customers/customers_screen.dart';
import '../dashboard/dashboard_screen.dart';
import '../follow_ups/follow_ups_screen.dart';
import '../leads/add_lead_screen.dart';
import '../leads/leads_screen.dart';
import '../settings/settings_screen.dart';
import 'app_drawer.dart';
import 'app_top_bar.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  // Tab index:
  // 0: Home (Dashboard)
  // 1: Leads
  // 2: Attendance
  // 3: Follow-ups
  // 4: Call Logs (drawer access)
  // 5: Customers (drawer access)
  // 6: Settings (drawer access)
  int _currentIndex = 0;
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();

  String get _currentTitle {
    switch (_currentIndex) {
      case 0:
        return 'Home';
      case 1:
        return 'Leads';
      case 2:
        return 'Attendance';
      case 3:
        return 'Follow-ups';
      case 4:
        return 'Call Logs';
      case 5:
        return 'Customers';
      case 6:
        return 'Settings';
      default:
        return 'Brokly CRM';
    }
  }

  void _onBottomNavTapped(int index) {
    if (index == 4) {
      // Menu tab opens Drawer
      _scaffoldKey.currentState?.openDrawer();
    } else {
      setState(() => _currentIndex = index);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final screens = [
      DashboardScreen(onNavigateTab: (index) => setState(() => _currentIndex = index)),
      const LeadsScreen(),
      const AttendanceScreen(),
      const FollowUpsScreen(),
      const CallLogsScreen(),
      const CustomersScreen(),
      const SettingsScreen(),
    ];

    // Determine bottom nav active index (0..3, or none if accessing auxiliary drawer pages)
    final bottomNavActiveIndex = _currentIndex <= 3 ? _currentIndex : -1;

    return Scaffold(
      key: _scaffoldKey,
      appBar: AppTopBar(
        title: _currentTitle,
        onOpenDrawer: () => _scaffoldKey.currentState?.openDrawer(),
      ),
      drawer: AppDrawer(
        selectedIndex: _currentIndex,
        onSelectTab: (index) => setState(() => _currentIndex = index),
      ),
      body: IndexedStack(
        index: _currentIndex,
        children: screens,
      ),
      bottomNavigationBar: SafeArea(
        bottom: true,
        child: Container(
          height: 64,
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkCard : Colors.white,
            border: Border(
              top: BorderSide(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                width: 1,
              ),
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildBottomNavItem(
                index: 0,
                icon: LucideIcons.home,
                label: 'Home',
                isActive: bottomNavActiveIndex == 0,
                isDark: isDark,
              ),
              _buildBottomNavItem(
                index: 1,
                icon: LucideIcons.users,
                label: 'Leads',
                isActive: bottomNavActiveIndex == 1,
                isDark: isDark,
              ),
              _buildBottomNavItem(
                index: 2,
                icon: LucideIcons.calendarCheck2,
                label: 'Attendance',
                isActive: bottomNavActiveIndex == 2,
                isDark: isDark,
              ),
              _buildBottomNavItem(
                index: 3,
                icon: LucideIcons.calendarClock,
                label: 'Follow-ups',
                isActive: bottomNavActiveIndex == 3,
                isDark: isDark,
              ),
              _buildBottomNavItem(
                index: 4,
                icon: LucideIcons.menu,
                label: 'Menu',
                isActive: false,
                isDark: isDark,
              ),
            ],
          ),
        ),
      ),
      floatingActionButton: _currentIndex == 1
          ? FloatingActionButton(
              backgroundColor: AppColors.neonLime,
              foregroundColor: const Color(0xFF142407),
              elevation: 4,
              child: const Icon(LucideIcons.plus, size: 22),
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const AddLeadScreen()),
                );
              },
            )
          : null,
    );
  }

  Widget _buildBottomNavItem({
    required int index,
    required IconData icon,
    required String label,
    required bool isActive,
    required bool isDark,
  }) {
    const activeColor = AppColors.neonLime;
    final inactiveColor = isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground;

    return Expanded(
      child: InkWell(
        onTap: () => _onBottomNavTapped(index),
        child: Stack(
          alignment: Alignment.topCenter,
          children: [
            // Top Glow Indicator
            if (isActive)
              Container(
                height: 3,
                width: 36,
                decoration: BoxDecoration(
                  color: activeColor,
                  borderRadius: const BorderRadius.only(
                    bottomLeft: Radius.circular(3),
                    bottomRight: Radius.circular(3),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: activeColor.withAlpha(180),
                      blurRadius: 8,
                      spreadRadius: 1,
                    ),
                  ],
                ),
              ),
            // Icon & Label Column
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const SizedBox(height: 4),
                Icon(
                  icon,
                  size: 20,
                  color: isActive ? activeColor : inactiveColor,
                ),
                const SizedBox(height: 3),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                    color: isActive ? activeColor : inactiveColor,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
