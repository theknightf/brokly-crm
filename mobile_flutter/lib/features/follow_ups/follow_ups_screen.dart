import 'package:flutter/material.dart';
import 'package:intl/intl.dart' show DateFormat;
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/tr.dart';
import '../../core/utils/whatsapp_utils.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/lead_model.dart';
import '../../data/services/follow_ups_service.dart';
import '../../state/leads_provider.dart';
import '../leads/lead_detail_screen.dart';
import '../leads/widgets/log_call_dialog.dart';
import '../leads/widgets/quick_note_dialog.dart';

/// Follow-up Center: every lead with a next-action date, grouped Overdue / Today / Upcoming.
/// Swipe right = done (with undo), swipe left = reschedule, long-press = more. "Add follow-up" is always visible.
/// Source of truth is the lead's `follow_up_due` (same rule as the website).
class FollowUpsScreen extends StatefulWidget {
  /// Sales agents: only two filters, Overdue and Today (no Upcoming / All, no extra filter pills).
  final bool overdueTodayOnly;

  const FollowUpsScreen({super.key, this.overdueTodayOnly = false});

  @override
  State<FollowUpsScreen> createState() => _FollowUpsScreenState();
}

enum _Bucket { overdue, today, upcoming, all }

enum _Filter { all, hot, priority }

/// Same closed stages as the website: a lead in one of them has no live follow-up.
const _closedStages = {
  'done deal', 'won', 'lost', 'cancellation', 'not interested', 'duplicate leads', 'wrong number', 'closed number', 'low budget',
};
const _hotStages = {'meeting', 'interested', 'following up', 'follow up after meeting', 'reservation'};

bool _isOpen(LeadModel l) => !_closedStages.contains(l.status.toLowerCase().trim());

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

class _FollowUpsScreenState extends State<FollowUpsScreen> {
  _Bucket _bucket = _Bucket.overdue;
  bool _bucketPicked = false;
  _Filter _filter = _Filter.all;
  String _query = '';
  final _busy = <String>{}; // lead ids with a save in flight (blocks double taps)
  final _service = FollowUpsService();
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  // ── Data ────────────────────────────────────────────────────────────

  _Bucket _bucketOf(LeadModel l, DateTime today) {
    final d = l.followUpDateTime?.toLocal();
    if (d == null) return _Bucket.upcoming;
    final day = _day(d);
    if (day.isBefore(today)) return _Bucket.overdue;
    if (day == today) return _Bucket.today;
    return _Bucket.upcoming;
  }

  bool _matches(LeadModel l) {
    switch (_filter) {
      case _Filter.hot:
        if (!_hotStages.contains(l.status.toLowerCase().trim())) return false;
        break;
      case _Filter.priority:
        final p = l.priority.toLowerCase();
        if (p == 'normal' || p == 'low' || p.isEmpty) return false;
        break;
      case _Filter.all:
        break;
    }
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return true;
    return l.name.toLowerCase().contains(q) || l.phone.contains(q) || (l.project?.toLowerCase().contains(q) ?? false);
  }

  // ── Actions ─────────────────────────────────────────────────────────

  Future<void> _guard(String leadId, Future<void> Function() run) async {
    if (_busy.contains(leadId)) return; // double tap
    setState(() => _busy.add(leadId));
    try {
      await run();
    } finally {
      if (mounted) setState(() => _busy.remove(leadId));
    }
  }

  Future<void> _markDone(LeadModel lead) => _guard(lead.id, () async {
        final provider = context.read<LeadsProvider>();
        final previous = lead.followUpDue;
        tapFeedback();
        try {
          await provider.updateLead(lead.id, {'follow_up_due': null});
          // Close the follow-up row too, so the dashboard and calendar agree with this screen.
          await _service.closeForLead(lead.id);
        } catch (e) {
          if (mounted) showAppSnack(context, tr('Could not mark it done. Try again.', 'معرفناش نقفلها. جرّب تاني.'), error: true);
          return;
        }
        await provider.addNote(lead.id, 'Follow-up done on ${DateFormat('dd/MM/yyyy HH:mm').format(DateTime.now())}');
        if (!mounted) return;
        showAppSnack(
          context,
          tr('Done: ${lead.name}', 'تمت المتابعة: ${lead.name}'),
          actionLabel: tr('Undo', 'تراجع'),
          onAction: () => _setDue(lead, previous, quiet: true),
        );
      });

