import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/follow_up_model.dart';
import '../../data/services/workspace_service.dart';
import '../../state/auth_provider.dart';
import '../leads/lead_detail_screen.dart';
import '../projects/projects_common.dart';

enum _Tab { all, today, late, tomorrow, uncompleted, custom }

const _tabLabels = {
  _Tab.all: 'All',
  _Tab.today: 'Today',
  _Tab.late: 'Late',
  _Tab.tomorrow: 'Tomorrow',
  _Tab.uncompleted: 'Uncompleted',
};

/// Workspace = the follow-up work list: quick tabs (All / Today / Late /
/// Tomorrow / Uncompleted), an advanced filter sheet (date, agent, status,
/// priority), live-ish refresh and one-tap done / pending.
///
/// Visibility follows the app's existing follow-up isolation (admins see all,
/// team leaders their team, agents their own). Sales roles open on "Today".
class WorkspaceScreen extends StatefulWidget {
  final bool showAppBar;
  const WorkspaceScreen({super.key, this.showAppBar = false});

  @override
  State<WorkspaceScreen> createState() => _WorkspaceScreenState();
}

class _WorkspaceScreenState extends State<WorkspaceScreen> {
  final _service = WorkspaceService();
  List<FollowUpModel> _all = [];
  bool _loading = true;
  String? _error;
  _Tab _tab = _Tab.all;
  WorkspaceFilters _filters = WorkspaceFilters.all;
  String? _toggling;
  Timer? _poll;
  bool _initialised = false;

