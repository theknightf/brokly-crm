import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/admin_models.dart';
import '../../data/services/admin_payroll_service.dart';
import '../../data/services/admin_service.dart';
import 'admin_ui.dart';

class _PayrollData {
  final List<AdminPayrollPeriod> periods;
  final AdminWorkingHours hours;
  final AdminPayrollRules rules;
  final List<AdminUser> users;
  const _PayrollData(this.periods, this.hours, this.rules, this.users);
}

/// Payroll: periods + per-employee entries, salaries, working hours and rules.
/// Tables: payroll_periods, payroll_entries, company_settings, user_profiles.
/// "Generate from attendance" stays web-only (see [AdminPayrollService]).
class AdminPayrollTab extends StatefulWidget {
  const AdminPayrollTab({super.key});

  @override
  State<AdminPayrollTab> createState() => _AdminPayrollTabState();
}

class _AdminPayrollTabState extends State<AdminPayrollTab> {
  final AdminPayrollService _payroll = AdminPayrollService();
  final AdminService _admin = AdminService();
  String _section = 'periods';
  String? _periodId;
  int _entriesVersion = 0;

  Future<_PayrollData> _load() async {
    final r = await Future.wait<dynamic>([
      _payroll.getPeriods(),
      _admin.getCompanySetting('workingHours'),
      _admin.getCompanySetting('payrollRules'),
      _admin.getUsers(),
    ]);
    return _PayrollData(
      r[0] as List<AdminPayrollPeriod>,
      AdminWorkingHours.fromJson(r[1] as Map<String, dynamic>?),
      AdminPayrollRules.fromJson(r[2] as Map<String, dynamic>?),
      (r[3] as List<AdminUser>).where((u) => u.isActive).toList(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AdminLoader<_PayrollData>(
      loader: _load,
      builder: (context, d, reload) {
        if (_periodId == null || !d.periods.any((p) => p.id == _periodId)) {
          _periodId = d.periods.isEmpty ? null : d.periods.first.id;
        }
        return [
          const SectionHeader(title: 'Payroll', subtitle: 'Periods, salaries and payroll rules'),
          AdminChipRow<String>(
            options: const ['periods', 'salaries', 'rules'],
            selected: _section,
            labelOf: (v) => switch (v) {
              'periods' => 'Periods',
              'salaries' => 'Salaries',
              _ => 'Hours & rules',
            },
            onSelected: (v) => setState(() => _section = v),
          ),
          const SizedBox(height: 8),
          if (_section == 'periods') ..._periods(context, d, reload),
          if (_section == 'salaries') ..._salaries(context, d, reload),
          if (_section == 'rules') ..._rules(context, d, reload),
        ];
      },
    );
  }

  // ─── Periods & entries ────────────────────────────────────────────────────

  List<Widget> _periods(BuildContext context, _PayrollData d, Future<void> Function() reload) {
    final selected = d.periods.where((p) => p.id == _periodId).cast<AdminPayrollPeriod?>().firstOrNull;
    return [
      Row(children: [
        Expanded(
          child: d.periods.isEmpty
              ? Text('No periods yet', style: TextStyle(color: Surf.subtext(context)))
              : AdminDropdown<String>(
                  key: ValueKey('${_periodId}_${d.periods.length}'),
                  label: 'Period',
                  value: _periodId,
                  items: [
                    for (final p in d.periods)
                      DropdownMenuItem(
                        value: p.id,
                        child: Text('${AdminFmt.date(p.start)} to ${AdminFmt.date(p.end)} (${p.status})', overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (v) => setState(() => _periodId = v),
                ),
        ),
        const SizedBox(width: 8),
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: AdminButton(label: 'New', icon: LucideIcons.plus, onPressed: () => _newPeriod(context, reload)),
        ),
      ]),
      const AdminNote('"Generate from attendance" recalculates every employee from attendance and leave and is available on the web only.'),
      if (selected != null) ...[
        if (!selected.finalized)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Align(
              alignment: Alignment.centerLeft,
              child: AdminButton(
                label: 'Finalize period',
                icon: LucideIcons.shieldCheck,
                outlined: true,
                onPressed: () => _finalize(context, selected, reload),
              ),
            ),
          ),
        _EntriesSection(
          key: ValueKey('${selected.id}_$_entriesVersion'),
          payroll: _payroll,
          period: selected,
          rules: d.rules,
          onChanged: () => setState(() => _entriesVersion++),
        ),
      ],
    ];
  }

  Future<void> _newPeriod(BuildContext context, Future<void> Function() reload) async {
    final saved = await showPremiumSheet<bool>(context, builder: (ctx) => _PeriodForm(payroll: _payroll));
    if (saved == true) {
      if (context.mounted) adminSnack(context, 'Payroll period created');
      await reload();
    }
  }

  Future<void> _finalize(BuildContext context, AdminPayrollPeriod p, Future<void> Function() reload) async {
    final ok = await confirmAction(
      context,
      title: 'Finalize this period?',
      message: '${AdminFmt.date(p.start)} to ${AdminFmt.date(p.end)} will be locked as finalized. This is a financial action; make sure a payroll officer has reviewed the figures.',
      confirmLabel: 'Finalize',
    );
    if (!ok) return;
    try {
      await _payroll.finalizePeriod(p.id);
      if (context.mounted) adminSnack(context, 'Period finalized');
      await reload();
    } catch (e) {
      if (context.mounted) adminSnack(context, adminErr(e), error: true);
    }
  }

  // ─── Salaries ─────────────────────────────────────────────────────────────

  List<Widget> _salaries(BuildContext context, _PayrollData d, Future<void> Function() reload) {
    if (d.users.isEmpty) return const [AdminEmptyBlock(icon: LucideIcons.users, title: 'No active users')];
    return [
      for (final u in d.users)
        PremiumCard(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          onTap: () => _editSalary(context, u, reload),
          child: Row(children: [
            AdminAvatar(u.displayName, size: 38),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(u.displayName, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: Surf.text(context))),
                Text(AdminFmt.label(u.role), style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
              ]),
            ),
            Text(AdminFmt.money(u.baseSalary),
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Surf.text(context), fontFeatures: kTabular)),
            const SizedBox(width: 6),
            Icon(LucideIcons.pencil, size: 15, color: Surf.subtext(context)),
          ]),
        ),
    ];
  }

  Future<void> _editSalary(BuildContext context, AdminUser u, Future<void> Function() reload) async {
    final saved = await showPremiumSheet<bool>(context, builder: (ctx) => _SalaryForm(payroll: _payroll, user: u));
    if (saved == true) {
      if (context.mounted) adminSnack(context, 'Salary updated');
      await reload();
    }
  }

  // ─── Working hours & rules ────────────────────────────────────────────────

  List<Widget> _rules(BuildContext context, _PayrollData d, Future<void> Function() reload) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    final h = d.hours;
    final r = d.rules;
    return [
      PremiumCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Working hours', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Surf.text(context))),
          const SizedBox(height: 8),
          DetailRow('Shift', '${h.start} to ${h.end}'),
          DetailRow('Late grace', '${h.lateGraceMinutes} min'),
          DetailRow('Flexible hours', h.flexibleHours ? 'Yes' : 'No'),
          DetailRow('Workdays', h.workdays.where((x) => x >= 0 && x < 7).map((x) => days[x]).join(', ')),
        ]),
      ),
      PremiumCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Payroll rules', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Surf.text(context))),
          const SizedBox(height: 8),
          DetailRow('Salary basis', '${AdminFmt.decimal(r.dailySalaryBasis)} days'),
          DetailRow('Per late minute', AdminFmt.money(r.deductPerLateMinute)),
          DetailRow('Per absence day', r.absenceDeductionPerDay > 0 ? AdminFmt.money(r.absenceDeductionPerDay) : 'Daily rate'),
          DetailRow('Overtime', r.overtimeEnabled ? 'x${AdminFmt.decimal(r.overtimeRate)}' : 'Off'),
          DetailRow('Commission', '${AdminFmt.decimal(r.commissionRate * 100)}% (${AdminFmt.label(r.commissionBasis)})'),
        ]),
      ),
      AdminButton(label: 'Edit hours & rules', icon: LucideIcons.settings2, onPressed: () => _editRules(context, d, reload)),
    ];
  }

  Future<void> _editRules(BuildContext context, _PayrollData d, Future<void> Function() reload) async {
    final saved = await showPremiumSheet<bool>(
      context,
      builder: (ctx) => _RulesForm(admin: _admin, hours: d.hours, rules: d.rules),
    );
    if (saved == true) {
      if (context.mounted) adminSnack(context, 'Working hours and payroll rules saved');
      await reload();
    }
  }
}