  /// Set (or clear with null) the next action date.
  Future<void> _setDue(LeadModel lead, String? ymd, {bool quiet = false}) => _guard(lead.id, () async {
        try {
          await context.read<LeadsProvider>().updateLead(lead.id, {'follow_up_due': ymd});
          if (ymd == null) await _service.closeForLead(lead.id, status: 'Cancelled');
          tapFeedback();
          if (!mounted || quiet) return;
          showAppSnack(
            context,
            ymd == null
                ? tr('Follow-up removed', 'اتشالت المتابعة')
                : tr('Moved to ${_fmtDay(DateTime.parse(ymd))}', 'اتأجلت لـ ${_fmtDay(DateTime.parse(ymd))}'),
          );
        } catch (_) {
          if (mounted) showAppSnack(context, tr('Could not save. Check the connection.', 'محصلش حفظ. اتأكد من النت.'), error: true);
        }
      });

  Future<void> _reschedule(LeadModel lead) async {
    final picked = await _pickDate(context, title: tr('Move follow-up', 'تأجيل المتابعة'), subtitle: lead.name, current: lead.followUpDateTime);
    if (picked != null && mounted) await _setDue(lead, DateFormat('yyyy-MM-dd').format(picked));
  }

  Future<void> _remove(LeadModel lead) async {
    final ok = await confirmAction(
      context,
      title: tr('Remove follow-up?', 'تشيل المتابعة؟'),
      message: tr('${lead.name} will have no next action date.', '${lead.name} مش هيبقى ليه ميعاد إجراء جاي.'),
      confirmLabel: tr('Remove', 'شيل'),
      destructive: true,
    );
    if (ok && mounted) await _setDue(lead, null);
  }

  Future<void> _call(LeadModel lead) => LogCallDialog.dialAndTrack(context, lead: lead);

  Future<void> _whatsApp(LeadModel lead) async {
    final launched = await WhatsAppUtils.openWhatsAppChat(context, phone: lead.phone);
    if (launched && mounted) LogCallDialog.show(context, lead: lead, initialChannel: 'WhatsApp');
  }

  void _note(LeadModel lead) => QuickNoteDialog.show(
        context,
        leadName: lead.name,
        onSaveNote: (note) => context.read<LeadsProvider>().addNote(lead.id, note),
      );

  void _open(LeadModel lead) => Navigator.push(context, MaterialPageRoute(builder: (_) => LeadDetailScreen(leadId: lead.id)));

