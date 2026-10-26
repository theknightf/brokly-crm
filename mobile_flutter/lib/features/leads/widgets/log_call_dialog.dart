import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../data/models/call_log_model.dart';
import '../../../data/models/lead_model.dart';
import '../../../data/services/call_logs_service.dart';
import '../../../state/call_logs_provider.dart';
import '../../../state/leads_provider.dart';

/// Lifecycle observer that detects when the user returns from the native phone
/// dialer after tapping "Call Now", captures the device call log metadata
/// (duration, timestamp, call status), attaches it to the lead's history,
/// and automatically triggers the Post-Call Modal.
class _PostCallLifecycleWaiter with WidgetsBindingObserver {
  final BuildContext context;
  final LeadModel lead;
  final DateTime callStartedAt;
  final VoidCallback? onCompleted;

  bool _wentBackground = false;
  bool _modalShown = false;
  Timer? _webFallbackTimer;

  _PostCallLifecycleWaiter({
    required this.context,
    required this.lead,
    required this.callStartedAt,
    this.onCompleted,
  });

  void start() {
    WidgetsBinding.instance.addObserver(this);
    // On Web (Chrome) or desktop environments where launching tel: might not
    // pause the Flutter lifecycle, trigger the post-call modal after a brief delay
    // if the app hasn't paused.
    _webFallbackTimer = Timer(
      const Duration(milliseconds: kIsWeb ? 900 : 2200),
      () {
        if (!_wentBackground && !_modalShown) {
          _triggerModal(initialDuration: 60);
        }
      },
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden) {
      _wentBackground = true;
      _webFallbackTimer?.cancel();
    } else if (state == AppLifecycleState.resumed && _wentBackground && !_modalShown) {
      final elapsed = DateTime.now().difference(callStartedAt).inSeconds;
      _triggerModal(initialDuration: elapsed > 0 ? elapsed.clamp(5, 3600) : 60);
    }
  }

  void _triggerModal({required int initialDuration}) {
    if (_modalShown) return;
    _modalShown = true;
    _webFallbackTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);

    if (!context.mounted) return;
    Future.delayed(const Duration(milliseconds: 550), () async {
      // Automatically capture and sync device call log metadata (duration, timestamp, status)
      DeviceCallMetadata? metadata;
      if (!kIsWeb) {
        try {
          metadata = await CallLogsService().captureAndSyncCallForLead(
            leadId: lead.id,
            leadName: lead.name,
            leadPhone: lead.phone,
            callStartedAt: callStartedAt,
            projectName: lead.project,
          );
        } catch (_) {}
      }

      if (!context.mounted) return;
      final resolvedDuration = metadata != null ? metadata.durationSeconds : initialDuration;

      await LogCallDialog.show(
        context,
        lead: lead,
        initialChannel: 'Call',
        initialDurationSeconds: resolvedDuration,
        isPostCallPopup: true,
        capturedMetadata: metadata,
      );
      onCompleted?.call();
    });
  }
}

class _CallOutcomeOption {
  final String key;
  final String label;
  final String labelAr;
  final String nextStage;
  final IconData icon;
  final Color color;
  final bool suggestsSchedule;

  const _CallOutcomeOption({
    required this.key,
    required this.label,
    required this.labelAr,
    required this.nextStage,
    required this.icon,
    required this.color,
    this.suggestsSchedule = false,
  });
}

class LogCallDialog extends StatefulWidget {
  final LeadModel lead;
  final String initialChannel;
  final int initialDurationSeconds;
  final bool isPostCallPopup;
  final DeviceCallMetadata? capturedMetadata;

  const LogCallDialog({
    super.key,
    required this.lead,
    this.initialChannel = 'Call',
    this.initialDurationSeconds = 60,
    this.isPostCallPopup = false,
    this.capturedMetadata,
  });

