import 'dart:async';
import 'package:flutter/material.dart';
import '../../data/services/device_call_sync_service.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../state/auth_provider.dart';
import 'agent_controller.dart';
import 'agent_follow_ups_tab.dart';
import 'agent_leads_tab.dart';
import 'agent_widgets.dart';

/// The whole app for the sales-agent role: two tabs (Leads, Follow-ups), the call-target header on top,
/// and a menu with only profile + logout. Arabic-first, right-to-left.
class AgentShell extends StatefulWidget {
  const AgentShell({super.key});

  @override
  State<AgentShell> createState() => _AgentShellState();
}

class _AgentShellState extends State<AgentShell> {
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    // Same as the full app: load call-sync settings and sync device calls on app open.
    unawaited(DeviceCallSyncService.instance.onSignedIn());
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AgentController(),
      child: Directionality(
        textDirection: TextDirection.rtl,
        child: TargetCelebration(
          child: Builder(
            builder: (context) {
              final followUpsDue = context.select<AgentController, int>((c) {
                final today = DateTime.now().toIso8601String().substring(0, 10);
                return c.followUps.where((f) => f.dueDate.compareTo(today) <= 0).length;
              });
              return Scaffold(
                appBar: AppBar(
                  title: Text(_tab == 0 ? 'العملاء' : 'المتابعات', style: const TextStyle(fontWeight: FontWeight.w800)),
                  actions: const [_ProfileMenu()],
                ),
                body: Column(
                  children: [
                    const CallTargetHeader(),
                    Expanded(
                      child: IndexedStack(
                        index: _tab,
                        children: const [AgentLeadsTab(), AgentFollowUpsTab()],
                      ),
                    ),
                  ],
                ),
                bottomNavigationBar: NavigationBar(
                  selectedIndex: _tab,
                  height: 68,
                  indicatorColor: AppColors.neonLime.withAlpha(90),
                  onDestinationSelected: (i) => setState(() => _tab = i),
                  destinations: [
                    const NavigationDestination(icon: Icon(LucideIcons.users), label: 'العملاء'),
                    NavigationDestination(
                      icon: Badge(
                        isLabelVisible: followUpsDue > 0,
                        label: Text('$followUpsDue'),
                        child: const Icon(LucideIcons.calendarClock),
                      ),
                      label: 'المتابعات',
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _ProfileMenu extends StatelessWidget {
  const _ProfileMenu();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final p = auth.profile;
    return PopupMenuButton<String>(
      tooltip: 'حسابي',
      icon: CircleAvatar(
        radius: 16,
        backgroundColor: AppColors.neonLime.withAlpha(60),
        child: Text(p?.initials ?? 'U', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
      ),
      onSelected: (v) async {
        if (v == 'logout') await context.read<AuthProvider>().signOut();
      },
      itemBuilder: (_) => [
        PopupMenuItem<String>(
          enabled: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(p?.fullName ?? '', style: const TextStyle(fontWeight: FontWeight.w800)),
              Text(p?.email ?? '', style: const TextStyle(fontSize: 12)),
            ],
          ),
        ),
        const PopupMenuDivider(),
        const PopupMenuItem<String>(
          value: 'logout',
          height: kTap,
          child: Row(children: [Icon(LucideIcons.logOut, size: 18), SizedBox(width: 8), Text('تسجيل خروج')]),
        ),
      ],
    );
  }
}
