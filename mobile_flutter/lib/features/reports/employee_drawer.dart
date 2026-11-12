import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/reports_models.dart';
import '../../data/services/reports_service.dart';
import 'widgets/reports_widgets.dart';

/// Totals already shown on the report row (header pills).
class EmployeeSummary {
  final int calls;
  final int connected;
  final int noAnswer;
  final int statusUpdates;
  const EmployeeSummary({this.calls = 0, this.connected = 0, this.noAnswer = 0, this.statusUpdates = 0});
}

/// Employee drawer (bottom sheet) with Calls / Notes / Actions, like the web `EmployeeDrawer`.
Future<void> showEmployeeDrawer(
  BuildContext context, {
  required ReportsService service,
  required String employeeId,
  required String employeeName,
  required String from,
  required String to,
  required EmployeeSummary summary,
  required bool viewerIsAdmin,
  required bool viewerIsManager,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Surf.card(context),
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
      child: FractionallySizedBox(
        heightFactor: 0.94,
        child: EmployeeDrawerSheet(
          service: service,
          employeeId: employeeId,
          employeeName: employeeName,
          from: from,
          to: to,
          summary: summary,
          viewerIsAdmin: viewerIsAdmin,
          viewerIsManager: viewerIsManager,
        ),
      ),
    ),
  );
}

class EmployeeDrawerSheet extends StatefulWidget {
  final ReportsService service;
  final String employeeId;
  final String employeeName;
  final String from;
  final String to;
  final EmployeeSummary summary;
  final bool viewerIsAdmin;
  final bool viewerIsManager;

  const EmployeeDrawerSheet({
    super.key,
    required this.service,
    required this.employeeId,
    required this.employeeName,
    required this.from,
    required this.to,
    required this.summary,
    required this.viewerIsAdmin,
    required this.viewerIsManager,
  });

  @override
  State<EmployeeDrawerSheet> createState() => _EmployeeDrawerSheetState();
}