  /// Dial the lead's phone number via native dialer and automatically pop up
  /// the Post-Call Outcome Modal when the user returns to the app.
  static Future<void> dialAndTrack(
    BuildContext context, {
    required LeadModel lead,
    VoidCallback? onCompleted,
  }) async {
    final cleanPhone = lead.phone.replaceAll(RegExp(r'\s+'), '');
    if (cleanPhone.isEmpty) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No phone number available for this lead')),
        );
      }
      return;
    }

    final waiter = _PostCallLifecycleWaiter(
      context: context,
      lead: lead,
      callStartedAt: DateTime.now(),
      onCompleted: onCompleted,
    );
    waiter.start();

    final uri = Uri.parse('tel:$cleanPhone');
    try {
      await launchUrl(uri);
    } catch (_) {
      // Even if native dialer cannot be launched on a simulator/browser,
      // the waiter's fallback will still open the Post-Call Outcome Modal.
    }
  }

  static Future<void> show(
    BuildContext context, {
    required LeadModel lead,
    String initialChannel = 'Call',
    int initialDurationSeconds = 60,
    bool isPostCallPopup = false,
    DeviceCallMetadata? capturedMetadata,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      enableDrag: true,
      backgroundColor: Colors.transparent,
      builder: (_) => LogCallDialog(
        lead: lead,
        initialChannel: initialChannel,
        initialDurationSeconds: initialDurationSeconds,
        isPostCallPopup: isPostCallPopup,
        capturedMetadata: capturedMetadata,
      ),
    );
  }

  @override
  State<LogCallDialog> createState() => _LogCallDialogState();
}

class _LogCallDialogState extends State<LogCallDialog> {
  late String _channel;
  String _outcome = 'Answered';
  late int _durationSeconds;
  final _notesController = TextEditingController();
  bool _isSubmitting = false;

  // Follow-up / Meeting scheduling state
  DateTime? _scheduledDate;
  TimeOfDay _scheduledTime = const TimeOfDay(hour: 11, minute: 0);

  // Quick Payment Calculator toggle inside Post-Call modal
  bool _showQuickCalc = false;
  late final TextEditingController _calcPriceCtrl;
  final TextEditingController _calcDownPctCtrl = TextEditingController(text: '10');
  final TextEditingController _calcYearsCtrl = TextEditingController(text: '8');

  static const List<String> _channels = ['Call', 'WhatsApp', 'Meeting', 'Site Visit'];

  static const List<_CallOutcomeOption> _outcomeOptions = [
    _CallOutcomeOption(
      key: 'Answered',
      label: 'Answered',
      labelAr: 'تم الرد',
      nextStage: 'Following Up',
      icon: LucideIcons.phoneCall,
      color: Color(0xFF10B981),
      suggestsSchedule: true,
    ),
    _CallOutcomeOption(
      key: 'No Answer',
      label: 'No Answer',
      labelAr: 'لم يتم الرد',
      nextStage: 'No Answer',
      icon: LucideIcons.phoneMissed,
      color: Color(0xFFF59E0B),
      suggestsSchedule: true,
    ),
    _CallOutcomeOption(
      key: 'Interested',
      label: 'Interested',
      labelAr: 'مهتم',
      nextStage: 'Interested',
      icon: LucideIcons.sparkles,
      color: Color(0xFF10B981),
      suggestsSchedule: true,
    ),
    _CallOutcomeOption(
      key: 'Follow-up',
      label: 'Follow-up',
      labelAr: 'متابعة',
      nextStage: 'Following Up',
      icon: LucideIcons.calendarClock,
      color: Color(0xFF3B82F6),
      suggestsSchedule: true,
    ),
    _CallOutcomeOption(
      key: 'Schedule Meeting',
      label: 'Schedule Meeting',
      labelAr: 'تحديد موعد',
      nextStage: 'Meeting',
      icon: LucideIcons.calendarCheck,
      color: Color(0xFF8B5CF6),
      suggestsSchedule: true,
    ),
    _CallOutcomeOption(
      key: 'Site Visit',
      label: 'Site Visit',
      labelAr: 'معاينة موقع',
      nextStage: 'Meeting',
      icon: LucideIcons.mapPin,
      color: Color(0xFF6366F1),
      suggestsSchedule: true,
    ),
    _CallOutcomeOption(
      key: 'Not Interested',
      label: 'Not Interested',
      labelAr: 'غير مهتم',
      nextStage: 'Not Interested',
      icon: LucideIcons.thumbsDown,
      color: Color(0xFFEF4444),
    ),
    _CallOutcomeOption(
      key: 'Wrong Phone',
      label: 'Wrong Phone',
      labelAr: 'رقم خاطئ',
      nextStage: 'Wrong Number',
      icon: LucideIcons.phoneOff,
      color: Color(0xFF64748B),
    ),
    _CallOutcomeOption(
      key: 'Closed Number',
      label: 'Closed Number',
      labelAr: 'رقم مغلق',
      nextStage: 'Closed Number',
      icon: LucideIcons.ban,
      color: Color(0xFF64748B),
    ),
    _CallOutcomeOption(
      key: 'Won Deal',
      label: 'Won Deal',
      labelAr: 'صفقة ناجحة',
      nextStage: 'Done Deal',
      icon: LucideIcons.trophy,
      color: Color(0xFF059669),
    ),
  ];

