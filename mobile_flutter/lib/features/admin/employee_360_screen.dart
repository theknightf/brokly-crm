import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/admin_models.dart';
import '../../data/services/admin_performance_service.dart';
import '../../state/auth_provider.dart';
import 'admin_performance_tab.dart';
import 'admin_ui.dart';

/// Employee 360 profile (web: /admin/employees/[id]/360 + the admin employee
/// report). Visible to admins/owners for anyone, and to an employee for
/// themselves (same rule as GET /api/employees/:id/profile-360).
///
/// Embedded in the shell: leave [standalone] false (no app bar).
/// Pushed from a list: pass `standalone: true` to get its own Scaffold + app bar.
class Employee360Screen extends StatefulWidget {
  final String employeeId;
  final bool standalone;
  const Employee360Screen({super.key, required this.employeeId, this.standalone = false});

  @override
  State<Employee360Screen> createState() => _Employee360ScreenState();
}

class _Employee360ScreenState extends State<Employee360Screen> {
  final AdminPerformanceService _service = AdminPerformanceService();
  String _period = 'month';
  String? _from;
  String? _to;
  String _tab = 'overview';
  int _version = 0;

  ({String from, String to}) _range() {
    if (_period == 'custom' && _from != null && _to != null) return (from: _from!, to: _to!);
    final r = AdminPerformanceService.periodRange(_period == 'week' ? 'week' : 'month');
    return (from: r.start, to: r.end);
  }

