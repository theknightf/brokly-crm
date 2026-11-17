import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/memory/memory_guard.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/sales_role.dart';
import '../../core/utils/tr.dart';
import '../../state/auth_provider.dart';
import 'sales_dashboard_screen.dart';
import 'sales_home_screen.dart';
import 'sales_target_bar.dart';
import '../follow_ups/follow_ups_screen.dart';
import '../../data/services/device_call_sync_service.dart';
import '../../data/services/pending_call_saves.dart';
import '../../state/call_logs_provider.dart';
import '../../state/leads_provider.dart';
import '../assistant/assistant_chat_screen.dart';
import '../attendance/attendance_screen.dart';
import '../dashboard/dashboard_screen.dart';
import '../leads/add_lead_screen.dart';
import '../reports/reports_screen.dart';
import 'app_drawer.dart';
import 'app_top_bar.dart';
import 'more_sheet.dart';
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

  // Bumped to send the sales Dashboard back to its stage picker.
  int _dashEpoch = 0;

  String _titleFor(bool isAgent) => isAgent ? salesPageLabel(_currentIndex) : titleForPage(_currentIndex);

  /// Sales agents only get these pages.
  static const _salesPages = [Pg.home, Pg.leads, Pg.followUps];

  bool get _isAgent => isSalesAgent(context.read<AuthProvider>().profile);

  void _goTo(int page) {
    if (_isAgent && !_salesPages.contains(page)) return;
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

  Widget _buildPage(int page, {required bool isAgent}) {
    switch (page) {
      case Pg.home:
        if (isAgent) {
          return SalesHomeScreen(
            onOpenLeads: () {
              // The Dashboard button always opens on the stage picker.
              context.read<LeadsProvider>().setStatusFilter('');
              setState(() => _dashEpoch++);
              _goTo(Pg.leads);
            },
            onOpenFollowUps: () => _goTo(Pg.followUps),
          );
        }
        return DashboardScreen(onNavigateTab: _goTo);
      case Pg.leads:
        // Sales agents: stage cards first, then the lead list for the stage they pick.
        if (isAgent) return SalesDashboardScreen(key: ValueKey(_dashEpoch), active: _currentIndex == Pg.leads);
        break;
      case Pg.followUps:
        // Sales agents: only the Overdue and Today filters.
        return FollowUpsScreen(overdueTodayOnly: isAgent);
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

  /// Bottom bar: Home, Leads, Follow-ups, Attendance, More (max 5, the top tasks first).
  static const _tabs = [Pg.home, Pg.leads, Pg.followUps, Pg.attendance];

  Future<void> _onBottomNavTapped(int index) async {
    final tabs = _isAgent ? _salesPages : _tabs;
    if (index < tabs.length) {
      _goTo(tabs[index]);
      return;
    }
    final page = await showMoreSheet(context, currentPage: _currentIndex);
    if (page != null && mounted) _goTo(page);
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final isAgent = isSalesAgent(context.watch<AuthProvider>().profile);
    if (isAgent && !_salesPages.contains(_currentIndex)) {
      // Agents land on their home page; the full dashboard (or any other page) is never built for them.
      _currentIndex = Pg.home;
      _visited
        ..removeWhere((pg) => !_salesPages.contains(pg))
        ..add(Pg.home);
    }
    final tabs = isAgent ? _salesPages : _tabs;
    final tabIndex = tabs.indexOf(_currentIndex);

    return Scaffold(
      key: _scaffoldKey,
      appBar: AppTopBar(
        title: _titleFor(isAgent),
        onOpenDrawer: () => _scaffoldKey.currentState?.openDrawer(),
      ),
      drawer: AppDrawer(
        selectedIndex: _currentIndex,
        onSelectTab: _goTo,
      ),
      body: Column(
        children: [
          if (isAgent) const SalesTargetBar(),
          Expanded(
            child: IndexedStack(
              index: _currentIndex,
              children: List.generate(
                Pg.importHistory + 1,
                (i) => _visited.contains(i) ? _buildPage(i, isAgent: isAgent) : const SizedBox.shrink(),
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(border: Border(top: BorderSide(color: p.border))),
        child: NavigationBar(
          // A page reached from "More" highlights the More tab.
          selectedIndex: tabIndex >= 0 ? tabIndex : tabs.length,
          onDestinationSelected: _onBottomNavTapped,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          destinations: isAgent
              ? [
                  NavigationDestination(icon: const Icon(LucideIcons.house), label: pageLabel(Pg.home)),
                  NavigationDestination(icon: const Icon(LucideIcons.users), label: salesPageLabel(Pg.leads)),
                  NavigationDestination(icon: const Icon(LucideIcons.calendarClock), label: salesPageLabel(Pg.followUps)),
                ]
              : [
                  NavigationDestination(icon: const Icon(LucideIcons.house), label: pageLabel(Pg.home)),
                  NavigationDestination(icon: const Icon(LucideIcons.users), label: pageLabel(Pg.leads)),
                  NavigationDestination(icon: const Icon(LucideIcons.calendarClock), label: pageLabel(Pg.followUps)),
                  NavigationDestination(icon: const Icon(LucideIcons.calendarCheck2), label: pageLabel(Pg.attendance)),
                  NavigationDestination(icon: const Icon(LucideIcons.layoutGrid), label: tr('More', 'المزيد')),
                ],
        ),
      ),
      // Leads (Dashboard for sales): add a lead. Follow-ups (Workspace) has its own "Add follow-up" button.
      // Elsewhere (Home): the AI assistant, for sales agents too.
      floatingActionButton: switch (_currentIndex) {
        Pg.leads => FloatingActionButton(
            tooltip: tr('Add lead', 'عميل جديد'),
            child: const Icon(LucideIcons.plus),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AddLeadScreen())),
          ),
        Pg.followUps => null,
        _ => FloatingActionButton.extended(
            heroTag: 'assistant',
            backgroundColor: p.card,
            foregroundColor: p.text,
            elevation: 2,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadius.lg),
              side: BorderSide(color: p.accent.withAlpha(140)),
            ),
            icon: Icon(LucideIcons.sparkles, size: 18, color: p.accent),
            label: Text(tr('Brokly AI', 'مساعد Brokly')),
            onPressed: () => AssistantChatScreen.showAsModal(context),
          ),
      },
    );
  }
}
