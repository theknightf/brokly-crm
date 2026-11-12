import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/reports_models.dart';
import '../../data/services/reports_calculator.dart';
import '../../data/services/reports_service.dart';
import 'employee_drawer.dart';
import 'reports_controller.dart';
import 'widgets/reports_widgets.dart';

Color _stageColor(BuildContext context, String stage) => AppColors.getStatusColors(stage, isDark: Surf.dark(context)).text;

/// Reports > Calls: Agent x Stage matrix, goals per agent, calls by employee
/// (opens the employee drawer) and the call log report.
class CallsReportView extends StatefulWidget {
  final ReportsController controller;
  final OpenLeadsCallback? onOpenLeads;
  final bool viewerIsAdmin;
  final bool viewerIsManager;

  const CallsReportView({super.key, required this.controller, this.onOpenLeads, required this.viewerIsAdmin, required this.viewerIsManager});

  @override
  State<CallsReportView> createState() => _CallsReportViewState();
}

class _CallsReportViewState extends State<CallsReportView> {
  MatrixFilters _filters = const MatrixFilters();

  MatrixResult? _matrix;
  MatrixOptions? _options;
  GoalsSummary? _goals;
  String? _key;

  ReportsController get c => widget.controller;

  void _recompute() {
    final ds = c.dataset;
    if (ds == null) return;
    final key = '${ds.fetchedAt.microsecondsSinceEpoch}|${c.userId}|${_filters.activeCount}|${_filters.agent}|${_filters.teamLeader}|${_filters.team}|${_filters.project}|${_filters.campaign}|${_filters.source}|${_filters.stage}';
    if (key == _key) return;
    _key = key;
    _matrix = ReportsCalculator.buildMatrix(ds, _filters, userId: c.userId);
    _options = ReportsCalculator.matrixOptions(ds);
    _goals = ReportsCalculator.buildGoals(ds, userId: c.userId);
  }

  @override
  Widget build(BuildContext context) {
    _recompute();
    final ds = c.dataset;
    final summary = c.summary;
    if (ds == null || summary == null || _matrix == null) return const SizedBox.shrink();
    return Column(children: [
      _buildMatrix(context, ds),
      _buildGoals(context),
      _buildEmployees(context, summary),
      CallLogsSection(controller: c),
    ]);
  }

  // ───────────────────────── Agent x Stage ─────────────────────────