  Future<void> _pickRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2023),
      lastDate: DateTime(now.year + 1),
      initialDateRange: DateTimeRange(
        start: AdminFmt.parse(_from) ?? DateTime(now.year, now.month, 1),
        end: AdminFmt.parse(_to) ?? now,
      ),
    );
    if (picked == null) return;
    setState(() {
      _period = 'custom';
      _from = AdminFmt.iso(picked.start);
      _to = AdminFmt.iso(picked.end);
    });
  }

  @override
  Widget build(BuildContext context) {
    final me = context.watch<AuthProvider>().profile;
    Widget body;
    if (me == null) {
      body = const SkeletonList();
    } else if (!me.isAdmin && me.id != widget.employeeId) {
      body = const AdminAccessDenied(message: 'You can only open your own 360 profile.');
    } else {
      final r = _range();
      body = AdminLoader<AdminEmployee360>(
        key: ValueKey('${widget.employeeId}_${r.from}_${r.to}_$_version'),
        loader: () => _service.getEmployee360(widget.employeeId, r.from, r.to),
        builder: (context, d, reload) => _content(context, d, me.isAdmin, reload),
      );
    }
    if (!widget.standalone) return body;
    return Scaffold(
      appBar: AppBar(title: const Text('Employee 360')),
      body: SafeArea(child: body),
    );
  }

  static const _tabs = ['overview', 'dress', 'payroll', 'attendance', 'calls', 'leads', 'followups', 'visits', 'expenses', 'timeline'];

  String _tabLabel(String t) => switch (t) {
        'dress' => 'Dress code',
        'followups' => 'Follow-ups',
        'visits' => 'Site visits',
        _ => AdminFmt.label(t),
      };

  List<Widget> _content(BuildContext context, AdminEmployee360 d, bool isAdmin, Future<void> Function() reload) {
    final e = d.employee;
    return [
      PremiumCard(
        child: Row(children: [
          AdminAvatar(e.displayName, size: 52),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(e.displayName, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Surf.text(context))),
              const SizedBox(height: 2),
              Text('${e.email}${e.phone.isEmpty ? '' : '  ·  ${e.phone}'}',
                  maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
              const SizedBox(height: 8),
              Wrap(spacing: 6, runSpacing: 6, children: [
                StatusPill(AdminFmt.label(e.role), color: Surf.accent(context)),
                if (!e.isActive) const StatusPill('Inactive', color: AppColors.alertRed),
              ]),
            ]),
          ),
        ]),
      ),
      Row(children: [
        Expanded(
          child: AdminChipRow<String>(
            options: const ['month', 'week', 'custom'],
            selected: _period,
            labelOf: (v) => switch (v) {
              'month' => 'This month',
              'week' => 'This week',
              _ => _period == 'custom' && _from != null ? '${AdminFmt.date(_from)} - ${AdminFmt.date(_to)}' : 'Custom',
            },
            onSelected: (v) {
              if (v == 'custom') {
                _pickRange();
              } else {
                setState(() => _period = v);
              }
            },
          ),
        ),
      ]),
      Text('${AdminFmt.date(d.from)} to ${AdminFmt.date(d.to)}', style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
      const SizedBox(height: 8),
      AdminChipRow<String>(options: _tabs, selected: _tab, labelOf: _tabLabel, onSelected: (v) => setState(() => _tab = v)),
      const SizedBox(height: 8),
      ...switch (_tab) {
        'overview' => _overview(context, d),
        'dress' => _dress(context, d, isAdmin),
        'payroll' => _payroll(context, d),
        'attendance' => _attendance(context, d),
        'calls' => _calls(context, d),
        'leads' => _leads(context, d),
        'followups' => _followUps(context, d),
        'visits' => _visits(context, d),
        'expenses' => _expenses(context, d),
        _ => _timeline(context, d),
      },
    ];
  }

  // ─── Overview ─────────────────────────────────────────────────────────────

  Color _gradeColor(String g) => switch (g) {
        'Excellent' => AppColors.statusInterested,
        'Good' => AppColors.statusFollowingUp,
        'Average' => AppColors.amber,
        _ => AppColors.alertRed,
      };

  List<Widget> _overview(BuildContext context, AdminEmployee360 d) {
    final s = d.scores;
    final gc = _gradeColor(s.grade);
    return [
      PremiumCard(
        tint: gc.withAlpha(Surf.dark(context) ? 28 : 18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('TOTAL PERFORMANCE SCORE', style: TextStyle(fontSize: 11, letterSpacing: 1, color: Surf.subtext(context))),
          const SizedBox(height: 4),
          Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text('${s.total}', style: TextStyle(fontSize: 44, fontWeight: FontWeight.w800, color: gc, height: 1, fontFeatures: kTabular)),
            Text(' /100', style: TextStyle(fontSize: 16, color: Surf.subtext(context))),
            const Spacer(),
            StatusPill(s.grade, color: gc),
          ]),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(child: AdminScoreBar(label: 'Call 40%', value: s.call, color: AppColors.statusInterested)),
            const SizedBox(width: 10),
            Expanded(child: AdminScoreBar(label: 'Attend 30%', value: s.attendance, color: AppColors.statusFollowingUp)),
            const SizedBox(width: 10),
            Expanded(child: AdminScoreBar(label: 'Dress 30%', value: s.dress, color: AppColors.neonLimeDark)),
          ]),
          const SizedBox(height: 10),
          Text('${s.total} = ${s.call} x 0.4 + ${s.attendance} x 0.3 + ${s.dress} x 0.3',
              style: TextStyle(fontSize: 11.5, color: Surf.subtext(context), fontFeatures: kTabular)),
        ]),
      ),
      AdminMetricGrid(tiles: [
        MetricTile(label: 'Attendance', value: '${d.daysWorked}/${d.totalDays}', icon: LucideIcons.calendar, color: AppColors.statusFollowingUp, caption: '${d.lateDays} late  ·  ${AdminFmt.duration(d.workSeconds)}'),
        MetricTile(label: 'Calls', value: AdminFmt.number(d.totalCalls), icon: LucideIcons.phone, color: AppColors.statusInterested, caption: '${d.converted} converted'),
        MetricTile(
          label: 'Dress code',
          value: d.avgDress != null ? '${d.avgDress}/5' : '—',
          icon: LucideIcons.shirt,
          caption: '${d.evaluationsCount} evals  ·  ${d.dressPassRate}% pass',
        ),
        MetricTile(label: 'Active hours', value: AdminFmt.duration(d.activeSeconds), icon: LucideIcons.activity, color: AppColors.amber, caption: '${d.actions} actions'),
        MetricTile(label: 'Work hours', value: AdminFmt.duration(d.workSeconds), icon: LucideIcons.timer, caption: '${d.daysWorked} days'),
        MetricTile(label: 'Overdue follow-ups', value: AdminFmt.number(d.overdueFollowUps), icon: LucideIcons.clockAlert, color: d.overdueFollowUps > 0 ? AppColors.alertRed : null),
      ]),
    ];
  }

  // ─── Dress code ───────────────────────────────────────────────────────────

  List<Widget> _dress(BuildContext context, AdminEmployee360 d, bool isAdmin) {
    return [
      SectionHeader(
        title: 'Dress code history (${d.evaluations.length})',
        trailing: isAdmin
            ? AdminButton(
                label: 'Add',
                icon: LucideIcons.plus,
                outlined: true,
                onPressed: () async {
                  final saved = await showPremiumSheet<bool>(context, builder: (ctx) => AdminDressCodeForm(employeeId: widget.employeeId));
                  if (saved == true) {
                    if (context.mounted) adminSnack(context, 'Dress code evaluation saved');
                    setState(() => _version++);
                  }
                },
              )
            : null,
      ),
      if (d.evaluations.isEmpty)
        const AdminEmptyBlock(icon: LucideIcons.shirt, title: 'No evaluations in this period')
      else
        for (final ev in d.evaluations)
          PremiumCard(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${AdminFmt.date(ev.date)}${ev.evaluatorName.isEmpty ? '' : '  ·  by ${ev.evaluatorName}'}',
                      style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Surf.text(context))),
                  const SizedBox(height: 2),
                  Text(ev.notes.isNotEmpty ? ev.notes : (ev.flags.isEmpty ? '—' : ev.flags.join(', ')),
                      maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
                ]),
              ),
              const SizedBox(width: 8),
              StatusPill('${ev.rating}/5  ${ev.rating >= 3 ? 'Pass' : 'Fail'}', color: ev.rating >= 3 ? AppColors.statusInterested : AppColors.alertRed),
            ]),
          ),
    ];
  }

  // ─── Payroll & deductions ─────────────────────────────────────────────────

  List<Widget> _payroll(BuildContext context, AdminEmployee360 d) {
    return [
      AdminMetricGrid(tiles: [
        MetricTile(label: 'Base salary', value: AdminFmt.money(d.baseSalary), icon: LucideIcons.wallet),
        MetricTile(label: 'Deductions', value: AdminFmt.money(d.totalDeductions), icon: LucideIcons.minus, color: AppColors.alertRed),
      ]),
      const SizedBox(height: 10),
      MetricTile(label: 'Net payout (base minus deductions)', value: AdminFmt.money(d.netPayout), icon: LucideIcons.banknote),
      const SizedBox(height: 8),
      const SectionHeader(title: 'Deductions'),
      if (d.deductions.isEmpty)
        const AdminEmptyBlock(icon: LucideIcons.receipt, title: 'No deductions')
      else
        for (final x in d.deductions)
          PremiumCard(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(x.reason, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Surf.text(context))),
                  Text('${AdminFmt.label(x.sourceRef)}  ·  ${x.monthYear}', style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
                ]),
              ),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(AdminFmt.money(x.amount), style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.alertRed, fontFeatures: kTabular)),
                StatusPill(x.isApplied ? 'Applied' : 'Pending', color: x.isApplied ? AppColors.statusInterested : AppColors.amber),
              ]),
            ]),
          ),
      if (d.notifications.isNotEmpty) ...[
        const SectionHeader(title: 'Notifications sent'),
        for (final n in d.notifications.take(5))
          PremiumCard(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              Expanded(
                child: Text('${n['title'] ?? ''}${n['message'] == null ? '' : '  ·  ${n['message']}'}',
                    maxLines: 3, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: Surf.text(context))),
              ),
              const SizedBox(width: 8),
              StatusPill(n['is_read'] == true ? 'Read' : 'Unread', color: n['is_read'] == true ? AppColors.statusInterested : AppColors.amber),
            ]),
          ),
      ],
    ];
  }

  // ─── Generic lists ────────────────────────────────────────────────────────

  Widget _row(BuildContext context, String title, String sub, {Widget? trailing}) {
    return PremiumCard(
      padding: const EdgeInsets.all(14),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Surf.text(context))),
            if (sub.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(sub, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
              ),
          ]),
        ),
        if (trailing != null) ...[const SizedBox(width: 8), trailing],
      ]),
    );
  }

  List<Widget> _attendance(BuildContext context, AdminEmployee360 d) {
    if (d.attendance.isEmpty) return const [AdminEmptyBlock(icon: LucideIcons.calendar, title: 'No attendance in this period')];
    return [
      for (final a in d.attendance)
        _row(
          context,
          AdminFmt.date(a['attendance_date']),
          'In ${AdminFmt.time(a['check_in_time'])}  ·  Out ${a['check_out_time'] == null ? '—' : AdminFmt.time(a['check_out_time'])}',
          trailing: Text(
            AdminFmt.duration(_dur(a['check_in_time'], a['check_out_time'])),
            style: TextStyle(fontWeight: FontWeight.w700, color: Surf.text(context), fontFeatures: kTabular),
          ),
        ),
    ];
  }

  int _dur(dynamic a, dynamic b) {
    final x = AdminFmt.parse(a);
    final y = AdminFmt.parse(b);
    if (x == null || y == null || y.isBefore(x)) return 0;
    return y.difference(x).inSeconds;
  }

  List<Widget> _calls(BuildContext context, AdminEmployee360 d) {
    if (d.calls.isEmpty) return const [AdminEmptyBlock(icon: LucideIcons.phone, title: 'No calls in this period')];
    return [
      for (final c in d.calls)
        _row(
          context,
          '${c['contact_name'] ?? c['contact_phone'] ?? 'Contact'}',
          '${c['channel'] ?? 'Call'}  ·  ${c['outcome'] ?? '—'}  ·  ${AdminFmt.dateTime(c['created_at'])}',
          trailing: Text(AdminFmt.duration(admNum(c['duration_seconds']).round()), style: TextStyle(color: Surf.subtext(context), fontFeatures: kTabular)),
        ),
    ];
  }

  List<Widget> _leads(BuildContext context, AdminEmployee360 d) {
    if (d.leads.isEmpty) return const [AdminEmptyBlock(icon: LucideIcons.target, title: 'No leads')];
    return [
      for (final l in d.leads)
        _row(
          context,
          '${l['name'] ?? 'Lead'}',
          '${l['phone'] ?? ''}  ·  ${AdminFmt.date(l['created_at'])}',
          trailing: StatusPill('${l['crm_status'] ?? l['lead_status'] ?? '—'}'),
        ),
    ];
  }

  List<Widget> _followUps(BuildContext context, AdminEmployee360 d) {
    if (d.followUps.isEmpty) return const [AdminEmptyBlock(icon: LucideIcons.clock, title: 'No follow-ups')];
    return [
      for (final f in d.followUps)
        _row(
          context,
          '${f['title'] ?? 'Follow-up'}',
          '${f['follow_up_type'] ?? ''}  ·  Due ${AdminFmt.date(f['due_date'])}',
          trailing: StatusPill('${f['follow_up_status'] ?? '—'}', color: AppColors.mutedText),
        ),
    ];
  }

  List<Widget> _visits(BuildContext context, AdminEmployee360 d) {
    if (d.visits.isEmpty) return const [AdminEmptyBlock(icon: LucideIcons.mapPin, title: 'No site visits in this period')];
    return [
      for (final v in d.visits)
        _row(
          context,
          '${v['project_name'] ?? v['lead_name'] ?? 'Site visit'}',
          '${AdminFmt.dateTime(v['check_in_at'])}${v['check_out_at'] == null ? '' : '  ·  out ${AdminFmt.time(v['check_out_at'])}'}',
          trailing: StatusPill('${v['status'] ?? '—'}', color: (v['verified'] == true || v['within_radius'] == true) ? AppColors.statusInterested : AppColors.mutedText),
        ),
    ];
  }

  List<Widget> _expenses(BuildContext context, AdminEmployee360 d) {
    if (d.expenses.isEmpty) return const [AdminEmptyBlock(icon: LucideIcons.receipt, title: 'No expenses')];
    final total = d.expenses.fold<double>(0, (s, e) => s + admNum(e['amount']));
    return [
      MetricTile(label: 'Total expenses', value: AdminFmt.money(total), icon: LucideIcons.receipt, color: AppColors.alertRed),
      const SizedBox(height: 10),
      for (final e in d.expenses)
        _row(
          context,
          '${e['title'] ?? e['category'] ?? 'Expense'}',
          '${e['category'] ?? ''}  ·  ${AdminFmt.date(e['expense_date'] ?? e['created_at'])}',
          trailing: Text(AdminFmt.money(admNum(e['amount'])), style: TextStyle(fontWeight: FontWeight.w800, color: Surf.text(context), fontFeatures: kTabular)),
        ),
    ];
  }

  List<Widget> _timeline(BuildContext context, AdminEmployee360 d) {
    if (d.timeline.isEmpty) return const [AdminEmptyBlock(icon: LucideIcons.history, title: 'No activity in this period')];
    return [
      for (final t in d.timeline.take(120))
        _row(
          context,
          t.label,
          '${AdminFmt.dateTime(t.at)}${t.detail.isEmpty ? '' : '  ·  ${t.detail}'}',
          trailing: StatusPill(AdminFmt.label(t.type), color: AppColors.mutedText),
        ),
    ];
  }
}