  static const List<String> _quickNoteTemplates = [
    'Sent Brochure via WhatsApp',
    'Requested callback tomorrow',
    'Interested in payment plan',
    'Discussed residential units',
    'Busy — call back later',
  ];

  @override
  void initState() {
    super.initState();
    _channel = widget.initialChannel;
    _durationSeconds = widget.capturedMetadata?.durationSeconds ?? widget.initialDurationSeconds;
    if (widget.capturedMetadata != null) {
      _outcome = widget.capturedMetadata!.detectedOutcome;
    }
    final defaultPrice = (widget.lead.budgetMax ?? widget.lead.budgetMin ?? 3500000).toInt();
    _calcPriceCtrl = TextEditingController(text: defaultPrice.toString());

    // Default follow-up date to tomorrow for follow-up/meeting outcomes
    _scheduledDate = DateTime.now().add(const Duration(days: 1));
  }

  @override
  void dispose() {
    _notesController.dispose();
    _calcPriceCtrl.dispose();
    _calcDownPctCtrl.dispose();
    _calcYearsCtrl.dispose();
    super.dispose();
  }

  _CallOutcomeOption get _selectedOption =>
      _outcomeOptions.firstWhere((o) => o.key == _outcome, orElse: () => _outcomeOptions.first);

  bool get _needsSchedule =>
      _outcome == 'Follow-up' ||
      _outcome == 'Schedule Meeting' ||
      _outcome == 'Site Visit' ||
      _outcome == 'Interested' ||
      _outcome == 'No Answer';