  Future<void> _openFilters(BuildContext context) async {
    final o = _options!;
    await showPremiumSheet<void>(context, builder: (ctx) {
      return StatefulBuilder(builder: (ctx, setSheet) {
        Future<void> pick(String title, String current, List<({String value, String label})> options, MatrixFilters Function(String v) apply, {bool searchable = false}) async {
          final v = await pickOption(ctx, title: title, options: [(value: '', label: 'All'), ...options], selected: current, searchable: searchable);
          if (v == null) return;
          setState(() => _filters = apply(v));
          setSheet(() {});
        }

        String nameIn(List<({String value, String label})> opts, String v, String all) =>
            v.isEmpty ? all : (opts.where((e) => e.value == v).map((e) => e.label).firstOrNull ?? v);

        final leaders = [for (final l in o.teamLeaders) (value: l.id, label: '${l.name} · ${l.teamName}')];
        final teams = [for (final t in o.teams) (value: t.id, label: t.name)];
        final projects = [for (final p in o.projects) (value: p, label: p)];
        final sources = [for (final s in o.sources) (value: s, label: s)];
        final stages = [for (final s in o.stages) (value: s, label: s)];
        final agents = [for (final a in o.agents) (value: a.id, label: a.name)];

        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Expanded(child: Text('Matrix filters', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Surf.text(ctx)))),
              if (_filters.activeCount > 0)
                TextButton(
                  onPressed: () {
                    setState(() => _filters = const MatrixFilters());
                    setSheet(() {});
                  },
                  child: const Text('Clear all'),
                ),
            ]),
            const SizedBox(height: 10),
            FilterField(label: 'Team leader', value: nameIn(leaders, _filters.teamLeader, 'All team leaders'), active: _filters.teamLeader.isNotEmpty, onTap: () => pick('Team leader', _filters.teamLeader, leaders, (v) => _filters.copyWith(teamLeader: v), searchable: true)),
            const SizedBox(height: 8),
            FilterField(label: 'Team', value: nameIn(teams, _filters.team, 'All teams'), active: _filters.team.isNotEmpty, onTap: () => pick('Team', _filters.team, teams, (v) => _filters.copyWith(team: v))),
            const SizedBox(height: 8),
            FilterField(label: 'Project', value: nameIn(projects, _filters.project, 'All projects'), active: _filters.project.isNotEmpty, onTap: () => pick('Project', _filters.project, projects, (v) => _filters.copyWith(project: v), searchable: true)),
            const SizedBox(height: 8),
            FilterField(label: 'Lead source', value: nameIn(sources, _filters.source, 'All lead sources'), active: _filters.source.isNotEmpty, onTap: () => pick('Lead source', _filters.source, sources, (v) => _filters.copyWith(source: v), searchable: true)),
            const SizedBox(height: 8),
            FilterField(label: 'Campaign', value: nameIn(sources, _filters.campaign, 'All campaigns'), active: _filters.campaign.isNotEmpty, onTap: () => pick('Campaign', _filters.campaign, sources, (v) => _filters.copyWith(campaign: v), searchable: true)),
            const SizedBox(height: 8),
            FilterField(label: 'Stage', value: nameIn(stages, _filters.stage, 'All stages'), active: _filters.stage.isNotEmpty, onTap: () => pick('Stage', _filters.stage, stages, (v) => _filters.copyWith(stage: v))),
            const SizedBox(height: 8),
            FilterField(label: 'Agent', value: nameIn(agents, _filters.agent, 'All agents'), active: _filters.agent.isNotEmpty, onTap: () => pick('Agent', _filters.agent, agents, (v) => _filters.copyWith(agent: v), searchable: true)),
            const SizedBox(height: 16),
            FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)), onPressed: () => Navigator.of(ctx).pop(), child: const Text('Done')),
          ]),
        );
      });
    });
  }

  Widget _buildMatrix(BuildContext context, ReportsDataset ds) {
    final m = _matrix!;
    final active = _filters.activeCount + (c.userId != null ? 1 : 0);
    final chips = <({String label, VoidCallback clear})>[
      if (_filters.teamLeader.isNotEmpty) (label: 'Leader: ${_options!.teamLeaders.where((l) => l.id == _filters.teamLeader).map((l) => l.name).firstOrNull ?? '…'}', clear: () => setState(() => _filters = _filters.copyWith(teamLeader: ''))),
      if (_filters.team.isNotEmpty) (label: 'Team: ${_options!.teams.where((t) => t.id == _filters.team).map((t) => t.name).firstOrNull ?? '…'}', clear: () => setState(() => _filters = _filters.copyWith(team: ''))),
      if (_filters.project.isNotEmpty) (label: 'Project: ${_filters.project}', clear: () => setState(() => _filters = _filters.copyWith(project: ''))),
      if (_filters.source.isNotEmpty) (label: 'Source: ${_filters.source}', clear: () => setState(() => _filters = _filters.copyWith(source: ''))),
      if (_filters.campaign.isNotEmpty) (label: 'Campaign: ${_filters.campaign}', clear: () => setState(() => _filters = _filters.copyWith(campaign: ''))),
      if (_filters.stage.isNotEmpty) (label: 'Stage: ${_filters.stage}', clear: () => setState(() => _filters = _filters.copyWith(stage: ''))),
      if (_filters.agent.isNotEmpty) (label: 'Agent: ${_options!.agents.where((a) => a.id == _filters.agent).map((a) => a.name).firstOrNull ?? '…'}', clear: () => setState(() => _filters = _filters.copyWith(agent: ''))),
    ];
    return ReportCard(
      title: 'Agent × Lead Stage',
      subtitle: '${active > 0 ? 'Filtered view' : 'How many leads each agent has at every stage'} · ${ds.from} → ${ds.to}',
      trailing: OutlinedButton.icon(
        style: OutlinedButton.styleFrom(minimumSize: const Size(48, 44)),
        onPressed: () => _openFilters(context),
        icon: const Icon(LucideIcons.slidersHorizontal, size: 15),
        label: Text(_filters.activeCount > 0 ? 'Filters (${_filters.activeCount})' : 'Filters'),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (chips.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Wrap(spacing: 6, runSpacing: 6, children: [
              for (final ch in chips)
                InputChip(
                  label: Text(ch.label, style: const TextStyle(fontSize: 12)),
                  onDeleted: ch.clear,
                  deleteButtonTooltipMessage: 'Remove filter',
                  materialTapTargetSize: MaterialTapTargetSize.padded,
                ),
            ]),
          ),
        if (m.rows.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 20),
            child: Center(
              child: Column(children: [
                Text('No results for selected filters', style: TextStyle(fontWeight: FontWeight.w700, color: Surf.text(context))),
                const SizedBox(height: 4),
                Text('Try adjusting or clearing filters', style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
                if (_filters.activeCount > 0)
                  TextButton(onPressed: () => setState(() => _filters = const MatrixFilters()), child: const Text('Clear filters')),
              ]),
            ),
          )
        else ...[
          for (final r in m.rows)
            Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(14)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  InitialsAvatar(r.agent, size: 30),
                  const SizedBox(width: 10),
                  Expanded(child: Text(r.agent, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Surf.text(context)))),
                  Text(fmtInt(r.total), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Surf.accent(context), fontFeatures: kTabular)),
                ]),
                const SizedBox(height: 8),
                Wrap(spacing: 6, runSpacing: 2, children: [
                  for (var i = 0; i < m.stages.length; i++)
                    if (r.counts[i] > 0)
                      CountChip(
                        label: m.stages[i],
                        count: r.counts[i],
                        color: _stageColor(context, m.stages[i]),
                        onTap: widget.onOpenLeads == null ? null : () => widget.onOpenLeads!(agentName: r.agent, stage: m.stages[i]),
                      ),
                ]),
              ]),
            ),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Surf.accent(context).withAlpha(Surf.dark(context) ? 30 : 24), borderRadius: BorderRadius.circular(14)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text('Total', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Surf.text(context)))),
                Text(fmtInt(m.grandTotal), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Surf.accent(context), fontFeatures: kTabular)),
              ]),
              const SizedBox(height: 8),
              Wrap(spacing: 6, runSpacing: 2, children: [
                for (var i = 0; i < m.stages.length; i++)
                  if (m.columnTotals[i] > 0)
                    CountChip(
                      label: m.stages[i],
                      count: m.columnTotals[i],
                      color: _stageColor(context, m.stages[i]),
                      onTap: widget.onOpenLeads == null ? null : () => widget.onOpenLeads!(stage: m.stages[i]),
                    ),
              ]),
            ]),
          ),
        ],
      ]),
    );
  }

  // ───────────────────────── Goals ─────────────────────────

  Widget _goalStat(BuildContext context, String label, int v, Color color) => Expanded(child: MiniStat(label: label, value: fmtInt(v), color: color));

  Widget _buildGoals(BuildContext context) {
    final g = _goals!;
    final t = GoalStages();
    var totalCalls = 0;
    for (final a in g.agents) {
      t.newFresh += a.stages.newFresh;
      t.newCold += a.stages.newCold;
      t.pending += a.stages.pending;
      t.callsAnswer += a.stages.callsAnswer;
      t.noAnswer += a.stages.noAnswer;
      t.cancel += a.stages.cancel;
      t.doneDeal += a.stages.doneDeal;
      totalCalls += a.totalCalls;
    }
    final target = g.targetDeals <= 0 ? 15 : g.targetDeals;
    const green = Color(0xFF16A34A);
    const sky = Color(0xFF0284C7);
    const violet = Color(0xFF7C3AED);
    return ReportCard(
      title: 'Goals — Lead Lifecycle by Agent',
      subtitle: 'Standardized stages per agent · ${c.from} → ${c.to} · ${g.agents.length} agents · Target $target deals',
      child: g.agents.isEmpty
          ? Padding(
              padding: const EdgeInsets.symmetric(vertical: 20),
              child: Center(child: Text('No goals data for selected period\nTry adjusting the date range or clearing filters', textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: Surf.subtext(context)))),
            )
          : Column(children: [
              for (final a in g.agents)
                Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(14)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      InitialsAvatar(a.agentName, size: 34),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(a.agentName, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Surf.text(context))),
                          Text(a.role, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: Surf.subtext(context))),
                        ]),
                      ),
                    ]),
                    const SizedBox(height: 10),
                    Row(children: [
                      Expanded(child: Text('${a.stages.doneDeal} / ${a.targetDeals} deals', style: TextStyle(fontSize: 12, color: Surf.subtext(context), fontFeatures: kTabular))),
                      Text('${fmtDec(a.goalProgress)}%', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: Surf.accent(context), fontFeatures: kTabular)),
                    ]),
                    const SizedBox(height: 5),
                    ProgressBar(value: a.goalProgress / 100, color: violet),
                    const SizedBox(height: 12),
                    Row(children: [
                      _goalStat(context, 'Fresh', a.stages.newFresh, green),
                      _goalStat(context, 'Cold', a.stages.newCold, sky),
                      _goalStat(context, 'Pending', a.stages.pending, AppColors.amber),
                      _goalStat(context, 'Answer', a.stages.callsAnswer, violet),
                    ]),
                    const SizedBox(height: 10),
                    Row(children: [
                      _goalStat(context, 'No answer', a.stages.noAnswer, Surf.subtext(context)),
                      _goalStat(context, 'Cancel', a.stages.cancel, AppColors.alertRed),
                      _goalStat(context, 'D.Deal', a.stages.doneDeal, green),
                      _goalStat(context, 'Calls', a.totalCalls, Surf.text(context)),
                    ]),
                  ]),
                ),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Surf.accent(context).withAlpha(Surf.dark(context) ? 30 : 24), borderRadius: BorderRadius.circular(14)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text('Total', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Surf.text(context)))),
                    Text('${fmtDec(t.doneDeal / target * 100)}%', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: Surf.accent(context), fontFeatures: kTabular)),
                  ]),
                  const SizedBox(height: 6),
                  ProgressBar(value: t.doneDeal / target, color: Surf.accent(context)),
                  const SizedBox(height: 12),
                  Row(children: [
                    _goalStat(context, 'Fresh', t.newFresh, green),
                    _goalStat(context, 'Cold', t.newCold, sky),
                    _goalStat(context, 'Pending', t.pending, AppColors.amber),
                    _goalStat(context, 'Answer', t.callsAnswer, violet),
                  ]),
                  const SizedBox(height: 10),
                  Row(children: [
                    _goalStat(context, 'No answer', t.noAnswer, Surf.subtext(context)),
                    _goalStat(context, 'Cancel', t.cancel, AppColors.alertRed),
                    _goalStat(context, 'D.Deal', t.doneDeal, green),
                    _goalStat(context, 'Calls', totalCalls, Surf.text(context)),
                  ]),
                ]),
              ),
            ]),
    );
  }

  // ───────────────────────── Calls by employee ─────────────────────────

  Widget _buildEmployees(BuildContext context, ReportSummary s) {
    final list = s.callsByEmployee.toList()..sort((a, b) => b.calls.compareTo(a.calls));
    if (list.isEmpty) return const SizedBox.shrink();
    final totalCalls = list.fold<int>(0, (n, e) => n + e.calls);
    final totalStatus = list.fold<int>(0, (n, e) => n + e.statusUpdates);
    return ReportCard(
      title: 'Calls and status updates by employee',
      subtitle: 'Tap an employee for calls, notes and actions',
      trailing: null,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 6, runSpacing: 6, children: [
          StatusPill('Calls $totalCalls', color: Surf.subtext(context)),
          StatusPill('Status updates $totalStatus', color: Surf.accent(context)),
        ]),
        const SizedBox(height: 12),
        for (final e in list)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Material(
              color: Surf.muted(context),
              borderRadius: BorderRadius.circular(14),
              child: InkWell(
                borderRadius: BorderRadius.circular(14),
                onTap: e.userId.isEmpty
                    ? null
                    : () {
                        final me = c.service.currentUserId;
                        if (!widget.viewerIsManager && e.userId != me) return;
                        showEmployeeDrawer(
                          context,
                          service: c.service,
                          employeeId: e.userId,
                          employeeName: e.name,
                          from: c.from,
                          to: c.to,
                          summary: EmployeeSummary(calls: e.calls, connected: e.connected, noAnswer: e.noAnswer, statusUpdates: e.statusUpdates),
                          viewerIsAdmin: widget.viewerIsAdmin,
                          viewerIsManager: widget.viewerIsManager,
                        );
                      },
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      InitialsAvatar(e.name, size: 32),
                      const SizedBox(width: 10),
                      Expanded(child: Text(e.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Surf.text(context)))),
                      Icon(LucideIcons.chevronRight, size: 16, color: Surf.subtext(context)),
                    ]),
                    const SizedBox(height: 10),
                    Row(children: [
                      Expanded(child: MiniStat(label: 'Calls', value: fmtInt(e.calls))),
                      Expanded(child: MiniStat(label: 'Status upd.', value: fmtInt(e.statusUpdates), color: Surf.accent(context))),
                      Expanded(child: MiniStat(label: 'Connected', value: fmtInt(e.connected), color: AppColors.accent)),
                      Expanded(child: MiniStat(label: 'No answer', value: fmtInt(e.noAnswer), color: Surf.subtext(context))),
                    ]),
                    const SizedBox(height: 8),
                    Row(children: [
                      Expanded(child: MiniStat(label: 'Incoming', value: fmtInt(e.incoming), color: AppColors.tealCyan)),
                      Expanded(child: MiniStat(label: 'Duration', value: fmtMinutes(e.totalDurationSeconds), color: Surf.subtext(context))),
                      const Expanded(child: SizedBox.shrink()),
                      const Expanded(child: SizedBox.shrink()),
                    ]),
                  ]),
                ),
              ),
            ),
          ),
      ]),
    );
  }
}

