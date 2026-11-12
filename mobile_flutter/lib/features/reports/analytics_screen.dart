import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/reports_models.dart';
import '../../data/services/reports_calculator.dart';
import '../../data/services/reports_service.dart';
import 'widgets/reports_widgets.dart';

/// Reports > Analytics as a stand-alone screen (pull-to-refresh, own scrolling).
/// Embedded use inside Reports goes through [AnalyticsPanel].
class AnalyticsScreen extends StatefulWidget {
  final OpenLeadsCallback? onOpenLeads;
  const AnalyticsScreen({super.key, this.onOpenLeads});

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  final GlobalKey<AnalyticsPanelState> _panel = GlobalKey<AnalyticsPanelState>();

  @override
  Widget build(BuildContext context) {
    return Material(
      type: MaterialType.transparency,
      child: RefreshIndicator(
        onRefresh: () => _panel.currentState?.reload() ?? Future<void>.value(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [AnalyticsPanel(key: _panel, onOpenLeads: widget.onOpenLeads)],
        ),
      ),
    );
  }
}

enum _View { overview, calls, assigned, funnel }

const _frames = <String, String>{'day': 'Day', 'weekly': 'Weekly', 'monthly': 'Monthly', 'year': 'Year'};
const _sorts = <String, String>{
  'at': 'Time',
  'lead': 'Lead',
  'phone': 'Mobile',
  'agent': 'Sales agent',
  'direction': 'Call type',
  'outcome': 'Call result',
  'duration': 'Duration',
};

/// Non-scrolling analytics body: header, view switcher and the four views.
class AnalyticsPanel extends StatefulWidget {
  final OpenLeadsCallback? onOpenLeads;
  const AnalyticsPanel({super.key, this.onOpenLeads});

  @override
  State<AnalyticsPanel> createState() => AnalyticsPanelState();
}

class AnalyticsPanelState extends State<AnalyticsPanel> {
  final ReportsService _svc = ReportsService();

  _View _view = _View.overview;
  AnalyticsFilters _filters = const AnalyticsFilters();
  String _frame = 'weekly';
  int _page = 1;
  static const int _pageSize = 25;
  String _sort = 'at';
  String _dir = 'desc';
  String _search = '';
  String _teamId = '';
  bool _assignedDesc = true;
  final TextEditingController _searchCtl = TextEditingController();
  Timer? _searchTimer;

  OverviewStats? _overview;
  bool _overviewLoading = true;
  String? _overviewError;

  AnalyticsCallsPage? _calls;
  bool _callsLoading = true;
  String? _callsError;

  AssignedData? _assigned;
  bool _assignedLoading = true;
  String? _assignedError;

  AnalyticsOptions _options = const AnalyticsOptions();

  int _seqO = 0, _seqC = 0, _seqA = 0;
  bool _exporting = false;

  RealtimeChannel? _channel;
  Timer? _liveTimer;
  bool _live = false;
  String? _syncedAt;

  @override
  void initState() {
    super.initState();
    _loadOverview();
    _loadCalls();
    _loadAssigned();
    _svc.analyticsOptions().then((o) {
      if (mounted) setState(() => _options = o);
    });
    try {
      _channel = _svc.subscribeCallLogs((direction, isInsert) {
        if (!mounted) return;
        if (isInsert && direction == 'incoming') showInfo(context, 'Incoming call logged');
        _liveTimer?.cancel();
        _liveTimer = Timer(const Duration(milliseconds: 1500), () {
          if (mounted) reload();
        });
      }, (live) {
        if (mounted) setState(() => _live = live);
      });
    } catch (_) {
      // Realtime is optional; the screen keeps working with manual refresh.
    }
  }

  @override
  void dispose() {
    _searchTimer?.cancel();
    _liveTimer?.cancel();
    _searchCtl.dispose();
    final ch = _channel;
    if (ch != null) _svc.removeChannel(ch);
    super.dispose();
  }

  void _stamp() {
    final n = DateTime.now();
    _syncedAt = '${n.hour.toString().padLeft(2, '0')}:${n.minute.toString().padLeft(2, '0')}:${n.second.toString().padLeft(2, '0')}';
  }

  Future<void> reload() async {
    await Future.wait([_loadOverview(), _loadCalls(), _loadAssigned()]);
  }

