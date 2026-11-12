import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/theme/app_colors.dart';
import 'package:provider/provider.dart';
import '../../state/leads_provider.dart';
import '../attendance/attendance_screen.dart';
import '../dashboard/dashboard_screen.dart';
import '../leads/add_lead_screen.dart';
import '../reports/reports_screen.dart';
import 'app_drawer.dart';
import 'app_top_bar.dart';
import 'shell_destinations.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  // Page ids live in shell_destinations.dart (Pg). Screens are built lazily on first visit
  // and kept alive afterwards, so opening the app does not fire 20 data loads at once.
  int _currentIndex = Pg.home;
  final Set<int> _visited = {Pg.home};
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();

  String get _currentTitle => titleForPage(_currentIndex);

  void _goTo(int page) {
    setState(() {
      _currentIndex = page;
      _visited.add(page);
    });
  }

  /// Reports count chips -> Leads filtered by agent / stage.
  void _openLeads({String? agentName, String? stage}) {
    final leads = context.read<LeadsProvider>();
    if (stage != null && stage.isNotEmpty) leads.setStatusFilter(stage);
    _goTo(Pg.leads);
  }

  Widget _buildPage(int page) {
    switch (page) {
      case Pg.home:
        return DashboardScreen(onNavigateTab: _goTo);
      case Pg.attendance:
        return const AttendanceScreen();
      case Pg.reports:
        return ReportsScreen(
          onOpenLeads: _openLeads,
          onOpenRoute: (key) {
            final target = pageForReportRoute(key);
            if (target != null) _goTo(target);
          },
        );
    }
    return buildSimplePage(page) ?? const SizedBox.shrink();
  }

  void _onBottomNavTapped(int index) {
    if (index == 4) {
      // Menu tab opens Drawer
      _scaffoldKey.currentState?.openDrawer();
    } else {
      _goTo(index);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

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
        onSelectTab: _goTo,
      ),
      body: IndexedStack(
        index: _currentIndex,
        children: List.generate(
          Pg.importHistory + 1,
          (i) => _visited.contains(i) ? _buildPage(i) : const SizedBox.shrink(),
        ),
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