  static bool _isSalesRole(String role) {
    final r = role.toLowerCase().trim().replaceAll(RegExp(r'[\s-]+'), '_');
    return r == 'agent' || r == 'senior_agent' || r == 'telecaller' || r == 'sales';
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    final role = context.read<AuthProvider>().profile?.role ?? '';
    if (_isSalesRole(role)) {
      _tab = _Tab.today;
      _filters = WorkspaceFilters.today;
    }
    _load();
    // Calm polling fallback (the web keeps this list live with realtime + polling).
    _poll = Timer.periodic(const Duration(seconds: 60), (_) {
      if (mounted && !_loading && _toggling == null) _load(silent: true);
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final list = await _service.fetchAll();
      if (!mounted) return;
      setState(() {
        _all = list;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        if (!silent || _all.isEmpty) _error = friendlyError(e);
      });
    }
  }

  void _applyTab(_Tab t) {
    setState(() {
      _tab = t;
      _filters = switch (t) {
        _Tab.today => WorkspaceFilters.today,
        _Tab.late => WorkspaceFilters.late,
        _Tab.tomorrow => WorkspaceFilters.tomorrow,
        _Tab.uncompleted => WorkspaceFilters.uncompleted,
        _ => WorkspaceFilters.all,
      };
    });
  }

  Future<void> _openFilters() async {
    final r = await showPremiumSheet<WorkspaceFilters?>(
      context,
      builder: (_) => _FilterSheet(initial: _filters, agents: WorkspaceService.agentsOf(_all)),
    );
    if (r == null || !mounted) return;
    setState(() {
      _tab = _Tab.custom;
      _filters = r;
    });
  }

  Future<void> _toggle(FollowUpModel item) async {
    if (_toggling != null || item.isCancelled) return;
    setState(() => _toggling = item.id);
    try {
      await _service.setDone(item, !item.isCompleted);
      if (mounted) showModuleSnack(context, item.isCompleted ? 'Marked as pending' : 'Marked as completed');
      await _load(silent: true);
    } catch (_) {
      if (mounted) showModuleSnack(context, 'Could not update follow-up', error: true);
    } finally {
      if (mounted) setState(() => _toggling = null);
    }
  }

  void _openLead(FollowUpModel f) {
    final id = f.leadId;
    if (id == null || id.isEmpty) return;
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => LeadDetailScreen(leadId: id)));
  }

  ({String label, Color color}) _due(FollowUpModel f) {
    final now = DateTime.now();
    final today = WorkspaceService.dateStr(now);
    final tomorrow = WorkspaceService.dateStr(now.add(const Duration(days: 1)));
    final d = f.dueDate;
    String time = (f.dueTime ?? '').isNotEmpty ? ' · ${f.dueTime}' : '';
    if (d.isEmpty) return (label: 'No date', color: Surf.subtext(context));
    if (d.compareTo(today) < 0) return (label: 'Overdue · ${_short(d)}$time', color: AppColors.alertRed);
    if (d == today) return (label: 'Due today$time', color: AppColors.amber);
    if (d == tomorrow) return (label: 'Due tomorrow$time', color: const Color(0xFF2563EB));
    return (label: '${_short(d)}$time', color: Surf.subtext(context));
  }

  String _short(String ymd) {
    final dt = DateTime.tryParse(ymd);
    return dt == null ? ymd : DateFormat('d MMM yyyy').format(dt);
  }

  Color _priorityColor(String p) {
    switch (p) {
      case 'High':
        return AppColors.alertRed;
      case 'Medium':
        return AppColors.amber;
      default:
        return Surf.subtext(context);
    }
  }

  Color _statusColor(FollowUpModel f) {
    if (f.isCompleted) return const Color(0xFF16A34A);
    if (f.isCancelled) return const Color(0xFF64748B);
    return const Color(0xFF2563EB);
  }

  Widget _card(FollowUpModel f) {
    final due = _due(f);
    final name = f.contactName.isNotEmpty && f.contactName != 'Contact' ? f.contactName : (f.title.isNotEmpty ? f.title : 'Unnamed');
    final busy = _toggling == f.id;
    final canOpen = (f.leadId ?? '').isNotEmpty;
    final canToggle = !f.isCancelled && !(f.id.startsWith('lead-') && f.isCompleted);
    return PremiumCard(
      padding: const EdgeInsets.fromLTRB(16, 12, 6, 12),
      onTap: canOpen ? () => _openLead(f) : null,
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: Surf.text(context),
                  decoration: f.isCompleted ? TextDecoration.lineThrough : null,
                  decorationColor: Surf.subtext(context),
                )),
            if ((f.propertyInterest ?? '').isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(f.propertyInterest!,
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
              ),
            if (f.title.isNotEmpty && f.title != name && f.title != 'Follow up: $name')
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(f.title,
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
              ),
            const SizedBox(height: 8),
            Wrap(spacing: 6, runSpacing: 6, children: [
              StatusPill(due.label, color: due.color, icon: LucideIcons.calendarClock),
              StatusPill(f.status, color: _statusColor(f)),
              StatusPill(f.priority, color: _priorityColor(f.priority)),
            ]),
          ]),
        ),
        SizedBox(
          width: 56,
          height: 56,
          child: busy
              ? const Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.2)))
              : IconButton(
                  tooltip: f.isCompleted ? 'Mark as not done' : (f.isCancelled ? 'Cancelled' : 'Mark as completed'),
                  onPressed: canToggle ? () => _toggle(f) : null,
                  icon: f.isCompleted
                      ? Container(
                          width: 28,
                          height: 28,
                          decoration: const BoxDecoration(color: Color(0xFF16A34A), shape: BoxShape.circle),
                          child: const Icon(LucideIcons.check, size: 16, color: Colors.white),
                        )
                      : Icon(f.isCancelled ? LucideIcons.circleX : LucideIcons.circle,
                          size: 26, color: Surf.subtext(context)),
                ),
        ),
      ]),
    );
  }

  Widget _scrollable(Widget child) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [SizedBox(height: 380, child: child)],
      );

  @override
  Widget build(BuildContext context) {
    final list = WorkspaceService.apply(_all, _filters);
    final accent = Surf.accent(context);

    Widget body;
    if (_loading) {
      body = const SkeletonList(count: 6, height: 104);
    } else if (_error != null) {
      body = _scrollable(ErrorState(message: _error!, onRetry: _load));
    } else if (list.isEmpty) {
      body = _scrollable(const EmptyState(
        icon: LucideIcons.calendarClock,
        title: 'Nothing here',
        message: 'No follow-ups match these filters.',
      ));
    } else {
      body = ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
        itemCount: list.length,
        itemBuilder: (_, i) => _card(list[i]),
      );
    }

    return ModulePage(
      title: 'Workspace',
      showAppBar: widget.showAppBar,
      body: Column(children: [
        const SizedBox(height: 12),
        Row(children: [
          Expanded(
            child: SizedBox(
              height: 44,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.only(left: 16),
                children: [
                  for (final t in _tabLabels.entries) ...[
                    ChoiceChip(
                      label: Text(t.value),
                      selected: _tab == t.key,
                      showCheckmark: false,
                      materialTapTargetSize: MaterialTapTargetSize.padded,
                      onSelected: (_) => _applyTab(t.key),
                      labelStyle: TextStyle(
                          fontSize: 12.5, fontWeight: FontWeight.w700, color: _tab == t.key ? Colors.black : Surf.subtext(context)),
                      selectedColor: accent,
                      backgroundColor: Surf.muted(context),
                      side: BorderSide.none,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                    ),
                    const SizedBox(width: 8),
                  ],
                ],
              ),
            ),
          ),
          IconButton(
            tooltip: 'Filter',
            constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
            style: IconButton.styleFrom(backgroundColor: _tab == _Tab.custom ? accent : Surf.muted(context)),
            onPressed: _openFilters,
            icon: Icon(LucideIcons.funnel, size: 19, color: _tab == _Tab.custom ? Colors.black : Surf.subtext(context)),
          ),
          const SizedBox(width: 12),
        ]),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 8, 4),
          child: Row(children: [
            Expanded(
              child: Text(_loading ? 'Loading…' : '${list.length} follow-up${list.length == 1 ? '' : 's'}',
                  style: TextStyle(fontSize: 12.5, color: Surf.subtext(context), fontFeatures: tabularFigures)),
            ),
            TextButton.icon(
              style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
              onPressed: _loading ? null : () => _load(),
              icon: const Icon(LucideIcons.refreshCw, size: 14),
              label: const Text('Refresh'),
            ),
          ]),
        ),
        Expanded(child: RefreshIndicator(onRefresh: () => _load(silent: true), child: body)),
      ]),
    );
  }
}

