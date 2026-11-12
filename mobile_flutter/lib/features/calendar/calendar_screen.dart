import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/follow_up_model.dart';
import '../../data/services/follow_ups_service.dart';

const List<String> _weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

IconData _typeIcon(String type) {
  switch (type) {
    case 'Call':
      return LucideIcons.phone;
    case 'Site Visit':
      return LucideIcons.mapPin;
    case 'Meeting':
      return LucideIcons.calendarClock;
    case 'WhatsApp':
      return LucideIcons.messageCircle;
    case 'Email':
      return LucideIcons.mail;
    case 'Video Call':
      return LucideIcons.video;
    default:
      return LucideIcons.calendarClock;
  }
}

String _iso(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Calendar: month grid of follow-ups and meetings with a day agenda below.
/// Scoped by role through [FollowUpsService] (owners/admins all, team leaders their team, others own).
class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  final FollowUpsService _service = FollowUpsService();

  List<FollowUpModel> _all = [];
  bool _loading = true;
  String? _error;

  late DateTime _cursor;
  late String _selected;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _cursor = DateTime(now.year, now.month, 1);
    _selected = _iso(now);
    _load();
  }

  Future<void> _load() async {
    if (_all.isEmpty) setState(() => _loading = true);
    try {
      final list = await _service.getAll();
      if (!mounted) return;
      setState(() {
        _all = list;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = 'Could not load follow-ups. Pull down to retry.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Map<String, List<FollowUpModel>> get _byDay {
    final map = <String, List<FollowUpModel>>{};
    for (final f in _all) {
      final d = f.dueDate.length >= 10 ? f.dueDate.substring(0, 10) : '';
      if (d.isEmpty) continue;
      map.putIfAbsent(d, () => []).add(f);
    }
    for (final l in map.values) {
      l.sort((a, b) => (a.dueTime ?? '').compareTo(b.dueTime ?? ''));
    }
    return map;
  }

  void _shift(int delta) => setState(() => _cursor = DateTime(_cursor.year, _cursor.month + delta, 1));

  void _goToday() {
    final now = DateTime.now();
    setState(() {
      _cursor = DateTime(now.year, now.month, 1);
      _selected = _iso(now);
    });
  }

  Color _dotColor(BuildContext context, FollowUpModel f) {
    if (f.isCompleted) return AppColors.accent;
    if (f.isCancelled) return Surf.subtext(context);
    if (f.isOverdue) return AppColors.alertRed;
    return AppColors.tealCyan;
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      type: MaterialType.transparency,
      child: RefreshIndicator(
        onRefresh: _load,
        child: _loading && _all.isEmpty
            ? const SkeletonList(count: 4, height: 110)
            : ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                children: _error != null && _all.isEmpty
                    ? [SizedBox(height: 420, child: ErrorState(message: _error!, onRetry: _load))]
                    : _content(context),
              ),
      ),
    );
  }

  List<Widget> _content(BuildContext context) {
    final byDay = _byDay;
    final monthPrefix = '${_cursor.year.toString().padLeft(4, '0')}-${_cursor.month.toString().padLeft(2, '0')}';
    final monthCount = _all.where((f) => f.dueDate.startsWith(monthPrefix)).length;
    final todayIso = _iso(DateTime.now());
    final selectedList = byDay[_selected] ?? const <FollowUpModel>[];
    final selectedDate = DateTime.tryParse(_selected) ?? DateTime.now();

    return [
      Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Calendar', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Surf.text(context))),
            Text('Your follow-ups and meetings', style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
          ]),
        ),
        OutlinedButton(
          style: OutlinedButton.styleFrom(minimumSize: const Size(72, 48)),
          onPressed: _goToday,
          child: const Text('Today'),
        ),
      ]),
      const SizedBox(height: 10),
      Align(alignment: Alignment.centerLeft, child: StatusPill('$monthCount follow-ups this month', color: Surf.accent(context))),
      const SizedBox(height: 12),
      PremiumCard(
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
        child: Column(children: [
          Row(children: [
            const SizedBox(width: 8),
            Icon(LucideIcons.calendarDays, size: 16, color: Surf.accent(context)),
            const SizedBox(width: 8),
            Expanded(child: Text(DateFormat('MMMM yyyy').format(_cursor), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Surf.text(context)))),
            IconButton(
              tooltip: 'Previous month',
              constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
              onPressed: () => _shift(-1),
              icon: const Icon(LucideIcons.chevronLeft),
            ),
            IconButton(
              tooltip: 'Next month',
              constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
              onPressed: () => _shift(1),
              icon: const Icon(LucideIcons.chevronRight),
            ),
          ]),
          Row(children: [
            for (final w in _weekdays)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Center(child: Text(w, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Surf.subtext(context)))),
                ),
              ),
          ]),
          ..._weeks(context, byDay, todayIso),
        ]),
      ),
      const SizedBox(height: 4),
      Row(children: [
        Expanded(
          child: Text(
            _selected == todayIso ? 'Today' : DateFormat('EEEE, d MMM yyyy').format(selectedDate),
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Surf.text(context)),
          ),
        ),
        Text('${selectedList.length} follow-up${selectedList.length == 1 ? '' : 's'} scheduled', style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
      ]),
      const SizedBox(height: 10),
      if (selectedList.isEmpty)
        const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: EmptyState(icon: LucideIcons.calendarDays, title: 'No follow-ups', message: 'Nothing scheduled for this day.'))
      else
        for (final f in selectedList) _card(context, f),
    ];
  }

  List<Widget> _weeks(BuildContext context, Map<String, List<FollowUpModel>> byDay, String todayIso) {
    final first = DateTime(_cursor.year, _cursor.month, 1);
    final lead = first.weekday % 7; // Sunday = 0
    final days = DateTime(_cursor.year, _cursor.month + 1, 0).day;
    final cells = <DateTime?>[
      for (var i = 0; i < lead; i++) null,
      for (var d = 1; d <= days; d++) DateTime(_cursor.year, _cursor.month, d),
    ];
    while (cells.length % 7 != 0) {
      cells.add(null);
    }
    final accent = Surf.accent(context);
    return [
      for (var r = 0; r < cells.length; r += 7)
        Row(children: [
          for (var c = 0; c < 7; c++)
            Expanded(
              child: Builder(builder: (context) {
                final d = cells[r + c];
                if (d == null) return const SizedBox(height: 54);
                final key = _iso(d);
                final items = byDay[key] ?? const <FollowUpModel>[];
                final isToday = key == todayIso;
                final isSel = key == _selected;
                return Semantics(
                  button: true,
                  selected: isSel,
                  label: '${DateFormat('d MMMM').format(d)}, ${items.length} follow-ups',
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => setState(() => _selected = key),
                    child: Container(
                      height: 54,
                      margin: const EdgeInsets.all(1.5),
                      decoration: BoxDecoration(
                        color: isSel ? accent.withAlpha(Surf.dark(context) ? 40 : 30) : Colors.transparent,
                        borderRadius: BorderRadius.circular(12),
                        border: isSel ? Border.all(color: accent, width: 1.4) : null,
                      ),
                      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Container(
                          width: 26,
                          height: 26,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(color: isToday ? accent : Colors.transparent, shape: BoxShape.circle),
                          child: Text('${d.day}',
                              style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w700,
                                  color: isToday ? (Surf.dark(context) ? Colors.black : Colors.white) : Surf.text(context),
                                  fontFeatures: const [FontFeature.tabularFigures()])),
                        ),
                        const SizedBox(height: 3),
                        SizedBox(
                          height: 7,
                          child: items.isEmpty
                              ? null
                              : Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                                  for (final f in items.take(3))
                                    Container(width: 5.5, height: 5.5, margin: const EdgeInsets.symmetric(horizontal: 1.2), decoration: BoxDecoration(color: _dotColor(context, f), shape: BoxShape.circle)),
                                  if (items.length > 3) Text('+', style: TextStyle(fontSize: 9, height: 1, fontWeight: FontWeight.w800, color: Surf.subtext(context))),
                                ]),
                        ),
                      ]),
                    ),
                  ),
                );
              }),
            ),
        ]),
    ];
  }

  Widget _card(BuildContext context, FollowUpModel f) {
    final dot = _dotColor(context, f);
    final status = f.status.isEmpty ? 'Pending' : f.status;
    final overdue = f.isActive && f.isOverdue;
    final name = f.contactName.isNotEmpty ? f.contactName : (f.title.isNotEmpty ? f.title : 'Follow-up');
    return PremiumCard(
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(color: dot.withAlpha(34), borderRadius: BorderRadius.circular(12)),
            child: Icon(_typeIcon(f.followUpType), size: 17, color: dot),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: Surf.text(context))),
              const SizedBox(height: 3),
              Wrap(spacing: 10, runSpacing: 2, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Text(f.followUpType.isEmpty ? 'Follow-up' : f.followUpType, style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
                if (f.dueTime != null && f.dueTime!.isNotEmpty) Text(f.dueTime!, style: TextStyle(fontSize: 12, color: Surf.subtext(context), fontFeatures: const [FontFeature.tabularFigures()])),
                if (f.agent != null && f.agent!.isNotEmpty) Text(f.agent!, style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
              ]),
            ]),
          ),
          const SizedBox(width: 8),
          StatusPill(status, color: f.isCompleted ? AppColors.accent : (f.isCancelled ? Surf.subtext(context) : AppColors.tealCyan)),
        ]),
        if (f.isCompleted || overdue || (f.leadId != null && f.leadId!.isNotEmpty))
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(children: [
              if (f.isCompleted)
                Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(LucideIcons.circleCheck, size: 14, color: AppColors.accent),
                  const SizedBox(width: 4),
                  Text('Completed', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Surf.dark(context) ? AppColors.accent : AppColors.primaryHover)),
                ])
              else if (overdue)
                const Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(LucideIcons.circleAlert, size: 14, color: AppColors.alertRed),
                  SizedBox(width: 4),
                  Text('Overdue', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.alertRed)),
                ]),
              const Spacer(),
              if (f.leadId != null && f.leadId!.isNotEmpty)
                TextButton.icon(
                  style: TextButton.styleFrom(minimumSize: const Size(48, 44)),
                  onPressed: () => context.push('/leads/${f.leadId}'),
                  icon: const Icon(LucideIcons.userRound, size: 15),
                  label: const Text('Open lead'),
                ),
            ]),
          ),
      ]),
    );
  }
}