// ─── Entries list ───────────────────────────────────────────────────────────

class _EntriesSection extends StatefulWidget {
  final AdminPayrollService payroll;
  final AdminPayrollPeriod period;
  final AdminPayrollRules rules;
  final VoidCallback onChanged;
  const _EntriesSection({super.key, required this.payroll, required this.period, required this.rules, required this.onChanged});

  @override
  State<_EntriesSection> createState() => _EntriesSectionState();
}

class _EntriesSectionState extends State<_EntriesSection> {
  late final Future<List<AdminPayrollEntry>> _future = widget.payroll.getEntries(widget.period.id);

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<AdminPayrollEntry>>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return Column(children: [
            for (var i = 0; i < 3; i++)
              Container(
                height: 120,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(20)),
              ),
          ]);
        }
        if (snap.hasError) {
          return Padding(padding: const EdgeInsets.all(16), child: Text(adminErr(snap.error!), style: const TextStyle(color: AppColors.alertRed)));
        }
        final entries = snap.data ?? [];
        if (entries.isEmpty) {
          return const AdminEmptyBlock(
            icon: LucideIcons.banknote,
            title: 'No entries in this period',
            message: 'Generate payroll from attendance on the web, then review and adjust it here.',
          );
        }
        final gross = entries.fold<double>(0, (s, e) => s + e.gross);
        final ded = entries.fold<double>(0, (s, e) => s + e.deductionsTotal);
        final net = entries.fold<double>(0, (s, e) => s + e.net);
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          AdminMetricGrid(tiles: [
            MetricTile(label: 'Gross', value: AdminFmt.money(gross), icon: LucideIcons.wallet),
            MetricTile(label: 'Deductions', value: AdminFmt.money(ded), icon: LucideIcons.minus, color: AppColors.alertRed),
          ]),
          const SizedBox(height: 10),
          MetricTile(label: 'Net payable', value: AdminFmt.money(net), icon: LucideIcons.banknote),
          const SizedBox(height: 14),
          for (final e in entries)
            PremiumCard(
              onTap: widget.period.finalized ? null : () => _edit(context, e),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(
                    child: Text(e.userName.isEmpty ? '—' : e.userName,
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Surf.text(context))),
                  ),
                  StatusPill(AdminFmt.label(e.status),
                      color: e.status == 'paid' ? AppColors.statusInterested : (e.status == 'approved' ? AppColors.statusFollowingUp : AppColors.mutedText)),
                ]),
                const SizedBox(height: 8),
                Text(
                  '${AdminFmt.decimal(e.attendanceDays)}/${AdminFmt.decimal(e.workingDays)} days  ·  ${AdminFmt.decimal(e.lateMinutes)} late min  ·  '
                  '${AdminFmt.decimal(e.absenceDays)} absent  ·  ${AdminFmt.decimal(e.leaveDays)} leave',
                  style: TextStyle(fontSize: 12, color: Surf.subtext(context), fontFeatures: kTabular),
                ),
                const SizedBox(height: 10),
                DetailRow('Base', AdminFmt.money(e.baseSalary)),
                DetailRow('Bonus', AdminFmt.money(e.bonus)),
                DetailRow('Commission', AdminFmt.money(e.commission)),
                DetailRow('Reimbursed', AdminFmt.money(e.reimbursement)),
                DetailRow('Deductions', '-${AdminFmt.money(e.deductionsTotal)}'),
                const Divider(height: 16),
                Row(children: [
                  Text('Net', style: TextStyle(fontSize: 13, color: Surf.subtext(context))),
                  const Spacer(),
                  Text(AdminFmt.money(e.net),
                      style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Surf.accent(context), fontFeatures: kTabular)),
                ]),
              ]),
            ),
        ]);
      },
    );
  }

  Future<void> _edit(BuildContext context, AdminPayrollEntry e) async {
    final saved = await showPremiumSheet<bool>(
      context,
      builder: (ctx) => _EntryForm(payroll: widget.payroll, entry: e, rules: widget.rules),
    );
    if (saved == true) {
      if (context.mounted) adminSnack(context, 'Changes saved');
      widget.onChanged();
    }
  }
}