class _EmployeeDrawerSheetState extends State<EmployeeDrawerSheet> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 3, vsync: this);
  late final String _me = widget.service.currentUserId;

  // calls
  final List<EmpCall> _calls = [];
  String? _cursor;
  bool _callsLoading = true;
  bool _callsMore = false;
  String? _callsError;
  CallResult? _resultFilter;
  String _dayFilter = '';
  int _callsSeq = 0;

  // notes
  List<EmpNote> _notes = [];
  bool _notesLoading = true;
  String? _notesError;

  // actions
  EmpActions _actions = const EmpActions([], []);
  bool _actionsLoading = true;
  String? _actionsError;

  String _linkedCallId = '';
  String? _banner;
  bool _bannerError = false;
  Timer? _bannerTimer;

  @override
  void initState() {
    super.initState();
    _tabs.addListener(() {
      if (!_tabs.indexIsChanging) setState(() {});
    });
    _loadCalls(reset: true);
    _loadNotes();
    _loadActions();
  }

  @override
  void dispose() {
    _bannerTimer?.cancel();
    _tabs.dispose();
    super.dispose();
  }

  void _notify(String msg, {bool error = false}) {
    if (!mounted) return;
    _bannerTimer?.cancel();
    setState(() {
      _banner = msg;
      _bannerError = error;
    });
    _bannerTimer = Timer(const Duration(seconds: 3), () {
      if (mounted) setState(() => _banner = null);
    });
  }

  Future<void> _loadCalls({required bool reset}) async {
    final seq = ++_callsSeq;
    setState(() {
      if (reset) {
        _callsLoading = true;
      } else {
        _callsMore = true;
      }
      _callsError = null;
    });
    try {
      final page = await widget.service.employeeCalls(
        widget.employeeId,
        widget.from,
        widget.to,
        result: _resultFilter,
        dayFilter: _dayFilter.isEmpty ? null : _dayFilter,
        cursor: reset ? null : _cursor,
      );
      if (!mounted || seq != _callsSeq) return;
      setState(() {
        if (reset) _calls.clear();
        _calls.addAll(page.calls);
        _cursor = page.nextCursor;
      });
    } catch (e) {
      if (mounted && seq == _callsSeq) setState(() => _callsError = ReportsService.friendlyError(e));
    } finally {
      if (mounted && seq == _callsSeq) {
        setState(() {
          _callsLoading = false;
          _callsMore = false;
        });
      }
    }
  }

  Future<void> _loadNotes() async {
    setState(() {
      _notesLoading = true;
      _notesError = null;
    });
    try {
      final n = await widget.service.employeeNotes(widget.employeeId, widget.from, widget.to);
      if (mounted) setState(() => _notes = n);
    } catch (e) {
      if (mounted) setState(() => _notesError = ReportsService.friendlyError(e));
    } finally {
      if (mounted) setState(() => _notesLoading = false);
    }
  }

  Future<void> _loadActions({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _actionsLoading = true;
        _actionsError = null;
      });
    }
    try {
      final a = await widget.service.employeeActions(widget.employeeId, widget.from, widget.to);
      if (mounted) setState(() => _actions = a);
    } catch (e) {
      if (mounted) setState(() => _actionsError = ReportsService.friendlyError(e));
    } finally {
      if (mounted) setState(() => _actionsLoading = false);
    }
  }

  void _startNote(EmpCall c) {
    setState(() => _linkedCallId = c.id);
    _tabs.animateTo(1);
  }

  void _startAction(EmpCall c) {
    setState(() => _linkedCallId = c.id);
    _tabs.animateTo(2);
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.summary;
    final counts = [s.calls, _notes.length, _actions.upcoming.length + _actions.history.length];
    const labels = ['Calls', 'Notes', 'Actions'];
    return Column(children: [
      const SizedBox(height: 10),
      Container(width: 40, height: 4, decoration: BoxDecoration(color: Surf.border(context), borderRadius: BorderRadius.circular(4))),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 0),
        child: Row(children: [
          InitialsAvatar(widget.employeeName, size: 42),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(widget.employeeName, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Surf.text(context))),
              Text('${widget.from} → ${widget.to}', style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
            ]),
          ),
          IconButton(
            tooltip: 'Close',
            constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(LucideIcons.x),
          ),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        child: Align(
          alignment: Alignment.centerLeft,
          child: Wrap(spacing: 6, runSpacing: 6, children: [
            StatusPill('Calls ${s.calls}', color: Surf.subtext(context)),
            StatusPill('Connected ${s.connected}', color: AppColors.accent),
            StatusPill('No answer ${s.noAnswer}', color: Surf.subtext(context)),
            StatusPill('Status updates ${s.statusUpdates}', color: Surf.accent(context)),
          ]),
        ),
      ),
      if (_banner != null)
        Container(
          width: double.infinity,
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: (_bannerError ? AppColors.alertRed : AppColors.accent).withAlpha(36),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(_banner!, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: _bannerError ? AppColors.alertRed : Surf.text(context))),
        ),
      TabBar(
        controller: _tabs,
        labelColor: Surf.text(context),
        unselectedLabelColor: Surf.subtext(context),
        indicatorColor: Surf.accent(context),
        dividerColor: Surf.border(context),
        tabs: [
          for (var i = 0; i < 3; i++)
            Tab(
              height: 48,
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text(labels[i], style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(999)),
                  child: Text('${counts[i]}', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, fontFeatures: kTabular, color: Surf.subtext(context))),
                ),
              ]),
            ),
        ],
      ),
      Expanded(
        child: TabBarView(controller: _tabs, children: [
          _callsTab(context),
          _NotesTab(
            service: widget.service,
            notes: _notes,
            loading: _notesLoading,
            error: _notesError,
            calls: _calls,
            linkedCallId: _linkedCallId,
            onLink: (v) => setState(() => _linkedCallId = v),
            meId: _me,
            isAdmin: widget.viewerIsAdmin,
            onRetry: _loadNotes,
            onChanged: _loadNotes,
            notify: _notify,
          ),
          _ActionsTab(
            service: widget.service,
            data: _actions,
            loading: _actionsLoading,
            error: _actionsError,
            calls: _calls,
            linkedCallId: _linkedCallId,
            onLink: (v) => setState(() => _linkedCallId = v),
            isManager: widget.viewerIsManager,
            meId: _me,
            onRetry: _loadActions,
            onChanged: () => _loadActions(silent: true),
            notify: _notify,
          ),
        ]),
      ),
    ]);
  }

  // ───────────────────────── Calls tab ─────────────────────────

  Widget _callsTab(BuildContext context) {
    const results = <CallResult?>[null, CallResult.connected, CallResult.noAnswer, CallResult.incoming, CallResult.other];
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
      children: [
        InlineChips<CallResult?>(
          options: results,
          selected: _resultFilter,
          labelOf: (r) => r?.label ?? 'All results',
          onSelected: (r) {
            setState(() => _resultFilter = r);
            _loadCalls(reset: true);
          },
        ),
        const SizedBox(height: 8),
        DateFieldButton(
          label: 'Day',
          value: _dayFilter,
          firstDate: ReportsService.parseDay(widget.from),
          lastDate: ReportsService.parseDay(widget.to),
          onChanged: (v) {
            setState(() => _dayFilter = v);
            _loadCalls(reset: true);
          },
        ),
        const SizedBox(height: 12),
        if (_callsLoading)
          for (var i = 0; i < 4; i++)
            Container(height: 78, margin: const EdgeInsets.only(bottom: 10), decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(16)))
        else if (_callsError != null)
          ErrorState(message: _callsError!, onRetry: () => _loadCalls(reset: true))
        else if (_calls.isEmpty)
          const EmptyState(icon: LucideIcons.phoneOff, title: 'No calls in this period')
        else ...[
          for (final c in _calls) _callCard(context, c),
          if (_cursor != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: OutlinedButton(
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                onPressed: _callsMore ? null : () => _loadCalls(reset: false),
                child: _callsMore ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Load more'),
              ),
            ),
        ],
      ],
    );
  }

  Widget _callCard(BuildContext context, EmpCall c) {
    final color = switch (c.result) {
      CallResult.connected => AppColors.accent,
      CallResult.incoming => AppColors.tealCyan,
      CallResult.other => AppColors.amber,
      CallResult.noAnswer => Surf.subtext(context),
    };
    return PremiumCard(
      padding: const EdgeInsets.all(12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(c.incoming ? LucideIcons.phoneIncoming : LucideIcons.phoneOutgoing, size: 16, color: c.incoming ? AppColors.tealCyan : Surf.subtext(context)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(c.leadName ?? 'Unknown lead', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Surf.text(context))),
              const SizedBox(height: 2),
              Text(
                [if (c.phone != null && c.phone!.isNotEmpty) c.phone!, fmtDateTime(c.createdAt)].join('  ·  '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12, color: Surf.subtext(context)),
              ),
            ]),
          ),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            StatusPill(c.result.label, color: color),
            const SizedBox(height: 4),
            Text(fmtDuration(c.durationSeconds), style: TextStyle(fontSize: 12, color: Surf.subtext(context), fontFeatures: kTabular)),
          ]),
        ]),
        if (c.leadId != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Wrap(spacing: 8, children: [
              TextButton.icon(
                style: TextButton.styleFrom(minimumSize: const Size(48, 44)),
                onPressed: () => _startNote(c),
                icon: const Icon(LucideIcons.stickyNote, size: 15),
                label: const Text('Add note'),
              ),
              TextButton.icon(
                style: TextButton.styleFrom(minimumSize: const Size(48, 44)),
                onPressed: () => _startAction(c),
                icon: const Icon(LucideIcons.listPlus, size: 15),
                label: const Text('Add action'),
              ),
            ]),
          ),
      ]),
    );
  }
}

