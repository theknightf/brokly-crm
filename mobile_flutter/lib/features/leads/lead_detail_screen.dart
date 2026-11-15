import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart' show DateFormat;
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/currency_formatter.dart';
import '../../core/utils/date_utils.dart';
import '../../core/utils/note_formatter.dart';
import '../../core/utils/stage_note_guard.dart';
import '../../core/utils/tr.dart';
import '../../core/utils/whatsapp_utils.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/call_log_model.dart';
import '../../data/models/lead_model.dart';
import '../../data/services/call_logs_service.dart';
import '../../data/services/leads_service.dart';
import '../../data/services/supabase_service.dart';
import '../../state/leads_provider.dart';
import '../calculator/unit_calculator_screen.dart';
import 'edit_lead_screen.dart';
import 'widgets/log_call_dialog.dart';
import 'widgets/quick_note_dialog.dart';
import 'widgets/status_change_sheet.dart';

/// Lead profile, same shape as the website's phone page: sticky header (who, stage, Call / WhatsApp),
/// then three tabs — Info (next action + details), Notes, Activity (calls).
class LeadDetailScreen extends StatefulWidget {
  final String leadId;

  const LeadDetailScreen({super.key, required this.leadId});

  @override
  State<LeadDetailScreen> createState() => _LeadDetailScreenState();
}

class _LeadDetailScreenState extends State<LeadDetailScreen> {
  final LeadsService _leadsService = LeadsService();
  final CallLogsService _callLogsService = CallLogsService();
  final SupabaseClient _client = SupabaseService().client;

  LeadModel? _lead;
  List<CallLogModel> _calls = [];
  List<Map<String, dynamic>> _comments = [];
  bool _isLoading = true;
  int _tab = 0; // 0 Info, 1 Notes, 2 Activity

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  Future<void> _loadAll() async {
    setState(() => _isLoading = true);
    LeadModel? leadData;
    List<CallLogModel> callData = [];
    try {
      leadData = await _leadsService.getById(widget.leadId);
      callData = await _callLogsService.getAll(entityId: widget.leadId);
    } catch (_) {
      // Keep whatever is already on screen; the not-found state offers Retry.
      leadData ??= _lead;
      if (callData.isEmpty) callData = _calls;
    }

    List<Map<String, dynamic>> fetchedComments = [];
    try {
      final res = await _client
          .from('lead_comments')
          .select('id, body, created_at, user_id')
          .eq('lead_id', widget.leadId)
          .order('created_at', ascending: false)
          .limit(30);
      fetchedComments = (res as List<dynamic>).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {}

    if (mounted) {
      setState(() {
        _lead = leadData;
        _calls = callData;
        _comments = fetchedComments;
        _isLoading = false;
      });
    }
  }

  // ── Actions (unchanged behaviour) ───────────────────────────────────

  Future<void> _makeCall() async {
    if (_lead == null) return;
    await LogCallDialog.dialAndTrack(context, lead: _lead!, onCompleted: _loadAll);
  }

  Future<void> _openWhatsApp({bool isBrochure = false}) async {
    if (_lead == null) return;
    String? customMsg;
    if (isBrochure) {
      final userName = WhatsAppUtils.resolveCurrentUserName(context);
      final proj = (_lead!.project != null && _lead!.project!.isNotEmpty) ? ' لمشروع ${_lead!.project}' : '';
      customMsg = 'صباح الخير / مساء الخير، أنا $userName من شركة On Point للتسويق العقاري، مرفق لحضرتك تفاصيل البروشور وخطط السداد المتاحة$proj.';
    }
    if (!mounted) return;
    final launched = await WhatsAppUtils.openWhatsAppChat(context, phone: _lead!.phone, customMessage: customMsg);
    if (launched && mounted) {
      await LogCallDialog.show(context, lead: _lead!, initialChannel: 'WhatsApp');
      _loadAll();
    }
  }

  Future<void> _scheduleFollowUp() async {
    if (_lead == null) return;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final initial = _lead!.followUpDateTime ?? now.add(const Duration(days: 1));
    final pickedDate = await showDatePicker(
      context: context,
      initialDate: initial.isBefore(today) ? today.add(const Duration(days: 1)) : initial,
      firstDate: today,
      lastDate: now.add(const Duration(days: 365)),
    );
    if (pickedDate == null || !mounted) return;

    final pickedTime = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 11, minute: 0));
    if (!mounted) return;

