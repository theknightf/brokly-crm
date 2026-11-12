import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/currency_formatter.dart';
import '../../core/widgets/premium.dart';
import '../../data/services/reports_service.dart';
import '../../state/auth_provider.dart';
import 'analytics_screen.dart';
import 'reports_calls_view.dart';
import 'reports_controller.dart';
import 'reports_views.dart';
import 'widgets/reports_widgets.dart';

enum ReportView { overview, team, leads, sales, calls, analytics, attendance }

class _Category {
  final ReportView view;
  final String title;
  final String desc;
  final IconData icon;
  final bool adminOnly;
  const _Category(this.view, this.title, this.desc, this.icon, {this.adminOnly = false});
}

const List<_Category> _categories = [
  _Category(ReportView.overview, 'My performance', 'Your leads, wins and conversion at a glance', LucideIcons.userCheck),
  _Category(ReportView.team, 'Team performance', 'How every agent and team is doing', LucideIcons.users),
  _Category(ReportView.leads, 'Lead stages', 'See how many leads are New, Pending, Interested and Won', LucideIcons.gitBranch),
  _Category(ReportView.leads, 'Leads & follow-ups', 'Where leads come from and follow-up status', LucideIcons.chartColumn),
  _Category(ReportView.sales, 'Sales & revenue', 'Deals closed and money earned', LucideIcons.dollarSign),
  _Category(ReportView.calls, 'Calls', 'Call volume, duration and outcomes', LucideIcons.phone),
  _Category(ReportView.analytics, 'Analytics', 'Calls over time, call log, assigned report and funnel matrix', LucideIcons.activity),
  _Category(ReportView.attendance, 'Attendance', 'Who was on time, late or absent', LucideIcons.clock, adminOnly: true),
];

const Map<ReportView, String> _titles = {
  ReportView.overview: 'My performance',
  ReportView.team: 'Team performance',
  ReportView.leads: 'Leads & follow-ups',
  ReportView.sales: 'Sales & revenue',
  ReportView.calls: 'Calls',
  ReportView.analytics: 'Analytics',
  ReportView.attendance: 'Attendance',
};

/// "More reports" entries the shell can route to (keys are passed to `onOpenRoute`).
class _More {
  final String key;
  final String title;
  final String desc;
  final IconData icon;
  final bool adminOnly;
  const _More(this.key, this.title, this.desc, this.icon, {this.adminOnly = false});
}

const List<_More> _moreReports = [
  _More('calendar', 'Meetings', 'Scheduled site visits and meetings', LucideIcons.calendarCheck),
  _More('followUps', 'Follow-ups', 'Pending and completed follow-ups', LucideIcons.squareCheck),
  _More('projects', 'Projects', 'Project pipeline and pitches', LucideIcons.folderKanban),
  _More('expenses', 'Expenses', 'Spend by category and team', LucideIcons.receipt),
  _More('payroll', 'Payroll', 'Payroll entries, bonuses and deductions', LucideIcons.banknote, adminOnly: true),
  _More('accounts', 'Accounts', 'Company accounts and balances', LucideIcons.wallet, adminOnly: true),
  _More('kpis', 'KPIs', 'Team KPI targets vs actual results', LucideIcons.target, adminOnly: true),
];

/// Reports & Analytics. Embed inside the shell (no app bar of its own) or push standalone.
///
/// [onOpenLeads] opens the Leads list filtered by agent name and/or stage; when null the counts are not tappable.
/// [onOpenRoute] receives one of: calendar, followUps, projects, expenses, payroll, accounts, kpis
/// (the "More reports" section is hidden when it is null).
class ReportsScreen extends StatefulWidget {
  final OpenLeadsCallback? onOpenLeads;
  final void Function(String key)? onOpenRoute;

  const ReportsScreen({super.key, this.onOpenLeads, this.onOpenRoute});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  final ReportsController _ctl = ReportsController();
  final GlobalKey<AnalyticsPanelState> _analyticsKey = GlobalKey<AnalyticsPanelState>();
  ReportView? _view;