String _callLabel(EmpCall c) => '${c.leadName ?? c.phone ?? 'Unknown lead'} · ${fmtDateTime(c.createdAt)} · ${fmtDuration(c.durationSeconds)}';

List<({String value, String label})> _callOptions(List<EmpCall> calls) =>
    [for (final c in calls.where((c) => c.leadId != null)) (value: c.id, label: _callLabel(c))];

Future<String?> _pickCall(BuildContext context, List<EmpCall> calls, String selected) =>
    pickOption(context, title: 'Link to a call', options: _callOptions(calls), selected: selected, searchable: true);

// ───────────────────────── Notes tab ─────────────────────────

class _NotesTab extends StatefulWidget {
  final ReportsService service;
  final List<EmpNote> notes;
  final bool loading;
  final String? error;
  final List<EmpCall> calls;
  final String linkedCallId;
  final ValueChanged<String> onLink;
  final String meId;
  final bool isAdmin;
  final VoidCallback onRetry;
  final VoidCallback onChanged;
  final void Function(String, {bool error}) notify;

  const _NotesTab({
    required this.service,
    required this.notes,
    required this.loading,
    required this.error,
    required this.calls,
    required this.linkedCallId,
    required this.onLink,
    required this.meId,
    required this.isAdmin,
    required this.onRetry,
    required this.onChanged,
    required this.notify,
  });