    final dateStr = DateFormat('yyyy-MM-dd').format(pickedDate);
    final timeStr = pickedTime != null
        ? '${pickedTime.hour.toString().padLeft(2, '0')}:${pickedTime.minute.toString().padLeft(2, '0')}'
        : '11:00';

    try {
      await context.read<LeadsProvider>().updateLead(_lead!.id, {'follow_up_due': dateStr});
    } catch (_) {
      if (mounted) showAppSnack(context, tr('Could not save the date. Check the connection.', 'محصلش حفظ للتاريخ. اتأكد من النت.'), error: true);
      return;
    }

    final user = _client.auth.currentUser;
    try {
      await _client.from('follow_ups').insert({
        'lead_id': _lead!.id,
        'title': 'Follow up: ${_lead!.name}',
        'contact_name': _lead!.name,
        'contact_phone': _lead!.phone,
        'property_interest': _lead!.project ?? '',
        'due_date': dateStr,
        'due_time': timeStr,
        'follow_up_status': 'Pending',
        'priority': 'High',
        'notes': 'Scheduled from Lead 360° Hub',
        if (user != null) 'created_by': user.id,
      });
    } catch (_) {}

    await _loadAll();
    if (mounted) showAppSnack(context, tr('Next action set for ${_fmt(dateStr)} $timeStr', 'الإجراء الجاي: ${_fmt(dateStr)} $timeStr'));
  }

  Future<void> _bookSiteVisit() async {
    if (_lead == null) return;
    await LogCallDialog.show(context, lead: _lead!, initialChannel: 'Site Visit');
    await _loadAll();
  }

  Future<void> _syncDeviceCalls() async {
    if (_lead == null) return;
    final synced = await _callLogsService.syncDeviceCallLogs(limit: 40, filterLeadId: _lead!.id);
    await _loadAll();
    if (mounted) {
      showAppSnack(context, synced > 0 ? tr('Synced $synced call(s) from the phone', 'اتسحب $synced مكالمة من التليفون') : tr('Call log is up to date', 'سجل المكالمات محدّث'));
    }
  }

  void _changeStage() {
    final lead = _lead;
    if (lead == null) return;
    StatusChangeSheet.show(
      context,
      currentStatus: lead.status,
      onSelectStatus: (newStatus) async {
        final provider = context.read<LeadsProvider>();
        final changed = await StageNoteGuard.run(
          context,
          leadId: lead.id,
          leadName: lead.name,
          newStage: newStatus,
          apply: () => provider.updateStatus(lead.id, newStatus),
        );
        if (changed) _loadAll();
      },
    );
  }

  void _addNote() {
    final lead = _lead;
    if (lead == null) return;
    QuickNoteDialog.show(
      context,
      leadName: lead.name,
      onSaveNote: (note) async {
        await context.read<LeadsProvider>().addNote(lead.id, note);
        _loadAll();
      },
    );
  }

  Future<void> _edit() async {
    final lead = _lead;
    if (lead == null) return;
    final updated = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => EditLeadScreen(lead: lead)));
    if (updated == true) _loadAll();
  }

  Future<void> _confirmDelete() async {
    final ok = await confirmAction(
      context,
      title: tr('Delete lead?', 'تمسح العميل؟'),
      message: tr('${_lead?.name} will be deleted. This cannot be undone.', 'هيتمسح ${_lead?.name}. مش هينفع ترجّعه.'),
      confirmLabel: tr('Delete', 'امسح'),
      destructive: true,
    );
    if (!ok || !mounted) return;
    await context.read<LeadsProvider>().deleteLead(widget.leadId);
    if (mounted) Navigator.pop(context);
  }

  void _copyPhone() {
    Clipboard.setData(ClipboardData(text: _lead?.phone ?? ''));
    tapFeedback();
    showAppSnack(context, tr('Phone copied', 'اتنسخ الرقم'));
  }

  void _more() {
    final p = context.palette;
    showPremiumSheet<void>(context, builder: (ctx) {
      Widget item(IconData icon, String label, VoidCallback onTap, {Color? color}) => ListTile(
            minTileHeight: AppSpacing.tap + 8,
            leading: Icon(icon, color: color ?? p.text),
            title: Text(label, style: TextStyle(color: color ?? p.text, fontWeight: FontWeight.w600)),
            onTap: () {
              Navigator.pop(ctx);
              onTap();
            },
          );
      return SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const SizedBox(height: 8),
          item(LucideIcons.pencil, tr('Edit lead', 'تعديل العميل'), _edit),
          item(LucideIcons.mapPin, tr('Book site visit', 'حجز معاينة'), _bookSiteVisit),
          item(LucideIcons.fileText, tr('Send brochure on WhatsApp', 'ابعت البروشور واتساب'), () => _openWhatsApp(isBrochure: true)),
          item(LucideIcons.calculator, tr('Unit calculator', 'حاسبة الوحدات'),
              () => Navigator.push(context, MaterialPageRoute(builder: (_) => const UnitCalculatorScreen()))),
          item(LucideIcons.refreshCw, tr('Sync calls from phone', 'اسحب المكالمات من التليفون'), _syncDeviceCalls),
          item(LucideIcons.trash2, tr('Delete lead', 'امسح العميل'), _confirmDelete, color: p.danger),
          const SizedBox(height: 8),
        ]),
      );
    });
  }

  // ── UI ──────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    if (_isLoading && _lead == null) {
      return Scaffold(appBar: AppBar(title: Text(tr('Lead', 'العميل'))), body: const SkeletonList(count: 4, height: 120));
    }
    if (_lead == null) {
      return Scaffold(
        appBar: AppBar(title: Text(tr('Lead', 'العميل'))),
        body: EmptyState(
          icon: LucideIcons.userX,
          title: tr('Lead not found', 'العميل مش موجود'),
          message: tr('It may have been deleted or you may not have access. Check your connection and try again.',
              'ممكن يكون اتمسح أو مش من صلاحياتك. اتأكد من النت وجرّب تاني.'),
          actionLabel: tr('Try again', 'حاول تاني'),
          onAction: _loadAll,
        ),
      );
    }

    final lead = _lead!;
    final p = context.palette;
    final notes = _noteLines(lead);

    return Scaffold(
      body: NestedScrollView(
        headerSliverBuilder: (_, __) => [
          SliverAppBar(
            pinned: true,
            title: Text(lead.name.isEmpty ? tr('Lead', 'العميل') : lead.name, maxLines: 1, overflow: TextOverflow.ellipsis),
            actions: [IconButton(tooltip: tr('More', 'المزيد'), onPressed: _more, icon: const Icon(LucideIcons.ellipsisVertical))],
          ),
          SliverToBoxAdapter(child: _Header(lead: lead, onStage: _changeStage, onCall: _makeCall, onWhatsApp: _openWhatsApp)),
          SliverPersistentHeader(
            pinned: true,
            delegate: _TabsHeader(
              color: p.background,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, AppSpacing.sm),
                child: SegmentedButton<int>(
                  showSelectedIcon: false,
                  segments: [
                    ButtonSegment(value: 0, label: Text(tr('Info', 'البيانات')), icon: const Icon(LucideIcons.info, size: 16)),
                    ButtonSegment(value: 1, label: Text('${tr('Notes', 'النوتس')} ${notes.length}'), icon: const Icon(LucideIcons.notebookPen, size: 16)),
                    ButtonSegment(value: 2, label: Text(tr('Activity', 'النشاط')), icon: const Icon(LucideIcons.activity, size: 16)),
                  ],
                  selected: {_tab},
                  onSelectionChanged: (s) => setState(() => _tab = s.first),
                  style: SegmentedButton.styleFrom(
                    selectedBackgroundColor: p.accentSoft,
                    selectedForegroundColor: p.text,
                    side: BorderSide(color: p.border),
                    minimumSize: const Size(0, AppSpacing.tap),
                  ),
                ),
              ),
            ),
          ),
        ],
        body: RefreshIndicator(
          onRefresh: _loadAll,
          child: AnimatedSwitcher(
            duration: AppMotion.normal,
            child: switch (_tab) {
              0 => _InfoTab(key: const ValueKey(0), lead: lead, onSchedule: _scheduleFollowUp, onCopyPhone: _copyPhone),
              1 => _NotesTab(key: const ValueKey(1), lines: notes, onAdd: _addNote),
              _ => _ActivityTab(key: const ValueKey(2), calls: _calls, onSync: _syncDeviceCalls, onCall: _makeCall),
            },
          ),
        ),
      ),
      // One-handed: the two most common actions stay at the bottom.
      bottomNavigationBar: SafeArea(
        child: Container(
          padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.md, AppSpacing.page, AppSpacing.md),
          decoration: BoxDecoration(color: p.card, border: Border(top: BorderSide(color: p.border))),
          child: Row(children: [
            Expanded(child: AppButton(tr('Add note', 'نوتة'), icon: LucideIcons.notebookPen, kind: AppButtonKind.secondary, expand: true, onPressed: _addNote)),
            const SizedBox(width: AppSpacing.sm),
            Expanded(child: AppButton(tr('Next action', 'الإجراء الجاي'), icon: LucideIcons.calendarClock, expand: true, onPressed: _scheduleFollowUp)),
          ]),
        ),
      ),
    );
  }

  List<String> _noteLines(LeadModel lead) {
    final lines = <String>[];
    for (final c in _comments) {
      final body = c['body']?.toString().trim() ?? '';
      if (body.isNotEmpty) lines.add(body);
    }
    if (lead.notes != null && lead.notes!.trim().isNotEmpty) {
      for (final line in lead.notes!.split('\n')) {
        final l = line.trim();
        if (l.isNotEmpty && !lines.any((x) => x.contains(l))) lines.add(l);
      }
    }
    return lines;
  }
}

