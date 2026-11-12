// ignore_for_file: prefer_const_constructors, prefer_const_literals_to_create_immutables, prefer_const_declarations
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/utils/currency_formatter.dart';
import '../../core/utils/date_utils.dart';
import '../../core/utils/note_formatter.dart';
import '../../core/utils/stage_note_guard.dart';
import '../../core/utils/whatsapp_utils.dart';
import '../../core/widgets/premium.dart';
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

  // Theme-aware palette (dark keeps the original Stitch look; light follows AppColors surfaces).
  bool _dark = true;
  Color get _bgLowest => _dark ? Color(0xFF0B0E14) : Color(0xFFF8FAFC);
  Color get _cardLow => _dark ? Color(0xFF161920) : Colors.white;
  Color get _cardContainer => _dark ? Color(0xFF1D2026) : Color(0xFFF1F5F9);
  Color get _surfaceHigh => _dark ? Color(0xFF272A31) : Color(0xFFE2E8F0);
  Color get _surfaceHighest => _dark ? Color(0xFF32353C) : Color(0xFFCBD5E1);
  Color get _neonPrimary => _dark ? Color(0xFFCCFF80) : Color(0xFF4D7C0F);
  Color get _outlineVariant => _dark ? Color(0xFF282D38) : Color(0xFFE2E8F0);
  Color get _onSurface => _dark ? Color(0xFFE1E2EB) : Color(0xFF0F172A);
  Color get _onSurfaceVariant => _dark ? Color(0xFFA8B0BF) : Color(0xFF64748B);
  static const Color _neonContainer = Color(0xFFA3E635);
  static const Color _onNeon = Color(0xFF142407);
  static const Color _whatsAppGreen = Color(0xFF25D366);

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
    final initial = _lead!.followUpDateTime ?? now.add(Duration(days: 1));
    final pickedDate = await showDatePicker(
      context: context,
      initialDate: initial.isBefore(now) ? now.add(Duration(days: 1)) : initial,
      firstDate: now,
      lastDate: now.add(Duration(days: 365)),
    );
    if (pickedDate == null || !mounted) return;

    final pickedTime = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: 11, minute: 0),
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
          backgroundColor: Color(0xFF65A30D),
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
          backgroundColor: Color(0xFF65A30D),
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
    _dark = Theme.of(context).brightness == Brightness.dark;

    // Skeleton only on the very first load; refreshes keep the content (and scroll position).
    if (_isLoading && _lead == null) {
      return Scaffold(
        backgroundColor: _bgLowest,
        appBar: AppBar(
          backgroundColor: _bgLowest,
          elevation: 0,
          iconTheme: IconThemeData(color: _onSurface),
          title: Text('Lead Profile', style: TextStyle(color: _onSurface, fontSize: 16, fontWeight: FontWeight.w800)),
        ),
        body: SkeletonList(count: 4, height: 150),
      );
    }

    if (_lead == null) {
      return Scaffold(
        backgroundColor: _bgLowest,
        appBar: AppBar(
          backgroundColor: _bgLowest,
          elevation: 0,
          iconTheme: IconThemeData(color: _onSurface),
          title: Text('Lead Profile', style: TextStyle(color: _onSurface, fontSize: 16, fontWeight: FontWeight.w800)),
        ),
        body: EmptyState(
          icon: LucideIcons.userX,
          title: 'Lead not found',
          message: 'It may have been deleted or you may not have access. Check your connection and try again.',
          actionLabel: 'Retry',
          onAction: _loadAll,
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
        lead.assignedToName ?? lead.agent ?? auth.profile?.fullName ?? 'Unassigned';

    return Scaffold(
      backgroundColor: _bgLowest,
      body: SafeArea(
        child: Column(
          children: [
            // Top Bar / Navigation Context
            Container(
              padding: EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: _bgLowest.withAlpha(242),
                border: Border(
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
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: _cardLow,
                            shape: BoxShape.circle,
                            border: Border.all(color: _outlineVariant),
                          ),
                          child: Icon(
                            LucideIcons.arrowLeft,
                            size: 18,
                            color: _onSurface,
                          ),
                        ),
                      ),
                      SizedBox(width: 10),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                '#LEAD-$shortId',
                                style: TextStyle(
                                  color: _neonPrimary,
                                  fontSize: 11.5,
                                  fontFamily: 'monospace',
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.6,
                                ),
                              ),
                              SizedBox(width: 6),
                              Container(
                                width: 6,
                                height: 6,
                                decoration: BoxDecoration(
                                  color: _neonPrimary,
                                  shape: BoxShape.circle,
                                ),
                              ),
                            ],
                          ),
                          Text(
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
                        padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: _cardContainer,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: _outlineVariant),
                        ),
                        child: Row(
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
                      SizedBox(width: 6),
                      InkWell(
                        onTap: () {
                          Clipboard.setData(
                            ClipboardData(text: '${lead.name} - ${lead.phone}'),
                          );
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
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
                          child: Icon(
                            LucideIcons.share2,
                            size: 16,
                            color: _onSurfaceVariant,
                          ),
                        ),
                      ),
                      SizedBox(width: 6),
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
                          child: Icon(
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
                                builder: (_) => UnitCalculatorScreen(),
                              ),
                            );
                          } else if (value == 'delete') {
                            _confirmDelete();
                          }
                        },
                        itemBuilder: (_) => [
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
                  physics: AlwaysScrollableScrollPhysics(),
                  padding: EdgeInsets.fromLTRB(14, 14, 14, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // 1. Lead Identity & Executive Summary Card
                      Container(
                        padding: EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: _cardLow,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: _outlineVariant),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withAlpha(110),
                              blurRadius: 18,
                              offset: Offset(0, 6),
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
                                                style: TextStyle(
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
                                      SizedBox(width: 12),
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
                                                  style: TextStyle(
                                                    color: _onSurface,
                                                    fontSize: 16.5,
                                                    fontWeight: FontWeight.w800,
                                                  ),
                                                ),
                                                Container(
                                                  padding: EdgeInsets.symmetric(
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
                                                    style: TextStyle(
                                                      color: _neonPrimary,
                                                      fontSize: 9.5,
                                                      fontWeight: FontWeight.w800,
                                                      letterSpacing: 0.4,
                                                    ),
                                                  ),
                                                ),
                                                StatusPill(lead.status),
                                              ],
                                            ),
                                            SizedBox(height: 4),
                                            Row(
                                              children: [
                                                Icon(
                                                  LucideIcons.mapPin,
                                                  size: 12,
                                                  color: _neonPrimary,
                                                ),
                                                SizedBox(width: 4),
                                                Expanded(
                                                  child: Text(
                                                    lead.location?.isNotEmpty == true
                                                        ? lead.location!
                                                        : (lead.project?.isNotEmpty == true
                                                            ? lead.project!
                                                            : 'Location not set'),
                                                    maxLines: 1,
                                                    overflow: TextOverflow.ellipsis,
                                                    style: TextStyle(
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
                                      style: TextStyle(
                                        color: _neonPrimary,
                                        fontSize: 12.5,
                                        fontFamily: 'monospace',
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                    Text(
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
                            SizedBox(height: 14),

                            // Contact Ribbon & Direct CTA
                            Container(
                              padding: EdgeInsets.symmetric(
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
                                          child: Icon(
                                            LucideIcons.phone,
                                            size: 16,
                                            color: _neonPrimary,
                                          ),
                                        ),
                                        SizedBox(width: 10),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                lead.phone,
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: TextStyle(
                                                  color: _onSurface,
                                                  fontSize: 13.5,
                                                  fontFamily: 'monospace',
                                                  fontWeight: FontWeight.w700,
                                                ),
                                              ),
                                              Text(
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
                                          width: 44,
                                          height: 44,
                                          decoration: BoxDecoration(
                                            color: _whatsAppGreen.withAlpha(38),
                                            shape: BoxShape.circle,
                                            border: Border.all(
                                              color: _whatsAppGreen.withAlpha(110),
                                            ),
                                          ),
                                          child: Icon(
                                            LucideIcons.messageCircle,
                                            size: 18,
                                            color: _whatsAppGreen,
                                          ),
                                        ),
                                      ),
                                      SizedBox(width: 8),
                                      // Direct Dial Action
                                      InkWell(
                                        onTap: _makeCall,
                                        borderRadius: BorderRadius.circular(20),
                                        child: Container(
                                          width: 44,
                                          height: 44,
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
                                          child: Icon(
                                            LucideIcons.phoneCall,
                                            size: 18,
                                            color: _onNeon,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            SizedBox(height: 14),

                            // Sales Stage Stepper Visualizer (مرحلة البيع)
                            Container(
                              padding: EdgeInsets.only(top: 12),
                              decoration: BoxDecoration(
                                border: Border(
                                  top: BorderSide(color: _outlineVariant, width: 0.8),
                                ),
                              ),
                              child: Column(
                                children: [
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Row(
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
                                        },
                                        borderRadius: BorderRadius.circular(14),
                                        child: Container(
                                          padding: EdgeInsets.symmetric(
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
                                                style: TextStyle(
                                                  color: _neonPrimary,
                                                  fontSize: 10.5,
                                                  fontWeight: FontWeight.w800,
                                                ),
                                              ),
                                              SizedBox(width: 4),
                                              Icon(
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
                                  SizedBox(height: 10),
                                  Row(
                                    children: [
                                      _buildStageStep(0, 'Fresh', stepIdx),
                                      SizedBox(width: 6),
                                      _buildStageStep(1, 'Contacted', stepIdx),
                                      SizedBox(width: 6),
                                      _buildStageStep(2, 'Meeting', stepIdx),
                                      SizedBox(width: 6),
                                      _buildStageStep(3, 'Negotiate', stepIdx),
                                      SizedBox(width: 6),
                                      _buildStageStep(4, 'Won', stepIdx),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            SizedBox(height: 14),

                            // Metadata Roster (Director / Source / Added Date)
                            Container(
                              padding: EdgeInsets.only(top: 12),
                              decoration: BoxDecoration(
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
                                          : 'Not specified',
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
                            SizedBox(height: 12),
                            // Next follow-up (turns red when overdue)
                            InkWell(
                              onTap: _scheduleFollowUp,
                              borderRadius: BorderRadius.circular(12),
                              child: Container(
                                constraints: BoxConstraints(minHeight: 48),
                                padding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                decoration: BoxDecoration(
                                  color: AppDateUtils.isOverdue(lead.followUpDue)
                                      ? Color(0xFFEF4444).withAlpha(25)
                                      : _cardContainer,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(
                                    color: AppDateUtils.isOverdue(lead.followUpDue)
                                        ? Color(0xFFEF4444).withAlpha(90)
                                        : _outlineVariant,
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    Icon(
                                      LucideIcons.calendarClock,
                                      size: 16,
                                      color: AppDateUtils.isOverdue(lead.followUpDue)
                                          ? Color(0xFFEF4444)
                                          : _neonPrimary,
                                    ),
                                    SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        lead.followUpDue != null
                                            ? 'Next follow-up: ${AppDateUtils.formatFollowUpShort(lead.followUpDue)}'
                                            : 'No follow-up scheduled',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          color: AppDateUtils.isOverdue(lead.followUpDue)
                                              ? Color(0xFFEF4444)
                                              : _onSurface,
                                          fontSize: 12.5,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                    Text(
                                      lead.followUpDue != null ? 'Reschedule' : 'Schedule',
                                      style: TextStyle(
                                        color: _neonPrimary,
                                        fontSize: 11.5,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(height: 16),

                      // 2. Quick Dispatch Actions (4-Button Grid)
                      Row(
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
                      SizedBox(height: 8),
                      GridView.count(
                        crossAxisCount: 2,
                        shrinkWrap: true,
                        physics: NeverScrollableScrollPhysics(),
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
                      SizedBox(height: 16),

                      // 3. Target Property & Budget Matrix
                      Container(
                        padding: EdgeInsets.all(16),
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
                            SizedBox(height: 10),
                            Divider(color: _outlineVariant, height: 1),
                            SizedBox(height: 12),

                            // Property Card Banner
                            Container(
                              padding: EdgeInsets.all(10),
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
                                      gradient: LinearGradient(
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
                                        Icon(
                                          LucideIcons.building,
                                          size: 28,
                                          color: _neonPrimary,
                                        ),
                                        Positioned(
                                          bottom: 4,
                                          left: 4,
                                          right: 4,
                                          child: Container(
                                            padding: EdgeInsets.symmetric(
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
                                                  : 'Developer',
                                              textAlign: TextAlign.center,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: TextStyle(
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
                                  SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                          children: [
                                            Text(
                                              'PRIME INTEREST',
                                              style: TextStyle(
                                                color: _neonPrimary,
                                                fontSize: 9.5,
                                                fontWeight: FontWeight.w800,
                                                letterSpacing: 0.5,
                                              ),
                                            ),
                                            Container(
                                              padding: EdgeInsets.symmetric(
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
                                                    : 'Type not set',
                                                style: TextStyle(
                                                  color: _onSurfaceVariant,
                                                  fontSize: 9.5,
                                                  fontFamily: 'monospace',
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                        SizedBox(height: 4),
                                        Text(
                                          lead.project?.isNotEmpty == true
                                              ? lead.project!
                                              : 'No project selected',
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
                                            color: _onSurface,
                                            fontSize: 13.5,
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                        Text(
                                          'Developer: ${lead.developer?.isNotEmpty == true ? lead.developer! : "Not specified"}',
                                          style: TextStyle(
                                            color: _onSurfaceVariant,
                                            fontSize: 11,
                                          ),
                                        ),
                                        SizedBox(height: 4),
                                        Row(
                                          children: [
                                            Icon(
                                              LucideIcons.bedDouble,
                                              size: 12,
                                              color: _neonPrimary,
                                            ),
                                            SizedBox(width: 4),
                                            Text(
                                              lead.unit?.isNotEmpty == true
                                                  ? lead.unit!
                                                  : '—',
                                              style: TextStyle(
                                                color: _onSurfaceVariant,
                                                fontSize: 11,
                                              ),
                                            ),
                                            SizedBox(width: 10),
                                            Icon(
                                              LucideIcons.maximize2,
                                              size: 11,
                                              color: _neonPrimary,
                                            ),
                                            SizedBox(width: 4),
                                            Text(
                                              lead.unitArea > 0
                                                  ? '${lead.unitArea.toInt()} m²'
                                                  : '—',
                                              style: TextStyle(
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
                            SizedBox(height: 10),

                            // Financial Matrix KPI Grid
                            Row(
                              children: [
                                Expanded(
                                  child: Container(
                                    padding: EdgeInsets.all(12),
                                    decoration: BoxDecoration(
                                      color: _bgLowest,
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(color: _outlineVariant),
                                    ),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
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
                                        SizedBox(height: 4),
                                        Text(
                                          (lead.budgetMax != null || lead.budgetMin != null)
                                              ? CurrencyFormatter.formatCompact(
                                                  lead.budgetMax ?? lead.budgetMin,
                                                )
                                              : 'Not set',
                                          style: TextStyle(
                                            color: _neonPrimary,
                                            fontSize: 17,
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                        SizedBox(height: 2),
                                        Text(
                                          (lead.budgetMin != null || lead.budgetMax != null)
                                              ? CurrencyFormatter.formatRange(
                                                  lead.budgetMin,
                                                  lead.budgetMax,
                                                )
                                              : 'Budget range not set',
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
                                            color: _onSurfaceVariant,
                                            fontSize: 10.5,
                                            fontFamily: 'monospace',
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                                SizedBox(width: 8),
                                Expanded(
                                  child: InkWell(
                                    onTap: () {
                                      Navigator.push(
                                        context,
                                        MaterialPageRoute(
                                          builder: (_) => UnitCalculatorScreen(),
                                        ),
                                      );
                                    },
                                    borderRadius: BorderRadius.circular(12),
                                    child: Container(
                                      padding: EdgeInsets.all(12),
                                      decoration: BoxDecoration(
                                        color: _bgLowest,
                                        borderRadius: BorderRadius.circular(12),
                                        border: Border.all(color: _outlineVariant),
                                      ),
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Row(
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
                                          SizedBox(height: 4),
                                          Text(
                                            lead.installmentCount > 0
                                                ? '${lead.installmentCount} Installments'
                                                : 'Plan not set',
                                            style: TextStyle(
                                              color: _onSurface,
                                              fontSize: 13.5,
                                              fontWeight: FontWeight.w800,
                                            ),
                                          ),
                                          SizedBox(height: 4),
                                          Row(
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
                      SizedBox(height: 16),

                      // 4. 360° Activity Ledger (سجل التفاعلات والتواصل الشامل)
                      Container(
                        padding: EdgeInsets.all(16),
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
                                Column(
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
                                      icon: Icon(
                                        LucideIcons.plus,
                                        size: 13,
                                        color: _neonPrimary,
                                      ),
                                      label: Text(
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
                                      icon: Icon(
                                        LucideIcons.refreshCw,
                                        size: 13,
                                        color: _neonPrimary,
                                      ),
                                      label: Text(
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
                            SizedBox(height: 12),

                            // Segmented Interactive Filter Tabs
                            SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              child: Row(
                                children: [
                                  _buildLedgerTabChip(
                                    'all',
                                    'All Activity ($totalActivityCount)',
                                  ),
                                  SizedBox(width: 6),
                                  _buildLedgerTabChip(
                                    'calls',
                                    'Call Logs (${_calls.length})',
                                    showDot: _calls.isNotEmpty,
                                  ),
                                  SizedBox(width: 6),
                                  _buildLedgerTabChip(
                                    'notes',
                                    'Notes (${noteLines.length})',
                                  ),
                                  SizedBox(width: 6),
                                  _buildLedgerTabChip(
                                    'files',
                                    'Files & KYC',
                                  ),
                                ],
                              ),
                            ),
                            SizedBox(height: 16),

                            // Timeline Content
                            Stack(
                              children: [
                                if (_activeLedgerTab != 'files')
                                  Positioned(
                                    left: 11,
                                    top: 14,
                                    bottom: 14,
                                    width: 2,
                                    child: DecoratedBox(
                                      decoration: BoxDecoration(
                                        color: _outlineVariant,
                                        borderRadius: BorderRadius.circular(2),
                                      ),
                                    ),
                                  ),
                                AnimatedSwitcher(
                                  duration: Duration(milliseconds: 200),
                                  child: Column(
                                    key: ValueKey(_activeLedgerTab),
                                    crossAxisAlignment: CrossAxisAlignment.stretch,
                                    children: _buildTimelineWidgets(
                                      lead: lead,
                                      noteLines: noteLines,
                                      currentAgentName: currentAgentName,
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
              ),
            ),

            // 5. Sticky Bottom Outreach & Execution Bar
            Container(
              padding: EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: _bgLowest.withAlpha(245),
                border: Border(
                  top: BorderSide(color: _outlineVariant),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withAlpha(180),
                    blurRadius: 20,
                    offset: Offset(0, -6),
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
                        child: Row(
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
                  SizedBox(width: 10),
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
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(LucideIcons.calendarClock, size: 18, color: _onNeon),
                            SizedBox(width: 8),
                            Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Update & Callback',
                                  style: TextStyle(
                                    color: _onNeon,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                                Text(
                                  'تحديث المرحلة وموعد',
                                  style: TextStyle(
                                    color: _onNeon,
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
          SizedBox(height: 4),
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
          style: TextStyle(
            color: _onSurfaceVariant,
            fontSize: 9.5,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.4,
          ),
        ),
        SizedBox(height: 2),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
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
        padding: EdgeInsets.symmetric(horizontal: 10, vertical: 10),
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
            SizedBox(width: 9),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: _onSurface,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    subtitleAr,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
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
        padding: EdgeInsets.symmetric(horizontal: 12, vertical: 7),
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
                color: selected ? _onNeon : _onSurfaceVariant,
                fontSize: 11.5,
                fontWeight: FontWeight.w800,
              ),
            ),
            if (showDot) ...[
              SizedBox(width: 5),
              Container(
                width: 6,
                height: 6,
                decoration: BoxDecoration(
                  color: selected ? _onNeon : _neonPrimary,
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
          padding: EdgeInsets.all(14),
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
                  Row(
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
                    child: Text(
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
              SizedBox(height: 6),
              Text(
                'Project: ${lead.project ?? "not set"} • Ready for WhatsApp dispatch or Unit Calculator breakdown.',
                style: TextStyle(color: _onSurfaceVariant, fontSize: 12),
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
            padding: EdgeInsets.only(bottom: 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 24,
                  height: 24,
                  margin: EdgeInsets.only(top: 2),
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
                SizedBox(width: 10),
                Expanded(
                  child: Container(
                    padding: EdgeInsets.all(12),
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
                                  SizedBox(width: 6),
                                  Container(
                                    padding: EdgeInsets.symmetric(
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
                                  // Added automatically from the phone's call log.
                                  if (call.isDeviceSync) ...[
                                    const SizedBox(width: 6),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF3B82F6).withAlpha(25),
                                        borderRadius: BorderRadius.circular(4),
                                        border: Border.all(color: const Color(0xFF3B82F6).withAlpha(80)),
                                      ),
                                      child: const Text(
                                        'AUTO',
                                        style: TextStyle(
                                          color: Color(0xFF3B82F6),
                                          fontSize: 9,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                            Text(
                              tsLabel,
                              style: TextStyle(
                                color: _onSurfaceVariant,
                                fontSize: 10,
                                fontFamily: 'monospace',
                              ),
                            ),
                          ],
                        ),
                        if (call.notes != null && call.notes!.trim().isNotEmpty) ...[
                          SizedBox(height: 6),
                          Text(
                            call.notes!,
                            style: TextStyle(
                              color: _onSurface,
                              fontSize: 12.5,
                              height: 1.35,
                            ),
                          ),
                        ],
                        SizedBox(height: 8),
                        // Call Metadata Bar
                        Container(
                          padding: EdgeInsets.symmetric(horizontal: 10, vertical: 6),
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
                                  SizedBox(width: 6),
                                  Text(
                                    'Status: ${call.outcome} (${call.direction.toUpperCase()})',
                                    style: TextStyle(
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
                        // Let the agent add the outcome / a note to an auto-synced call afterwards. The dialog
                        // updates this same row (matched by its client_ref), so nothing is duplicated.
                        if (call.isDeviceSync && _lead != null)
                          Align(
                            alignment: AlignmentDirectional.centerEnd,
                            child: TextButton.icon(
                              style: TextButton.styleFrom(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 0),
                                minimumSize: const Size(0, 32),
                                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              ),
                              onPressed: () async {
                                await LogCallDialog.show(
                                  context,
                                  lead: _lead!,
                                  initialDurationSeconds: call.durationSeconds,
                                  capturedMetadata: DeviceCallMetadata(
                                    durationSeconds: call.durationSeconds,
                                    timestamp: DateTime.tryParse(call.createdAt ?? '')?.toLocal() ?? DateTime.now(),
                                    detectedOutcome: call.outcome,
                                    direction: call.direction,
                                    callTypeLabel: call.direction,
                                    clientRef: call.clientRef ?? '',
                                    syncedCallLogId: call.id,
                                  ),
                                );
                                if (mounted) _loadAll();
                              },
                              icon: const Icon(LucideIcons.pencil, size: 12),
                              label: const Text('Add outcome / note', style: TextStyle(fontSize: 11)),
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
            padding: EdgeInsets.only(bottom: 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 24,
                  height: 24,
                  margin: EdgeInsets.only(top: 2),
                  decoration: BoxDecoration(
                    color: _bgLowest,
                    shape: BoxShape.circle,
                    border: Border.all(color: _neonPrimary, width: 2),
                  ),
                  child: Icon(
                    LucideIcons.fileText,
                    size: 11,
                    color: _neonPrimary,
                  ),
                ),
                SizedBox(width: 10),
                Expanded(
                  child: Container(
                    padding: EdgeInsets.all(12),
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
                        SizedBox(height: 5),
                        Text(
                          NoteFormatter.pretty(line),
                          style: TextStyle(
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
              margin: EdgeInsets.only(top: 2),
              decoration: BoxDecoration(
                color: _bgLowest,
                shape: BoxShape.circle,
                border: Border.all(color: _neonPrimary, width: 2),
              ),
              child: Icon(
                LucideIcons.gitCommitHorizontal,
                size: 11,
                color: _neonPrimary,
              ),
            ),
            SizedBox(width: 10),
            Expanded(
              child: Container(
                padding: EdgeInsets.all(12),
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
                        Text(
                          'Stage Status Active',
                          style: TextStyle(
                            color: _onSurface,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        Text(
                          AppDateUtils.formatDate(lead.lastActionAt ?? lead.createdAt),
                          style: TextStyle(
                            color: _onSurfaceVariant,
                            fontSize: 10,
                            fontFamily: 'monospace',
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: 4),
                    Text(
                      'Current pipeline stage: ${lead.status} (${_stageSubtitleAr(lead.status)}) • Assigned to $currentAgentName.',
                      style: TextStyle(
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
        Padding(
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
        title: Text('Delete Lead', style: TextStyle(color: _onSurface)),
        content: Text(
          'Are you sure you want to delete ${_lead?.name}?',
          style: TextStyle(color: _onSurfaceVariant),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('Cancel', style: TextStyle(color: _onSurfaceVariant)),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await context.read<LeadsProvider>().deleteLead(widget.leadId);
              if (mounted) Navigator.pop(context);
            },
            child: Text('Delete', style: TextStyle(color: Color(0xFFEF4444))),
          ),
        ],
      ),
    );
  }
}