  @override
  State<_NotesTab> createState() => _NotesTabState();
}

class _NotesTabState extends State<_NotesTab> {
  static const int _max = 500;
  static const Duration _window = Duration(minutes: 15);
  final TextEditingController _body = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  bool _canChange(EmpNote n) =>
      widget.isAdmin || (n.authorId == widget.meId && n.createdAt != null && DateTime.now().difference(n.createdAt!) <= _window);

  EmpCall? get _linked {
    for (final c in widget.calls) {
      if (c.id == widget.linkedCallId) return c;
    }
    return null;
  }

  Future<void> _save() async {
    final text = _body.text.trim();
    final call = _linked;
    if (text.isEmpty || _saving) return;
    if (call == null || call.leadId == null) {
      widget.notify('Choose the call this note is about.', error: true);
      return;
    }
    setState(() => _saving = true);
    try {
      await widget.service.createNote(leadId: call.leadId!, callId: call.id, body: text);
      _body.clear();
      widget.notify('Note saved');
      widget.onChanged();
    } catch (e) {
      widget.notify(ReportsService.friendlyError(e), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _edit(EmpNote n) async {
    final ctrl = TextEditingController(text: n.body);
    final saved = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit note'),
        content: TextField(controller: ctrl, maxLines: 4, maxLength: _max, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, ctrl.text), child: const Text('Save')),
        ],
      ),
    );
    ctrl.dispose();
    if (saved == null || saved.trim().isEmpty || saved.trim() == n.body) return;
    try {
      await widget.service.updateNote(n.id, saved);
      widget.notify('Note updated');
      widget.onChanged();
    } catch (e) {
      widget.notify(ReportsService.friendlyError(e), error: true);
    }
  }

  Future<void> _delete(EmpNote n) async {
    final ok = await confirmAction(context, title: 'Delete note?', message: 'This cannot be undone.', confirmLabel: 'Delete', destructive: true);
    if (!ok) return;
    try {
      await widget.service.deleteNote(n.id);
      widget.notify('Note deleted');
      widget.onChanged();
    } catch (e) {
      widget.notify(ReportsService.friendlyError(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final linked = _linked;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
      children: [
        PremiumCard(
          padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            FilterField(
              label: 'Link to a call',
              value: linked != null ? _callLabel(linked) : (widget.calls.any((c) => c.leadId != null) ? 'Choose the call this is about' : 'No calls in this period'),
              active: linked != null,
              onTap: () async {
                final v = await _pickCall(context, widget.calls, widget.linkedCallId);
                if (v != null) widget.onLink(v);
              },
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _body,
              minLines: 3,
              maxLines: 5,
              maxLength: _max,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(hintText: 'What happened on this call?', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 4),
            FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              onPressed: (_saving || _body.text.trim().isEmpty) ? null : _save,
              icon: _saving ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(LucideIcons.save, size: 16),
              label: const Text('Save note'),
            ),
          ]),
        ),
        const SizedBox(height: 8),
        if (widget.loading)
          for (var i = 0; i < 3; i++)
            Container(height: 84, margin: const EdgeInsets.only(bottom: 10), decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(16)))
        else if (widget.error != null)
          ErrorState(message: widget.error!, onRetry: widget.onRetry)
        else if (widget.notes.isEmpty)
          const EmptyState(icon: LucideIcons.stickyNote, title: 'No notes in this period')
        else
          for (final n in widget.notes)
            PremiumCard(
              padding: const EdgeInsets.fromLTRB(14, 12, 4, 12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(
                    child: Text(n.leadName ?? 'Lead', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Surf.text(context))),
                  ),
                  if (_canChange(n))
                    PopupMenuButton<String>(
                      tooltip: 'Note actions',
                      constraints: const BoxConstraints(minWidth: 140),
                      onSelected: (v) => v == 'edit' ? _edit(n) : _delete(n),
                      itemBuilder: (_) => const [
                        PopupMenuItem(value: 'edit', height: 48, child: Text('Edit')),
                        PopupMenuItem(value: 'delete', height: 48, child: Text('Delete')),
                      ],
                    ),
                ]),
                Padding(
                  padding: const EdgeInsets.only(right: 10),
                  child: Text(n.body, style: TextStyle(fontSize: 13.5, height: 1.4, color: Surf.text(context))),
                ),
                const SizedBox(height: 6),
                Text('${n.authorName} · ${fmtDateTime(n.createdAt)}${n.edited ? ' · edited' : ''}', style: TextStyle(fontSize: 11.5, color: Surf.subtext(context))),
              ]),
            ),
      ],
    );
  }
}