// ─── Forms ──────────────────────────────────────────────────────────────────

class _PeriodForm extends StatefulWidget {
  final AdminPayrollService payroll;
  const _PeriodForm({required this.payroll});

  @override
  State<_PeriodForm> createState() => _PeriodFormState();
}

class _PeriodFormState extends State<_PeriodForm> {
  String? _start;
  String? _end;
  bool _busy = false;

  Future<void> _save() async {
    if (_start == null || _end == null) {
      adminSnack(context, 'Pick both dates', error: true);
      return;
    }
    if (_end!.compareTo(_start!) < 0) {
      adminSnack(context, 'End date must be after start date', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      await widget.payroll.createPeriod(_start!, _end!);
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
      title: 'New payroll period',
      children: [
        AdminDateField(label: 'Start date', value: _start, onChanged: (v) => setState(() => _start = v)),
        AdminDateField(label: 'End date', value: _end, onChanged: (v) => setState(() => _end = v)),
        Row(children: [
          Expanded(child: AdminButton(label: 'Cancel', outlined: true, onPressed: () => Navigator.pop(context))),
          const SizedBox(width: 12),
          Expanded(child: AdminButton(label: 'Create', icon: LucideIcons.check, busy: _busy, onPressed: _save)),
        ]),
      ],
    );
  }
}

class _SalaryForm extends StatefulWidget {
  final AdminPayrollService payroll;
  final AdminUser user;
  const _SalaryForm({required this.payroll, required this.user});

