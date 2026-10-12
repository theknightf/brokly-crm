import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/utils/currency_formatter.dart';
import '../../core/utils/date_utils.dart';
import '../../core/utils/whatsapp_utils.dart';
import '../../data/models/call_log_model.dart';
import '../../data/models/lead_model.dart';
import '../../data/services/call_logs_service.dart';
import '../../data/services/leads_service.dart';
import '../../data/services/supabase_service.dart';
import '../../state/auth_provider.dart';
import '../../state/leads_provider.dart';
import '../calculator/unit_calculator_screen.dart';
import 'edit_lead_screen.dart';
import 'widgets/log_call_dialog.dart';
import 'widgets/quick_note_dialog.dart';
import 'widgets/status_change_sheet.dart';

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
  String _activeLedgerTab = 'all'; // 'all' | 'calls' | 'notes' | 'files'

  // Stitch Color Palette
  static const Color _bgLowest = Color(0xFF0B0E14);
  static const Color _cardLow = Color(0xFF191C22);
  static const Color _cardContainer = Color(0xFF1D2026);
  static const Color _surfaceHigh = Color(0xFF272A31);
  static const Color _surfaceHighest = Color(0xFF32353C);
  static const Color _neonPrimary = Color(0xFFCCFF80);
  static const Color _neonContainer = Color(0xFFA3E635);
  static const Color _outlineVariant = Color(0xFF424936);
  static const Color _onSurface = Color(0xFFE1E2EB);
  static const Color _onSurfaceVariant = Color(0xFFC2CAB0);
  static const Color _whatsAppGreen = Color(0xFF25D366);

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  Future<void> _loadAll() async {
    setState(() => _isLoading = true);
    final leadData = await _leadsService.getById(widget.leadId);
    final callData = await _callLogsService.getAll(entityId: widget.leadId);

    List<Map<String, dynamic>> fetchedComments = [];
    try {
      final res = await _client
          .from('lead_comments')
          .select('id, body, created_at, user_id')
          .eq('lead_id', widget.leadId)
          .order('created_at', ascending: false)
          .limit(30);
      fetchedComments = (res as List<dynamic>)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
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

  Future<void> _makeCall() async {
    if (_lead == null) return;
    await LogCallDialog.dialAndTrack(
      context,
      lead: _lead!,
      onCompleted: _loadAll,
    );
  }

  Future<void> _openWhatsApp({bool isBrochure = false}) async {
    if (_lead == null) return;
    String? customMsg;
    if (isBrochure) {
      final userName = WhatsAppUtils.resolveCurrentUserName(context);
      final proj = (_lead!.project != null && _lead!.project!.isNotEmpty)
          ? ' لمشروع ${_lead!.project}'
          : '';
      customMsg =
          'صباح الخير / مساء الخير، أنا $userName من شركة On Point للتسويق العقاري، مرفق لحضرتك تفاصيل البروشور وخطط السداد المتاحة$proj.';
    }
    if (!mounted) return;
    final launched = await WhatsAppUtils.openWhatsAppChat(
      context,
      phone: _lead!.phone,
      customMessage: customMsg,
    );
    if (launched && mounted) {
      await LogCallDialog.show(context, lead: _lead!, initialChannel: 'WhatsApp');
      _loadAll();
    }
  }

  Future<void> _scheduleFollowUp() async {
    if (_lead == null) return;
    final now = DateTime.now();
    final initial = _lead!.followUpDateTime ?? now.add(const Duration(days: 1));
    final pickedDate = await showDatePicker(
      context: context,
      initialDate: initial.isBefore(now) ? now.add(const Duration(days: 1)) : initial,
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
    );
    if (pickedDate == null || !mounted) return;

    final pickedTime = await showTimePicker(
      context: context,
      initialTime: const TimeOfDay(hour: 11, minute: 0),
    );
    if (!mounted) return;

    final dateStr = DateFormat('yyyy-MM-dd').format(pickedDate);
    final timeStr = pickedTime != null
        ? '${pickedTime.hour.toString().padLeft(2, '0')}:${pickedTime.minute.toString().padLeft(2, '0')}'
        : '11:00';

    await context.read<LeadsProvider>().updateLead(_lead!.id, {
      'follow_up_due': dateStr,
    });

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
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Follow-up scheduled for $dateStr at $timeStr'),
          backgroundColor: const Color(0xFF65A30D),
        ),
      );
    }
  }

  Future<void> _bookSiteVisit() async {
    if (_lead == null) return;
    await LogCallDialog.show(
      context,
      lead: _lead!,
      initialChannel: 'Site Visit',
    );
    await _loadAll();
  }

  Future<void> _syncDeviceCalls() async {
    if (_lead == null) return;
    final synced = await _callLogsService.syncDeviceCallLogs(
      limit: 40,
      filterLeadId: _lead!.id,
    );
    await _loadAll();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            synced > 0
                ? 'Synced $synced call(s) from device call log'
                : 'Device call log is up to date',
          ),
          backgroundColor: const Color(0xFF65A30D),
        ),
      );
    }
  }

  int _calculateLeadScore(LeadModel lead) {
    int score = 68;
    final st = lead.status.toLowerCase();
    if (st.contains('done') || st.contains('won')) {
      score = 98;
    } else if (st.contains('meeting') || st.contains('visit')) {
      score = 94;
    } else if (st.contains('interest')) {
      score = 88;
    } else if (st.contains('follow')) {
      score = 80;
    } else if (st.contains('fresh') || st.contains('new')) {
      score = 74;
    }
    if ((lead.budgetMax ?? lead.budgetMin ?? 0) >= 5000000) {
      score = (score + 4).clamp(0, 99);
    }
    if (_calls.isNotEmpty) {
      score = (score + 2).clamp(0, 99);
    }
    return score;
  }

  int _activeStageStepIndex(String status) {
    final s = status.toLowerCase();
    if (s.contains('done') || s.contains('won')) return 4;
    if (s.contains('interest') || s.contains('negotiate')) return 3;
    if (s.contains('meeting') || s.contains('visit')) return 2;
    if (s.contains('follow') || s.contains('contact') || s.contains('answer') || s.contains('cold')) {
      return 1;
    }
    return 0;
  }

  String _stageSubtitleAr(String status) {
    final s = status.toLowerCase();
    if (s.contains('done') || s.contains('won')) return 'صفقة ناجحة';
    if (s.contains('meeting') || s.contains('visit')) return 'مقابلة محددة';
    if (s.contains('interest')) return 'عميل مهتم';
    if (s.contains('follow')) return 'قيد المتابعة';
    if (s.contains('no answer')) return 'لم يتم الرد';
    return 'عميل جديد';
  }

  List<String> _extractNoteLines(LeadModel lead) {
    final lines = <String>[];
    if (lead.notes != null && lead.notes!.trim().isNotEmpty) {
      for (final line in lead.notes!.split('\n')) {
        if (line.trim().isNotEmpty) lines.add(line.trim());
      }
    }
    for (final c in _comments) {
      final body = c['body']?.toString().trim() ?? '';
      if (body.isNotEmpty && !lines.any((l) => l.contains(body))) {
        lines.insert(0, body);
      }
    }
    return lines;
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        backgroundColor: _bgLowest,
        body: Center(
          child: CircularProgressIndicator(color: _neonPrimary),
        ),
      );
    }

    if (_lead == null) {
      return Scaffold(
        backgroundColor: _bgLowest,
        appBar: AppBar(
          backgroundColor: _bgLowest,
          title: const Text('Lead Profile'),
        ),
        body: const Center(
          child: Text('Lead not found', style: TextStyle(color: _onSurface)),
        ),
      );
    }

    final lead = _lead!;
    final shortId = lead.id.length > 6
        ? lead.id.substring(lead.id.length - 5).toUpperCase()
        : lead.id.toUpperCase();
    final initials = lead.name.trim().isNotEmpty
        ? lead.name
            .trim()
            .split(' ')
            .take(2)
            .map((e) => e.isNotEmpty ? e[0].toUpperCase() : '')
            .join()
        : 'LD';
    final score = _calculateLeadScore(lead);
    final stepIdx = _activeStageStepIndex(lead.status);
    final noteLines = _extractNoteLines(lead);
    final totalActivityCount = _calls.length + noteLines.length + 1;

    final auth = context.watch<AuthProvider>();
    final currentAgentName =
        lead.assignedToName ?? lead.agent ?? auth.profile?.fullName ?? 'Faris Mansoor';

    return Scaffold(
      backgroundColor: _bgLowest,
      body: SafeArea(
        child: Column(
          children: [
            // Top Bar / Navigation Context
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: _bgLowest.withAlpha(242),
                border: const Border(
                  bottom: BorderSide(color: _outlineVariant, width: 0.8),
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      InkWell(
                        onTap: () => Navigator.pop(context),
                        borderRadius: BorderRadius.circular(20),
                        child: Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            color: _cardLow,
                            shape: BoxShape.circle,
                            border: Border.all(color: _outlineVariant),
                          ),
                          child: const Icon(
                            LucideIcons.arrowLeft,
                            size: 18,
                            color: _onSurface,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                '#LEAD-$shortId',
                                style: const TextStyle(
                                  color: _neonPrimary,
                                  fontSize: 11.5,
                                  fontFamily: 'monospace',
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.6,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Container(
                                width: 6,
                                height: 6,
                                decoration: const BoxDecoration(
                                  color: _neonPrimary,
                                  shape: BoxShape.circle,
                                ),
                              ),
                            ],
                          ),
                          const Text(
                            'ملف العميل • Lead Profile',
                            style: TextStyle(
                              color: _onSurfaceVariant,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: _cardContainer,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: _outlineVariant),
                        ),
                        child: const Row(
                          children: [
                            Icon(LucideIcons.shieldCheck, size: 13, color: _neonPrimary),
                            SizedBox(width: 4),
                            Text(
                              'Brokly',
                              style: TextStyle(
                                color: _neonPrimary,
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 6),
                      InkWell(
                        onTap: () {
                          Clipboard.setData(
                            ClipboardData(text: '${lead.name} - ${lead.phone}'),
                          );
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Lead contact copied to clipboard'),
                              duration: Duration(seconds: 2),
                            ),
                          );
                        },
                        borderRadius: BorderRadius.circular(20),
                        child: Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: _cardLow,
                            shape: BoxShape.circle,
                            border: Border.all(color: _outlineVariant),
                          ),
                          child: const Icon(
                            LucideIcons.share2,
                            size: 16,
                            color: _onSurfaceVariant,
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      PopupMenuButton<String>(
                        color: _cardLow,
                        icon: Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: _cardLow,
                            shape: BoxShape.circle,
                            border: Border.all(color: _outlineVariant),
                          ),
                          child: const Icon(
                            LucideIcons.ellipsisVertical,
                            size: 16,
                            color: _onSurfaceVariant,
                          ),
                        ),
                        onSelected: (value) async {
                          if (value == 'edit') {
                            final updated = await Navigator.push<bool>(
                              context,
                              MaterialPageRoute(
                                builder: (_) => EditLeadScreen(lead: lead),
                              ),
                            );
                            if (updated == true) _loadAll();
                          } else if (value == 'sync') {
                            await _syncDeviceCalls();
                          } else if (value == 'note') {
                            QuickNoteDialog.show(
                              context,
                              leadName: lead.name,
                              onSaveNote: (note) async {
                                await context
                                    .read<LeadsProvider>()
                                    .addNote(lead.id, note);
                                _loadAll();
                              },
                            );
                          } else if (value == 'calculator') {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => const UnitCalculatorScreen(),
                              ),
                            );
                          } else if (value == 'delete') {
                            _confirmDelete();
                          }
                        },
                        itemBuilder: (_) => const [
                          PopupMenuItem(
                            value: 'edit',
                            child: Text('Edit Lead Profile', style: TextStyle(color: _onSurface)),
                          ),
                          PopupMenuItem(
                            value: 'note',
                            child: Text('Add Quick Note', style: TextStyle(color: _onSurface)),
                          ),
                          PopupMenuItem(
                            value: 'sync',
                            child: Text('Sync Device Call Logs', style: TextStyle(color: _onSurface)),
                          ),
                          PopupMenuItem(
                            value: 'calculator',
                            child: Text('Open Unit Calculator', style: TextStyle(color: _onSurface)),
                          ),
                          PopupMenuItem(
                            value: 'delete',
                            child: Text('Delete Lead', style: TextStyle(color: Color(0xFFEF4444))),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // Main Scrollable Content
            Expanded(
              child: RefreshIndicator(
                color: _neonPrimary,
                onRefresh: _loadAll,
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(14, 14, 14, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // 1. Lead Identity & Executive Summary Card
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: _cardLow,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: _outlineVariant),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withAlpha(110),
                              blurRadius: 18,
                              offset: const Offset(0, 6),
                            ),
                          ],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            // Identity Header
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Stack(
                                        children: [
                                          Container(
                                            width: 54,
                                            height: 54,
                                            decoration: BoxDecoration(
                                              color: _surfaceHigh,
                                              shape: BoxShape.circle,
                                              border: Border.all(color: _neonPrimary, width: 2),
                                              boxShadow: [
                                                BoxShadow(
                                                  color: _neonContainer.withAlpha(70),
                                                  blurRadius: 12,
                                                ),
                                              ],
                                            ),
                                            child: Center(
                                              child: Text(
                                                initials,
                                                style: const TextStyle(
                                                  color: _neonPrimary,
                                                  fontSize: 18,
                                                  fontWeight: FontWeight.w800,
                                                ),
                                              ),
                                            ),
                                          ),
                                          Positioned(
                                            bottom: 0,
                                            right: 0,
                                            child: Container(
                                              width: 14,
                                              height: 14,
                                              decoration: BoxDecoration(
                                                color: _neonPrimary,
                                                shape: BoxShape.circle,
                                                border: Border.all(color: _bgLowest, width: 2),
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Wrap(
                                              crossAxisAlignment: WrapCrossAlignment.center,
                                              spacing: 6,
                                              runSpacing: 4,
                                              children: [
                                                Text(
                                                  lead.name.isNotEmpty
                                                      ? lead.name
                                                      : lead.phone,
                                                  style: const TextStyle(
                                                    color: _onSurface,
                                                    fontSize: 16.5,
                                                    fontWeight: FontWeight.w800,
                                                  ),
                                                ),
                                                Container(
                                                  padding: const EdgeInsets.symmetric(
                                                    horizontal: 7,
                                                    vertical: 2,
                                                  ),
                                                  decoration: BoxDecoration(
                                                    color: _neonPrimary.withAlpha(25),
                                                    borderRadius: BorderRadius.circular(12),
                                                    border: Border.all(
                                                      color: _neonPrimary.withAlpha(80),
                                                    ),
                                                  ),
                                                  child: Text(
                                                    lead.priority == 'High' ||
                                                            lead.priority == 'Urgent'
                                                        ? 'VIP HNW'
                                                        : lead.priority.toUpperCase(),
                                                    style: const TextStyle(
                                                      color: _neonPrimary,
                                                      fontSize: 9.5,
                                                      fontWeight: FontWeight.w800,
                                                      letterSpacing: 0.4,
                                                    ),
                                                  ),
                                                ),
                                              ],
                                            ),
                                            const SizedBox(height: 4),
                                            Row(
                                              children: [
                                                const Icon(
                                                  LucideIcons.mapPin,
                                                  size: 12,
                                                  color: _neonPrimary,
                                                ),
                                                const SizedBox(width: 4),
                                                Expanded(
                                                  child: Text(
                                                    lead.location?.isNotEmpty == true
                                                        ? lead.location!
                                                        : (lead.project?.isNotEmpty == true
                                                            ? lead.project!
                                                            : 'New Cairo, Egypt'),
                                                    maxLines: 1,
                                                    overflow: TextOverflow.ellipsis,
                                                    style: const TextStyle(
                                                      color: _onSurfaceVariant,
                                                      fontSize: 11.5,
                                                    ),
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text(
                                      '$score/100',
                                      style: const TextStyle(
                                        color: _neonPrimary,
                                        fontSize: 12.5,
                                        fontFamily: 'monospace',
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                    const Text(
                                      'LEAD SCORE',
                                      style: TextStyle(
                                        color: _onSurfaceVariant,
                                        fontSize: 9.5,
                                        fontWeight: FontWeight.w700,
                                        letterSpacing: 0.4,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                            const SizedBox(height: 14),

                            // Contact Ribbon & Direct CTA
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 10,
                              ),
                              decoration: BoxDecoration(
                                color: _bgLowest.withAlpha(205),
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: _outlineVariant),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(
                                    child: Row(
                                      children: [
                                        Container(
                                          width: 34,
                                          height: 34,
                                          decoration: BoxDecoration(
                                            color: _cardContainer,
                                            borderRadius: BorderRadius.circular(8),
                                            border: Border.all(color: _outlineVariant),
                                          ),
                                          child: const Icon(
                                            LucideIcons.phone,
                                            size: 16,
                                            color: _neonPrimary,
                                          ),
                                        ),
                                        const SizedBox(width: 10),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                lead.phone,
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                  color: _onSurface,
                                                  fontSize: 13.5,
                                                  fontFamily: 'monospace',
                                                  fontWeight: FontWeight.w700,
                                                ),
                                              ),
                                              const Text(
                                                'Primary Mobile • Verified',
                                                style: TextStyle(
                                                  color: _onSurfaceVariant,
                                                  fontSize: 10,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Row(
                                    children: [
                                      // WhatsApp Action
                                      InkWell(
                                        onTap: () => _openWhatsApp(),
                                        borderRadius: BorderRadius.circular(20),
                                        child: Container(
                                          width: 38,
                                          height: 38,
                                          decoration: BoxDecoration(
                                            color: _whatsAppGreen.withAlpha(38),
                                            shape: BoxShape.circle,
                                            border: Border.all(
                                              color: _whatsAppGreen.withAlpha(110),
                                            ),
                                          ),
                                          child: const Icon(
                                            LucideIcons.messageCircle,
                                            size: 18,
                                            color: _whatsAppGreen,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      // Direct Dial Action
                                      InkWell(
                                        onTap: _makeCall,
                                        borderRadius: BorderRadius.circular(20),
                                        child: Container(
                                          width: 38,
                                          height: 38,
                                          decoration: BoxDecoration(
                                            color: _neonContainer,
                                            shape: BoxShape.circle,
                                            boxShadow: [
                                              BoxShadow(
                                                color: _neonContainer.withAlpha(90),
                                                blurRadius: 12,
                                              ),
                                            ],
                                          ),
                                          child: const Icon(
                                            LucideIcons.phoneCall,
                                            size: 18,
                                            color: _bgLowest,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 14),

                            // Sales Stage Stepper Visualizer (مرحلة البيع)
                            Container(
                              padding: const EdgeInsets.only(top: 12),
                              decoration: const BoxDecoration(
                                border: Border(
                                  top: BorderSide(color: _outlineVariant, width: 0.8),
                                ),
                              ),
                              child: Column(
                                children: [
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      const Row(
                                        children: [
                                          Icon(
                                            LucideIcons.activity,
                                            size: 14,
                                            color: _neonPrimary,
                                          ),
                                          SizedBox(width: 5),
                                          Text(
                                            'Sales Stage ',
                                            style: TextStyle(
                                              color: _onSurfaceVariant,
                                              fontSize: 11.5,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                          Text(
                                            '(مرحلة البيع)',
                                            style: TextStyle(
                                              color: _onSurfaceVariant,
                                              fontSize: 11,
                                            ),
                                          ),
                                        ],
                                      ),
                                      InkWell(
                                        onTap: () {
                                          StatusChangeSheet.show(
                                            context,
                                            currentStatus: lead.status,
                                            onSelectStatus: (newStatus) async {
                                              await context
                                                  .read<LeadsProvider>()
                                                  .updateStatus(lead.id, newStatus);
                                              _loadAll();
                                            },
                                          );
                                        },
                                        borderRadius: BorderRadius.circular(14),
                                        child: Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 9,
                                            vertical: 4,
                                          ),
                                          decoration: BoxDecoration(
                                            color: _neonPrimary.withAlpha(25),
                                            borderRadius: BorderRadius.circular(14),
                                            border: Border.all(
                                              color: _neonPrimary.withAlpha(70),
                                            ),
                                          ),
                                          child: Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              Text(
                                                '${lead.status} (${_stageSubtitleAr(lead.status)})',
                                                style: const TextStyle(
                                                  color: _neonPrimary,
                                                  fontSize: 10.5,
                                                  fontWeight: FontWeight.w800,
                                                ),
                                              ),
                                              const SizedBox(width: 4),
                                              const Icon(
                                                LucideIcons.chevronDown,
                                                size: 12,
                                                color: _neonPrimary,
                                              ),
                                            ],
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 10),
                                  Row(
                                    children: [
                                      _buildStageStep(0, 'Fresh', stepIdx),
                                      const SizedBox(width: 6),
                                      _buildStageStep(1, 'Contacted', stepIdx),
                                      const SizedBox(width: 6),
                                      _buildStageStep(2, 'Meeting', stepIdx),
                                      const SizedBox(width: 6),
                                      _buildStageStep(3, 'Negotiate', stepIdx),
                                      const SizedBox(width: 6),
                                      _buildStageStep(4, 'Won', stepIdx),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 14),

                            // Metadata Roster (Director / Source / Added Date)
                            Container(
                              padding: const EdgeInsets.only(top: 12),
                              decoration: const BoxDecoration(
                                border: Border(
                                  top: BorderSide(color: _outlineVariant, width: 0.8),
                                ),
                              ),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: _buildRosterCol('DIRECTOR', currentAgentName),
                                  ),
                                  Expanded(
                                    child: _buildRosterCol(
                                      'SOURCE',
                                      lead.source?.isNotEmpty == true
                                          ? lead.source!
                                          : 'Meta VIP Ad',
                                    ),
                                  ),
                                  Expanded(
                                    child: _buildRosterCol(
                                      'ADDED DATE',
                                      AppDateUtils.formatDate(lead.createdAt),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),

                      // 2. Quick Dispatch Actions (4-Button Grid)
                      const Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'QUICK DISPATCH ACTIONS',
                            style: TextStyle(
                              color: _onSurfaceVariant,
                              fontSize: 11.5,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.6,
                            ),
                          ),
                          Text(
                            'إجراءات سريعة',
                            style: TextStyle(
                              color: _neonPrimary,
                              fontSize: 11.5,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      GridView.count(
                        crossAxisCount: 2,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        mainAxisSpacing: 8,
                        crossAxisSpacing: 8,
                        childAspectRatio: 2.4,
                        children: [
                          _buildQuickDispatchButton(
                            icon: LucideIcons.filePenLine,
                            title: 'Log Call Outcome',
                            subtitleAr: 'سجل نتيجة الاتصال',
                            accentColor: _neonPrimary,
                            onTap: () async {
                              await LogCallDialog.show(context, lead: lead);
                              _loadAll();
                            },
                          ),
                          _buildQuickDispatchButton(
                            icon: LucideIcons.calendarCheck2,
                            title: 'Schedule Follow-up',
                            subtitleAr: 'متابعة مجدولة',
                            accentColor: _neonPrimary,
                            onTap: _scheduleFollowUp,
                          ),
                          _buildQuickDispatchButton(
                            icon: LucideIcons.send,
                            title: 'Send WA Brochure',
                            subtitleAr: 'كتالوج واتساب آلي',
                            accentColor: _whatsAppGreen,
                            onTap: () => _openWhatsApp(isBrochure: true),
                          ),
                          _buildQuickDispatchButton(
                            icon: LucideIcons.mapPin,
                            title: 'Book Site Visit',
                            subtitleAr: 'حجز معاينة ميدانية',
                            accentColor: _neonPrimary,
                            onTap: _bookSiteVisit,
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // 3. Target Property & Budget Matrix
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: _cardLow,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: _outlineVariant),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Row(
                                  children: [
                                    Icon(
                                      LucideIcons.building2,
                                      size: 18,
                                      color: _neonPrimary,
                                    ),
                                    SizedBox(width: 8),
                                    Text(
                                      'Target Property & Budget Matrix',
                                      style: TextStyle(
                                        color: _onSurface,
                                        fontSize: 13.5,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ],
                                ),
                                Text(
                                  'الميزانية والوحدة',
                                  style: TextStyle(
                                    color: _onSurfaceVariant,
                                    fontSize: 11,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            const Divider(color: _outlineVariant, height: 1),
                            const SizedBox(height: 12),

                            // Property Card Banner
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: _bgLowest,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: _outlineVariant),
                              ),
                              child: Row(
                                children: [
                                  Container(
                                    width: 68,
                                    height: 68,
                                    decoration: BoxDecoration(
                                      gradient: const LinearGradient(
                                        colors: [Color(0xFF1F2937), Color(0xFF0F172A)],
                                        begin: Alignment.topLeft,
                                        end: Alignment.bottomRight,
                                      ),
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(color: _outlineVariant),
                                    ),
                                    child: Stack(
                                      alignment: Alignment.center,
                                      children: [
                                        const Icon(
                                          LucideIcons.building,
                                          size: 28,
                                          color: _neonPrimary,
                                        ),
                                        Positioned(
                                          bottom: 4,
                                          left: 4,
                                          right: 4,
                                          child: Container(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 3,
                                              vertical: 1,
                                            ),
                                            decoration: BoxDecoration(
                                              color: _bgLowest.withAlpha(220),
                                              borderRadius: BorderRadius.circular(4),
                                            ),
                                            child: Text(
                                              lead.developer?.isNotEmpty == true
                                                  ? lead.developer!
                                                  : 'Prime Tier',
                                              textAlign: TextAlign.center,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: const TextStyle(
                                                color: _neonPrimary,
                                                fontSize: 8.5,
                                                fontFamily: 'monospace',
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                          children: [
                                            const Text(
                                              'PRIME INTEREST',
                                              style: TextStyle(
                                                color: _neonPrimary,
                                                fontSize: 9.5,
                                                fontWeight: FontWeight.w800,
                                                letterSpacing: 0.5,
                                              ),
                                            ),
                                            Container(
                                              padding: const EdgeInsets.symmetric(
                                                horizontal: 6,
                                                vertical: 2,
                                              ),
                                              decoration: BoxDecoration(
                                                color: _surfaceHigh,
                                                borderRadius: BorderRadius.circular(4),
                                              ),
                                              child: Text(
                                                lead.propertyType?.isNotEmpty == true
                                                    ? lead.propertyType!
                                                    : 'Villa 3BR+M',
                                                style: const TextStyle(
                                                  color: _onSurfaceVariant,
                                                  fontSize: 9.5,
                                                  fontFamily: 'monospace',
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          lead.project?.isNotEmpty == true
                                              ? lead.project!
                                              : 'Palm Residence Luxury Suites',
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            color: _onSurface,
                                            fontSize: 13.5,
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                        Text(
                                          'Developer: ${lead.developer?.isNotEmpty == true ? lead.developer! : "Tier-1 Real Estate"}',
                                          style: const TextStyle(
                                            color: _onSurfaceVariant,
                                            fontSize: 11,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Row(
                                          children: [
                                            const Icon(
                                              LucideIcons.bedDouble,
                                              size: 12,
                                              color: _neonPrimary,
                                            ),
                                            const SizedBox(width: 4),
                                            Text(
                                              lead.unit?.isNotEmpty == true
                                                  ? lead.unit!
                                                  : '3 BR',
                                              style: const TextStyle(
                                                color: _onSurfaceVariant,
                                                fontSize: 11,
                                              ),
                                            ),
                                            const SizedBox(width: 10),
                                            const Icon(
                                              LucideIcons.maximize2,
                                              size: 11,
                                              color: _neonPrimary,
                                            ),
                                            const SizedBox(width: 4),
                                            Text(
                                              lead.unitArea > 0
                                                  ? '${lead.unitArea.toInt()} m²'
                                                  : '240 m²',
                                              style: const TextStyle(
                                                color: _onSurfaceVariant,
                                                fontSize: 11,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 10),

                            // Financial Matrix KPI Grid
                            Row(
                              children: [
                                Expanded(
                                  child: Container(
                                    padding: const EdgeInsets.all(12),
                                    decoration: BoxDecoration(
                                      color: _bgLowest,
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(color: _outlineVariant),
                                    ),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        const Row(
                                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                          children: [
                                            Text(
                                              'TARGET BUDGET',
                                              style: TextStyle(
                                                color: _onSurfaceVariant,
                                                fontSize: 9.5,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                            Text(
                                              'الميزانية',
                                              style: TextStyle(
                                                color: _neonPrimary,
                                                fontSize: 10,
                                              ),
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          (lead.budgetMax != null || lead.budgetMin != null)
                                              ? CurrencyFormatter.formatCompact(
                                                  lead.budgetMax ?? lead.budgetMin,
                                                )
                                              : '7.50M ج.م',
                                          style: const TextStyle(
                                            color: _neonPrimary,
                                            fontSize: 17,
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          (lead.budgetMin != null || lead.budgetMax != null)
                                              ? CurrencyFormatter.formatRange(
                                                  lead.budgetMin,
                                                  lead.budgetMax,
                                                )
                                              : 'Flexible Allocation',
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            color: _onSurfaceVariant,
                                            fontSize: 10.5,
                                            fontFamily: 'monospace',
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: InkWell(
                                    onTap: () {
                                      Navigator.push(
                                        context,
                                        MaterialPageRoute(
                                          builder: (_) => const UnitCalculatorScreen(),
                                        ),
                                      );
                                    },
                                    borderRadius: BorderRadius.circular(12),
                                    child: Container(
                                      padding: const EdgeInsets.all(12),
                                      decoration: BoxDecoration(
                                        color: _bgLowest,
                                        borderRadius: BorderRadius.circular(12),
                                        border: Border.all(color: _outlineVariant),
                                      ),
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          const Row(
                                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                            children: [
                                              Text(
                                                'PAYMENT STRUCTURE',
                                                style: TextStyle(
                                                  color: _onSurfaceVariant,
                                                  fontSize: 9.5,
                                                  fontWeight: FontWeight.w700,
                                                ),
                                              ),
                                              Text(
                                                'السداد',
                                                style: TextStyle(
                                                  color: _onSurfaceVariant,
                                                  fontSize: 10,
                                                ),
                                              ),
                                            ],
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            lead.installmentCount > 0
                                                ? '${lead.installmentCount} Installments'
                                                : '7 Yrs Installments',
                                            style: const TextStyle(
                                              color: _onSurface,
                                              fontSize: 13.5,
                                              fontWeight: FontWeight.w800,
                                            ),
                                          ),
                                          const SizedBox(height: 4),
                                          const Row(
                                            children: [
                                              Icon(
                                                LucideIcons.calculator,
                                                size: 12,
                                                color: _neonPrimary,
                                              ),
                                              SizedBox(width: 4),
                                              Expanded(
                                                child: Text(
                                                  'Open Calculator →',
                                                  maxLines: 1,
                                                  overflow: TextOverflow.ellipsis,
                                                  style: TextStyle(
                                                    color: _neonPrimary,
                                                    fontSize: 10.5,
                                                    fontWeight: FontWeight.w700,
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),

                      // 4. 360° Activity Ledger (سجل التفاعلات والتواصل الشامل)
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: _cardLow,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: _outlineVariant),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '360° Activity Ledger',
                                      style: TextStyle(
                                        color: _onSurface,
                                        fontSize: 15.5,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                    Text(
                                      'سجل التفاعلات والتواصل الشامل',
                                      style: TextStyle(
                                        color: _onSurfaceVariant,
                                        fontSize: 11,
                                      ),
                                    ),
                                  ],
                                ),
                                Row(
                                  children: [
                                    TextButton.icon(
                                      onPressed: () {
                                        QuickNoteDialog.show(
                                          context,
                                          leadName: lead.name,
                                          onSaveNote: (note) async {
                                            await context
                                                .read<LeadsProvider>()
                                                .addNote(lead.id, note);
                                            _loadAll();
                                          },
                                        );
                                      },
                                      icon: const Icon(
                                        LucideIcons.plus,
                                        size: 13,
                                        color: _neonPrimary,
                                      ),
                                      label: const Text(
                                        'Note',
                                        style: TextStyle(
                                          color: _neonPrimary,
                                          fontSize: 11.5,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                    TextButton.icon(
                                      onPressed: _syncDeviceCalls,
                                      icon: const Icon(
                                        LucideIcons.refreshCw,
                                        size: 13,
                                        color: _neonPrimary,
                                      ),
                                      label: const Text(
                                        'Sync',
                                        style: TextStyle(
                                          color: _neonPrimary,
                                          fontSize: 11.5,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),

                            // Segmented Interactive Filter Tabs
                            SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              child: Row(
                                children: [
                                  _buildLedgerTabChip(
                                    'all',
                                    'All Activity ($totalActivityCount)',
                                  ),
                                  const SizedBox(width: 6),
                                  _buildLedgerTabChip(
                                    'calls',
                                    'Call Logs (${_calls.length})',
                                    showDot: _calls.isNotEmpty,
                                  ),
                                  const SizedBox(width: 6),
                                  _buildLedgerTabChip(
                                    'notes',
                                    'Notes (${noteLines.length})',
                                  ),
                                  const SizedBox(width: 6),
                                  _buildLedgerTabChip(
                                    'files',
                                    'Files & KYC',
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 16),

                            // Timeline Content
                            ..._buildTimelineWidgets(
                              lead: lead,
                              noteLines: noteLines,
                              currentAgentName: currentAgentName,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // 5. Sticky Bottom Outreach & Execution Bar
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: _bgLowest.withAlpha(245),
                border: const Border(
                  top: BorderSide(color: _outlineVariant),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withAlpha(180),
                    blurRadius: 20,
                    offset: const Offset(0, -6),
                  ),
                ],
              ),
              child: Row(
                children: [
                  // Direct Audio Call CTA
                  Expanded(
                    flex: 10,
                    child: InkWell(
                      onTap: _makeCall,
                      borderRadius: BorderRadius.circular(28),
                      child: Container(
                        height: 48,
                        decoration: BoxDecoration(
                          color: _cardLow,
                          borderRadius: BorderRadius.circular(28),
                          border: Border.all(color: _outlineVariant),
                        ),
                        child: const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(LucideIcons.phone, size: 18, color: _neonPrimary),
                            SizedBox(width: 8),
                            Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Call Client',
                                  style: TextStyle(
                                    color: _onSurface,
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                Text(
                                  'اتصال هاتفي مباشر',
                                  style: TextStyle(
                                    color: _onSurfaceVariant,
                                    fontSize: 9.5,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  // Primary Kinetic Action: Update Stage & Schedule Callback
                  Expanded(
                    flex: 14,
                    child: InkWell(
                      onTap: () async {
                        await LogCallDialog.show(context, lead: lead);
                        _loadAll();
                      },
                      borderRadius: BorderRadius.circular(28),
                      child: Container(
                        height: 48,
                        decoration: BoxDecoration(
                          color: _neonContainer,
                          borderRadius: BorderRadius.circular(28),
                          boxShadow: [
                            BoxShadow(
                              color: _neonContainer.withAlpha(90),
                              blurRadius: 14,
                            ),
                          ],
                        ),
                        child: const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(LucideIcons.calendarClock, size: 18, color: _bgLowest),
                            SizedBox(width: 8),
                            Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Update & Callback',
                                  style: TextStyle(
                                    color: _bgLowest,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                                Text(
                                  'تحديث المرحلة وموعد',
                                  style: TextStyle(
                                    color: _bgLowest,
                                    fontSize: 9.5,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStageStep(int idx, String label, int activeIdx) {
    final completedOrActive = idx <= activeIdx;
    final isCurrent = idx == activeIdx;
    return Expanded(
      child: Column(
        children: [
          Container(
            height: 6,
            decoration: BoxDecoration(
              color: completedOrActive ? _neonPrimary : _surfaceHighest,
              borderRadius: BorderRadius.circular(4),
              boxShadow: isCurrent
                  ? [
                      BoxShadow(
                        color: _neonContainer.withAlpha(140),
                        blurRadius: 8,
                      ),
                    ]
                  : null,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              color: isCurrent
                  ? _neonPrimary
                  : (completedOrActive ? _onSurfaceVariant : _onSurfaceVariant.withAlpha(120)),
              fontSize: 9.5,
              fontWeight: isCurrent ? FontWeight.w800 : FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRosterCol(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: _onSurfaceVariant,
            fontSize: 9.5,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.4,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: _onSurface,
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }

  Widget _buildQuickDispatchButton({
    required IconData icon,
    required String title,
    required String subtitleAr,
    required Color accentColor,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        decoration: BoxDecoration(
          color: _cardContainer,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: _outlineVariant),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: _bgLowest,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: _outlineVariant),
              ),
              child: Icon(icon, size: 17, color: accentColor),
            ),
            const SizedBox(width: 9),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: _onSurface,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    subtitleAr,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: _onSurfaceVariant,
                      fontSize: 10.5,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLedgerTabChip(String key, String label, {bool showDot = false}) {
    final selected = _activeLedgerTab == key;
    return InkWell(
      onTap: () => setState(() => _activeLedgerTab = key),
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? _neonContainer : _cardContainer,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected ? _neonContainer : _outlineVariant,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                color: selected ? _bgLowest : _onSurfaceVariant,
                fontSize: 11.5,
                fontWeight: FontWeight.w800,
              ),
            ),
            if (showDot) ...[
              const SizedBox(width: 5),
              Container(
                width: 6,
                height: 6,
                decoration: BoxDecoration(
                  color: selected ? _bgLowest : _neonPrimary,
                  shape: BoxShape.circle,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  List<Widget> _buildTimelineWidgets({
    required LeadModel lead,
    required List<String> noteLines,
    required String currentAgentName,
  }) {
    final List<Widget> items = [];

    if (_activeLedgerTab == 'files') {
      items.add(
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: _cardContainer,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: _outlineVariant),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Row(
                    children: [
                      Icon(LucideIcons.fileText, size: 16, color: _neonPrimary),
                      SizedBox(width: 8),
                      Text(
                        'Official Brochure & Payment Plan',
                        style: TextStyle(
                          color: _onSurface,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                  TextButton(
                    onPressed: () => _openWhatsApp(isBrochure: true),
                    child: const Text(
                      'Send via WA →',
                      style: TextStyle(
                        color: _whatsAppGreen,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                'Project: ${lead.project ?? "Residential Portfolio"} • Ready for WhatsApp dispatch or Unit Calculator breakdown.',
                style: const TextStyle(color: _onSurfaceVariant, fontSize: 12),
              ),
            ],
          ),
        ),
      );
      return items;
    }

    // 1) Call Logs entries
    if (_activeLedgerTab == 'all' || _activeLedgerTab == 'calls') {
      for (final call in _calls) {
        final isWhatsApp = call.channel.toLowerCase().contains('whatsapp');
        final isIncoming = call.direction == 'incoming';
        final markerColor = isWhatsApp ? _whatsAppGreen : _neonPrimary;
        final tsLabel = call.createdAt != null
            ? '${AppDateUtils.formatDate(call.createdAt)} • ${AppDateUtils.formatTime(call.createdAt)}'
            : 'Recent';

        items.add(
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 24,
                  height: 24,
                  margin: const EdgeInsets.only(top: 2),
                  decoration: BoxDecoration(
                    color: _bgLowest,
                    shape: BoxShape.circle,
                    border: Border.all(color: markerColor, width: 2),
                  ),
                  child: Icon(
                    isWhatsApp
                        ? LucideIcons.messageCircle
                        : (isIncoming ? LucideIcons.phoneIncoming : LucideIcons.phoneOutgoing),
                    size: 11,
                    color: markerColor,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: _cardContainer,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: _outlineVariant),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Flexible(
                              child: Row(
                                children: [
                                  Flexible(
                                    child: Text(
                                      isWhatsApp
                                          ? 'WhatsApp Media Dispatched'
                                          : (isIncoming ? 'Incoming Call' : 'Outgoing Dial'),
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        color: markerColor,
                                        fontSize: 12.5,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 6,
                                      vertical: 2,
                                    ),
                                    decoration: BoxDecoration(
                                      color: markerColor.withAlpha(25),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      '${call.outcome} • ${AppDateUtils.formatDuration(call.durationSeconds)}',
                                      style: TextStyle(
                                        color: markerColor,
                                        fontSize: 10,
                                        fontFamily: 'monospace',
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Text(
                              tsLabel,
                              style: const TextStyle(
                                color: _onSurfaceVariant,
                                fontSize: 10,
                                fontFamily: 'monospace',
                              ),
                            ),
                          ],
                        ),
                        if (call.notes != null && call.notes!.trim().isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Text(
                            call.notes!,
                            style: const TextStyle(
                              color: _onSurface,
                              fontSize: 12.5,
                              height: 1.35,
                            ),
                          ),
                        ],
                        const SizedBox(height: 8),
                        // Call Metadata Bar
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: _bgLowest,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: _outlineVariant),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Row(
                                children: [
                                  Icon(
                                    LucideIcons.checkCircle2,
                                    size: 13,
                                    color: markerColor,
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    'Status: ${call.outcome} (${call.direction.toUpperCase()})',
                                    style: const TextStyle(
                                      color: _onSurfaceVariant,
                                      fontSize: 10.5,
                                      fontFamily: 'monospace',
                                    ),
                                  ),
                                ],
                              ),
                              Text(
                                'Dur: ${AppDateUtils.formatDuration(call.durationSeconds)}',
                                style: TextStyle(
                                  color: markerColor,
                                  fontSize: 10.5,
                                  fontFamily: 'monospace',
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
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

    // 2) Notes & Comments entries
    if (_activeLedgerTab == 'all' || _activeLedgerTab == 'notes') {
      for (final line in noteLines) {
        items.add(
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 24,
                  height: 24,
                  margin: const EdgeInsets.only(top: 2),
                  decoration: BoxDecoration(
                    color: _bgLowest,
                    shape: BoxShape.circle,
                    border: Border.all(color: _neonPrimary, width: 2),
                  ),
                  child: const Icon(
                    LucideIcons.fileText,
                    size: 11,
                    color: _neonPrimary,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: _cardContainer,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: _outlineVariant),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Agent Note & Activity',
                              style: TextStyle(
                                color: _neonPrimary,
                                fontSize: 12,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            Text(
                              'Logged',
                              style: TextStyle(
                                color: _onSurfaceVariant,
                                fontSize: 10,
                                fontFamily: 'monospace',
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 5),
                        Text(
                          line,
                          style: const TextStyle(
                            color: _onSurface,
                            fontSize: 12.5,
                            height: 1.4,
                          ),
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

    // 3) Stage Status Event
    if (_activeLedgerTab == 'all') {
      items.add(
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 24,
              height: 24,
              margin: const EdgeInsets.only(top: 2),
              decoration: BoxDecoration(
                color: _bgLowest,
                shape: BoxShape.circle,
                border: Border.all(color: _neonPrimary, width: 2),
              ),
              child: const Icon(
                LucideIcons.gitCommitHorizontal,
                size: 11,
                color: _neonPrimary,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _cardContainer,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: _outlineVariant),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Stage Status Active',
                          style: TextStyle(
                            color: _onSurface,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        Text(
                          AppDateUtils.formatDate(lead.lastActionAt ?? lead.createdAt),
                          style: const TextStyle(
                            color: _onSurfaceVariant,
                            fontSize: 10,
                            fontFamily: 'monospace',
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Current pipeline stage: ${lead.status} (${_stageSubtitleAr(lead.status)}) • Assigned to $currentAgentName.',
                      style: const TextStyle(
                        color: _onSurfaceVariant,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    }

    if (items.isEmpty) {
      items.add(
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 20),
          child: Center(
            child: Text(
              'No entries in this filter yet',
              style: TextStyle(color: _onSurfaceVariant, fontSize: 12.5),
            ),
          ),
        ),
      );
    }

    return items;
  }

  void _confirmDelete() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: _cardLow,
        title: const Text('Delete Lead', style: TextStyle(color: _onSurface)),
        content: Text(
          'Are you sure you want to delete ${_lead?.name}?',
          style: const TextStyle(color: _onSurfaceVariant),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel', style: TextStyle(color: _onSurfaceVariant)),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await context.read<LeadsProvider>().deleteLead(widget.leadId);
              if (mounted) Navigator.pop(context);
            },
            child: const Text('Delete', style: TextStyle(color: Color(0xFFEF4444))),
          ),
        ],
      ),
    );
  }
}
