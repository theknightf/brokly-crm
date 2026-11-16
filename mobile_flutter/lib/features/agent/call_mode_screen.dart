import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../data/models/call_log_model.dart';
import '../../data/models/lead_model.dart';
import '../../data/services/call_logs_service.dart';
import '../../data/services/pending_call_saves.dart';
import 'agent_controller.dart';
import 'agent_widgets.dart';

/// One-tap call outcomes. [stage] null = keep the lead's current stage.
class AgentOutcome {
  final String key; // stored in call_logs.outcome (same keys the rest of the app uses)
  final String label;
  final String note; // pre-filled note (sales users need a written note to change a stage)
  final String? stage;
  final IconData icon;
  final Color color;
  final _FollowUpDefault followUp;

  const AgentOutcome(this.key, this.label, this.note, this.stage, this.icon, this.color, this.followUp);
}

enum _FollowUpDefault { none, retryToday, inOneHour, tomorrow }

const agentOutcomes = <AgentOutcome>[
  AgentOutcome('Interested', 'رد · مهتم', 'مهتم', 'Interested', LucideIcons.sparkles, Color(0xFF16A34A), _FollowUpDefault.tomorrow),
  AgentOutcome('Not Interested', 'رد · مش مهتم', 'مش مهتم', 'Not Interested', LucideIcons.thumbsDown, Color(0xFFEF4444), _FollowUpDefault.none),
  AgentOutcome('No Answer', 'مردّش', 'مردّش', 'No Answer', LucideIcons.phoneMissed, Color(0xFFF59E0B), _FollowUpDefault.retryToday),
  AgentOutcome('Busy', 'مشغول', 'مشغول', null, LucideIcons.phoneOff, Color(0xFFF97316), _FollowUpDefault.retryToday),
  AgentOutcome('Wrong Phone', 'رقم غلط', 'رقم غلط', 'Wrong Number', LucideIcons.ban, Color(0xFF64748B), _FollowUpDefault.none),
  AgentOutcome('Follow-up', 'كلّمه بعدين', 'هنكلمه تاني', 'Following Up', LucideIcons.calendarClock, Color(0xFF3B82F6), _FollowUpDefault.inOneHour),
];

/// Full-screen calling flow: one lead at a time → Call → outcome sheet → Save & Next.
class CallModeScreen extends StatefulWidget {
  const CallModeScreen({super.key, required this.leads, this.startLeadId, this.title});
  final List<LeadModel> leads;
  final String? startLeadId;
  final String? title;

  static Future<void> open(BuildContext context, List<LeadModel> leads, {String? startLeadId, String? title}) {
    if (leads.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('مفيش عملاء في القائمة دي')));
      return Future.value();
    }
    final controller = context.read<AgentController>();
    return Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => ChangeNotifierProvider.value(
        value: controller,
        child: CallModeScreen(leads: leads, startLeadId: startLeadId, title: title),
      ),
    ));
  }

  @override
  State<CallModeScreen> createState() => _CallModeScreenState();
}

class _CallModeScreenState extends State<CallModeScreen> {
  late final List<LeadModel> _leads = List.of(widget.leads);
  int _index = 0;
  int _done = 0;
  bool _calling = false;

  @override
  void initState() {
    super.initState();
    final start = widget.startLeadId;
    if (start != null) {
      final i = _leads.indexWhere((l) => l.id == start);
      if (i >= 0) _index = i;
    }
    _remember();
  }

  LeadModel? get _lead => _index < _leads.length ? _leads[_index] : null;

  void _remember() => unawaited(context.read<AgentController>().saveQueuePosition(_lead?.id));

  void _next() {
    setState(() => _index++);
    _remember();
  }

  Future<void> _call() async {
    final lead = _lead;
    if (lead == null || _calling) return;
    setState(() => _calling = true);
    await AgentDialer.call(context, lead, onEnded: (meta, elapsed) async {
      if (!mounted) return;
      setState(() => _calling = false);
      final saved = await OutcomeSheet.show(context, lead: lead, meta: meta, elapsedSeconds: elapsed);
      if (saved == true && mounted) {
        setState(() => _done++);
        _next();
      }
    });
    // The phone number was missing: AgentDialer showed a message and never calls back.
    if (lead.phone.trim().isEmpty && mounted) setState(() => _calling = false);
  }

