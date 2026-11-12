import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../data/models/user_profile_model.dart';
import '../admin/admin_claim_conflicts_screen.dart';
import '../admin/admin_console_screen.dart';
import '../calculator/unit_calculator_screen.dart';
import '../calendar/calendar_screen.dart';
import '../call_logs/call_logs_screen.dart';
import '../customers/customers_screen.dart';
import '../deals/deals_screen.dart';
import '../duplicates/duplicate_center_screen.dart';
import '../duplicates/duplicates_screen.dart';
import '../expenses/expenses_screen.dart';
import '../follow_ups/follow_ups_screen.dart';
import '../import_history/import_history_screen.dart';
import '../leads/leads_screen.dart';
import '../locations/locations_screen.dart';
import '../projects/projects_screen.dart';
import '../reservations/reservations_screen.dart';
import '../settings/settings_screen.dart';
import '../teams/teams_screen.dart';
import '../units/units_screen.dart';
import '../workspace/workspace_screen.dart';

/// Shell page ids. 0-3 are the bottom-nav tabs; the rest are reached from the drawer.
class Pg {
  static const home = 0;
  static const leads = 1;
  static const attendance = 2;
  static const followUps = 3;
  static const callLogs = 4;
  static const customers = 5;
  static const settings = 6;
  static const calculator = 7;
  static const reservations = 8;
  static const deals = 9;
  static const calendar = 10;
  static const locations = 11;
  static const projects = 12;
  static const reports = 13;
  static const units = 14;
  static const workspace = 15;
  static const expenses = 16;
  static const teams = 17;
  static const admin = 18;
  static const claimConflicts = 19;
  static const duplicates = 20;
  static const duplicateCenter = 21;
  static const importHistory = 22;
}

/// Mirrors the web Sidebar visibility rules (src/components/Sidebar.tsx):
///  - Admin, Expenses, Duplicate Leads, Claim Conflicts: owner/admin only
///  - Import History: owner/admin or team leader
///  - Teams: owner/admin or team leader
class DrawerEntry {
  final int page;
  final String label;
  final IconData icon;
  final bool Function(UserProfileModel?) visible;
  const DrawerEntry(this.page, this.label, this.icon, [this.visible = _everyone]);
}

bool _everyone(UserProfileModel? p) => true;
bool _admin(UserProfileModel? p) => p?.isAdmin ?? false;
bool _adminOrLead(UserProfileModel? p) => (p?.isAdmin ?? false) || (p?.isTeamLeader ?? false);

class DrawerSection {
  final String title;
  final List<DrawerEntry> entries;
  const DrawerSection(this.title, this.entries);
}

const drawerSections = <DrawerSection>[
  DrawerSection('PIPELINE', [
    DrawerEntry(Pg.leads, 'Leads', LucideIcons.users),
    DrawerEntry(Pg.duplicates, 'Duplicates', LucideIcons.copy),
    DrawerEntry(Pg.customers, 'Customers', LucideIcons.userCheck),
    DrawerEntry(Pg.followUps, 'Follow-ups', LucideIcons.calendarClock),
    DrawerEntry(Pg.reservations, 'Reservations', LucideIcons.bookmarkCheck),
    DrawerEntry(Pg.deals, 'Deals', LucideIcons.badgeDollarSign),
    DrawerEntry(Pg.callLogs, 'Call Logs', LucideIcons.phone),
    DrawerEntry(Pg.calendar, 'Calendar', LucideIcons.calendar),
    DrawerEntry(Pg.workspace, 'Workspace', LucideIcons.layoutGrid),
  ]),
  DrawerSection('MANAGEMENT', [
    DrawerEntry(Pg.locations, 'Locations', LucideIcons.mapPin),
    DrawerEntry(Pg.projects, 'Projects', LucideIcons.building2),
    DrawerEntry(Pg.units, 'Units', LucideIcons.house),
    DrawerEntry(Pg.teams, 'Teams', LucideIcons.usersRound, _adminOrLead),
    DrawerEntry(Pg.reports, 'Reports', LucideIcons.chartColumn),
  ]),
  DrawerSection('SYSTEM', [
    DrawerEntry(Pg.expenses, 'Expenses', LucideIcons.wallet, _admin),
    DrawerEntry(Pg.duplicateCenter, 'Duplicate Leads', LucideIcons.gitMerge, _admin),
    DrawerEntry(Pg.claimConflicts, 'Claim Conflicts', LucideIcons.swords, _admin),
    DrawerEntry(Pg.importHistory, 'Import History', LucideIcons.history, _adminOrLead),
    DrawerEntry(Pg.admin, 'Admin', LucideIcons.shieldCheck, _admin),
    DrawerEntry(Pg.settings, 'Settings', LucideIcons.settings),
  ]),
];

const _titles = <int, String>{
  Pg.home: 'Home',
  Pg.leads: 'Leads',
  Pg.attendance: 'Attendance',
  Pg.followUps: 'Follow-ups',
  Pg.callLogs: 'Call Logs',
  Pg.customers: 'Customers',
  Pg.settings: 'Settings',
  Pg.calculator: 'Unit Calculator',
  Pg.reservations: 'Reservations',
  Pg.deals: 'Deals',
  Pg.calendar: 'Calendar',
  Pg.locations: 'Locations',
  Pg.projects: 'Projects',
  Pg.reports: 'Reports',
  Pg.units: 'Units',
  Pg.workspace: 'Workspace',
  Pg.expenses: 'Expenses',
  Pg.teams: 'Teams',
  Pg.admin: 'Admin',
  Pg.claimConflicts: 'Claim Conflicts',
  Pg.duplicates: 'Duplicates',
  Pg.duplicateCenter: 'Duplicate Leads',
  Pg.importHistory: 'Import History',
};

String titleForPage(int page) => _titles[page] ?? 'Brokly CRM';

/// Screens without arguments. Home, Reports and Leads-dependent ones are built in MainShell.
Widget? buildSimplePage(int page) {
  switch (page) {
    case Pg.leads:
      return const LeadsScreen();
    case Pg.followUps:
      return const FollowUpsScreen();
    case Pg.callLogs:
      return const CallLogsScreen();
    case Pg.customers:
      return const CustomersScreen();
    case Pg.settings:
      return const SettingsScreen();
    case Pg.calculator:
      return const UnitCalculatorScreen(showAppBar: false);
    case Pg.reservations:
      return const ReservationsScreen();
    case Pg.deals:
      return const DealsScreen();
    case Pg.calendar:
      return const CalendarScreen();
    case Pg.locations:
      return const LocationsScreen();
    case Pg.projects:
      return const ProjectsScreen();
    case Pg.units:
      return const UnitsScreen();
    case Pg.workspace:
      return const WorkspaceScreen();
    case Pg.expenses:
      return const ExpensesScreen();
    case Pg.teams:
      return const TeamsScreen();
    case Pg.admin:
      return const AdminConsoleScreen();
    case Pg.claimConflicts:
      return const AdminClaimConflictsScreen();
    case Pg.duplicates:
      return const DuplicatesScreen();
    case Pg.duplicateCenter:
      return const DuplicateCenterScreen();
    case Pg.importHistory:
      return const ImportHistoryScreen();
    default:
      return null;
  }
}

/// Reports "More reports" route keys -> shell page.
int? pageForReportRoute(String key) {
  switch (key) {
    case 'calendar':
      return Pg.calendar;
    case 'followUps':
      return Pg.followUps;
    case 'projects':
      return Pg.projects;
    case 'expenses':
      return Pg.expenses;
    case 'payroll':
    case 'accounts':
    case 'kpis':
      return Pg.admin;
  }
  return null;
}