// ───────────────────────── Call logs report ─────────────────────────

enum _LogPeriod { day, week, month, range }

class CallLogsSection extends StatefulWidget {
  final ReportsController controller;
  const CallLogsSection({super.key, required this.controller});

  @override
  State<CallLogsSection> createState() => _CallLogsSectionState();
}

class _CallLogsSectionState extends State<CallLogsSection> {
  _LogPeriod _period = _LogPeriod.week;
  String _customFrom = '';
  String _customTo = '';
  List<CallLogEntry> _logs = [];
  bool _loading = true;
  String? _error;
  int _visible = 40;
  int _seq = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  ({DateTime from, DateTime to}) _window() {
    final now = DateTime.now();
    switch (_period) {
      case _LogPeriod.day:
        return (from: DateTime(now.year, now.month, now.day), to: now);
      case _LogPeriod.month:
        return (from: DateTime(now.year, now.month, 1), to: now);
      case _LogPeriod.range:
        final f = _customFrom.isEmpty ? DateTime(2020) : ReportsService.parseDay(_customFrom);
        final t = _customTo.isEmpty ? now : ReportsService.parseDay(_customTo).add(const Duration(hours: 23, minutes: 59, seconds: 59));
        return (from: f, to: t);
      case _LogPeriod.week:
        return (from: DateTime(now.year, now.month, now.day - ((now.weekday + 6) % 7)), to: now);
    }
  }

