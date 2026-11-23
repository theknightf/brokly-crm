import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/tr.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/attendance_model.dart';
import '../../state/attendance_provider.dart';
import '../../state/auth_provider.dart';

/// Attendance, same layout as the website: today in one card with one big button, a four-number summary
/// (week / month), then one line per day.
class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key});

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  Timer? _clockTimer;
  DateTime _now = DateTime.now();
  bool _month = false; // false = last 7 days, true = this month

  @override
  void initState() {
    super.initState();
    _clockTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _clockTimer?.cancel();
    super.dispose();
  }

  static String _time(String? iso) {
    if (iso == null) return '—';
    final d = DateTime.tryParse(iso)?.toLocal();
    return d == null ? '—' : DateFormat('h:mm a').format(d);
  }

  static String _hm(int minutes) {
    if (minutes <= 0) return '—';
    final h = minutes ~/ 60;
    final m = minutes % 60;
    return h > 0 ? '${h}h ${m}m' : '${m}m';
  }

  List<AttendanceModel> _inRange(List<AttendanceModel> all) {
    final today = DateTime(_now.year, _now.month, _now.day);
    return all.where((a) {
      final d = DateTime.tryParse(a.attendanceDate);
      if (d == null) return false;
      return _month
          ? (d.year == today.year && d.month == today.month)
          : !d.isBefore(today.subtract(const Duration(days: 6)));
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = Theme.of(context).textTheme;
    final provider = context.watch<AttendanceProvider>();
    final profile = context.watch<AuthProvider>().profile;
    final firstName = (profile?.fullName ?? '').trim().split(RegExp(r'\s+')).first;

    final today = provider.today;
    final checkedIn = provider.isCheckedIn;
    final checkedOut = provider.isCheckedOut;
    final busy = provider.isBusy;

    // Worked time: live while checked in, final once checked out.
    int workedMin = 0;
    if (today?.checkInTime != null) {
      final start = DateTime.tryParse(today!.checkInTime!);
      final end = today.checkOutTime != null ? DateTime.tryParse(today.checkOutTime!) : _now;
      if (start != null && end != null) workedMin = end.difference(start).inMinutes.clamp(0, 24 * 60);
    }
    final state = checkedOut ? 2 : (checkedIn ? 1 : 0); // 0 idle, 1 working, 2 done
    final stateText = [tr('Not checked in yet', 'لسه ما سجلتش حضورك'), tr('Working now', 'شغال دلوقتي'), tr('Done for today', 'خلصت النهارده')][state];
    final stateColor = [p.subtext, p.success, p.info][state];

    final bigText = state == 0
        ? DateFormat('h:mm').format(_now)
        : '${(workedMin ~/ 60).toString().padLeft(2, '0')}:${(workedMin % 60).toString().padLeft(2, '0')}';
    final bigCaption = state == 0 ? tr('Current time', 'الساعة دلوقتي') : tr('Worked today', 'ساعات الشغل النهارده');

    final range = _inRange(provider.history);
    final present = range.where((a) => a.isCheckedIn).length;
    final complete = range.where((a) => a.isCheckedIn && a.isCheckedOut).length;
    final late = range.where((a) => a.delayMinutes > 0).length;
    final totalMin = range.fold<int>(0, (s, a) => s + a.durationMinutes);
    final delayToday = today?.delayMinutes ?? 0;

    return Scaffold(
      backgroundColor: p.background,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => provider.init(),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.lg, AppSpacing.page, AppSpacing.listBottom),
            children: [
              Semantics(
                header: true,
                child: Text(firstName.isEmpty ? tr('Attendance', 'الحضور') : tr('Hi $firstName', 'أهلاً $firstName'), style: t.headlineSmall),
              ),
              const SizedBox(height: 2),
              Text(DateFormat('EEEE, d MMMM').format(_now), style: t.bodySmall),
              const SizedBox(height: AppSpacing.lg),

              // ── Today: one card, one big button ──
              PremiumCard(
                padding: const EdgeInsets.all(AppSpacing.xl),
                child: Column(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                      decoration: BoxDecoration(color: stateColor.withAlpha(36), borderRadius: BorderRadius.circular(20)),
                      child: Text(stateText, style: t.labelMedium?.copyWith(color: stateColor, fontWeight: FontWeight.w700)),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Text(bigText, style: t.displayMedium?.copyWith(fontWeight: FontWeight.w900, fontFeatures: const [FontFeature.tabularFigures()])),
                    Text(bigCaption, style: t.bodySmall),
                    const SizedBox(height: AppSpacing.lg),
                    SizedBox(
                      width: double.infinity,
                      height: 64,
                      child: FilledButton.icon(
                        style: FilledButton.styleFrom(
                          backgroundColor: state == 1 ? p.danger : p.accent,
                          foregroundColor: state == 1 ? Colors.white : p.onAccent,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                        ),
                        onPressed: busy || checkedOut
                            ? null
                            : () async {
                                if (checkedIn) {
                                  await provider.checkOut();
                                } else {
                                  await provider.checkIn();
                                }
                              },
                        icon: busy
                            ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                            : Icon(state == 1 ? LucideIcons.logOut : (state == 2 ? LucideIcons.circleCheck : LucideIcons.logIn), size: 24),
                        label: Text(
                          busy
                              ? (provider.busyPhase.isEmpty ? tr('Working…', 'جاري التنفيذ…') : provider.busyPhase)
                              : state == 1
                                  ? tr('Check out', 'سجّل انصراف')
                                  : state == 2
                                      ? tr('All done', 'تم النهارده')
                                      : tr('Check in', 'سجّل حضور'),
                          style: t.titleMedium?.copyWith(fontWeight: FontWeight.w800, color: state == 1 ? Colors.white : p.onAccent),
                        ),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Row(
                      children: [
                        _Fact(label: tr('In', 'دخول'), value: _time(today?.checkInTime)),
                        _Fact(label: tr('Out', 'خروج'), value: _time(today?.checkOutTime)),
                        _Fact(label: tr('Worked', 'اشتغلت'), value: _hm(workedMin)),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Wrap(
                      alignment: WrapAlignment.center,
                      spacing: 8,
                      runSpacing: 6,
                      children: [
                        if (today?.hasGps == true)
                          _Chip(icon: LucideIcons.mapPin, text: tr('Location OK', 'الموقع تمام'), color: p.success)
                        else
                          _Chip(icon: LucideIcons.mapPin, text: tr('No location', 'من غير موقع'), color: p.subtext),
                        if (delayToday > 0)
                          _Chip(icon: LucideIcons.triangleAlert, text: tr('Late $delayToday min', 'متأخر $delayToday د'), color: p.warning)
                        else if (checkedIn)
                          _Chip(icon: LucideIcons.circleCheck, text: tr('On time', 'في الميعاد'), color: p.success),
                      ],
                    ),
                  ],
                ),
              ),

              if (provider.error != null && provider.error!.trim().isNotEmpty)
                PremiumCard(
                  tint: p.danger.withAlpha(24),
                  borderColor: p.danger.withAlpha(90),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(LucideIcons.triangleAlert, size: 18, color: p.danger),
                      const SizedBox(width: AppSpacing.md),
                      Expanded(child: Text(provider.error!.replaceAll('Exception: ', ''), style: t.bodySmall?.copyWith(color: p.danger))),
                    ],
                  ),
                ),

              // ── Summary ──
              const SizedBox(height: AppSpacing.sm),
              Row(
                children: [
                  Expanded(child: Text(tr('My record', 'سجلي'), style: t.titleMedium)),
                  ChoiceChip(label: Text(tr('Week', 'أسبوع')), selected: !_month, onSelected: (_) => setState(() => _month = false)),
                  const SizedBox(width: 8),
                  ChoiceChip(label: Text(tr('Month', 'شهر')), selected: _month, onSelected: (_) => setState(() => _month = true)),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  _Stat(label: tr('Present', 'حضور'), value: '$present'),
                  _Stat(label: tr('Complete', 'مكتمل'), value: '$complete'),
                  _Stat(label: tr('Late', 'تأخير'), value: '$late', color: late > 0 ? p.warning : null),
                  _Stat(label: tr('Hours', 'ساعات'), value: totalMin <= 0 ? '—' : (totalMin / 60).toStringAsFixed(1)),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),

              // ── History: one line per day ──
              if (provider.isLoading && provider.history.isEmpty)
                const Padding(padding: EdgeInsets.symmetric(vertical: 32), child: Center(child: CircularProgressIndicator()))
              else if (range.isEmpty)
                PremiumCard(
                  child: Column(
                    children: [
                      Icon(LucideIcons.calendarCheck2, size: 30, color: p.subtext),
                      const SizedBox(height: 8),
                      Text(tr('No attendance yet', 'مفيش حضور مسجّل لسه'), style: t.titleSmall),
                      Text(tr('Your days will show up here.', 'أيامك هتظهر هنا.'), style: t.bodySmall),
                    ],
                  ),
                )
              else
                PremiumCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (var i = 0; i < range.length; i++) ...[
                        if (i > 0) Divider(height: 1, color: p.border),
                        _DayRow(record: range[i]),
                      ],
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  final String label;
  final String value;
  const _Fact({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Expanded(
      child: Column(
        children: [
          Text(label, style: t.bodySmall),
          const SizedBox(height: 2),
          Text(value, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final IconData icon;
  final String text;
  final Color color;
  const _Chip({required this.icon, required this.text, required this.color});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: color.withAlpha(28), borderRadius: BorderRadius.circular(20)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 5),
          Text(text, style: t.labelSmall?.copyWith(color: color, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String label;
  final String value;
  final Color? color;
  const _Stat({required this.label, required this.value, this.color});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Expanded(
      child: PremiumCard(
        margin: const EdgeInsets.symmetric(horizontal: 3),
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.md, horizontal: 4),
        child: Column(
          children: [
            Text(value, style: t.titleLarge?.copyWith(fontWeight: FontWeight.w800, color: color)),
            Text(label, style: t.bodySmall),
          ],
        ),
      ),
    );
  }
}

class _DayRow extends StatelessWidget {
  final AttendanceModel record;
  const _DayRow({required this.record});

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = Theme.of(context).textTheme;
    final done = record.isCheckedIn && record.isCheckedOut;
    final partial = record.isCheckedIn && !record.isCheckedOut;
    final late = record.delayMinutes > 0;
    final d = DateTime.tryParse(record.attendanceDate);
    final dayText = d == null ? record.attendanceDate : DateFormat('EEE, d MMM').format(d);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
      child: Row(
        children: [
          Container(width: 10, height: 10, decoration: BoxDecoration(shape: BoxShape.circle, color: done ? p.success : (partial ? p.warning : p.subtext.withAlpha(110)))),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(dayText, style: t.titleSmall),
                Wrap(
                  spacing: 8,
                  children: [
                    Text('${_AttendanceHelpers.time(record.checkInTime)} → ${_AttendanceHelpers.time(record.checkOutTime)}', style: t.bodySmall),
                    if (late) Text(tr('late ${record.delayMinutes}m', 'متأخر ${record.delayMinutes} د'), style: t.bodySmall?.copyWith(color: p.warning, fontWeight: FontWeight.w700)),
                    if (partial) Text(tr('no check-out', 'من غير انصراف'), style: t.bodySmall?.copyWith(color: p.warning, fontWeight: FontWeight.w700)),
                  ],
                ),
              ],
            ),
          ),
          Text(_AttendanceHelpers.hm(record.durationMinutes), style: t.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

class _AttendanceHelpers {
  static String time(String? iso) => _AttendanceScreenState._time(iso);
  static String hm(int m) => _AttendanceScreenState._hm(m);
}
