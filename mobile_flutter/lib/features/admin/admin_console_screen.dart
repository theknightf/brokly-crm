import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/widgets/premium.dart';
import '../../state/auth_provider.dart';
import 'admin_claim_conflicts_screen.dart';
import 'admin_email_templates_tab.dart';
import 'admin_ops_tabs.dart';
import 'admin_payroll_tab.dart';
import 'admin_performance_tab.dart';
import 'admin_settings_tab.dart';
import 'admin_ui.dart';
import 'admin_users_tab.dart';

enum AdminSection {
  users('Users', LucideIcons.users, 'People'),
  performance('Performance 360', LucideIcons.chartColumn, 'People'),
  claimConflicts('Claim conflicts', LucideIcons.shieldAlert, 'People'),
  tasks('Tasks', LucideIcons.clipboardList, 'Operations'),
  kpiTargets('KPI targets', LucideIcons.target, 'Operations'),
  leave('Leave', LucideIcons.palmtree, 'Operations'),
  payroll('Payroll', LucideIcons.banknote, 'Operations'),
  rotation('Lead rotation', LucideIcons.repeat, 'Operations'),
  emailTemplates('Email templates', LucideIcons.mail, 'Operations'),
  leadSources('Lead sources', LucideIcons.radio, 'CRM setup'),
  pipelineStages('Pipeline stages', LucideIcons.gitBranch, 'CRM setup'),
  areas('Areas', LucideIcons.mapPin, 'CRM setup'),
  priorities('Priorities', LucideIcons.flag, 'CRM setup'),
  developers('Developers', LucideIcons.building, 'CRM setup');

  final String label;
  final IconData icon;
  final String group;
  const AdminSection(this.label, this.icon, this.group);
}

const List<String> _groups = ['People', 'Operations', 'CRM setup'];

/// Single entry screen for the Admin console. Mirrors the web /admin page:
/// the same sections grouped as People / Operations / CRM setup.
///
/// Gate: owners and admins only (isAdminRole). The Users section additionally
/// requires canManageUsers (role exactly owner or admin, case-insensitive).
/// Works embedded in the shell (no app bar) and when pushed standalone.
class AdminConsoleScreen extends StatefulWidget {
  /// Optional section to open first (e.g. from a deep link).
  final AdminSection? initialSection;
  const AdminConsoleScreen({super.key, this.initialSection});

  @override
  State<AdminConsoleScreen> createState() => _AdminConsoleScreenState();
}

class _AdminConsoleScreenState extends State<AdminConsoleScreen> {
  late AdminSection _section = widget.initialSection ?? AdminSection.users;
  late String _group = _section.group;

  Widget _body(AdminSection s) => switch (s) {
        AdminSection.users => const AdminUsersTab(),
        AdminSection.performance => const AdminPerformanceTab(),
        AdminSection.claimConflicts => const AdminClaimConflictsScreen(),
        AdminSection.tasks => const AdminTasksTab(),
        AdminSection.kpiTargets => const AdminKpiTab(),
        AdminSection.leave => const AdminLeaveTab(),
        AdminSection.payroll => const AdminPayrollTab(),
        AdminSection.rotation => const AdminRotationTab(),
        AdminSection.emailTemplates => const AdminEmailTemplatesTab(),
        AdminSection.leadSources => const AdminSettingsListTab(kind: AdminSettingsKind.leadSources),
        AdminSection.pipelineStages => const AdminSettingsListTab(kind: AdminSettingsKind.pipelineStages),
        AdminSection.areas => const AdminSettingsListTab(kind: AdminSettingsKind.areas),
        AdminSection.priorities => const AdminSettingsListTab(kind: AdminSettingsKind.priorities),
        AdminSection.developers => const AdminSettingsListTab(kind: AdminSettingsKind.developers),
      };

  @override
  Widget build(BuildContext context) {
    final profile = context.watch<AuthProvider>().profile;
    if (profile == null) return const SkeletonList();
    if (!profile.isAdmin) return const AdminAccessDenied();

    final role = profile.role.trim().toLowerCase();
    final canUsers = role == 'owner' || role == 'admin';
    final sections = AdminSection.values.where((s) => s != AdminSection.users || canUsers).toList();
    final groupSections = sections.where((s) => s.group == _group).toList();
    // Keep the selection valid if the group changed or Users is hidden.
    final current = groupSections.contains(_section) ? _section : groupSections.first;

    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        child: Row(children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: Surf.accent(context).withAlpha(32), borderRadius: BorderRadius.circular(12)),
            child: Icon(LucideIcons.shieldCheck, size: 20, color: Surf.accent(context)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Admin console', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Surf.text(context))),
              Text('Users, performance, payroll and CRM settings', style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
            ]),
          ),
        ]),
      ),
      const SizedBox(height: 8),
      Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: AdminChipRow<String>(
        options: [for (final g in _groups) if (sections.any((s) => s.group == g)) g],
        selected: _group,
        labelOf: (g) => g,
        onSelected: (g) => setState(() {
          _group = g;
          _section = sections.firstWhere((s) => s.group == g);
        }),
      )),
      Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: AdminChipRow<AdminSection>(
        options: groupSections,
        selected: current,
        labelOf: (s) => s.label,
        onSelected: (s) => setState(() => _section = s),
      )),
      const SizedBox(height: 4),
      Expanded(child: KeyedSubtree(key: ValueKey(current), child: _body(current))),
    ]);
  }
}
