import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/memory/memory_guard.dart';
import '../../core/theme/app_colors.dart';
import '../../data/services/device_call_sync_service.dart';
import '../../data/services/pending_call_saves.dart';
import '../../state/call_logs_provider.dart';
import '../../state/leads_provider.dart';
import '../assistant/assistant_chat_screen.dart';
import '../attendance/attendance_screen.dart';
import '../calculator/unit_calculator_screen.dart';
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
  // 7: Unit Calculator (drawer & quick toolbox access)
  int _currentIndex = 0;
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();

  // Tabs opened so far; only these are built and kept alive.
  final Set<int> _visited = {0};
  VoidCallback? _unregisterTrim;
  VoidCallback? _unregisterSaved;
  VoidCallback? _unregisterCallSync;

  @override
  void initState() {
    super.initState();
    // When a queued call save finally reaches the server (e.g. after being offline), refresh the call list.
    _unregisterSaved = PendingCallSaves.instance.addOnSaved(() {
      if (!mounted) return;
      context.read<CallLogsProvider>().fetchCalls(silent: true);
      context.read<LeadsProvider>().refreshLastCalls(); // the lead card's "last call" line
    });
    // Sign-in is done by the time the shell is shown: load call-sync settings, sync on app open, and refresh the
    // call list whenever a sync adds calls.
    unawaited(DeviceCallSyncService.instance.onSignedIn());
    _unregisterCallSync = DeviceCallSyncService.instance.addOnSynced((r) {
      if (!mounted || r.inserted == 0) return;
      context.read<CallLogsProvider>().fetchCalls(silent: true);
      context.read<LeadsProvider>().refreshLastCalls();
    });
    // Under memory pressure drop every tab except the one on screen; they rebuild when visited again.
    _unregisterTrim = MemoryGuard.onTrim((critical) {
      if (!mounted) return;
      setState(() {
        _visited
          ..clear()
          ..add(_currentIndex);
      });
    });
  }

  @override
  void dispose() {
    _unregisterTrim?.call();
    _unregisterSaved?.call();
    _unregisterCallSync?.call();
    super.dispose();
  }

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
      case 7:
        return 'Unit Calculator';
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

    // Screens are built on first visit instead of all 8 up front (IndexedStack builds every child), so a
    // phone that only ever opens Home + Leads never pays for Attendance, Calculator, Settings...
    _visited.add(_currentIndex);
    final screenBuilders = <Widget Function()>[
      () => DashboardScreen(onNavigateTab: (index) => setState(() => _currentIndex = index)),
      () => const LeadsScreen(),
      () => const AttendanceScreen(),
      () => const FollowUpsScreen(),
      () => const CallLogsScreen(),
      () => const CustomersScreen(),
      () => const SettingsScreen(),
      () => const UnitCalculatorScreen(showAppBar: false),
    ];
    final screens = <Widget>[
      for (var i = 0; i < screenBuilders.length; i++)
        _visited.contains(i) ? screenBuilders[i]() : const SizedBox.shrink(),
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
          : FloatingActionButton.extended(
              backgroundColor: const Color(0xFF0C1017),
              foregroundColor: Colors.white,
              elevation: 6,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
                side: BorderSide(color: AppColors.neonLime.withAlpha(140), width: 1.2),
              ),
              icon: Container(
                width: 24,
                height: 24,
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [AppColors.neonLime, AppColors.primary],
                  ),
                  shape: BoxShape.circle,
                ),
                child: const Center(
                  child: Icon(LucideIcons.sparkles, size: 13, color: Color(0xFF142407)),
                ),
              ),
              label: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Brokly AI',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.2,
                    ),
                  ),
                  SizedBox(width: 4),
                  Text(
                    'مساعد المبيعات',
                    style: TextStyle(
                      fontSize: 10,
                      color: AppColors.neonLime,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              onPressed: () => AssistantChatScreen.showAsModal(context),
            ),
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