  @override
  State<_SalaryForm> createState() => _SalaryFormState();
}

class _SalaryFormState extends State<_SalaryForm> {
  late final TextEditingController _salary = TextEditingController(text: widget.user.baseSalary == 0 ? '' : widget.user.baseSalary.toString());
  bool _busy = false;

  @override
  void dispose() {
    _salary.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final v = double.tryParse(_salary.text.trim());
    if (v == null || v < 0) {
      adminSnack(context, 'Enter a valid salary', error: true);
      return;
    }
    final ok = await confirmAction(
      context,
      title: 'Update base salary?',
      message: '${widget.user.displayName}: ${AdminFmt.money(widget.user.baseSalary)} to ${AdminFmt.money(v)}.',
      confirmLabel: 'Update salary',
    );
    if (!ok) return;
    setState(() => _busy = true);
    try {
      await widget.payroll.setBaseSalary(widget.user.id, v);
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
      title: 'Base salary',
      subtitle: widget.user.displayName,
      children: [
        AdminField(label: 'Monthly base salary (EGP)', controller: _salary, keyboard: const TextInputType.numberWithOptions(decimal: true)),
        Row(children: [
          Expanded(child: AdminButton(label: 'Cancel', outlined: true, onPressed: () => Navigator.pop(context))),
          const SizedBox(width: 12),
          Expanded(child: AdminButton(label: 'Save', icon: LucideIcons.check, busy: _busy, onPressed: _save)),
        ]),
      ],
    );
  }
}

class _EntryForm extends StatefulWidget {
  final AdminPayrollService payroll;
  final AdminPayrollEntry entry;
  final AdminPayrollRules rules;
  const _EntryForm({required this.payroll, required this.entry, required this.rules});