  @override
  void initState() {
    super.initState();
    _ctl.load();
  }

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  Future<void> _afterRangeChange() async {
    if (_view == ReportView.attendance && _ctl.isAdmin) await _ctl.loadAttendance();
  }

  Future<void> _refresh() async {
    await _ctl.refresh();
    if (_view == ReportView.analytics) await _analyticsKey.currentState?.reload();
  }

  void _open(ReportView v) {
    setState(() => _view = v);
    if (v == ReportView.attendance && _ctl.isAdmin && _ctl.attendance == null && !_ctl.attendanceLoading) {
      _ctl.loadAttendance();
    }
  }

  Future<void> _pickCustomRange() async {
    final now = DateTime.now();
    final initial = DateTimeRange(start: ReportsService.parseDay(_ctl.from), end: ReportsService.parseDay(_ctl.to));
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime(now.year, now.month, now.day),
      initialDateRange: initial,
    );
    if (r == null) return;
    await _ctl.setCustomRange(ReportsService.isoDay(r.start), ReportsService.isoDay(r.end));
    await _afterRangeChange();
  }

  Future<void> _pickUser() async {
    final opts = _ctl.userOptions;
    final v = await pickOption(
      context,
      title: 'Show data for',
      options: [(value: '', label: 'All users'), for (final u in opts) (value: u.id, label: u.name)],
      selected: _ctl.userId ?? '',
      searchable: true,
    );
    if (v != null) _ctl.setUser(v);
  }

  // ───────────────────────── export (copy) ─────────────────────────

  void _copyCsv() {
    final s = _ctl.summary;
    if (s == null) return;
    final rows = <List<Object?>>[
      ['Total Leads', s.totalLeads],
      ['Total Customers', s.totalCustomers],
      ['Total Revenue', s.totalRevenue.round()],
      ['Conversion Rate %', fmtDec(s.conversionRate)],
      for (final e in s.leadsByStatus.entries) ['Leads By Status — ${e.key}', e.value],
      for (final e in s.leadsBySource.entries) ['Leads By Source — ${e.key}', e.value],
      for (final a in (s.agentPerformance.toList()..sort((a, b) => b.leads.compareTo(a.leads)))) ['Agent ${a.name}', 'leads ${a.leads}, won ${a.won}, ${fmtDec(a.rate)}%'],
    ];
    copyText(context, toCsv(['Metric', 'Value'], rows), 'Report data copied as CSV');
  }

  void _copySummary() {
    final s = _ctl.summary;
    if (s == null) return;
    final b = StringBuffer()
      ..writeln('Reports & Analytics')
      ..writeln('${_ctl.from} → ${_ctl.to} · ${_ctl.selectedUserName ?? 'All users'}')
      ..writeln()
      ..writeln('Total Leads: ${s.totalLeads}')
      ..writeln('Customers: ${s.totalCustomers}')
      ..writeln('Revenue: ${CurrencyFormatter.formatCompact(s.totalRevenue)}')
      ..writeln('Conversion: ${fmtDec(s.conversionRate)}%');
    if (s.monthlyLeads.isNotEmpty) {
      b
        ..writeln()
        ..writeln('Monthly Leads vs Won (Last 6 Months)');
      for (final m in s.monthlyLeads) {
        b.writeln('  ${m.month}: ${m.leads} leads, ${m.won} won');
      }
    }
    final agents = s.agentPerformance.toList()..sort((a, b) => b.leads.compareTo(a.leads));
    if (agents.isNotEmpty) {
      b
        ..writeln()
        ..writeln('Agent Performance');
      for (final a in agents) {
        b.writeln('  ${a.name}: ${a.leads} leads, ${a.won} won, ${fmtDec(a.rate)}%');
      }
    }
    final teams = s.teamPerformance.toList()..sort((a, b) => b.closedDeals.compareTo(a.closedDeals));
    if (teams.isNotEmpty) {
      b
        ..writeln()
        ..writeln('Team Performance');
      for (final t in teams) {
        b.writeln('  ${t.name}: ${t.assignedLeads} assigned, ${t.closedDeals} closed, ${CurrencyFormatter.formatCompact(t.totalRevenue)}, ${fmtDec(t.conversionRate)}%');
      }
    }
    final att = _ctl.attendance;
    if (att != null && att.rows.isNotEmpty) {
      b
        ..writeln()
        ..writeln('Attendance Report');
      for (final r in att.rows) {
        b.writeln('  ${r.name}: present ${r.present}, on time ${r.onTime}, late ${r.late}, absent ${r.absent}');
      }
    }
    copyText(context, b.toString(), 'Report summary copied');
  }

  // ───────────────────────── build ─────────────────────────

  @override
  Widget build(BuildContext context) {
    final profile = context.watch<AuthProvider>().profile;
    final role = (profile?.role ?? '').toLowerCase().trim();
    final viewerIsAdmin = profile?.isAdmin ?? false;
    final viewerIsManager = viewerIsAdmin || role == 'manager';

    return ListenableBuilder(
      listenable: _ctl,
      builder: (context, _) {
        return PopScope(
          canPop: _view == null,
          onPopInvokedWithResult: (didPop, _) {
            if (!didPop) setState(() => _view = null);
          },
          child: Material(
            type: MaterialType.transparency,
            child: RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                children: [
                  _toolbar(context),
                  const SizedBox(height: 14),
                  ..._body(context, viewerIsAdmin, viewerIsManager),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _toolbar(BuildContext context) {
    final c = _ctl;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(color: Surf.accent(context).withAlpha(34), borderRadius: BorderRadius.circular(13)),
          child: Icon(LucideIcons.chartColumn, size: 20, color: Surf.accent(context)),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Reports & Analytics', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Surf.text(context))),
            Text('Pick a report to see your numbers', style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
          ]),
        ),
        PopupMenuButton<String>(
          tooltip: 'Refresh and export',
          constraints: const BoxConstraints(minWidth: 200),
          icon: const Icon(LucideIcons.ellipsisVertical),
          onSelected: (v) {
            switch (v) {
              case 'refresh':
                _refresh();
              case 'csv':
                _copyCsv();
              case 'summary':
                _copySummary();
            }
          },
          itemBuilder: (_) => [
            const PopupMenuItem(value: 'refresh', height: 48, child: Text('Refresh')),
            PopupMenuItem(value: 'csv', height: 48, enabled: !c.loading && c.summary != null, child: const Text('Copy data as CSV')),
            PopupMenuItem(value: 'summary', height: 48, enabled: !c.loading && c.summary != null, child: const Text('Copy summary text')),
          ],
        ),
      ]),
      const SizedBox(height: 12),
      InlineChips<RangePreset>(
        options: RangePreset.values,
        selected: c.preset,
        labelOf: (p) => p.label,
        onSelected: (p) async {
          if (p == RangePreset.custom) {
            await _pickCustomRange();
          } else {
            await c.setPreset(p);
            await _afterRangeChange();
          }
        },
      ),
      const SizedBox(height: 8),
      Row(children: [
        Expanded(child: FilterField(label: 'Date range', value: '${c.from} → ${c.to}', active: c.preset == RangePreset.custom, icon: LucideIcons.calendar, onTap: _pickCustomRange)),
        const SizedBox(width: 8),
        Expanded(child: FilterField(label: 'Show data for', value: c.selectedUserName ?? 'All users', active: c.userId != null, onTap: c.dataset == null ? () {} : _pickUser)),
      ]),
    ]);
  }

  List<Widget> _body(BuildContext context, bool viewerIsAdmin, bool viewerIsManager) {
    final c = _ctl;
    if (c.loading && c.dataset == null) {
      return [for (var i = 0; i < 4; i++) Container(height: 92, margin: const EdgeInsets.only(bottom: 12), decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(20)))];
    }
    final summary = c.summary;
    if (c.error != null && summary == null) {
      return [SizedBox(height: 360, child: ErrorState(message: c.error!, onRetry: c.load))];
    }
    if (summary == null) return const [];

    final userBanner = c.userId != null
        ? PremiumCard(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            child: Row(children: [
              Icon(LucideIcons.users, size: 16, color: Surf.accent(context)),
              const SizedBox(width: 10),
              Expanded(child: Text('Showing reports for ${c.selectedUserName ?? 'this user'}', style: TextStyle(fontSize: 13, color: Surf.subtext(context)))),
              TextButton(style: TextButton.styleFrom(minimumSize: const Size(48, 44)), onPressed: () => c.setUser(null), child: const Text('View all')),
            ]),
          )
        : null;

    final refreshing = c.loading
        ? const Padding(padding: EdgeInsets.only(bottom: 10), child: LinearProgressIndicator(minHeight: 2))
        : null;
    final stale = c.error != null
        ? Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text('Could not refresh: ${c.error}', style: const TextStyle(fontSize: 12, color: AppColors.alertRed)),
          )
        : null;

    final view = _view;
    if (view == null) {
      final isAdmin = c.isAdmin;
      return [
        if (refreshing != null) refreshing,
        if (stale != null) stale,
        if (userBanner != null) userBanner,
        const SectionHeader(title: 'Pick a report'),
        const SizedBox(height: 8),
        for (final cat in _categories.where((e) => !e.adminOnly || isAdmin))
          PremiumCard(
            onTap: () => _open(cat.view),
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(color: Surf.accent(context).withAlpha(30), borderRadius: BorderRadius.circular(15)),
                child: Icon(cat.icon, size: 22, color: Surf.accent(context)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(cat.title, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Surf.text(context))),
                  const SizedBox(height: 2),
                  Text(cat.desc, style: TextStyle(fontSize: 12.5, height: 1.3, color: Surf.subtext(context))),
                ]),
              ),
              Icon(LucideIcons.chevronRight, size: 18, color: Surf.subtext(context)),
            ]),
          ),
        if (widget.onOpenRoute != null) ...[
          const SizedBox(height: 8),
          const SectionHeader(title: 'More reports'),
          const SizedBox(height: 8),
          for (final m in _moreReports.where((e) => !e.adminOnly || isAdmin))
            PremiumCard(
              onTap: () => widget.onOpenRoute!(m.key),
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(12),
              child: Row(children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(color: Surf.accent(context).withAlpha(30), borderRadius: BorderRadius.circular(12)),
                  child: Icon(m.icon, size: 18, color: Surf.accent(context)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(m.title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Surf.text(context))),
                    Text(m.desc, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
                  ]),
                ),
                Icon(LucideIcons.chevronRight, size: 16, color: Surf.subtext(context)),
              ]),
            ),
        ],
      ];
    }

    final Widget content = switch (view) {
      ReportView.overview => OverviewReportView(summary: summary, showDelta: c.preset != RangePreset.year),
      ReportView.leads => LeadsReportView(summary: summary, onOpenLeads: widget.onOpenLeads),
      ReportView.sales => SalesReportView(summary: summary),
      ReportView.team => TeamReportView(summary: summary, onOpenLeads: widget.onOpenLeads),
      ReportView.attendance => AttendanceReportView(controller: c),
      ReportView.calls => CallsReportView(controller: c, onOpenLeads: widget.onOpenLeads, viewerIsAdmin: viewerIsAdmin, viewerIsManager: viewerIsManager),
      ReportView.analytics => AnalyticsPanel(key: _analyticsKey, onOpenLeads: widget.onOpenLeads),
    };

    return [
      Row(children: [
        TextButton.icon(
          style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
          onPressed: () => setState(() => _view = null),
          icon: const Icon(LucideIcons.chevronLeft, size: 18),
          label: const Text('All reports'),
        ),
        Expanded(child: Text(_titles[view] ?? 'Report', textAlign: TextAlign.end, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Surf.text(context)))),
      ]),
      const SizedBox(height: 6),
      if (refreshing != null) refreshing,
      if (stale != null) stale,
      if (userBanner != null) userBanner,
      content,
    ];
  }
}