  Future<void> _loadOverview() async {
    final seq = ++_seqO;
    setState(() {
      _overviewLoading = true;
      _overviewError = null;
    });
    try {
      final o = await _svc.analyticsOverview(_filters, _frame);
      if (!mounted || seq != _seqO) return;
      setState(() {
        _overview = o;
        _stamp();
      });
    } catch (e) {
      if (mounted && seq == _seqO) setState(() => _overviewError = ReportsService.friendlyError(e));
    } finally {
      if (mounted && seq == _seqO) setState(() => _overviewLoading = false);
    }
  }

  Future<void> _loadCalls() async {
    final seq = ++_seqC;
    setState(() {
      _callsLoading = true;
      _callsError = null;
    });
    try {
      final p = await _svc.analyticsCalls(_filters, page: _page, pageSize: _pageSize, sort: _sort, dir: _dir, search: _search);
      if (!mounted || seq != _seqC) return;
      setState(() {
        _calls = p;
        _stamp();
      });
    } catch (e) {
      if (mounted && seq == _seqC) setState(() => _callsError = ReportsService.friendlyError(e));
    } finally {
      if (mounted && seq == _seqC) setState(() => _callsLoading = false);
    }
  }

  Future<void> _loadAssigned() async {
    final seq = ++_seqA;
    setState(() {
      _assignedLoading = true;
      _assignedError = null;
    });
    try {
      final a = await _svc.analyticsAssigned(_filters);
      if (!mounted || seq != _seqA) return;
      setState(() {
        _assigned = a;
        _stamp();
      });
    } catch (e) {
      if (mounted && seq == _seqA) setState(() => _assignedError = ReportsService.friendlyError(e));
    } finally {
      if (mounted && seq == _seqA) setState(() => _assignedLoading = false);
    }
  }

  void _applyFilters(AnalyticsFilters f) {
    setState(() {
      _filters = f;
      _page = 1;
    });
    reload();
  }

  // ───────────────────────── export (copy CSV) ─────────────────────────