  Future<void> _pickScheduleDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _scheduledDate ?? now.add(const Duration(days: 1)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() => _scheduledDate = picked);
    }
  }

  Future<void> _pickScheduleTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _scheduledTime,
    );
    if (picked != null) {
      setState(() => _scheduledTime = picked);
    }
  }

  void _appendQuickNote(String text) {
    final cur = _notesController.text.trim();
    _notesController.text = cur.isEmpty ? text : '$cur • $text';
    _notesController.selection = TextSelection.fromPosition(
      TextPosition(offset: _notesController.text.length),
    );
    setState(() {});
  }

  Future<void> _submit() async {
    setState(() => _isSubmitting = true);

    String? followUpDateStr;
    String? followUpTimeStr;

    if (_needsSchedule && _scheduledDate != null) {
      followUpDateStr = DateFormat('yyyy-MM-dd').format(_scheduledDate!);
      followUpTimeStr =
          '${_scheduledTime.hour.toString().padLeft(2, '0')}:${_scheduledTime.minute.toString().padLeft(2, '0')}';
    }

    final callLog = CallLogModel(
      id: widget.capturedMetadata?.syncedCallLogId ?? '',
      entityType: 'lead',
      entityId: widget.lead.id,
      contactName: widget.lead.name,
      contactPhone: widget.lead.phone,
      channel: _channel,
      direction: widget.capturedMetadata?.direction ?? 'outgoing',
      durationSeconds: _channel == 'Call' ? _durationSeconds : 0,
      outcome: _outcome,
      notes: _notesController.text.trim(),
      clientRef: widget.capturedMetadata?.clientRef,
      projectName: widget.lead.project,
    );

    try {
      await context.read<CallLogsProvider>().logCall(
            callLog,
            followUpDate: followUpDateStr,
            followUpTime: followUpTimeStr,
          );

      if (mounted) {
        final leadsProvider = context.read<LeadsProvider>();
        await leadsProvider.updateStatus(widget.lead.id, _selectedOption.nextStage);
        await leadsProvider.fetchLeads(silent: true);
      }
    } catch (_) {}

    if (mounted) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Saved: $_outcome (${_selectedOption.labelAr}) → ${_selectedOption.nextStage}',
          ),
          backgroundColor: AppColors.primary,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    final selectedOpt = _selectedOption;

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.90,
      ),
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 16,
        bottom: 20 + bottomInset,
      ),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF141820) : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border.all(
          color: isDark ? const Color(0xFF282D38) : AppColors.lightBorder,
        ),
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Drag Handle
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 14),
                decoration: BoxDecoration(
                  color: isDark ? Colors.white24 : Colors.black12,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),

            // Header Banner
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: AppColors.neonLime.withAlpha(30),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.neonLime.withAlpha(90)),
                  ),
                  child: const Center(
                    child: Icon(LucideIcons.phoneCall, size: 20, color: AppColors.neonLime),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            widget.isPostCallPopup ? 'Post-Call Summary' : 'Log Touchpoint',
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                              color: isDark ? Colors.white : const Color(0xFF0F172A),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                            decoration: BoxDecoration(
                              color: selectedOpt.color.withAlpha(25),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: selectedOpt.color.withAlpha(80)),
                            ),
                            child: Text(
                              '→ ${selectedOpt.nextStage}',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                color: selectedOpt.color,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 3),
                      Text(
                        '${widget.lead.name.isNotEmpty ? widget.lead.name : "Lead"} • ${widget.lead.phone}',
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                          color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF475569),
                        ),
                      ),
                      if (widget.lead.project != null && widget.lead.project!.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            'Project: ${widget.lead.project}',
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: AppColors.neonLime,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(LucideIcons.x, size: 20),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            if (widget.capturedMetadata != null) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: const Color(0xFF10B981).withAlpha(20),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFF10B981).withAlpha(80)),
                ),
                child: Row(
                  children: [
                    const Icon(LucideIcons.checkCircle2, size: 15, color: Color(0xFF10B981)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Device Call Synced: ${widget.capturedMetadata!.callTypeLabel} (${widget.capturedMetadata!.detectedOutcome}) • ${widget.capturedMetadata!.durationSeconds}s • ${DateFormat('HH:mm:ss').format(widget.capturedMetadata!.timestamp.toLocal())}',
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF10B981),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 14),

            // Channel Selector + Quick Payment Calculator Toggle
            Row(
              children: [
                Expanded(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: _channels.map((ch) {
                        final isSelected = ch == _channel;
                        return Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: ChoiceChip(
                            label: Text(ch),
                            selected: isSelected,
                            selectedColor: AppColors.neonLime,
                            labelStyle: TextStyle(
                              color: isSelected
                                  ? const Color(0xFF142407)
                                  : (isDark ? Colors.white70 : Colors.black87),
                              fontWeight: FontWeight.w700,
                              fontSize: 11.5,
                            ),
                            onSelected: (val) {
                              if (val) setState(() => _channel = ch);
                            },
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                ),
                TextButton.icon(
                  onPressed: () => setState(() => _showQuickCalc = !_showQuickCalc),
                  icon: Icon(
                    LucideIcons.calculator,
                    size: 14,
                    color: _showQuickCalc ? AppColors.neonLime : const Color(0xFF38BDF8),
                  ),
                  label: Text(
                    _showQuickCalc ? 'Hide Calc' : 'Payment Calc',
                    style: TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                      color: _showQuickCalc ? AppColors.neonLime : const Color(0xFF38BDF8),
                    ),
                  ),
                ),
              ],
            ),

            // Expandable Quick Payment Plan Calculator (matching PostCallOutcomeModal.tsx)
            if (_showQuickCalc) ...[
              const SizedBox(height: 8),
              _buildInlinePaymentCalculator(isDark),
            ],

            const SizedBox(height: 14),

            // Selectable Call Outcome Actions Grid
            Text(
              'Select Call Outcome / نتيجة المكالمة',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155),
              ),
            ),
            const SizedBox(height: 8),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _outcomeOptions.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                childAspectRatio: 2.75,
              ),
              itemBuilder: (context, index) {
                final opt = _outcomeOptions[index];
                final isSelected = opt.key == _outcome;
                return InkWell(
                  onTap: () => setState(() => _outcome = opt.key),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? opt.color.withAlpha(isDark ? 45 : 25)
                          : (isDark ? const Color(0xFF1C212B) : const Color(0xFFF8FAFC)),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isSelected
                            ? opt.color
                            : (isDark ? const Color(0xFF282D38) : const Color(0xFFE2E8F0)),
                        width: isSelected ? 1.6 : 1.0,
                      ),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 28,
                          height: 28,
                          decoration: BoxDecoration(
                            color: opt.color.withAlpha(30),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Icon(opt.icon, size: 15, color: opt.color),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                opt.label,
                                style: TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w800,
                                  color: isSelected
                                      ? opt.color
                                      : (isDark ? Colors.white : const Color(0xFF0F172A)),
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              Text(
                                opt.labelAr,
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                  color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                        ),
                        if (isSelected)
                          Icon(LucideIcons.checkCircle2, size: 15, color: opt.color),
                      ],
                    ),
                  ),
                );
              },
            ),

            // Conditional Follow-up / Meeting Date & Time Section
            if (_needsSchedule) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF1C212B) : const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: selectedOpt.color.withAlpha(90),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Icon(LucideIcons.calendarClock, size: 15, color: selectedOpt.color),
                            const SizedBox(width: 6),
                            Text(
                              _outcome == 'Schedule Meeting' || _outcome == 'Site Visit'
                                  ? 'Schedule Meeting / Site Visit'
                                  : 'Schedule Next Follow-up',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w800,
                                color: isDark ? Colors.white : const Color(0xFF0F172A),
                              ),
                            ),
                          ],
                        ),
                        if (_scheduledDate != null)
                          InkWell(
                            onTap: () => setState(() => _scheduledDate = null),
                            child: const Text(
                              'Skip',
                              style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    // Quick Date Presets
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          _buildDatePresetChip('Today', 0, isDark),
                          const SizedBox(width: 6),
                          _buildDatePresetChip('Tomorrow', 1, isDark),
                          const SizedBox(width: 6),
                          _buildDatePresetChip('In 2 Days', 2, isDark),
                          const SizedBox(width: 6),
                          _buildDatePresetChip('Next Week', 7, isDark),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _pickScheduleDate,
                            icon: const Icon(LucideIcons.calendar, size: 14),
                            label: Text(
                              _scheduledDate != null
                                  ? DateFormat('EEE, dd MMM yyyy').format(_scheduledDate!)
                                  : 'Select Date',
                              style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _pickScheduleTime,
                            icon: const Icon(LucideIcons.clock, size: 14),
                            label: Text(
                              _scheduledTime.format(context),
                              style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],

            // Call Duration Slider
            if (_channel == 'Call') ...[
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Call Duration',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                    ),
                  ),
                  Text(
                    '${_durationSeconds ~/ 60}m ${_durationSeconds % 60}s',
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                      color: AppColors.neonLime,
                    ),
                  ),
                ],
              ),
              Slider(
                value: _durationSeconds.clamp(0, 600).toDouble(),
                min: 0,
                max: 600,
                divisions: 60,
                activeColor: AppColors.neonLime,
                onChanged: (val) => setState(() => _durationSeconds = val.toInt()),
              ),
            ],

            // Notes & Quick Disposition Chips
            const SizedBox(height: 8),
            Text(
              'Call Notes & Summary / ملاحظات المكالمة',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155),
              ),
            ),
            const SizedBox(height: 6),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: _quickNoteTemplates.map((tpl) {
                  return Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: ActionChip(
                      label: Text(tpl, style: const TextStyle(fontSize: 10.5)),
                      onPressed: () => _appendQuickNote(tpl),
                      visualDensity: VisualDensity.compact,
                    ),
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _notesController,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: 'Write call summary, unit preferences, budget feedback…',
                filled: true,
                fillColor: isDark ? const Color(0xFF1C212B) : const Color(0xFFF8FAFC),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 18),

            // Save Action Button
            SizedBox(
              height: 48,
              child: ElevatedButton.icon(
                onPressed: _isSubmitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.neonLime,
                  foregroundColor: const Color(0xFF142407),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                icon: _isSubmitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Color(0xFF142407),
                        ),
                      )
                    : const Icon(LucideIcons.checkCircle2, size: 18),
                label: Text(
                  _isSubmitting ? 'Saving Action...' : 'Save Action',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDatePresetChip(String label, int daysOffset, bool isDark) {
    final target = DateTime.now().add(Duration(days: daysOffset));
    final isSelected = _scheduledDate != null &&
        _scheduledDate!.year == target.year &&
        _scheduledDate!.month == target.month &&
        _scheduledDate!.day == target.day;

    return InkWell(
      onTap: () => setState(() => _scheduledDate = target),
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.neonLime
              : (isDark ? const Color(0xFF141820) : Colors.white),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected
                ? AppColors.neonLime
                : (isDark ? const Color(0xFF282D38) : AppColors.lightBorder),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: isSelected
                ? const Color(0xFF142407)
                : (isDark ? Colors.white70 : Colors.black87),
          ),
        ),
      ),
    );
  }

  Widget _buildInlinePaymentCalculator(bool isDark) {
    final total = double.tryParse(_calcPriceCtrl.text.replaceAll(',', '')) ?? 0;
    final downPct = double.tryParse(_calcDownPctCtrl.text) ?? 10;
    final years = double.tryParse(_calcYearsCtrl.text) ?? 8;

    final downAmount = total * (downPct / 100);
    final remaining = (total - downAmount).clamp(0.0, double.infinity);
    final monthly = years > 0 ? remaining / (years * 12) : 0.0;
    final quarterly = monthly * 3;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1C212B) : const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF38BDF8).withAlpha(80)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(LucideIcons.calculator, size: 14, color: Color(0xFF38BDF8)),
              SizedBox(width: 6),
              Text(
                'Quick Payment Plan Estimate',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF38BDF8),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                flex: 2,
                child: TextField(
                  controller: _calcPriceCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Total EGP',
                    isDense: true,
                  ),
                  onChanged: (_) => setState(() {}),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _calcDownPctCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Down %',
                    isDense: true,
                  ),
                  onChanged: (_) => setState(() {}),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _calcYearsCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Years',
                    isDense: true,
                  ),
                  onChanged: (_) => setState(() {}),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _buildCalcMetric('Down Payment', CurrencyFormatter.formatCompact(downAmount)),
              _buildCalcMetric('Monthly', CurrencyFormatter.formatCompact(monthly)),
              _buildCalcMetric('Quarterly', CurrencyFormatter.formatCompact(quarterly)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCalcMetric(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8))),
        Text(
          value,
          style: const TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w800,
            color: AppColors.neonLime,
          ),
        ),
      ],
    );
  }
}