  Future<void> _more(LeadModel lead) async {
    final p = context.palette;
    await showPremiumSheet<void>(context, builder: (ctx) {
      Widget item(IconData icon, String label, VoidCallback onTap, {Color? color}) => ListTile(
            leading: Icon(icon, color: color ?? p.text),
            title: Text(label, style: TextStyle(color: color ?? p.text, fontWeight: FontWeight.w600)),
            minTileHeight: AppSpacing.tap + 8,
            onTap: () {
              Navigator.pop(ctx);
              onTap();
            },
          );
      return SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
            child: Row(children: [
              Expanded(child: Text(lead.name, style: Theme.of(ctx).textTheme.titleMedium, overflow: TextOverflow.ellipsis)),
              StatusPill(lead.status),
            ]),
          ),
          item(LucideIcons.userRound, tr('Open lead', 'افتح العميل'), () => _open(lead)),
          item(LucideIcons.circleCheck, tr('Mark done', 'تمت'), () => _markDone(lead), color: p.accent),
          item(LucideIcons.calendarClock, tr('Reschedule', 'تأجيل'), () => _reschedule(lead)),
          item(LucideIcons.notebookPen, tr('Add note', 'نوتة'), () => _note(lead)),
          item(LucideIcons.trash2, tr('Remove follow-up', 'شيل المتابعة'), () => _remove(lead), color: p.danger),
          const SizedBox(height: 8),
        ]),
      );
    });
  }

  Future<void> _add(List<LeadModel> openLeads) async {
    final lead = await showPremiumSheet<LeadModel>(context, builder: (ctx) => _LeadPicker(leads: openLeads));
    if (lead == null || !mounted) return;
    final date = await _pickDate(context, title: tr('When?', 'إمتى؟'), subtitle: lead.name, current: lead.followUpDateTime);
    if (date == null || !mounted) return;
    await _setDue(lead, DateFormat('yyyy-MM-dd').format(date));
  }

  // ── UI ──────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = Theme.of(context).textTheme;
    final provider = context.watch<LeadsProvider>();
    final all = provider.allLeads; // unfiltered: a filter left on the Leads tab must not empty this screen
    final today = _day(DateTime.now());

    final withDue = all.where((l) => (l.followUpDue?.trim().isNotEmpty ?? false) && _isOpen(l)).toList()
      ..sort((a, b) => (a.followUpDateTime ?? today).compareTo(b.followUpDateTime ?? today));
    final counts = {for (final b in _Bucket.values) b: 0};
    for (final l in withDue) {
      counts[_bucketOf(l, today)] = counts[_bucketOf(l, today)]! + 1;
    }
    counts[_Bucket.all] = withDue.length;

    // Open on the first group that has something, once.
    if (!_bucketPicked && withDue.isNotEmpty) {
      _bucketPicked = true;
      _bucket = counts[_Bucket.overdue]! > 0
          ? _Bucket.overdue
          : counts[_Bucket.today]! > 0
              ? _Bucket.today
              : (widget.overdueTodayOnly ? _Bucket.today : _Bucket.upcoming);
    }

    final shown = withDue.where((l) => (_bucket == _Bucket.all || _bucketOf(l, today) == _bucket) && _matches(l)).toList();
    final loading = provider.isLoading && all.isEmpty;
    final failed = provider.error != null && all.isEmpty;

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _add(all.where(_isOpen).toList()),
        icon: const Icon(LucideIcons.plus),
        label: Text(tr('Add follow-up', 'متابعة جديدة')),
      ),
      body: SafeArea(
        bottom: false,
        child: Column(children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.md, AppSpacing.sm, AppSpacing.sm),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Semantics(header: true, child: Text(tr('Follow-ups', 'المتابعات'), style: t.headlineSmall)),
                  const SizedBox(height: 2),
                  Text(
                    tr('${counts[_Bucket.overdue]} ${widget.overdueTodayOnly ? 'late' : 'overdue'} · ${counts[_Bucket.today]} today', '${counts[_Bucket.overdue]} متأخرة · ${counts[_Bucket.today]} النهارده'),
                    style: t.bodySmall,
                  ),
                ]),
              ),
              IconButton(
                tooltip: tr('Refresh', 'تحديث'),
                onPressed: provider.isLoading ? null : () => provider.fetchLeads(),
                icon: const Icon(LucideIcons.refreshCw, size: 20),
              ),
            ]),
          ),
          // Search
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
            child: AppSearchField(
              controller: _search,
              hint: tr('Search name, phone or project', 'دوّر بالاسم أو الرقم أو المشروع'),
              onChanged: (v) => setState(() => _query = v),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          // Groups: Overdue / Today / Upcoming / All
          FilterChipRow<_Bucket>(
            options: widget.overdueTodayOnly ? const [_Bucket.overdue, _Bucket.today] : _Bucket.values,
            selected: _bucket,
            labelOf: _bucketLabel,
            countOf: (b) => counts[b],
            onSelected: (b) => setState(() {
              _bucket = b;
              _bucketPicked = true;
            }),
          ),
          const SizedBox(height: AppSpacing.sm),
          // Simple filters
          if (!widget.overdueTodayOnly) SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
              children: [
                for (final f in _Filter.values) ...[
                  _FilterPill(
                    label: _filterLabel(f),
                    icon: f == _Filter.hot ? LucideIcons.flame : (f == _Filter.priority ? LucideIcons.flag : null),
                    selected: _filter == f,
                    onTap: () => setState(() => _filter = f),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                ],
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          // List
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => provider.fetchLeads(silent: true),
              child: AnimatedSwitcher(
                duration: AppMotion.normal,
                child: loading
                    ? const SkeletonList(count: 5, height: 132)
                    : failed
                        ? _scrollable(ErrorState(
                            message: tr('Check the connection and try again.', 'اتأكد من النت وجرّب تاني.'),
                            onRetry: () => provider.fetchLeads(),
                          ))
                        : shown.isEmpty
                            ? _scrollable(_empty(withDue.isNotEmpty))
                            : ListView.builder(
                                key: ValueKey('$_bucket$_filter'),
                                physics: const AlwaysScrollableScrollPhysics(),
                                padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, AppSpacing.listBottom),
                                itemCount: shown.length,
                                itemBuilder: (_, i) {
                                  final lead = shown[i];
                                  final b = _bucketOf(lead, today);
                                  final showHeader = _bucket == _Bucket.all && (i == 0 || _bucketOf(shown[i - 1], today) != b);
                                  return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                                    if (showHeader)
                                      Padding(
                                        padding: EdgeInsets.only(top: i == 0 ? 0 : AppSpacing.md, bottom: AppSpacing.sm),
                                        child: Text('${_bucketLabel(b)} · ${counts[b]}', style: t.labelMedium?.copyWith(color: b == _Bucket.overdue ? p.danger : p.subtext)),
                                      ),
                                    _swipeable(lead, b, today),
                                  ]);
                                },
                              ),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _swipeable(LeadModel lead, _Bucket b, DateTime today) {
    final p = context.palette;
    Widget bg(Color c, IconData icon, String label, Alignment a) => Container(
          margin: const EdgeInsets.only(bottom: AppSpacing.md),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xxl),
          alignment: a,
          decoration: BoxDecoration(color: c.withAlpha(40), borderRadius: AppRadius.card),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, color: c),
            const SizedBox(width: AppSpacing.sm),
            Text(label, style: TextStyle(color: c, fontWeight: FontWeight.w700)),
          ]),
        );
    return Dismissible(
      key: ValueKey('fu-${lead.id}-${lead.followUpDue}'),
      background: bg(p.accent, LucideIcons.circleCheck, tr('Done', 'تمت'), AlignmentDirectional.centerStart.resolve(Directionality.of(context))),
      secondaryBackground: bg(p.info, LucideIcons.calendarClock, tr('Later', 'تأجيل'), AlignmentDirectional.centerEnd.resolve(Directionality.of(context))),
      confirmDismiss: (dir) async {
        if (dir == DismissDirection.startToEnd) {
          await _markDone(lead);
        } else {
          await _reschedule(lead);
        }
        return false; // the list re-renders from the provider; never remove the row optimistically
      },
      child: _FollowUpCard(
        lead: lead,
        bucket: b,
        today: today,
        busy: _busy.contains(lead.id),
        onOpen: () => _open(lead),
        onMore: () => _more(lead),
        onCall: () => _call(lead),
        onWhatsApp: () => _whatsApp(lead),
        onNote: () => _note(lead),
        onLater: () => _reschedule(lead),
        onDone: () => _markDone(lead),
      ),
    );
  }

  Widget _empty(bool othersHaveItems) {
    final filtered = _filter != _Filter.all || _query.trim().isNotEmpty;
    if (filtered) {
      return EmptyState(
        icon: LucideIcons.searchX,
        title: tr('Nothing matches', 'مفيش نتايج'),
        message: tr('Try another search or filter.', 'جرّب بحث أو فلتر تاني.'),
        actionLabel: tr('Clear filters', 'امسح الفلاتر'),
        onAction: () => setState(() {
          _filter = _Filter.all;
          _query = '';
          _search.clear();
        }),
      );
    }
    if (othersHaveItems && !widget.overdueTodayOnly) {
      return EmptyState(
        icon: LucideIcons.calendarCheck,
        title: _bucket == _Bucket.overdue ? tr('Nothing overdue 👏', 'مفيش متأخرات 👏') : tr('Nothing here', 'مفيش حاجة هنا'),
        message: tr('Other groups still have follow-ups.', 'لسه فيه متابعات في مجموعات تانية.'),
        actionLabel: tr('Show all', 'اعرض الكل'),
        onAction: () => setState(() => _bucket = _Bucket.all),
      );
    }
    if (othersHaveItems && widget.overdueTodayOnly) {
      final other = _bucket == _Bucket.overdue ? _Bucket.today : _Bucket.overdue;
      return EmptyState(
        icon: LucideIcons.calendarCheck,
        title: _bucket == _Bucket.overdue ? tr('Nothing late 👏', 'مفيش متأخرات 👏') : tr('Nothing for today', 'مفيش حاجة النهارده'),
        message: tr('Your other follow-ups are scheduled for later.', 'باقي متابعاتك متحددة بعدين.'),
        actionLabel: _bucketLabel(other),
        onAction: () => setState(() => _bucket = other),
      );
    }
    return EmptyState(
      icon: LucideIcons.calendarCheck,
      title: tr('No follow-ups', 'مفيش متابعات'),
      message: tr('Add one to plan your next call.', 'ضيف متابعة عشان تخطط لمكالمتك الجاية.'),
    );
  }

  /// Keeps pull-to-refresh working on empty / error states.
  Widget _scrollable(Widget child) => LayoutBuilder(
        builder: (_, c) => SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          child: ConstrainedBox(constraints: BoxConstraints(minHeight: c.maxHeight), child: child),
        ),
      );

  String _bucketLabel(_Bucket b) => switch (b) {
        _Bucket.overdue => widget.overdueTodayOnly ? tr('Late', 'متأخرة') : tr('Overdue', 'متأخرة'),
        _Bucket.today => tr('Today', 'النهارده'),
        _Bucket.upcoming => tr('Upcoming', 'الجاية'),
        _Bucket.all => tr('All', 'الكل'),
      };

  String _filterLabel(_Filter f) => switch (f) {
        _Filter.all => tr('All stages', 'كل المراحل'),
        _Filter.hot => tr('Hot leads', 'عملاء مهمين'),
        _Filter.priority => tr('High priority', 'أولوية عالية'),
      };
}