  @override
  State<_EntryForm> createState() => _EntryFormState();
}

class _EntryFormState extends State<_EntryForm> {
  String _t(double v) => v == 0 ? '0' : v.toString();
  late final TextEditingController _bonus = TextEditingController(text: _t(widget.entry.bonus));
  late final TextEditingController _commission = TextEditingController(text: _t(widget.entry.commission));
  late final TextEditingController _reimb = TextEditingController(text: _t(widget.entry.reimbursement));
  late final TextEditingController _other = TextEditingController(text: _t(widget.entry.otherDeductions));
  late final TextEditingController _notes = TextEditingController(text: widget.entry.notes);
  late String _status = const ['draft', 'approved', 'paid'].contains(widget.entry.status) ? widget.entry.status : 'draft';
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_bonus, _commission, _reimb, _other, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    double p(TextEditingController c) => double.tryParse(c.text.trim()) ?? 0;
    final vals = [p(_bonus), p(_commission), p(_reimb), p(_other)];
    if (vals.any((v) => v < 0)) {
      adminSnack(context, 'Amounts cannot be negative', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      await widget.payroll.updateEntry(
        widget.entry,
        widget.rules,
        bonus: vals[0],
        commission: vals[1],
        reimbursement: vals[2],
        otherDeductions: vals[3],
        notes: _notes.text.trim(),
        status: _status,
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
    const num = TextInputType.numberWithOptions(decimal: true);
    return AdminSheetBody(
      title: widget.entry.userName.isEmpty ? 'Payroll entry' : widget.entry.userName,
      subtitle: 'Net and deductions are recalculated when you save',
      children: [
        AdminField(label: 'Bonus', controller: _bonus, keyboard: num),
        AdminField(label: 'Commission', controller: _commission, keyboard: num),
        AdminField(label: 'Reimbursements', controller: _reimb, keyboard: num),
        AdminField(label: 'Other deductions', controller: _other, keyboard: num),
        AdminDropdown<String>(
          label: 'Status',
          value: _status,
          items: [for (final s in const ['draft', 'approved', 'paid']) DropdownMenuItem(value: s, child: Text(AdminFmt.label(s)))],
          onChanged: (v) => setState(() => _status = v ?? _status),
        ),
        AdminField(label: 'Notes', controller: _notes, maxLines: 2),
        Row(children: [
          Expanded(child: AdminButton(label: 'Cancel', outlined: true, onPressed: () => Navigator.pop(context))),
          const SizedBox(width: 12),
          Expanded(child: AdminButton(label: 'Save', icon: LucideIcons.check, busy: _busy, onPressed: _save)),
        ]),
      ],
    );
  }
}

class _RulesForm extends StatefulWidget {
  final AdminService admin;
  final AdminWorkingHours hours;
  final AdminPayrollRules rules;
  const _RulesForm({required this.admin, required this.hours, required this.rules});

  @override
  State<_RulesForm> createState() => _RulesFormState();
}

class _RulesFormState extends State<_RulesForm> {
  late String _start = widget.hours.start;
  late String _end = widget.hours.end;
  late bool _flex = widget.hours.flexibleHours;
  late final Set<int> _days = {...widget.hours.workdays}..remove(5);
  late final TextEditingController _grace = TextEditingController(text: '${widget.hours.lateGraceMinutes}');
  late final TextEditingController _basis = TextEditingController(text: '${widget.rules.dailySalaryBasis}');
  late final TextEditingController _perMin = TextEditingController(text: '${widget.rules.deductPerLateMinute}');
  late final TextEditingController _perAbs = TextEditingController(text: '${widget.rules.absenceDeductionPerDay}');
  late bool _ot = widget.rules.overtimeEnabled;
  late final TextEditingController _otRate = TextEditingController(text: '${widget.rules.overtimeRate}');
  late final TextEditingController _comm = TextEditingController(text: '${widget.rules.commissionRate}');
  late String _commBasis = widget.rules.commissionBasis == 'net' ? 'net' : 'deal_value';
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_grace, _basis, _perMin, _perAbs, _otRate, _comm]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pickTime(bool start) async {
    final cur = (start ? _start : _end).split(':');
    final t = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: int.tryParse(cur[0]) ?? 12, minute: int.tryParse(cur.length > 1 ? cur[1] : '0') ?? 0),
    );
    if (t == null) return;
    final v = '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
    setState(() => start ? _start = v : _end = v);
  }

