import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/admin_models.dart';
import '../../data/services/admin_service.dart';
import '../../state/auth_provider.dart';
import 'admin_ui.dart';

String _roleLabel(String v) {
  for (final r in adminTargetRoles) {
    if (r.value == v) return r.label;
  }
  return AdminFmt.label(v);
}

// ═════════════════════════════════════════════════════════════════════════════
// LEAVE
// ═════════════════════════════════════════════════════════════════════════════

const List<String> _leaveTypes = ['annual', 'sick', 'unpaid', 'emergency', 'other'];

Color _leaveColor(String status) => switch (status) {
      'approved' => AppColors.statusInterested,
      'rejected' => AppColors.alertRed,
      'pending' => AppColors.amber,
      _ => AppColors.mutedText,
    };

/// Approve / reject leave requests (leave_requests; admin RLS = full access).
class AdminLeaveTab extends StatefulWidget {
  const AdminLeaveTab({super.key});

  @override
  State<AdminLeaveTab> createState() => _AdminLeaveTabState();
}

class _AdminLeaveTabState extends State<AdminLeaveTab> {
  final AdminService _service = AdminService();
  String _filter = 'all';
  String? _busyId;

  @override
  Widget build(BuildContext context) {
    final me = context.read<AuthProvider>().profile;
    return AdminLoader<List<AdminLeave>>(
      loader: _service.getLeave,
      builder: (context, all, reload) {
        final list = _filter == 'all' ? all : all.where((r) => r.status == _filter).toList();
        return [
          SectionHeader(
            title: 'Leave requests',
            subtitle: '${all.where((r) => r.status == 'pending').length} pending',
            trailing: AdminButton(
              label: 'Request',
              icon: LucideIcons.send,
              onPressed: me == null ? null : () => _request(context, me.id, reload),
            ),
          ),
          AdminChipRow<String>(
            options: const ['all', 'pending', 'approved', 'rejected', 'cancelled'],
            selected: _filter,
            labelOf: AdminFmt.label,
            onSelected: (v) => setState(() => _filter = v),
          ),
          const SizedBox(height: 8),
          if (list.isEmpty)
            const AdminEmptyBlock(icon: LucideIcons.palmtree, title: 'No leave requests')
          else
            for (final r in list)
              PremiumCard(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    AdminAvatar(r.userName.isEmpty ? '?' : r.userName, size: 38),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(r.userName.isEmpty ? '—' : r.userName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Surf.text(context))),
                    ),
                    StatusPill(AdminFmt.label(r.status), color: _leaveColor(r.status)),
                  ]),
                  const SizedBox(height: 10),
                  Text('${AdminFmt.label(r.leaveType)}  ·  ${AdminFmt.decimal(r.days)} day${r.days == 1 ? '' : 's'}',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Surf.text(context), fontFeatures: kTabular)),
                  const SizedBox(height: 2),
                  Text('${AdminFmt.date(r.startDate)}  to  ${AdminFmt.date(r.endDate)}',
                      style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
                  if (r.reason.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(r.reason, maxLines: 3, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
                  ],
                  if (r.status == 'pending') ...[
                    const SizedBox(height: 12),
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      AdminButton(
                        label: 'Approve',
                        icon: LucideIcons.check,
                        busy: _busyId == r.id,
                        onPressed: me == null ? null : () => _decide(context, r, 'approved', me.id, reload),
                      ),
                      AdminButton(
                        label: 'Reject',
                        icon: LucideIcons.x,
                        outlined: true,
                        destructive: true,
                        onPressed: _busyId == r.id || me == null ? null : () => _decide(context, r, 'rejected', me.id, reload),
                      ),
                      AdminButton(
                        label: 'Cancel request',
                        outlined: true,
                        onPressed: _busyId == r.id ? null : () => _cancel(context, r, reload),
                      ),
                    ]),
                  ],
                ]),
              ),
        ];
      },
    );
  }

  Future<void> _decide(BuildContext context, AdminLeave r, String status, String actorId, Future<void> Function() reload) async {
    final ok = await confirmAction(
      context,
      title: status == 'approved' ? 'Approve leave?' : 'Reject leave?',
      message: '${r.userName.isEmpty ? 'This employee' : r.userName}: ${AdminFmt.date(r.startDate)} to ${AdminFmt.date(r.endDate)}.',
      confirmLabel: status == 'approved' ? 'Approve' : 'Reject',
      destructive: status == 'rejected',
    );
    if (!ok) return;
    setState(() => _busyId = r.id);
    try {
      await _service.reviewLeave(r.id, status, actorId);
      if (context.mounted) adminSnack(context, status == 'approved' ? 'Leave approved' : 'Leave rejected');
      await reload();
    } catch (e) {
      if (context.mounted) adminSnack(context, adminErr(e), error: true);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _cancel(BuildContext context, AdminLeave r, Future<void> Function() reload) async {
    final ok = await confirmAction(
      context,
      title: 'Cancel this request?',
      message: 'The request will be marked as cancelled.',
      confirmLabel: 'Cancel request',
      destructive: true,
    );
    if (!ok) return;
    setState(() => _busyId = r.id);
    try {
      await _service.cancelLeave(r.id);
      if (context.mounted) adminSnack(context, 'Request cancelled');
      await reload();
    } catch (e) {
      if (context.mounted) adminSnack(context, adminErr(e), error: true);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _request(BuildContext context, String userId, Future<void> Function() reload) async {
    final saved = await showPremiumSheet<bool>(context, builder: (ctx) => _LeaveForm(service: _service, userId: userId));
    if (saved == true) {
      if (context.mounted) adminSnack(context, 'Leave request submitted');
      await reload();
    }
  }
}

class _LeaveForm extends StatefulWidget {
  final AdminService service;
  final String userId;
  const _LeaveForm({required this.service, required this.userId});

  @override
  State<_LeaveForm> createState() => _LeaveFormState();
}

class _LeaveFormState extends State<_LeaveForm> {
  String _type = 'annual';
  String? _start;
  String? _end;
  final TextEditingController _reason = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_start == null || _end == null) {
      adminSnack(context, 'Pick start and end dates', error: true);
      return;
    }
    if (_end!.compareTo(_start!) < 0) {
      adminSnack(context, 'End date must be after start date', error: true);
      return;
    }
    final days = DateTime.parse(_end!).difference(DateTime.parse(_start!)).inDays + 1;
    setState(() => _busy = true);
    try {
      await widget.service.requestLeave(
        userId: widget.userId,
        leaveType: _type,
        startDate: _start!,
        endDate: _end!,
        days: days.toDouble(),
        reason: _reason.text.trim(),
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        adminSnack(context, adminErr(e), error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AdminSheetBody(
      title: 'Request leave',
      children: [
        AdminDropdown<String>(
          label: 'Type',
          value: _type,
          items: [for (final t in _leaveTypes) DropdownMenuItem(value: t, child: Text(AdminFmt.label(t)))],
          onChanged: (v) => setState(() => _type = v ?? _type),
        ),
        AdminDateField(label: 'Start date', value: _start, onChanged: (v) => setState(() => _start = v)),
        AdminDateField(label: 'End date', value: _end, onChanged: (v) => setState(() => _end = v)),
        AdminField(label: 'Reason (optional)', controller: _reason, maxLines: 3),
        Row(children: [
          Expanded(child: AdminButton(label: 'Cancel', outlined: true, onPressed: () => Navigator.pop(context))),
          const SizedBox(width: 12),
          Expanded(child: AdminButton(label: 'Submit', icon: LucideIcons.send, busy: _busy, onPressed: _submit)),
        ]),
      ],
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// KPI TARGETS
// ═════════════════════════════════════════════════════════════════════════════

const Map<String, ({String label, String unit, String period})> _kpiMeta = {
  'daily_calls': (label: 'Daily calls', unit: 'calls', period: 'day'),
  'daily_followups': (label: 'Daily follow-ups', unit: 'follow-ups', period: 'day'),
  'daily_meetings': (label: 'Daily meetings', unit: 'meetings', period: 'day'),
  'leads_worked': (label: 'Leads worked', unit: 'leads', period: 'day'),
  'deals': (label: 'Deals closed', unit: 'deals', period: 'month'),
  'revenue': (label: 'Revenue generated', unit: 'EGP', period: 'month'),
};

/// Daily / monthly performance targets (kpi_targets; read all, write admin).
class AdminKpiTab extends StatefulWidget {
  const AdminKpiTab({super.key});

  @override
  State<AdminKpiTab> createState() => _AdminKpiTabState();
}

class _AdminKpiTabState extends State<AdminKpiTab> {
  final AdminService _service = AdminService();

  @override
  Widget build(BuildContext context) {
    return AdminLoader<List<AdminKpiTarget>>(
      loader: _service.getKpiTargets,
      builder: (context, list, reload) => [
        SectionHeader(
          title: 'KPI targets',
          subtitle: 'Daily and monthly goals shown on each user\'s dashboard',
          trailing: AdminButton(label: 'Add', icon: LucideIcons.plus, onPressed: () => _edit(context, null, reload)),
        ),
        if (list.isEmpty)
          const AdminEmptyBlock(
            icon: LucideIcons.target,
            title: 'No KPI targets yet',
            message: 'If this looks wrong, the KPI migrations may not be applied on the database.',
          )
        else
          for (final t in list)
            PremiumCard(
              onTap: () => _edit(context, t, reload),
              child: Row(children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(color: Surf.accent(context).withAlpha(30), borderRadius: BorderRadius.circular(12)),
                  child: Icon(LucideIcons.target, size: 19, color: Surf.accent(context)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(_kpiMeta[t.metric]?.label ?? (t.label.isEmpty ? t.metric : t.label),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: Surf.text(context))),
                    const SizedBox(height: 2),
                    Text('${AdminFmt.decimal(t.targetValue)} ${_kpiMeta[t.metric]?.unit ?? ''} per ${t.periodType}  ·  ${_roleLabel(t.targetRole)}',
                        style: TextStyle(fontSize: 12.5, color: Surf.subtext(context), fontFeatures: kTabular)),
                  ]),
                ),
                if (!t.isActive) const StatusPill('Off', color: AppColors.mutedText),
                IconButton(
                  tooltip: 'Delete target',
                  constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                  icon: const Icon(LucideIcons.trash2, size: 18),
                  onPressed: () => _delete(context, t, reload),
                ),
              ]),
            ),
      ],
    );
  }

  Future<void> _delete(BuildContext context, AdminKpiTarget t, Future<void> Function() reload) async {
    final ok = await confirmAction(
      context,
      title: 'Delete this target?',
      message: '"${_kpiMeta[t.metric]?.label ?? t.metric}" for ${_roleLabel(t.targetRole)} will be removed.',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!ok) return;
    try {
      await _service.deleteKpiTarget(t.id);
      if (context.mounted) adminSnack(context, 'Target deleted');
      await reload();
    } catch (e) {
      if (context.mounted) adminSnack(context, adminErr(e), error: true);
    }
  }

  Future<void> _edit(BuildContext context, AdminKpiTarget? t, Future<void> Function() reload) async {
    final saved = await showPremiumSheet<bool>(context, builder: (ctx) => _KpiForm(service: _service, target: t));
    if (saved == true) {
      if (context.mounted) adminSnack(context, 'Target saved');
      await reload();
    }
  }
}

class _KpiForm extends StatefulWidget {
  final AdminService service;
  final AdminKpiTarget? target;
  const _KpiForm({required this.service, required this.target});

  @override
  State<_KpiForm> createState() => _KpiFormState();
}

class _KpiFormState extends State<_KpiForm> {
  late String _metric = _kpiMeta.containsKey(widget.target?.metric) ? widget.target!.metric : 'daily_calls';
  late String _role = adminTargetRoles.any((r) => r.value == widget.target?.targetRole) ? widget.target!.targetRole : 'all';
  late bool _active = widget.target?.isActive ?? true;
  late final TextEditingController _value =
      TextEditingController(text: widget.target == null ? '30' : AdminFmt.decimal(widget.target!.targetValue).replaceAll(',', ''));
  bool _busy = false;

  @override
  void dispose() {
    _value.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final n = double.tryParse(_value.text.trim());
    if (n == null || n < 0) {
      adminSnack(context, 'Enter a valid target value', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      final meta = _kpiMeta[_metric]!;
      await widget.service.saveKpiTarget(
        id: widget.target?.id,
        metric: _metric,
        label: meta.label,
        targetValue: n,
        periodType: meta.period,
        targetRole: _role,
        isActive: _active,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        adminSnack(context, adminErr(e), error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AdminSheetBody(
      title: widget.target == null ? 'Add KPI target' : 'Edit KPI target',
      children: [
        AdminDropdown<String>(
          label: 'Metric',
          value: _metric,
          items: [
            for (final e in _kpiMeta.entries) DropdownMenuItem(value: e.key, child: Text('${e.value.label} (${e.value.period})')),
          ],
          onChanged: (v) => setState(() => _metric = v ?? _metric),
        ),
        AdminField(label: 'Target value', controller: _value, keyboard: const TextInputType.numberWithOptions(decimal: true)),
        AdminDropdown<String>(
          label: 'For',
          value: _role,
          items: [for (final r in adminTargetRoles) DropdownMenuItem(value: r.value, child: Text(r.label))],
          onChanged: (v) => setState(() => _role = v ?? _role),
        ),
        AdminSwitchRow(label: 'Active', value: _active, onChanged: (v) => setState(() => _active = v)),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: AdminButton(label: 'Cancel', outlined: true, onPressed: () => Navigator.pop(context))),
          const SizedBox(width: 12),
          Expanded(child: AdminButton(label: 'Save', icon: LucideIcons.check, busy: _busy, onPressed: _save)),
        ]),
      ],
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// TASKS
// ═════════════════════════════════════════════════════════════════════════════

const List<String> _priorities = ['High', 'Medium', 'Low'];

Color _priorityColor(String p) => switch (p) {
      'High' => AppColors.alertRed,
      'Low' => AppColors.statusInterested,
      _ => AppColors.amber,
    };

/// Role-assigned to-dos shown on each user's dashboard (tasks table).
class AdminTasksTab extends StatefulWidget {
  const AdminTasksTab({super.key});

  @override
  State<AdminTasksTab> createState() => _AdminTasksTabState();
}

class _AdminTasksTabState extends State<AdminTasksTab> {
  final AdminService _service = AdminService();

  @override
  Widget build(BuildContext context) {
    return AdminLoader<List<AdminTask>>(
      loader: _service.getTasks,
      builder: (context, list, reload) => [
        SectionHeader(
          title: 'Tasks',
          subtitle: 'Assign to-dos to a role. They appear on each user\'s dashboard',
          trailing: AdminButton(label: 'Assign', icon: LucideIcons.plus, onPressed: () => _create(context, reload)),
        ),
        if (list.isEmpty)
          const AdminEmptyBlock(icon: LucideIcons.clipboardList, title: 'No active tasks', message: 'Tap "Assign" to create one.')
        else
          for (final t in list)
            PremiumCard(
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(t.title, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: Surf.text(context))),
                    if (t.description.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(t.description, maxLines: 3, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
                    ],
                    const SizedBox(height: 8),
                    Wrap(spacing: 6, runSpacing: 6, children: [
                      StatusPill(t.priority, color: _priorityColor(t.priority)),
                      StatusPill(_roleLabel(t.targetRole), color: AppColors.tealCyan, icon: LucideIcons.users),
                      if (t.dueDate != null) StatusPill('Due ${AdminFmt.date(t.dueDate)}', color: AppColors.mutedText, icon: LucideIcons.calendar),
                    ]),
                  ]),
                ),
                IconButton(
                  tooltip: 'Delete task',
                  constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                  icon: const Icon(LucideIcons.trash2, size: 18),
                  onPressed: () => _delete(context, t, reload),
                ),
              ]),
            ),
      ],
    );
  }

  Future<void> _delete(BuildContext context, AdminTask t, Future<void> Function() reload) async {
    final ok = await confirmAction(
      context,
      title: 'Delete task?',
      message: '"${t.title}" will be removed for everyone it was assigned to.',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!ok) return;
    try {
      await _service.deleteTask(t.id);
      if (context.mounted) adminSnack(context, 'Task deleted');
      await reload();
    } catch (e) {
      if (context.mounted) adminSnack(context, adminErr(e), error: true);
    }
  }

  Future<void> _create(BuildContext context, Future<void> Function() reload) async {
    final saved = await showPremiumSheet<bool>(context, builder: (ctx) => _TaskForm(service: _service));
    if (saved == true) {
      if (context.mounted) adminSnack(context, 'Task assigned');
      await reload();
    }
  }
}

class _TaskForm extends StatefulWidget {
  final AdminService service;
  const _TaskForm({required this.service});

  @override
  State<_TaskForm> createState() => _TaskFormState();
}

class _TaskFormState extends State<_TaskForm> {
  final TextEditingController _title = TextEditingController();
  final TextEditingController _desc = TextEditingController();
  String _role = 'all';
  String _priority = 'Medium';
  String? _due;
  bool _busy = false;

  @override
  void dispose() {
    _title.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_title.text.trim().isEmpty) {
      adminSnack(context, 'Enter a task title', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      await widget.service.createTask(
        title: _title.text.trim(),
        description: _desc.text.trim(),
        targetRole: _role,
        dueDate: _due,
        priority: _priority,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        adminSnack(context, adminErr(e), error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AdminSheetBody(
      title: 'Assign task',
      children: [
        AdminField(label: 'Title *', controller: _title),
        AdminField(label: 'Description (optional)', controller: _desc, maxLines: 3),
        AdminDropdown<String>(
          label: 'For',
          value: _role,
          items: [for (final r in adminTargetRoles) DropdownMenuItem(value: r.value, child: Text(r.label))],
          onChanged: (v) => setState(() => _role = v ?? _role),
        ),
        AdminDropdown<String>(
          label: 'Priority',
          value: _priority,
          items: [for (final p in _priorities) DropdownMenuItem(value: p, child: Text(p))],
          onChanged: (v) => setState(() => _priority = v ?? _priority),
        ),
        AdminDateField(label: 'Due date (optional)', value: _due, onChanged: (v) => setState(() => _due = v)),
        Row(children: [
          Expanded(child: AdminButton(label: 'Cancel', outlined: true, onPressed: () => Navigator.pop(context))),
          const SizedBox(width: 12),
          Expanded(child: AdminButton(label: 'Assign', icon: LucideIcons.check, busy: _busy, onPressed: _save)),
        ]),
      ],
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// LEAD ROTATION
// ═════════════════════════════════════════════════════════════════════════════

class _RotationData {
  final bool enabled;
  final int days;
  final List<AdminRotationLog> history;
  const _RotationData(this.enabled, this.days, this.history);
}

/// Inactivity rotation settings + history. Running the sweep ("Run now")
/// reassigns leads and notifies agents server-side, so it stays on the web.
class AdminRotationTab extends StatefulWidget {
  const AdminRotationTab({super.key});

  @override
  State<AdminRotationTab> createState() => _AdminRotationTabState();
}

class _AdminRotationTabState extends State<AdminRotationTab> {
  final AdminService _service = AdminService();
  bool? _enabled;
  int? _days;
  bool _saving = false;

  Future<_RotationData> _load() async {
    final r = await Future.wait<dynamic>([_service.getRotationConfig(), _service.getRotationHistory()]);
    final cfg = r[0] as ({bool enabled, int days});
    _enabled = cfg.enabled;
    _days = cfg.days;
    return _RotationData(cfg.enabled, cfg.days, r[1] as List<AdminRotationLog>);
  }

  @override
  Widget build(BuildContext context) {
    return AdminLoader<_RotationData>(
      loader: _load,
      builder: (context, d, reload) => [
        const SectionHeader(title: 'Lead rotation', subtitle: 'Auto-reassign inactive leads to available agents'),
        PremiumCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            AdminSwitchRow(label: 'Rotation enabled', value: _enabled ?? d.enabled, onChanged: (v) => setState(() => _enabled = v)),
            const SizedBox(height: 4),
            Text('Inactivity threshold: ${_days ?? d.days} day${(_days ?? d.days) == 1 ? '' : 's'}',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Surf.text(context), fontFeatures: kTabular)),
            Slider(
              min: 1,
              max: 60,
              divisions: 59,
              value: (_days ?? d.days).clamp(1, 60).toDouble(),
              label: '${_days ?? d.days}',
              onChanged: (v) => setState(() => _days = v.round()),
            ),
            AdminButton(
              label: 'Save settings',
              icon: LucideIcons.save,
              busy: _saving,
              onPressed: () async {
                setState(() => _saving = true);
                try {
                  await _service.saveRotationConfig(_enabled ?? d.enabled, _days ?? d.days);
                  if (context.mounted) adminSnack(context, 'Rotation settings saved');
                } catch (e) {
                  if (context.mounted) adminSnack(context, adminErr(e), error: true);
                } finally {
                  if (mounted) setState(() => _saving = false);
                }
              },
            ),
          ]),
        ),
        const AdminNote('"Run now" reassigns leads on the server and is available on the web only.'),
        const SectionHeader(title: 'Rotation history', subtitle: 'Latest 100 reassignments'),
        if (d.history.isEmpty)
          const AdminEmptyBlock(icon: LucideIcons.repeat, title: 'No rotations yet')
        else
          for (final h in d.history)
            PremiumCard(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(h.leadName.isEmpty ? 'Lead' : h.leadName,
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: Surf.text(context))),
                const SizedBox(height: 4),
                Text('${h.fromName.isEmpty ? '—' : h.fromName}  →  ${h.toName.isEmpty ? '—' : h.toName}',
                    style: TextStyle(fontSize: 13, color: Surf.text(context))),
                const SizedBox(height: 2),
                Text('${AdminFmt.dateTime(h.rotatedAt)}${h.reason.isEmpty ? '' : '  ·  ${h.reason}'}',
                    style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
                if (h.detail.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(h.detail, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
                  ),
              ]),
            ),
      ],
    );
  }
}