  Future<void> _export() async {
    if (_exporting) return;
    setState(() => _exporting = true);
    try {
      String csv;
      String name;
      switch (_view) {
        case _View.calls:
          final all = await _svc.analyticsCalls(_filters, page: 1, pageSize: 5000, sort: _sort, dir: _dir, search: _search);
          csv = toCsv(
            ['Lead name', 'Mobile', 'Sales agent', 'Call type', 'Call result', 'Duration', 'Timestamp'],
            [for (final c in all.rows) [c.leadName ?? '', maskPhone(c.phone), c.agentName ?? '', c.direction ?? '', c.bucket, fmtMmSs(c.durationSeconds), fmtDateTime(c.createdAt)]],
          );
          name = 'Calls log (${all.rows.length} rows)';
        case _View.assigned:
          final agents = _visibleAgents();
          csv = toCsv([
            'Agent',
            'Team',
            'Leads assigned',
            'Assign from',
            'Total volume'
          ], [
            for (final r in agents) [r.agentName, r.teamName, r.leadsAssigned, r.assignFrom, r.total],
            ['Total Accounts (${agents.length})', '', agents.fold<int>(0, (n, r) => n + r.leadsAssigned), agents.fold<int>(0, (n, r) => n + r.assignFrom), agents.fold<int>(0, (n, r) => n + r.total)],
          ]);
          name = 'Assigned report';
        case _View.funnel:
          final agents = _visibleAgents();
          final cols = _stageColumns(agents);
          csv = toCsv([
            'Agent',
            'Total calls',
            ...cols,
            'Total leads'
          ], [
            for (final r in agents) [r.agentName, r.calls, ...cols.map((s) => r.allStages[s] ?? 0), r.total],
            ['Total Accounts (${agents.length})', agents.fold<int>(0, (n, r) => n + r.calls), ...cols.map((s) => agents.fold<int>(0, (n, r) => n + (r.allStages[s] ?? 0))), agents.fold<int>(0, (n, r) => n + r.total)],
          ]);
          name = 'Funnel matrix';
        case _View.overview:
          final s = _overview;
          if (s == null) throw Exception('Nothing to export yet');
          csv = toCsv(['Metric', 'Value'], [
            ['Total calls', s.totalCalls],
            ['Calls per active hour', fmtDec(s.callsByHour, 3)],
            ['Answered', s.answered],
            ['No answer', s.noAnswer],
            ['Closed', s.closed],
            ['Incoming', s.incoming],
            ['Outgoing', s.outgoing],
          ]);
          name = 'Analytics overview';
      }
      if (!mounted) return;
      await copyText(context, csv, '$name copied as CSV');
    } catch (e) {
      if (mounted) showInfo(context, ReportsService.friendlyError(e));
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  List<AssignedAgent> _visibleAgents() => (_assigned?.agents ?? const <AssignedAgent>[]).where((a) => _teamId.isEmpty || a.teamId == _teamId).toList();

  List<String> _stageColumns(List<AssignedAgent> agents) {
    final present = <String>{for (final a in agents) ...a.allStages.keys};
    return {..._options.stages, ...present}.toList()..sort(ReportsCalculator.compareStages);
  }

  // ───────────────────────── build ─────────────────────────

  @override
  Widget build(BuildContext context) {
    final count = _filters.activeCount;
    final accent = Surf.accent(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(999)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Container(width: 8, height: 8, decoration: BoxDecoration(color: _live ? accent : Surf.subtext(context), shape: BoxShape.circle)),
            const SizedBox(width: 6),
            Text('${_live ? 'Live' : 'Offline'}${_syncedAt != null ? ' · $_syncedAt' : ''}', style: TextStyle(fontSize: 11.5, color: Surf.subtext(context), fontFeatures: kTabular)),
          ]),
        ),
        const Spacer(),
        IconButton(
          tooltip: 'Refresh',
          constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
          onPressed: reload,
          icon: const Icon(LucideIcons.refreshCw, size: 18),
        ),
      ]),
      Row(children: [
        Expanded(
          child: OutlinedButton.icon(
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            onPressed: _openFilters,
            icon: const Icon(LucideIcons.slidersHorizontal, size: 16),
            label: Text(count > 0 ? 'Filter ($count)' : 'Filter'),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            onPressed: _exporting ? null : _export,
            icon: _exporting ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(LucideIcons.copy, size: 16),
            label: const Text('Copy CSV'),
          ),
        ),
      ]),
      const SizedBox(height: 12),
      InlineChips<_View>(
        options: _View.values,
        selected: _view,
        labelOf: (v) => switch (v) {
          _View.overview => 'Analytics Overview',
          _View.calls => 'Calls Log',
          _View.assigned => 'Assigned Report',
          _View.funnel => 'Funnel Matrix',
        },
        onSelected: (v) => setState(() => _view = v),
      ),
      const SizedBox(height: 12),
      switch (_view) {
        _View.overview => _overviewView(context),
        _View.calls => _callsView(context),
        _View.assigned => _assignedView(context),
        _View.funnel => _funnelView(context),
      },
    ]);
  }

  // ───────────────────────── Overview ─────────────────────────

  Widget _overviewView(BuildContext context) {
    final s = _overview;
    return AsyncBody(
      loading: _overviewLoading && s == null,
      error: s == null ? _overviewError : null,
      empty: false,
      onRetry: _loadOverview,
      skeletonCount: 3,
      builder: (_) {
        final stats = s!;
        final total = stats.totalCalls;
        final timeline = stats.timeline;
        return Opacity(
          opacity: _overviewLoading ? 0.6 : 1,
          child: Column(children: [
            TwoUp(children: [
              MetricTile(label: 'Total Calls', value: fmtInt(total), icon: LucideIcons.phoneCall),
              MetricTile(label: 'Calls by hour', value: fmtDec(stats.callsByHour, 3), icon: LucideIcons.clock, color: AppColors.tealCyan, caption: 'Avg. per active hour'),
            ]),
            const SizedBox(height: 12),
            ReportCard(
              title: 'Calls over time',
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                InlineChips<String>(
                  options: _frames.keys.toList(),
                  selected: _frame,
                  labelOf: (k) => _frames[k] ?? k,
                  onSelected: (k) {
                    setState(() => _frame = k);
                    _loadOverview();
                  },
                ),
                const SizedBox(height: 10),
                if (timeline.isEmpty || timeline.every((p) => p.calls == 0))
                  Padding(padding: const EdgeInsets.symmetric(vertical: 36), child: Center(child: Text('No calls in this period', style: TextStyle(color: Surf.subtext(context)))))
                else
                  MiniLineChart(labels: timeline.map((p) => p.label).toList(), series: [LineSeries('Calls', timeline.map((p) => p.calls).toList(), AppColors.tealCyan)], fill: true),
              ]),
            ),
            ReportCard(
              title: 'Call outcome',
              child: DonutWithLegend(slices: [
                DonutSlice('Answered', stats.answered, const Color(0xFF34D399)),
                DonutSlice('No Answer', stats.noAnswer, const Color(0xFFFBBF24)),
                DonutSlice('Closed', stats.closed, const Color(0xFFFB7185)),
              ]),
            ),
            ReportCard(
              title: 'Dial type',
              child: DonutWithLegend(slices: [
                DonutSlice('Incoming', stats.incoming, AppColors.tealCyan),
                DonutSlice('Outgoing', stats.outgoing, AppColors.neonLimeDark),
              ]),
            ),
          ]),
        );
      },
    );
  }

  // ───────────────────────── Calls log ─────────────────────────

  Color _bucketColor(String b) => b == 'no_answer' ? AppColors.amber : (b == 'closed' ? AppColors.alertRed : AppColors.accent);
  String _bucketLabel(String b) => b == 'no_answer' ? 'No Answer' : (b == 'closed' ? 'Closed' : 'Answer');

  Future<void> _addNote(AnalyticsCall c) async {
    if (c.leadId == null) return;
    final ctrl = TextEditingController();
    final text = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Note for ${c.leadName ?? 'lead'}'),
        content: TextField(controller: ctrl, maxLines: 4, maxLength: 500, autofocus: true, decoration: const InputDecoration(hintText: 'What happened on this call?')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, ctrl.text), child: const Text('Save note')),
        ],
      ),
    );
    ctrl.dispose();
    if (text == null || text.trim().isEmpty) return;
    try {
      await _svc.createNote(leadId: c.leadId!, callId: c.id, body: text);
      if (mounted) showInfo(context, 'Note saved');
    } catch (e) {
      if (mounted) showInfo(context, ReportsService.friendlyError(e));
    }
  }

  Widget _callsView(BuildContext context) {
    final p = _calls;
    final total = p?.total ?? 0;
    final pages = total == 0 ? 1 : (total / _pageSize).ceil();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      AppSearchField(
        hint: 'Search lead, mobile or agent',
        controller: _searchCtl,
        onChanged: (v) {
          _searchTimer?.cancel();
          _searchTimer = Timer(const Duration(milliseconds: 400), () {
            if (!mounted || v.trim() == _search) return;
            setState(() {
              _search = v.trim();
              _page = 1;
            });
            _loadCalls();
          });
        },
      ),
      const SizedBox(height: 8),
      Row(children: [
        Expanded(
          child: FilterField(
            label: 'Sort by',
            value: _sorts[_sort] ?? _sort,
            active: _sort != 'at',
            onTap: () async {
              final v = await pickOption(context, title: 'Sort by', options: [for (final e in _sorts.entries) (value: e.key, label: e.value)], selected: _sort);
              if (v == null || v.isEmpty) return;
              setState(() {
                _sort = v;
                _page = 1;
              });
              _loadCalls();
            },
          ),
        ),
        IconButton(
          tooltip: _dir == 'asc' ? 'Ascending' : 'Descending',
          constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
          onPressed: () {
            setState(() {
              _dir = _dir == 'asc' ? 'desc' : 'asc';
              _page = 1;
            });
            _loadCalls();
          },
          icon: Icon(_dir == 'asc' ? LucideIcons.arrowUp : LucideIcons.arrowDown, size: 18),
        ),
      ]),
      const SizedBox(height: 10),
      Row(children: [
        Expanded(child: Text('Calls log', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: Surf.text(context)))),
        Text('${fmtInt(total)} calls', style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
      ]),
      const SizedBox(height: 8),
      AsyncBody(
        loading: _callsLoading && p == null,
        error: p == null ? _callsError : null,
        empty: p != null && p.rows.isEmpty && !_callsLoading,
        emptyTitle: 'No calls found',
        emptyMessage: 'Nothing matches the current filters or search.',
        onRetry: _loadCalls,
        builder: (_) => Opacity(
          opacity: _callsLoading ? 0.6 : 1,
          child: Column(children: [
            for (final c in p!.rows) _callCard(context, c),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              IconButton(
                tooltip: 'Previous page',
                constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                onPressed: _page > 1 && !_callsLoading
                    ? () {
                        setState(() => _page--);
                        _loadCalls();
                      }
                    : null,
                icon: const Icon(LucideIcons.chevronLeft),
              ),
              Text('Page $_page of $pages', style: TextStyle(fontSize: 12.5, color: Surf.subtext(context), fontFeatures: kTabular)),
              IconButton(
                tooltip: 'Next page',
                constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                onPressed: _page < pages && !_callsLoading
                    ? () {
                        setState(() => _page++);
                        _loadCalls();
                      }
                    : null,
                icon: const Icon(LucideIcons.chevronRight),
              ),
            ]),
          ]),
        ),
      ),
    ]);
  }

  Widget _callCard(BuildContext context, AnalyticsCall c) {
    final incoming = c.direction == 'incoming';
    return PremiumCard(
      padding: const EdgeInsets.all(12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          InitialsAvatar(c.leadName ?? '?', size: 34),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(c.leadName ?? 'Unknown lead', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Surf.text(context))),
              Text(maskPhone(c.phone), style: TextStyle(fontSize: 12, color: Surf.subtext(context), fontFeatures: kTabular)),
              if (c.agentName != null) Text(c.agentName!, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: Surf.subtext(context))),
            ]),
          ),
          const SizedBox(width: 8),
          StatusPill(_bucketLabel(c.bucket), color: _bucketColor(c.bucket)),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Icon(incoming ? LucideIcons.phoneIncoming : LucideIcons.phoneOutgoing, size: 14, color: incoming ? AppColors.tealCyan : Surf.subtext(context)),
          const SizedBox(width: 5),
          Text(incoming ? 'Incoming' : 'Outgoing', style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
          const SizedBox(width: 10),
          Text(fmtMmSs(c.durationSeconds), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Surf.text(context), fontFeatures: kTabular)),
          const Spacer(),
          Text(fmtDateTime(c.createdAt), style: TextStyle(fontSize: 11.5, color: Surf.subtext(context))),
        ]),
        if (c.leadId != null)
          Wrap(spacing: 8, children: [
            TextButton.icon(
              style: TextButton.styleFrom(minimumSize: const Size(48, 44)),
              onPressed: () => _addNote(c),
              icon: const Icon(LucideIcons.stickyNote, size: 15),
              label: const Text('Add note'),
            ),
            TextButton.icon(
              style: TextButton.styleFrom(minimumSize: const Size(48, 44)),
              onPressed: () => context.push('/leads/${c.leadId}'),
              icon: const Icon(LucideIcons.userRound, size: 15),
              label: const Text('Open lead'),
            ),
          ]),
      ]),
    );
  }

  // ───────────────────────── Assigned report ─────────────────────────

  Widget _teamChips() {
    final teams = _assigned?.teams ?? const <({String id, String name})>[];
    if (teams.isEmpty) return const SizedBox.shrink();
    final ids = ['', ...teams.map((t) => t.id)];
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: InlineChips<String>(
        options: ids,
        selected: _teamId,
        labelOf: (id) => id.isEmpty ? '#All Teams' : '#Team: ${teams.firstWhere((t) => t.id == id).name}',
        onSelected: (id) => setState(() => _teamId = id),
      ),
    );
  }

  Widget _assignedView(BuildContext context) {
    final rows = _visibleAgents()..sort((a, b) => _assignedDesc ? b.total.compareTo(a.total) : a.total.compareTo(b.total));
    final leads = rows.fold<int>(0, (n, r) => n + r.leadsAssigned);
    final from = rows.fold<int>(0, (n, r) => n + r.assignFrom);
    final total = rows.fold<int>(0, (n, r) => n + r.total);
    final accent = Surf.accent(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SectionHeader(
        title: 'Assigned report',
        subtitle: 'Leads currently owned, leads received by reassignment, and the total volume per agent.',
        trailing: TextButton.icon(
          style: TextButton.styleFrom(minimumSize: const Size(48, 44)),
          onPressed: () => setState(() => _assignedDesc = !_assignedDesc),
          icon: Icon(_assignedDesc ? LucideIcons.arrowDown : LucideIcons.arrowUp, size: 15),
          label: const Text('Total'),
        ),
      ),
      const SizedBox(height: 10),
      _teamChips(),
      AsyncBody(
        loading: _assignedLoading && _assigned == null,
        error: _assigned == null ? _assignedError : null,
        empty: rows.isEmpty,
        emptyTitle: 'No assigned leads',
        emptyMessage: 'No assigned leads match these filters.',
        onRetry: _loadAssigned,
        builder: (_) => Opacity(
          opacity: _assignedLoading ? 0.6 : 1,
          child: Column(children: [
            for (final r in rows)
              PremiumCard(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    InitialsAvatar(r.agentName, size: 34),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(r.agentName, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Surf.text(context))),
                        Text(r.teamName, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: Surf.subtext(context))),
                      ]),
                    ),
                  ]),
                  const SizedBox(height: 12),
                  Row(children: [
                    Expanded(child: MiniStat(label: 'Leads assigned', value: fmtInt(r.leadsAssigned))),
                    Expanded(child: MiniStat(label: 'Assign from', value: fmtInt(r.assignFrom))),
                    Expanded(
                      child: Center(
                        child: CountChip(
                          label: 'Total',
                          count: r.total,
                          color: accent,
                          onTap: widget.onOpenLeads == null ? null : () => widget.onOpenLeads!(agentName: r.agentName),
                        ),
                      ),
                    ),
                  ]),
                ]),
              ),
            PremiumCard(
              tint: accent.withAlpha(Surf.dark(context) ? 28 : 22),
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Total Accounts (${rows.length})', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Surf.text(context))),
                const SizedBox(height: 10),
                Row(children: [
                  Expanded(child: MiniStat(label: 'Leads assigned', value: fmtInt(leads))),
                  Expanded(child: MiniStat(label: 'Assign from', value: fmtInt(from))),
                  Expanded(child: MiniStat(label: 'Total volume', value: fmtInt(total), color: accent)),
                ]),
              ]),
            ),
          ]),
        ),
      ),
    ]);
  }

  // ───────────────────────── Funnel matrix ─────────────────────────

  Color _stageColor(BuildContext context, String s) => AppColors.getStatusColors(s, isDark: Surf.dark(context)).text;

  Widget _funnelView(BuildContext context) {
    final rows = _visibleAgents();
    final stages = _stageColumns(rows);
    int stageTotal(String s) => rows.fold<int>(0, (n, r) => n + (r.allStages[s] ?? 0));
    final totalCalls = rows.fold<int>(0, (n, r) => n + r.calls);
    final totalLeads = rows.fold<int>(0, (n, r) => n + r.total);
    final accent = Surf.accent(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SectionHeader(title: 'Sales pipeline funnel', subtitle: "Total calls and leads per agent across every pipeline stage (the lead's current stage)."),
      const SizedBox(height: 10),
      _teamChips(),
      AsyncBody(
        loading: _assignedLoading && _assigned == null,
        error: _assigned == null ? _assignedError : null,
        empty: rows.isEmpty,
        emptyTitle: 'No leads',
        emptyMessage: 'No leads match these filters.',
        onRetry: _loadAssigned,
        builder: (_) => Opacity(
          opacity: _assignedLoading ? 0.6 : 1,
          child: Column(children: [
            for (final r in rows)
              PremiumCard(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    InitialsAvatar(r.agentName, size: 34),
                    const SizedBox(width: 10),
                    Expanded(child: Text(r.agentName, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Surf.text(context)))),
                  ]),
                  const SizedBox(height: 12),
                  Row(children: [
                    Expanded(child: MiniStat(label: 'Total calls', value: fmtInt(r.calls), color: AppColors.tealCyan)),
                    Expanded(
                      child: Center(
                        child: CountChip(label: 'Total leads', count: r.total, color: accent, onTap: widget.onOpenLeads == null ? null : () => widget.onOpenLeads!(agentName: r.agentName)),
                      ),
                    ),
                  ]),
                  if (stages.any((s) => (r.allStages[s] ?? 0) > 0)) ...[
                    const SizedBox(height: 10),
                    Wrap(spacing: 6, runSpacing: 2, children: [
                      for (final s in stages)
                        if ((r.allStages[s] ?? 0) > 0)
                          CountChip(
                            label: s,
                            count: r.allStages[s] ?? 0,
                            color: _stageColor(context, s),
                            onTap: widget.onOpenLeads == null ? null : () => widget.onOpenLeads!(agentName: r.agentName, stage: s),
                          ),
                    ]),
                  ],
                ]),
              ),
            PremiumCard(
              tint: accent.withAlpha(Surf.dark(context) ? 28 : 22),
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Total Accounts (${rows.length})', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Surf.text(context))),
                const SizedBox(height: 10),
                Row(children: [
                  Expanded(child: MiniStat(label: 'Total calls', value: fmtInt(totalCalls), color: AppColors.tealCyan)),
                  Expanded(child: MiniStat(label: 'Total leads', value: fmtInt(totalLeads), color: accent)),
                ]),
                const SizedBox(height: 10),
                Wrap(spacing: 6, runSpacing: 2, children: [
                  for (final s in stages)
                    if (stageTotal(s) > 0)
                      CountChip(
                        label: s,
                        count: stageTotal(s),
                        color: _stageColor(context, s),
                        onTap: widget.onOpenLeads == null ? null : () => widget.onOpenLeads!(stage: s),
                      ),
                ]),
              ]),
            ),
          ]),
        ),
      ),
    ]);
  }

  // ───────────────────────── Filter sheet ─────────────────────────

  Future<void> _openFilters() async {
    var draft = _filters;
    final applied = await showPremiumSheet<bool>(context, builder: (ctx) {
      return StatefulBuilder(builder: (ctx, setSheet) {
        void upd(AnalyticsFilters f) => setSheet(() => draft = f);
        final sources = [(value: '', label: 'All sources'), for (final s in _options.sources) (value: s, label: s)];
        final channels = [(value: '', label: 'All channels'), for (final s in _options.channels) (value: s, label: s)];
        final agents = [(value: '', label: 'Anyone'), for (final a in _options.agents) (value: a.id, label: a.name)];
        String nameIn(List<({String value, String label})> o, String v, String none) => v.isEmpty ? none : (o.where((e) => e.value == v).map((e) => e.label).firstOrNull ?? v);
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Advanced filters', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Surf.text(ctx))),
            const SizedBox(height: 12),
            _rangeGroup('Assign Date', draft.assignFrom, draft.assignTo, (f, t) => upd(draft.copyWith(assignFrom: f, assignTo: t))),
            _rangeGroup('Action Date', draft.actionFrom, draft.actionTo, (f, t) => upd(draft.copyWith(actionFrom: f, actionTo: t))),
            _rangeGroup('Creation Date', draft.createdFrom, draft.createdTo, (f, t) => upd(draft.copyWith(createdFrom: f, createdTo: t))),
            FilterField(
              label: 'Source / broker',
              value: nameIn(sources, draft.source, 'All sources'),
              active: draft.source.isNotEmpty,
              onTap: () async {
                final v = await pickOption(ctx, title: 'Source', options: sources, selected: draft.source, searchable: true);
                if (v != null) upd(draft.copyWith(source: v));
              },
            ),
            const SizedBox(height: 8),
            FilterField(
              label: 'Call channel',
              value: nameIn(channels, draft.channel, 'All channels'),
              active: draft.channel.isNotEmpty,
              onTap: () async {
                final v = await pickOption(ctx, title: 'Channel', options: channels, selected: draft.channel);
                if (v != null) upd(draft.copyWith(channel: v));
              },
            ),
            const SizedBox(height: 12),
            Text('Is Cold Call', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Surf.subtext(ctx))),
            const SizedBox(height: 6),
            InlineChips<String>(options: const ['', 'yes', 'no'], selected: draft.isCold, labelOf: (v) => v.isEmpty ? 'Any' : (v == 'yes' ? 'Yes' : 'No'), onSelected: (v) => upd(draft.copyWith(isCold: v))),
            const SizedBox(height: 12),
            FilterField(
              label: 'Created by',
              value: nameIn(agents, draft.createdBy, 'Anyone'),
              active: draft.createdBy.isNotEmpty,
              onTap: () async {
                final v = await pickOption(ctx, title: 'Created by', options: agents, selected: draft.createdBy, searchable: true);
                if (v != null) upd(draft.copyWith(createdBy: v));
              },
            ),
            const SizedBox(height: 18),
            Row(children: [
              Expanded(child: OutlinedButton(style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)), onPressed: () => upd(const AnalyticsFilters()), child: const Text('Reset'))),
              const SizedBox(width: 10),
              Expanded(child: FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)), onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Apply'))),
            ]),
          ]),
        );
      });
    });
    if (applied == true) _applyFilters(draft);
  }

  Widget _rangeGroup(String label, String from, String to, void Function(String from, String to) onChange) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Surf.subtext(context))),
        const SizedBox(height: 6),
        DateFieldButton(label: 'From', value: from, onChanged: (v) => onChange(v, to)),
        const SizedBox(height: 6),
        DateFieldButton(label: 'To', value: to, onChanged: (v) => onChange(from, v)),
      ]),
    );
  }
}