String _fmt(String? v) => (v == null || v.isEmpty) ? '—' : AppDateUtils.formatDate(v);

// ── Header ───────────────────────────────────────────────────────────

class _Header extends StatelessWidget {
  final LeadModel lead;
  final VoidCallback onStage;
  final VoidCallback onCall;
  final VoidCallback onWhatsApp;
  const _Header({required this.lead, required this.onStage, required this.onCall, required this.onWhatsApp});

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = Theme.of(context).textTheme;
    final initials = lead.name.trim().split(RegExp(r'\s+')).where((e) => e.isNotEmpty).take(2).map((e) => e[0].toUpperCase()).join();
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          CircleAvatar(
            radius: 26,
            backgroundColor: p.accentSoft,
            child: Text(initials.isEmpty ? '•' : initials, style: TextStyle(color: p.accent, fontWeight: FontWeight.w800, fontSize: 16)),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(lead.phone, textDirection: TextDirection.ltr, style: t.titleMedium),
              const SizedBox(height: 6),
              // Tap the stage to change it.
              Semantics(
                button: true,
                label: tr('Change stage', 'غيّر المرحلة'),
                child: InkWell(
                  onTap: onStage,
                  borderRadius: BorderRadius.circular(AppRadius.pill),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    StatusPill(lead.status, large: true),
                    const SizedBox(width: 4),
                    Icon(LucideIcons.chevronDown, size: 16, color: p.subtext),
                  ]),
                ),
              ),
            ]),
          ),
        ]),
        const SizedBox(height: AppSpacing.md),
        Row(children: [
          Expanded(child: AppButton(tr('Call', 'اتصال'), icon: LucideIcons.phone, expand: true, onPressed: onCall)),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: onWhatsApp,
              icon: Icon(LucideIcons.messageCircle, color: p.whatsapp, size: 18),
              label: const Text('WhatsApp'),
            ),
          ),
        ]),
      ]),
    );
  }
}

