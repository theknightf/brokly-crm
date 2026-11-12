import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/admin_models.dart';
import '../../data/services/admin_performance_service.dart';
import '../../data/services/admin_service.dart';
import 'admin_ui.dart';
import 'employee_360_screen.dart';

/// Performance 360 leaderboard: Total = Call x0.40 + Attendance x0.30 + Dress x0.30.
/// Tap a row to open the employee's 360 profile. Admin can also record the daily
/// dress-code evaluation that feeds the ranking.
class AdminPerformanceTab extends StatefulWidget {
  const AdminPerformanceTab({super.key});

  @override
  State<AdminPerformanceTab> createState() => _AdminPerformanceTabState();
}

class _AdminPerformanceTabState extends State<AdminPerformanceTab> {
  final AdminPerformanceService _service = AdminPerformanceService();
  String _period = 'month';

  @override
  Widget build(BuildContext context) {
    return AdminLoader<AdminLeaderboard>(
      key: ValueKey(_period),
      loader: () => _service.getLeaderboard(_period),
      builder: (context, lb, reload) => [
        SectionHeader(
          title: 'Performance leaderboard',
          subtitle: '${AdminFmt.date(lb.start)} to ${AdminFmt.date(lb.end)}  ·  Call 40 / Attendance 30 / Dress 30',
          trailing: AdminButton(
            label: 'Dress code',
            icon: LucideIcons.shirt,
            outlined: true,
            onPressed: () => _dressCode(context, reload),
          ),
        ),
        AdminChipRow<String>(
          options: const ['day', 'week', 'month'],
          selected: _period,
          labelOf: AdminFmt.label,
          onSelected: (v) => setState(() => _period = v),
        ),
        const SizedBox(height: 8),
        if (lb.rows.isEmpty)
          const AdminEmptyBlock(icon: LucideIcons.trophy, title: 'No data for this period')
        else
          for (final r in lb.rows) _RankCard(row: r),
      ],
    );
  }

  Future<void> _dressCode(BuildContext context, Future<void> Function() reload) async {
    final saved = await showPremiumSheet<bool>(context, builder: (ctx) => const AdminDressCodeForm());
    if (saved == true) {
      if (context.mounted) adminSnack(context, 'Dress code evaluation saved. Leaderboard updated');
      await reload();
    }
  }
}

class _RankCard extends StatelessWidget {
  final AdminLeaderboardRow row;
  const _RankCard({required this.row});

  Color _rankColor() => switch (row.rank) {
        1 => const Color(0xFFF59E0B),
        2 => const Color(0xFF94A3B8),
        3 => const Color(0xFFF97316),
        _ => AppColors.mutedText,
      };

  @override
  Widget build(BuildContext context) {
    final s = row.scores;
    return PremiumCard(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => Employee360Screen(employeeId: row.userId, standalone: true))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: _rankColor().withAlpha(row.rank <= 3 ? 50 : 30), shape: BoxShape.circle),
            child: row.rank <= 3
                ? Icon(LucideIcons.crown, size: 16, color: _rankColor())
                : Text('${row.rank}', style: TextStyle(fontWeight: FontWeight.w800, color: Surf.subtext(context), fontFeatures: kTabular)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(row.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Surf.text(context))),
              Text(AdminFmt.label(row.role), style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
            ]),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text('${s.total}',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Surf.accent(context), fontFeatures: kTabular)),
            Text('/100', style: TextStyle(fontSize: 11, color: Surf.subtext(context))),
          ]),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: AdminScoreBar(label: 'Call 40%', value: s.call, color: AppColors.statusInterested)),
          const SizedBox(width: 10),
          Expanded(child: AdminScoreBar(label: 'Attend 30%', value: s.attendance, color: AppColors.statusFollowingUp)),
          const SizedBox(width: 10),
          Expanded(child: AdminScoreBar(label: 'Dress 30%', value: s.dress, color: AppColors.neonLimeDark)),
        ]),
        const SizedBox(height: 8),
        Text(
          '${row.totalCalls} calls  ·  ${row.presentDays}/${row.totalDays} days  ·  ${row.avgDress != null ? '${row.avgDress}/5' : 'no rating'}',
          style: TextStyle(fontSize: 12, color: Surf.subtext(context), fontFeatures: kTabular),
        ),
      ]),
    );
  }
}