String _fmtDay(DateTime d) => DateFormat('EEE d MMM').format(d);

/// Bottom sheet with quick choices (Today / Tomorrow / In 3 days / Next week) and a calendar.
Future<DateTime?> _pickDate(BuildContext context, {required String title, String? subtitle, DateTime? current}) {
  final today = _day(DateTime.now());
  final quick = <(String, DateTime)>[
    (tr('Today', 'النهارده'), today),
    (tr('Tomorrow', 'بكرة'), today.add(const Duration(days: 1))),
    (tr('In 3 days', 'بعد 3 أيام'), today.add(const Duration(days: 3))),
    (tr('Next week', 'الأسبوع الجاي'), today.add(const Duration(days: 7))),
  ];
  return showPremiumSheet<DateTime>(context, builder: (ctx) {
    final t = Theme.of(ctx).textTheme;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(title, style: t.titleLarge),
          if (subtitle != null) Text(subtitle, style: t.bodySmall),
          const SizedBox(height: AppSpacing.lg),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: AppSpacing.sm,
            crossAxisSpacing: AppSpacing.sm,
            childAspectRatio: 2.6,
            children: [
              for (final q in quick)
                OutlinedButton(
                  onPressed: () => Navigator.pop(ctx, q.$2),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text(q.$1),
                    Text(_fmtDay(q.$2), style: t.bodySmall),
                  ]),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            tr('Pick a date', 'اختار تاريخ'),
            icon: LucideIcons.calendarDays,
            kind: AppButtonKind.ghost,
            expand: true,
            onPressed: () async {
              final init = current != null && !_day(current).isBefore(today) ? current : today.add(const Duration(days: 1));
              final d = await showDatePicker(context: ctx, initialDate: init, firstDate: today, lastDate: today.add(const Duration(days: 365)));
              if (d != null && ctx.mounted) Navigator.pop(ctx, d);
            },
          ),
        ]),
      ),
    );
  });
}