  @override
  Widget build(BuildContext context) {
    final lead = _lead;
    final c = context.watch<AgentController>();
    final stage = c.stages.where((s) => s.key == lead?.status).firstOrNull;
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          title: Text(widget.title ?? 'وضع الاتصال', style: const TextStyle(fontWeight: FontWeight.w800)),
          leading: IconButton(
            tooltip: 'خروج',
            icon: const Icon(LucideIcons.x),
            onPressed: () => Navigator.of(context).pop(),
          ),
          actions: [
            Center(
              child: Padding(
                padding: const EdgeInsetsDirectional.only(end: 16),
                child: Text('${(_index + 1).clamp(1, _leads.length)} / ${_leads.length}',
                    style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
          ],
        ),
        body: Column(
          children: [
            const CallTargetHeader(),
            Expanded(
              child: lead == null
                  ? _Finished(done: _done, onExit: () {
                      unawaited(context.read<AgentController>().saveQueuePosition(null));
                      Navigator.of(context).pop();
                    })
                  : Padding(
                      padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Spacer(),
                          CircleAvatar(
                            radius: 40,
                            backgroundColor: (stage?.color ?? AppColors.neonLimeDark).withAlpha(40),
                            child: Text(
                              lead.name.trim().isEmpty ? '؟' : lead.name.trim().characters.first,
                              style: TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: stage?.color ?? AppColors.neonLimeDark),
                            ),
                          ),
                          const SizedBox(height: 16),
                          Text(lead.name.isEmpty ? 'عميل' : lead.name,
                              textAlign: TextAlign.center, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
                          const SizedBox(height: 6),
                          Directionality(
                            textDirection: TextDirection.ltr,
                            child: Text(lead.phone, textAlign: TextAlign.center, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
                          ),
                          const SizedBox(height: 10),
                          Wrap(
                            alignment: WrapAlignment.center,
                            spacing: 8,
                            runSpacing: 6,
                            children: [
                              _Chip(stage?.labelAr ?? lead.status, stage?.color ?? AppColors.neonLimeDark),
                              if ((lead.project ?? '').isNotEmpty) _Chip(lead.project!, Colors.blueGrey),
                              _Chip('آخر تواصل: ${relativeAr(lead.lastActionAt)}', Colors.grey),
                            ],
                          ),
                          const Spacer(flex: 2),
                          SizedBox(
                            height: 72,
                            child: FilledButton.icon(
                              onPressed: _calling ? null : _call,
                              style: FilledButton.styleFrom(
                                backgroundColor: AppColors.neonLimeDark,
                                foregroundColor: const Color(0xFF142407),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                              ),
                              icon: _calling
                                  ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 3))
                                  : const Icon(LucideIcons.phone, size: 28),
                              label: Text(_calling ? 'جاري الاتصال…' : 'اتصل',
                                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: SizedBox(
                                  height: kTap,
                                  child: OutlinedButton.icon(
                                    onPressed: () => openWhatsApp(context, lead),
                                    icon: const Icon(LucideIcons.messageCircle),
                                    label: const Text('واتساب', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: SizedBox(
                                  height: kTap,
                                  child: OutlinedButton.icon(
                                    onPressed: () {
                                      HapticFeedback.selectionClick();
                                      _next();
                                    },
                                    icon: const Icon(LucideIcons.skipForward),
                                    label: const Text('تخطي', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(this.text, this.color);
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(color: color.withAlpha(35), borderRadius: BorderRadius.circular(12)),
        child: Text(text, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: color)),
      );
}

class _Finished extends StatelessWidget {
  const _Finished({required this.done, required this.onExit});
  final int done;
  final VoidCallback onExit;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(LucideIcons.circleCheck, size: 64, color: Color(0xFF16A34A)),
              const SizedBox(height: 12),
              const Text('خلصت القائمة', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              Text('سجلت $done مكالمة في الجلسة دي', style: const TextStyle(fontSize: 15)),
              const SizedBox(height: 20),
              SizedBox(height: kTap, child: FilledButton(onPressed: onExit, child: const Text('رجوع للقائمة'))),
            ],
          ),
        ),
      );
}

// ── Outcome sheet ────────────────────────────────────────────────────────────────────────────────

class OutcomeSheet extends StatefulWidget {
  const OutcomeSheet({super.key, required this.lead, this.meta, required this.elapsedSeconds});
  final LeadModel lead;
  final DeviceCallMetadata? meta;
  final int elapsedSeconds;

  /// Returns true when the outcome was saved (queued), null/false when the agent closed the sheet.
  static Future<bool?> show(BuildContext context, {required LeadModel lead, DeviceCallMetadata? meta, required int elapsedSeconds}) {
    final controller = context.read<AgentController>();
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      enableDrag: false,
      builder: (_) => ChangeNotifierProvider.value(
        value: controller,
        child: Directionality(
          textDirection: TextDirection.rtl,
          child: OutcomeSheet(lead: lead, meta: meta, elapsedSeconds: elapsedSeconds),
        ),
      ),
    );
  }

  @override
  State<OutcomeSheet> createState() => _OutcomeSheetState();
}

class _OutcomeSheetState extends State<OutcomeSheet> {
  AgentOutcome? _outcome;
  final _note = TextEditingController();
  DateTime? _followUp; // null = no follow-up
  String _followUpLabel = '';
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    // The device call log says nobody picked up → pre-select "No answer" (one tap: Save & Next).
    final m = widget.meta;
    if (m != null && m.durationSeconds == 0) {
      _select(agentOutcomes.firstWhere((o) => o.key == 'No Answer'));
    }
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  int get _duration => widget.meta?.durationSeconds ?? 0;

  void _select(AgentOutcome o) {
    HapticFeedback.selectionClick();
    final prevNote = _outcome?.note;
    setState(() {
      _outcome = o;
      // Replace the pre-filled note only if the agent has not typed their own.
      if (_note.text.trim().isEmpty || _note.text.trim() == prevNote) _note.text = o.note;
      final now = DateTime.now();
      switch (o.followUp) {
        case _FollowUpDefault.none:
          _followUp = null;
          _followUpLabel = '';
        case _FollowUpDefault.retryToday:
          // Same-day retry in 2 hours; after 7 pm it moves to tomorrow morning.
          final t = now.add(const Duration(hours: 2));
          _followUp = t.hour >= 21 || t.day != now.day ? DateTime(now.year, now.month, now.day + 1, 11) : t;
          _followUpLabel = t.hour >= 21 || t.day != now.day ? 'بكرة 11 الصبح' : 'إعادة اتصال كمان ساعتين';
        case _FollowUpDefault.inOneHour:
          _followUp = now.add(const Duration(hours: 1));
          _followUpLabel = 'كمان ساعة';
        case _FollowUpDefault.tomorrow:
          _followUp = DateTime(now.year, now.month, now.day + 1, 11);
          _followUpLabel = 'بكرة 11 الصبح';
      }
    });
  }

  bool get _showPicker => _outcome != null && (_outcome!.key == 'Interested' || _outcome!.key == 'Follow-up');

  Future<void> _pickTime() async {
    final now = DateTime.now();
    final d = await showDatePicker(context: context, initialDate: _followUp ?? now, firstDate: now, lastDate: now.add(const Duration(days: 180)));
    if (d == null || !mounted) return;
    final t = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(_followUp ?? now.add(const Duration(hours: 1))));
    if (t == null) return;
    setState(() {
      _followUp = DateTime(d.year, d.month, d.day, t.hour, t.minute);
      _followUpLabel = DateFormat('d/M  h:mm a').format(_followUp!);
    });
  }

  Future<void> _save() async {
    final o = _outcome;
    if (o == null || _saving) return;
    setState(() => _saving = true);
    HapticFeedback.mediumImpact();
    final lead = widget.lead;
    final meta = widget.meta;
    final stage = o.stage ?? (lead.status.trim().isEmpty ? 'Fresh Leads' : lead.status);
    final call = CallLogModel(
      id: meta?.syncedCallLogId ?? '',
      entityType: 'lead',
      entityId: lead.id,
      contactName: lead.name,
      contactPhone: lead.phone,
      channel: 'Call',
      direction: meta?.direction ?? 'outgoing',
      durationSeconds: _duration,
      outcome: o.key,
      notes: _note.text.trim().isEmpty ? o.note : _note.text.trim(),
      clientRef: meta?.clientRef ?? 'agent-${lead.id}-${DateTime.now().millisecondsSinceEpoch}',
      projectName: lead.project,
    );
    final fu = _followUp;
    final controller = context.read<AgentController>();
    final messenger = ScaffoldMessenger.of(context);
    // Written to the phone first, then sent (survives no signal / app killed). Don't wait: next lead loads now.
    unawaited(PendingCallSaves.instance
        .enqueue(
      call: call,
      leadId: lead.id,
      stage: stage,
      followUpDate: fu == null ? null : DateFormat('yyyy-MM-dd').format(fu),
      followUpTime: fu == null ? null : DateFormat('HH:mm').format(fu),
    )
        .then((savedNow) {
      if (!savedNow) {
        messenger.showSnackBar(const SnackBar(
          content: Text('مفيش نت — المكالمة متسجلة على الموبايل وهتترفع لوحدها'),
          backgroundColor: Color(0xFFF59E0B),
        ));
      }
    }));
    controller.onCallSaved(leadId: lead.id, wasCall: true);
    if (mounted) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 12, 16, 16 + bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text('نتيجة المكالمة · ${widget.lead.name}',
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                ),
                if (_duration > 0) Text('${_duration ~/ 60}:${(_duration % 60).toString().padLeft(2, '0')}'),
                IconButton(tooltip: 'إغلاق', icon: const Icon(LucideIcons.x), onPressed: () => Navigator.of(context).pop(false)),
              ],
            ),
            const SizedBox(height: 8),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: 2.9,
              children: [
                for (final o in agentOutcomes)
                  Material(
                    color: _outcome == o ? o.color.withAlpha(50) : o.color.withAlpha(18),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                      side: BorderSide(color: _outcome == o ? o.color : o.color.withAlpha(60), width: _outcome == o ? 2 : 1),
                    ),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(14),
                      onTap: () => _select(o),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        child: Row(
                          children: [
                            Icon(o.icon, color: o.color, size: 20),
                            const SizedBox(width: 8),
                            Expanded(child: Text(o.label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800))),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            if (_outcome != null) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _note,
                textInputAction: TextInputAction.done,
                decoration: InputDecoration(
                  labelText: 'ملاحظة',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  isDense: true,
                ),
              ),
              if (_followUp != null || _showPicker) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    const Icon(LucideIcons.calendarClock, size: 18),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(_followUp == null ? 'من غير متابعة' : 'المتابعة: $_followUpLabel',
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
                if (_showPicker) ...[
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    children: [
                      ChoiceChip(
                        label: const Text('كمان ساعة'),
                        selected: _followUpLabel == 'كمان ساعة',
                        onSelected: (_) => setState(() {
                          _followUp = DateTime.now().add(const Duration(hours: 1));
                          _followUpLabel = 'كمان ساعة';
                        }),
                      ),
                      ChoiceChip(
                        label: const Text('بكرة'),
                        selected: _followUpLabel == 'بكرة 11 الصبح',
                        onSelected: (_) => setState(() {
                          final n = DateTime.now();
                          _followUp = DateTime(n.year, n.month, n.day + 1, 11);
                          _followUpLabel = 'بكرة 11 الصبح';
                        }),
                      ),
                      ActionChip(avatar: const Icon(LucideIcons.clock, size: 16), label: const Text('اختار وقت'), onPressed: _pickTime),
                    ],
                  ),
                ],
              ],
            ],
            const SizedBox(height: 14),
            SizedBox(
              height: 60,
              child: FilledButton.icon(
                onPressed: _outcome == null || _saving ? null : _save,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.neonLimeDark,
                  foregroundColor: const Color(0xFF142407),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
                icon: const Icon(LucideIcons.arrowLeft, size: 22),
                label: const Text('احفظ واللي بعده', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