/// Daily dress-code evaluation (admin/owner only). Writes to `evaluations`.
class AdminDressCodeForm extends StatefulWidget {
  /// Pre-selects an employee (used from the 360 profile).
  final String? employeeId;
  const AdminDressCodeForm({super.key, this.employeeId});

  @override
  State<AdminDressCodeForm> createState() => _AdminDressCodeFormState();
}

class _AdminDressCodeFormState extends State<AdminDressCodeForm> {
  final AdminService _admin = AdminService();
  final AdminPerformanceService _perf = AdminPerformanceService();
  late final Future<List<AdminUser>> _employees = _admin.getActiveEmployees();
  late String? _employee = widget.employeeId;
  String _date = AdminFmt.iso(DateTime.now());
  int _rating = 3;
  final TextEditingController _flags = TextEditingController();
  final TextEditingController _notes = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _flags.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_employee == null) {
      adminSnack(context, 'Select an employee', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      await _perf.submitDressCode(
        employeeId: _employee!,
        date: _date,
        rating: _rating,
        notes: _notes.text,
        flags: _flags.text.split(','),
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
    const options = [(1, 'Casual', 'Score 1'), (2, 'Semi-Formal', 'Score 2'), (3, 'Classic / Formal', 'Score 3')];
    return AdminSheetBody(
      title: 'Daily dress code evaluation',
      subtitle: 'Feeds the leaderboard (30%) and the 360 profile',
      children: [
        FutureBuilder<List<AdminUser>>(
          future: _employees,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Padding(padding: EdgeInsets.only(bottom: 14), child: LinearProgressIndicator());
            }
            final list = snap.data ?? [];
            return AdminDropdown<String>(
              label: 'Employee *',
              value: list.any((u) => u.id == _employee) ? _employee : null,
              items: [
                for (final u in list)
                  DropdownMenuItem(value: u.id, child: Text('${u.displayName}  ·  ${AdminFmt.label(u.role)}', overflow: TextOverflow.ellipsis)),
              ],
              onChanged: (v) => setState(() => _employee = v),
            );
          },
        ),
        AdminDateField(label: 'Date *', value: _date, last: DateTime.now(), onChanged: (v) => setState(() => _date = v)),
        Text('Dress code rating *', style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
        const SizedBox(height: 8),
        Row(children: [
          for (final o in options)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: () => setState(() => _rating = o.$1),
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 64),
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: _rating == o.$1 ? Surf.accent(context).withAlpha(36) : Surf.muted(context),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: _rating == o.$1 ? Surf.accent(context) : Colors.transparent, width: 2),
                    ),
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Text(o.$2, textAlign: TextAlign.center, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: Surf.text(context))),
                      Text(o.$3, style: TextStyle(fontSize: 11, color: Surf.subtext(context))),
                    ]),
                  ),
                ),
              ),
            ),
        ]),
        const SizedBox(height: 14),
        AdminField(label: 'Behavioral flags (comma separated)', controller: _flags, hint: 'e.g. no tie, sneakers'),
        AdminField(label: 'Notes', controller: _notes, maxLines: 2),
        Row(children: [
          Expanded(child: AdminButton(label: 'Cancel', outlined: true, onPressed: () => Navigator.pop(context))),
          const SizedBox(width: 12),
          Expanded(child: AdminButton(label: 'Submit', icon: LucideIcons.check, busy: _busy, onPressed: _submit)),
        ]),
      ],
    );
  }
}