class _FilterPill extends StatelessWidget {
  final String label;
  final IconData? icon;
  final bool selected;
  final VoidCallback onTap;
  const _FilterPill({required this.label, this.icon, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return FilterChip(
      selected: selected,
      onSelected: (_) => onTap(),
      avatar: icon == null ? null : Icon(icon, size: 14, color: selected ? p.accent : p.subtext),
      label: Text(label),
      labelStyle: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: selected ? p.text : p.subtext),
      backgroundColor: p.card,
      selectedColor: p.accentSoft,
      side: BorderSide(color: selected ? p.accent.withAlpha(120) : p.border),
      visualDensity: VisualDensity.compact,
    );
  }
}

/// One follow-up: who, stage, when (red when late), and one-tap actions.
class _FollowUpCard extends StatelessWidget {
  final LeadModel lead;
  final _Bucket bucket;
  final DateTime today;
  final bool busy;
  final VoidCallback onOpen, onMore, onCall, onWhatsApp, onNote, onLater, onDone;

  const _FollowUpCard({
    required this.lead,
    required this.bucket,
    required this.today,
    required this.busy,
    required this.onOpen,
    required this.onMore,
    required this.onCall,
    required this.onWhatsApp,
    required this.onNote,
    required this.onLater,
    required this.onDone,
  });