  Future<void> _save() async {
    double p(TextEditingController c, double def) => double.tryParse(c.text.trim()) ?? def;
    final rate = p(_comm, 0);
    if (rate < 0 || rate > 1) {
      adminSnack(context, 'Commission rate must be between 0 and 1 (e.g. 0.02 for 2%)', error: true);
      return;
    }
    final hours = AdminWorkingHours(
      start: _start,
      end: _end,
      flexibleHours: _flex,
      lateGraceMinutes: p(_grace, 20).round(),
      workdays: (_days.toList()..sort()),
    );
    final rules = AdminPayrollRules(
      dailySalaryBasis: p(_basis, 26),
      lateGraceMinutes: hours.lateGraceMinutes.toDouble(),
      deductPerLateMinute: p(_perMin, 0),
      absenceDeductionPerDay: p(_perAbs, 0),
      overtimeEnabled: _ot,
      overtimeRate: p(_otRate, 1.5),
      commissionRate: rate,
      commissionBasis: _commBasis,
    );
    setState(() => _busy = true);
    try {
      await widget.admin.saveCompanySetting('workingHours', hours.toJson());
      await widget.admin.saveCompanySetting('payrollRules', rules.toJson());
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
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const num = TextInputType.numberWithOptions(decimal: true);
    return AdminSheetBody(
      title: 'Working hours and payroll rules',
      subtitle: 'Friday is always a weekly holiday',
      children: [
        Row(children: [
          Expanded(child: _timeTile('Shift start', _start, () => _pickTime(true))),
          const SizedBox(width: 10),
          Expanded(child: _timeTile('Shift end', _end, () => _pickTime(false))),
        ]),
        const SizedBox(height: 14),
        AdminField(label: 'Late grace (minutes)', controller: _grace, keyboard: TextInputType.number),
        AdminSwitchRow(label: 'Flexible hours', value: _flex, onChanged: (v) => setState(() => _flex = v)),
        Text('Workdays', style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
        const SizedBox(height: 6),
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (var i = 0; i < 7; i++)
            if (i != 5)
              FilterChip(
                label: Text(names[i]),
                selected: _days.contains(i),
                materialTapTargetSize: MaterialTapTargetSize.padded,
                onSelected: (v) => setState(() => v ? _days.add(i) : _days.remove(i)),
              ),
        ]),
        const SizedBox(height: 16),
        AdminField(label: 'Daily salary basis (days)', controller: _basis, keyboard: num),
        AdminField(label: 'Deduction per late minute (EGP)', controller: _perMin, keyboard: num),
        AdminField(label: 'Deduction per absence day (0 = daily rate)', controller: _perAbs, keyboard: num),
        AdminSwitchRow(label: 'Overtime enabled', value: _ot, onChanged: (v) => setState(() => _ot = v)),
        AdminField(label: 'Overtime rate (multiplier)', controller: _otRate, keyboard: num),
        AdminField(label: 'Commission rate (0 to 1)', controller: _comm, keyboard: num),
        AdminDropdown<String>(
          label: 'Commission basis',
          value: _commBasis,
          items: const [
            DropdownMenuItem(value: 'deal_value', child: Text('Deal value')),
            DropdownMenuItem(value: 'net', child: Text('Net')),
          ],
          onChanged: (v) => setState(() => _commBasis = v ?? _commBasis),
        ),
        Row(children: [
          Expanded(child: AdminButton(label: 'Cancel', outlined: true, onPressed: () => Navigator.pop(context))),
          const SizedBox(width: 12),
          Expanded(child: AdminButton(label: 'Save', icon: LucideIcons.save, busy: _busy, onPressed: _save)),
        ]),
      ],
    );
  }

  Widget _timeTile(String label, String value, VoidCallback onTap) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          filled: true,
          fillColor: Surf.muted(context),
          suffixIcon: const Icon(LucideIcons.clock, size: 18),
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
        ),
        child: Text(value, style: TextStyle(color: Surf.text(context), fontFeatures: kTabular)),
      ),
    );
  }
}