// ───────────────────────── Actions tab ─────────────────────────

class _ActionsTab extends StatefulWidget {
  final ReportsService service;
  final EmpActions data;
  final bool loading;
  final String? error;
  final List<EmpCall> calls;
  final String linkedCallId;
  final ValueChanged<String> onLink;
  final bool isManager;
  final String meId;
  final VoidCallback onRetry;
  final VoidCallback onChanged;
  final void Function(String, {bool error}) notify;

  const _ActionsTab({
    required this.service,
    required this.data,
    required this.loading,
    required this.error,
    required this.calls,
    required this.linkedCallId,
    required this.onLink,
    required this.isManager,
    required this.meId,
    required this.onRetry,
    required this.onChanged,
    required this.notify,
  });

  @override
  State<_ActionsTab> createState() => _ActionsTabState();
}

class _ActionsTabState extends State<_ActionsTab> {
  String _type = 'follow_up_call';
  String _status = '';
  DateTime? _due;
  String _assignee = '';
  final TextEditingController _note = TextEditingController();
  bool _saving = false;
  final Set<String> _busy = {};
  List<({String id, String name})> _users = [];

  @override
  void initState() {
    super.initState();
    if (widget.isManager) {
      widget.service.assignableUsers().then((u) {
        if (mounted) setState(() => _users = u);
      });
    }
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  EmpCall? get _linked {
    for (final c in widget.calls) {
      if (c.id == widget.linkedCallId) return c;
    }
    return null;
  }

  Future<void> _pickDue() async {
    final now = DateTime.now();
    final d = await showDatePicker(context: context, initialDate: _due ?? now, firstDate: DateTime(now.year - 1), lastDate: DateTime(now.year + 2));
    if (d == null || !mounted) return;
    final t = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(_due ?? now));
    if (!mounted) return;
    setState(() => _due = DateTime(d.year, d.month, d.day, t?.hour ?? 9, t?.minute ?? 0));
  }