  Future<void> _load() async {
    final seq = ++_seq;
    setState(() {
      _loading = true;
      _error = null;
      _visible = 40;
    });
    try {
      final w = _window();
      final rows = await widget.controller.service.fetchCallLogs(w.from, w.to);
      if (!mounted || seq != _seq) return;
      setState(() => _logs = rows);
    } catch (e) {
      if (mounted && seq == _seq) setState(() => _error = ReportsService.friendlyError(e));
    } finally {
      if (mounted && seq == _seq) setState(() => _loading = false);
    }
  }

  Color _outcomeColor(BuildContext context, String? o) {
    switch (o) {
      case 'Reached':
      case 'Interested':
      case 'Site Visit':
      case 'Won Deal':
        return AppColors.accent;
      case 'Not Interested':
      case 'Wrong Number':
        return AppColors.alertRed;
      case 'Call back later':
        return AppColors.amber;
      default:
        return Surf.subtext(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final uid = widget.controller.userId;
    final logs = uid == null ? _logs : _logs.where((l) => l.userId == uid).toList();
    final total = logs.length;
    final reached = logs.where((l) => l.outcome == 'Reached').length;
    final noAnswer = logs.where((l) => l.outcome == 'No Answer').length;
    final callbacks = logs.where((l) => l.outcome == 'Call back later').length;

    return ReportCard(
      title: 'Call log',
      subtitle: 'Call activity you can see — who called, when, and the outcome.',
      trailing: IconButton(
        tooltip: 'Refresh call log',
        constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
        onPressed: _loading ? null : _load,
        icon: const Icon(LucideIcons.refreshCw, size: 18),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        InlineChips<_LogPeriod>(
          options: _LogPeriod.values,
          selected: _period,
          labelOf: (p) => switch (p) {
            _LogPeriod.day => 'Today',
            _LogPeriod.week => 'This Week',
            _LogPeriod.month => 'This Month',
            _LogPeriod.range => 'Custom',
          },
          onSelected: (p) {
            setState(() => _period = p);
            if (p != _LogPeriod.range || _customFrom.isNotEmpty || _customTo.isNotEmpty) _load();
          },
        ),
        if (_period == _LogPeriod.range) ...[
          const SizedBox(height: 8),
          DateFieldButton(label: 'From', value: _customFrom, onChanged: (v) {
            setState(() => _customFrom = v);
            _load();
          }),
          const SizedBox(height: 8),
          DateFieldButton(label: 'To', value: _customTo, onChanged: (v) {
            setState(() => _customTo = v);
            _load();
          }),
        ],
        const SizedBox(height: 12),
        AsyncBody(
          loading: _loading,
          error: _error,
          empty: false,
          onRetry: _load,
          skeletonCount: 3,
          builder: (_) => _body(context, logs, total, reached, noAnswer, callbacks),
        ),
      ]),
    );
  }

  Widget _body(BuildContext context, List<CallLogEntry> logs, int total, int reached, int noAnswer, int callbacks) {
    // per day
    final byDay = <String, int>{};
    final order = <String>[];
    for (final l in logs.reversed) {
      final d = l.createdAt?.toLocal();
      if (d == null) continue;
      final key = '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}';
      if (!byDay.containsKey(key)) order.add(key);
      byDay[key] = (byDay[key] ?? 0) + 1;
    }
    final daily = order.length > 14 ? order.sublist(order.length - 14) : order;

    // per agent
    final groups = <String, List<CallLogEntry>>{};
    for (final l in logs) {
      groups.putIfAbsent(l.agentName, () => []).add(l);
    }
    final agents = groups.entries.toList()..sort((a, b) => b.value.length.compareTo(a.value.length));

    // outcomes
    final outcomes = <String, int>{};
    for (final l in logs) {
      final o = (l.outcome == null || l.outcome!.isEmpty) ? 'Other' : l.outcome!;
      outcomes[o] = (outcomes[o] ?? 0) + 1;
    }
    final outcomeList = outcomes.entries.toList()..sort((a, b) => b.value.compareTo(a.value));

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      TwoUp(children: [
        MetricTile(label: 'Total calls', value: fmtInt(total), icon: LucideIcons.phone),
        MetricTile(label: 'Reached', value: fmtInt(reached), icon: LucideIcons.phoneCall, color: AppColors.accent),
        MetricTile(label: 'No answer', value: fmtInt(noAnswer), icon: LucideIcons.phoneMissed, color: Surf.subtext(context)),
        MetricTile(label: 'Call back', value: fmtInt(callbacks), icon: LucideIcons.phoneForwarded, color: AppColors.amber),
      ]),
      if (daily.length > 1) ...[
        const SizedBox(height: 16),
        Text('Calls per day', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: Surf.subtext(context))),
        const SizedBox(height: 8),
        MiniBarChart(points: [for (final d in daily) BarPoint(d, byDay[d] ?? 0)], height: 120),
      ],
      const SizedBox(height: 16),
      Text('Per-agent performance', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Surf.text(context))),
      const SizedBox(height: 8),
      if (agents.isEmpty)
        Text('No calls in this period.', style: TextStyle(fontSize: 13, color: Surf.subtext(context)))
      else
        for (final a in agents) _agentCard(context, a.key, a.value),
      const SizedBox(height: 8),
      Text('Outcomes', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Surf.text(context))),
      const SizedBox(height: 8),
      if (outcomeList.isEmpty)
        Text('No calls in this period.', style: TextStyle(fontSize: 13, color: Surf.subtext(context)))
      else
        Wrap(spacing: 6, runSpacing: 2, children: [
          for (final o in outcomeList) CountChip(label: o.key, count: o.value, color: _outcomeColor(context, o.key)),
        ]),
      const SizedBox(height: 16),
      Row(children: [
        Expanded(child: Text('Call log', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Surf.text(context)))),
        Text('${fmtInt(total)} entries', style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
      ]),
      const SizedBox(height: 8),
      if (logs.isEmpty)
        Text('No calls in this period.', style: TextStyle(fontSize: 13, color: Surf.subtext(context)))
      else ...[
        for (final l in logs.take(_visible))
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(14)),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(l.contactName ?? '—', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Surf.text(context))),
                  if (l.contactPhone != null && l.contactPhone!.isNotEmpty)
                    Text(l.contactPhone!, style: TextStyle(fontSize: 12, color: Surf.subtext(context), fontFeatures: kTabular)),
                  Text(l.agentName, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: Surf.subtext(context))),
                ]),
              ),
              const SizedBox(width: 8),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                StatusPill((l.outcome == null || l.outcome!.isEmpty) ? '—' : l.outcome!, color: _outcomeColor(context, l.outcome)),
                const SizedBox(height: 4),
                Text(fmtDateTime(l.createdAt), style: TextStyle(fontSize: 11, color: Surf.subtext(context))),
              ]),
            ]),
          ),
        if (logs.length > _visible)
          OutlinedButton(
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            onPressed: () => setState(() => _visible += 40),
            child: Text('Show more (${logs.length - _visible} left)'),
          ),
      ],
    ]);
  }

  Widget _agentCard(BuildContext context, String name, List<CallLogEntry> arr) {
    int count(bool Function(CallLogEntry) f) => arr.where(f).length;
    final connected = count((l) => ReportsCalculator.isConnected(channel: l.channel, direction: l.direction, durationSeconds: l.durationSeconds, outcome: l.outcome));
    final shortCalls = count((l) => ReportsCalculator.isShortCall(channel: l.channel, direction: l.direction, durationSeconds: l.durationSeconds, outcome: l.outcome));
    final incoming = count((l) => l.direction == 'incoming');
    final reached = count((l) => l.outcome == 'Reached');
    final notInterested = count((l) => l.outcome == 'Not Interested');
    final noAnswer = count((l) => l.outcome == 'No Answer');
    final callbacks = count((l) => l.outcome == 'Call back later');
    final reachPct = arr.isEmpty ? 0 : (reached / arr.length * 100).round();
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(14)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          InitialsAvatar(name, size: 30),
          const SizedBox(width: 10),
          Expanded(child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Surf.text(context)))),
          Text('$reachPct% reach', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Surf.accent(context), fontFeatures: kTabular)),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(child: MiniStat(label: 'Calls', value: fmtInt(arr.length))),
          Expanded(child: MiniStat(label: 'Connected', value: fmtInt(connected), color: AppColors.accent)),
          Expanded(child: MiniStat(label: 'Short', value: fmtInt(shortCalls), color: AppColors.amber)),
          Expanded(child: MiniStat(label: 'Incoming', value: fmtInt(incoming), color: AppColors.tealCyan)),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: MiniStat(label: 'Reached', value: fmtInt(reached), color: AppColors.accent)),
          Expanded(child: MiniStat(label: 'Not int.', value: fmtInt(notInterested), color: AppColors.alertRed)),
          Expanded(child: MiniStat(label: 'No answer', value: fmtInt(noAnswer), color: Surf.subtext(context))),
          Expanded(child: MiniStat(label: 'Call back', value: fmtInt(callbacks), color: AppColors.amber)),
        ]),
      ]),
    );
  }
}