  String _when() {
    final d = lead.followUpDateTime?.toLocal();
    if (d == null) return '—';
    final diff = _day(d).difference(today).inDays;
    if (diff < 0) return tr('${-diff} ${-diff == 1 ? 'day' : 'days'} late', 'متأخرة ${-diff} ${-diff == 1 ? 'يوم' : 'أيام'}');
    if (diff == 0) return tr('Today', 'النهارده');
    if (diff == 1) return tr('Tomorrow', 'بكرة');
    return _fmtDay(d);
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = Theme.of(context).textTheme;
    final late = bucket == _Bucket.overdue;
    final whenColor = late ? p.danger : (bucket == _Bucket.today ? p.accent : p.subtext);

    return Semantics(
      label: '${lead.name}, ${lead.status}, ${_when()}',
      child: PremiumCard(
        padding: EdgeInsets.zero,
        borderColor: late ? p.danger.withAlpha(90) : null,
        onTap: onOpen,
        onLongPress: onMore,
        child: AnimatedOpacity(
          duration: AppMotion.fast,
          opacity: busy ? 0.5 : 1,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.xs, 0),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(lead.name.isEmpty ? tr('No name', 'بدون اسم') : lead.name, style: t.titleMedium, maxLines: 1, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 6),
                    Wrap(spacing: AppSpacing.sm, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
                      StatusPill(lead.status),
                      Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(late ? LucideIcons.alarmClock : LucideIcons.calendar, size: 14, color: whenColor),
                        const SizedBox(width: 4),
                        Text(_when(), style: t.labelMedium?.copyWith(color: whenColor, fontWeight: FontWeight.w700)),
                      ]),
                    ]),
                    if ((lead.project ?? '').isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(lead.project!, style: t.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                    ],
                  ]),
                ),
                IconButton(tooltip: tr('More', 'المزيد'), onPressed: onMore, icon: Icon(LucideIcons.ellipsisVertical, size: 20, color: p.subtext)),
              ]),
            ),
            const SizedBox(height: AppSpacing.sm),
            Divider(height: 1, color: p.border),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs, vertical: 2),
              child: Row(children: [
                Expanded(child: QuickAction(icon: LucideIcons.phone, label: tr('Call', 'اتصال'), onTap: busy ? null : onCall, color: p.accent)),
                Expanded(child: QuickAction(icon: LucideIcons.messageCircle, label: 'WhatsApp', onTap: busy ? null : onWhatsApp, color: p.whatsapp)),
                Expanded(child: QuickAction(icon: LucideIcons.notebookPen, label: tr('Note', 'نوتة'), onTap: busy ? null : onNote)),
                Expanded(child: QuickAction(icon: LucideIcons.calendarClock, label: tr('Later', 'تأجيل'), onTap: busy ? null : onLater)),
                Expanded(child: QuickAction(icon: LucideIcons.circleCheck, label: tr('Done', 'تمت'), onTap: busy ? null : onDone, color: p.accent)),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Searchable list of open leads for "Add follow-up".
class _LeadPicker extends StatefulWidget {
  final List<LeadModel> leads;
  const _LeadPicker({required this.leads});

  @override
  State<_LeadPicker> createState() => _LeadPickerState();
}

class _LeadPickerState extends State<_LeadPicker> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final q = _q.trim().toLowerCase();
    final list = (q.isEmpty
            ? widget.leads
            : widget.leads.where((l) => l.name.toLowerCase().contains(q) || l.phone.contains(q) || (l.project?.toLowerCase().contains(q) ?? false)))
        .take(60)
        .toList();
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.75,
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(tr('Who to follow up?', 'متابعة مع مين؟'), style: t.titleLarge),
            const SizedBox(height: AppSpacing.md),
            AppSearchField(hint: tr('Search name or phone', 'دوّر بالاسم أو الرقم'), onChanged: (v) => setState(() => _q = v)),
          ]),
        ),
        Expanded(
          child: list.isEmpty
              ? EmptyState(icon: LucideIcons.searchX, title: tr('No leads found', 'مفيش عملاء'))
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
                  itemCount: list.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 2),
                  itemBuilder: (_, i) {
                    final l = list[i];
                    return ListTile(
                      minTileHeight: AppSpacing.tap + 8,
                      title: Text(l.name.isEmpty ? tr('No name', 'بدون اسم') : l.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text(l.phone, textDirection: TextDirection.ltr),
                      trailing: StatusPill(l.status),
                      onTap: () => Navigator.pop(context, l),
                    );
                  },
                ),
        ),
      ]),
    );
  }
}