  Future<void> _save() async {
    final call = _linked;
    if (_saving) return;
    if (call == null || call.leadId == null) {
      widget.notify('Choose the call this action is about.', error: true);
      return;
    }
    if (_type == 'status_update' && _status.isEmpty) {
      widget.notify('Pick the new status.', error: true);
      return;
    }
    setState(() => _saving = true);
    try {
      await widget.service.createAction(
        leadId: call.leadId!,
        callId: call.id,
        type: _type,
        status: _type == 'status_update' ? _status : null,
        note: _note.text,
        dueAt: _due,
        assigneeId: widget.isManager && _assignee.isNotEmpty ? _assignee : null,
      );
      _note.clear();
      setState(() {
        _due = null;
        _status = '';
      });
      widget.notify('Action added');
      widget.onChanged();
    } catch (e) {
      widget.notify(ReportsService.friendlyError(e), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _toggle(EmpAction a) async {
    if (_busy.contains(a.id)) return;
    setState(() => _busy.add(a.id));
    try {
      await widget.service.setActionDone(a.id, true);
      widget.notify('Marked as done');
      widget.onChanged();
    } catch (e) {
      widget.notify(ReportsService.friendlyError(e), error: true);
    } finally {
      if (mounted) setState(() => _busy.remove(a.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final linked = _linked;
    final accent = Surf.accent(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
      children: [
        PremiumCard(
          padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            FilterField(
              label: 'Link to a call',
              value: linked != null ? _callLabel(linked) : (widget.calls.any((c) => c.leadId != null) ? 'Choose the call this is about' : 'No calls in this period'),
              active: linked != null,
              onTap: () async {
                final v = await _pickCall(context, widget.calls, widget.linkedCallId);
                if (v != null) widget.onLink(v);
              },
            ),
            const SizedBox(height: 8),
            FilterField(
              label: 'Action type',
              value: ReportsService.actionTypes[_type] ?? _type,
              active: true,
              onTap: () async {
                final v = await pickOption(context,
                    title: 'Action type', options: [for (final e in ReportsService.actionTypes.entries) (value: e.key, label: e.value)], selected: _type);
                if (v != null && v.isNotEmpty) setState(() => _type = v);
              },
            ),
            if (_type == 'status_update') ...[
              const SizedBox(height: 8),
              FilterField(
                label: 'New status',
                value: _status.isEmpty ? 'Pick the new status' : _status,
                active: _status.isNotEmpty,
                onTap: () async {
                  final v = await pickOption(context,
                      title: 'New status', options: [for (final s in ReportsService.statusToCrm.keys) (value: s, label: s)], selected: _status);
                  if (v != null) setState(() => _status = v);
                },
              ),
            ],
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: FilterField(label: 'Due', value: _due == null ? 'No due date' : fmtDateTime(_due), active: _due != null, icon: LucideIcons.calendarClock, onTap: _pickDue)),
              if (_due != null)
                IconButton(
                  tooltip: 'Clear due date',
                  constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                  onPressed: () => setState(() => _due = null),
                  icon: const Icon(LucideIcons.x, size: 18),
                ),
            ]),
            if (widget.isManager) ...[
              const SizedBox(height: 8),
              FilterField(
                label: 'Assign to',
                value: _assignee.isEmpty ? 'Me' : (_users.where((u) => u.id == _assignee).map((u) => u.name).firstOrNull ?? 'Selected'),
                active: _assignee.isNotEmpty,
                onTap: () async {
                  final v = await pickOption(context,
                      title: 'Assign to',
                      options: [(value: '', label: 'Me'), for (final u in _users) (value: u.id, label: u.name)],
                      selected: _assignee,
                      searchable: true);
                  if (v != null) setState(() => _assignee = v);
                },
              ),
            ],
            const SizedBox(height: 10),
            TextField(
              controller: _note,
              minLines: 2,
              maxLines: 4,
              maxLength: 500,
              decoration: const InputDecoration(hintText: 'Note (optional)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 4),
            FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              onPressed: _saving ? null : _save,
              icon: _saving ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(LucideIcons.listPlus, size: 16),
              label: const Text('Add action'),
            ),
          ]),
        ),
        const SizedBox(height: 8),
        if (widget.loading)
          for (var i = 0; i < 3; i++)
            Container(height: 72, margin: const EdgeInsets.only(bottom: 10), decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(16)))
        else if (widget.error != null)
          ErrorState(message: widget.error!, onRetry: widget.onRetry)
        else ...[
          SectionHeader(title: 'Upcoming (${widget.data.upcoming.length})'),
          const SizedBox(height: 6),
          if (widget.data.upcoming.isEmpty)
            Padding(padding: const EdgeInsets.only(bottom: 14), child: Text('No upcoming actions.', style: TextStyle(color: Surf.subtext(context))))
          else
            for (final a in widget.data.upcoming)
              PremiumCard(
                padding: const EdgeInsets.fromLTRB(6, 6, 14, 6),
                child: Row(children: [
                  IconButton(
                    tooltip: 'Mark as done',
                    constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                    onPressed: _busy.contains(a.id) ? null : () => _toggle(a),
                    icon: _busy.contains(a.id)
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : Icon(LucideIcons.circle, color: accent),
                  ),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(
                          (ReportsService.actionTypes[a.type] ?? a.type) + (a.status != null ? ' · ${a.status}' : ''),
                          style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Surf.text(context)),
                        ),
                        Text(
                          [if (a.leadName != null) a.leadName!, if (a.dueAt != null) 'Due ${fmtDateTime(a.dueAt)}', if (a.assigneeName != null) a.assigneeName!].join('  ·  '),
                          style: TextStyle(fontSize: 12, color: Surf.subtext(context)),
                        ),
                        if (a.note != null && a.note!.isNotEmpty)
                          Padding(padding: const EdgeInsets.only(top: 3), child: Text(a.note!, style: TextStyle(fontSize: 12.5, color: Surf.text(context)))),
                      ]),
                    ),
                  ),
                ]),
              ),
          const SizedBox(height: 8),
          SectionHeader(title: 'History (${widget.data.history.length})'),
          const SizedBox(height: 6),
          if (widget.data.history.isEmpty)
            Text('Nothing in this period.', style: TextStyle(color: Surf.subtext(context)))
          else
            for (final h in widget.data.history)
              PremiumCard(
                padding: const EdgeInsets.all(12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(h.label, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Surf.text(context)))),
                    Text(fmtDateTime(h.at), style: TextStyle(fontSize: 11.5, color: Surf.subtext(context))),
                  ]),
                  if (h.isStatusChange && (h.from != null || h.to != null))
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Row(children: [
                        if (h.from != null) Flexible(child: StatusPill(h.from!)),
                        const Padding(padding: EdgeInsets.symmetric(horizontal: 6), child: Icon(LucideIcons.arrowRight, size: 13)),
                        if (h.to != null) Flexible(child: StatusPill(h.to!)),
                      ]),
                    ),
                  if (h.note != null && h.note!.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(h.note!, style: TextStyle(fontSize: 12.5, color: Surf.text(context)))),
                  const SizedBox(height: 4),
                  Text([h.byName, if (h.leadName != null) h.leadName!].join('  ·  '), style: TextStyle(fontSize: 11.5, color: Surf.subtext(context))),
                ]),
              ),
        ],
      ],
    );
  }
}