class _TabsHeader extends SliverPersistentHeaderDelegate {
  final Widget child;
  final Color color;
  _TabsHeader({required this.child, required this.color});

  @override
  double get minExtent => 64;
  @override
  double get maxExtent => 64;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) => ColoredBox(color: color, child: child);

  @override
  bool shouldRebuild(covariant _TabsHeader old) => old.child != child || old.color != color;
}

// ── Info ─────────────────────────────────────────────────────────────

class _InfoTab extends StatelessWidget {
  final LeadModel lead;
  final VoidCallback onSchedule;
  final VoidCallback onCopyPhone;
  const _InfoTab({super.key, required this.lead, required this.onSchedule, required this.onCopyPhone});

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = Theme.of(context).textTheme;
    final overdue = AppDateUtils.isOverdue(lead.followUpDue);
    final hasDue = lead.followUpDue?.isNotEmpty ?? false;
    final budget = (lead.budgetMin != null || lead.budgetMax != null) ? CurrencyFormatter.formatRange(lead.budgetMin, lead.budgetMax) : '';

    return ListView(
      padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, AppSpacing.xxl),
      children: [
        // Next action first: the one thing to act on.
        PremiumCard(
          onTap: onSchedule,
          tint: overdue ? p.danger.withAlpha(20) : (hasDue ? p.accentSoft : null),
          borderColor: overdue ? p.danger.withAlpha(110) : null,
          child: Row(children: [
            Icon(overdue ? LucideIcons.alarmClock : LucideIcons.calendarClock, color: overdue ? p.danger : p.accent),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(overdue ? tr('Next action · overdue', 'الإجراء الجاي · متأخر') : tr('Next action', 'الإجراء الجاي'),
                    style: t.labelMedium?.copyWith(color: overdue ? p.danger : p.subtext)),
                const SizedBox(height: 2),
                Text(hasDue ? AppDateUtils.formatFollowUpShort(lead.followUpDue) : tr('Not set — tap to plan', 'مش محدد — دوس عشان تحدده'),
                    style: t.titleLarge?.copyWith(color: overdue ? p.danger : p.text)),
              ]),
            ),
            Icon(LucideIcons.chevronRight, color: p.subtext),
          ]),
        ),
        _Group(title: tr('Contact', 'التواصل'), rows: [
          _Row(tr('Phone', 'التليفون'), lead.phone, ltr: true, trailing: IconButton(tooltip: tr('Copy', 'نسخ'), onPressed: onCopyPhone, icon: const Icon(LucideIcons.copy, size: 18))),
          _Row(tr('Email', 'الإيميل'), lead.email, ltr: true),
          _Row(tr('Location', 'المنطقة'), lead.location),
        ]),
        _Group(title: tr('Lead', 'العميل'), rows: [
          _Row(tr('Assigned to', 'مسؤول عنه'), lead.assignedToName ?? lead.agent ?? tr('Nobody yet', 'لسه محدش')),
          _Row(tr('Source', 'المصدر'), lead.source),
          _Row(tr('Project', 'المشروع'), lead.project ?? lead.developer),
          _Row(tr('Unit', 'الوحدة'), lead.propertyType ?? lead.unit),
          _Row(tr('Budget', 'الميزانية'), budget),
          _Row(tr('Priority', 'الأولوية'), lead.priority == 'Normal' ? null : lead.priority),
          _Row(tr('Rating', 'التقييم'), lead.leadRating),
          _Row(tr('Team', 'الفريق'), lead.team),
        ]),
        _Group(title: tr('Dates', 'التواريخ'), rows: [
          _Row(tr('Created', 'اتضاف'), _fmt(lead.createdAt)),
          _Row(tr('Last action', 'آخر إجراء'), lead.lastActionAt == null ? null : AppDateUtils.timeAgo(lead.lastActionAt)),
        ]),
      ],
    );
  }
}