class _FilterSheet extends StatefulWidget {
  final WorkspaceFilters initial;
  final List<String> agents;
  const _FilterSheet({required this.initial, required this.agents});

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late WorkspaceFilters _f = widget.initial;

  Widget _group<T>(String title, List<(T, String)> options, T value, ValueChanged<T> onChanged) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: Surf.subtext(context))),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final o in options)
            ChoiceChip(
              label: Text(o.$2),
              selected: value == o.$1,
              showCheckmark: false,
              materialTapTargetSize: MaterialTapTargetSize.padded,
              onSelected: (_) => onChanged(o.$1),
              labelStyle: TextStyle(
                  fontSize: 12.5, fontWeight: FontWeight.w700, color: value == o.$1 ? Colors.black : Surf.subtext(context)),
              selectedColor: Surf.accent(context),
              backgroundColor: Surf.muted(context),
              side: BorderSide.none,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
            ),
        ]),
      ]),
    );
  }

  Future<void> _pickDate(bool from) async {
    final cur = DateTime.tryParse(from ? _f.from : _f.to) ?? DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: cur,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 730)),
    );
    if (d == null || !mounted) return;
    final s = WorkspaceService.dateStr(d);
    setState(() => _f = from ? _f.copyWith(from: s) : _f.copyWith(to: s));
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Filter follow-ups', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Surf.text(context))),
        const SizedBox(height: 16),
        _group<WorkspaceDate>(
          'Due date',
          const [
            (WorkspaceDate.any, 'Any'),
            (WorkspaceDate.late, 'Late'),
            (WorkspaceDate.today, 'Today'),
            (WorkspaceDate.tomorrow, 'Tomorrow'),
            (WorkspaceDate.custom, 'Custom range'),
          ],
          _f.date,
          (v) => setState(() => _f = _f.copyWith(date: v)),
        ),
        if (_f.date == WorkspaceDate.custom)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  onPressed: () => _pickDate(true),
                  icon: const Icon(LucideIcons.calendar, size: 15),
                  label: Text(_f.from.isEmpty ? 'From' : _f.from),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  onPressed: () => _pickDate(false),
                  icon: const Icon(LucideIcons.calendar, size: 15),
                  label: Text(_f.to.isEmpty ? 'To' : _f.to),
                ),
              ),
            ]),
          ),
        if (widget.agents.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: PickerField(
              label: 'Agent',
              valueLabel: _f.agent.isEmpty ? 'Any' : _f.agent,
              onTap: () async {
                final r = await pickOption(context, title: 'Agent', selected: _f.agent, options: [
                  (value: '', label: 'Any'),
                  for (final a in widget.agents) (value: a, label: a),
                ]);
                if (r != null) setState(() => _f = _f.copyWith(agent: r.value));
              },
            ),
          ),
        _group<WorkspaceStatus>(
          'Status',
          const [
            (WorkspaceStatus.any, 'Any'),
            (WorkspaceStatus.notCompleted, 'Not completed'),
            (WorkspaceStatus.completed, 'Completed'),
          ],
          _f.status,
          (v) => setState(() => _f = _f.copyWith(status: v)),
        ),
        _group<String>(
          'Priority',
          const [('', 'Any'), ('High', 'High'), ('Medium', 'Medium'), ('Low', 'Low')],
          _f.priority,
          (v) => setState(() => _f = _f.copyWith(priority: v)),
        ),
        const SizedBox(height: 4),
        Row(children: [
          Expanded(
            child: OutlinedButton(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              onPressed: () => Navigator.pop(context, WorkspaceFilters.all),
              child: const Text('Reset'),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 2,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              onPressed: () => Navigator.pop(context, _f),
              icon: const Icon(LucideIcons.check, size: 17),
              label: const Text('Apply'),
            ),
          ),
        ]),
      ]),
    );
  }
}