class _Row {
  final String label;
  final String? value;
  final bool ltr;
  final Widget? trailing;
  const _Row(this.label, this.value, {this.ltr = false, this.trailing});
}

class _Group extends StatelessWidget {
  final String title;
  final List<_Row> rows;
  const _Group({required this.title, required this.rows});

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = Theme.of(context).textTheme;
    final shown = rows.where((r) => (r.value ?? '').trim().isNotEmpty).toList();
    if (shown.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(padding: const EdgeInsets.fromLTRB(4, 8, 4, 8), child: Text(title.toUpperCase(), style: t.labelSmall)),
        PremiumCard(
          padding: EdgeInsets.zero,
          child: Column(children: [
            for (var i = 0; i < shown.length; i++) ...[
              if (i > 0) Divider(height: 1, color: p.border),
              ConstrainedBox(
                constraints: const BoxConstraints(minHeight: AppSpacing.tap + 4),
                child: Padding(
                  padding: EdgeInsetsDirectional.only(start: AppSpacing.lg, end: shown[i].trailing == null ? AppSpacing.lg : AppSpacing.xs),
                  child: Row(children: [
                    Text(shown[i].label, style: t.bodyMedium?.copyWith(color: p.subtext)),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Text(
                        shown[i].value!,
                        textAlign: TextAlign.end,
                        textDirection: shown[i].ltr ? TextDirection.ltr : null,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: t.titleSmall,
                      ),
                    ),
                    if (shown[i].trailing != null) shown[i].trailing!,
                  ]),
                ),
              ),
            ],
          ]),
        ),
      ]),
    );
  }
}

// ── Notes ────────────────────────────────────────────────────────────

class _NotesTab extends StatelessWidget {
  final List<String> lines;
  final VoidCallback onAdd;
  const _NotesTab({super.key, required this.lines, required this.onAdd});

  @override
  Widget build(BuildContext context) {
    if (lines.isEmpty) {
      return ListView(children: [
        const SizedBox(height: 40),
        EmptyState(
          icon: LucideIcons.notebookPen,
          title: tr('No notes yet', 'مفيش نوتس لسه'),
          message: tr('Write what happened on the last call.', 'اكتب اللي حصل في آخر مكالمة.'),
          actionLabel: tr('Add note', 'ضيف نوتة'),
          onAction: onAdd,
        ),
      ]);
    }
    final t = Theme.of(context).textTheme;
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, AppSpacing.xxl),
      itemCount: lines.length,
      itemBuilder: (_, i) => PremiumCard(
        child: Text(NoteFormatter.pretty(lines[i]), style: t.bodyMedium?.copyWith(height: 1.5)),
      ),
    );
  }
}

// ── Activity (calls & WhatsApp) ──────────────────────────────────────

class _ActivityTab extends StatelessWidget {
  final List<CallLogModel> calls;
  final VoidCallback onSync;
  final VoidCallback onCall;
  const _ActivityTab({super.key, required this.calls, required this.onSync, required this.onCall});

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = Theme.of(context).textTheme;
    if (calls.isEmpty) {
      return ListView(children: [
        const SizedBox(height: 40),
        EmptyState(
          icon: LucideIcons.phoneOff,
          title: tr('No calls yet', 'مفيش مكالمات لسه'),
          message: tr('Calls and WhatsApp messages you log show here.', 'المكالمات ورسايل الواتساب اللي بتسجلها بتظهر هنا.'),
          actionLabel: tr('Call now', 'اتصل دلوقتي'),
          onAction: onCall,
        ),
        Center(child: AppButton(tr('Sync calls from phone', 'اسحب المكالمات من التليفون'), kind: AppButtonKind.ghost, icon: LucideIcons.refreshCw, onPressed: onSync)),
      ]);
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, AppSpacing.xxl),
      itemCount: calls.length,
      itemBuilder: (_, i) {
        final c = calls[i];
        final wa = c.channel.toLowerCase().contains('whatsapp');
        final color = wa ? p.whatsapp : p.accent;
        final when = c.createdAt != null ? '${AppDateUtils.formatDate(c.createdAt)} · ${AppDateUtils.formatTime(c.createdAt)}' : '';
        return PremiumCard(
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: color.withAlpha(32), borderRadius: BorderRadius.circular(AppRadius.sm)),
              child: Icon(wa ? LucideIcons.messageCircle : (c.direction == 'incoming' ? LucideIcons.phoneIncoming : LucideIcons.phoneOutgoing), size: 18, color: color),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text(c.outcome.isEmpty ? c.channel : c.outcome, style: t.titleSmall)),
                  if (c.durationSeconds > 0) Text(AppDateUtils.formatDuration(c.durationSeconds), style: t.bodySmall),
                ]),
                if (when.isNotEmpty) Text(when, style: t.bodySmall),
                if ((c.notes ?? '').trim().isNotEmpty)
                  Padding(padding: const EdgeInsets.only(top: 6), child: Text(c.notes!.trim(), style: t.bodyMedium)),
              ]),
            ),
          ]),
        );
      },
    );
  }
}
