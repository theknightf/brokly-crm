import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/whatsapp_utils.dart';
import '../../data/models/lead_model.dart';
import '../../data/services/call_logs_service.dart';
import 'agent_controller.dart';

/// Minimum touch target for the agent app.
const double kTap = 52;

// ── Dialing ──────────────────────────────────────────────────────────────────────────────────────

/// Starts a phone call and reports back when the agent returns to the app (call ended), with the device call-log
/// metadata when available (real duration / answered or not). Mirrors the existing post-call lifecycle approach.
class AgentDialer with WidgetsBindingObserver {
  AgentDialer._(this.lead, this.onEnded);
  final LeadModel lead;
  final void Function(DeviceCallMetadata? meta, int elapsedSeconds) onEnded;
  final DateTime _startedAt = DateTime.now();
  bool _wentBackground = false;
  bool _done = false;
  Timer? _fallback;

  static Future<void> call(
    BuildContext context,
    LeadModel lead, {
    required void Function(DeviceCallMetadata? meta, int elapsedSeconds) onEnded,
  }) async {
    final phone = lead.phone.replaceAll(RegExp(r'\s+'), '');
    if (phone.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('مفيش رقم للعميل ده')));
      return;
    }
    HapticFeedback.mediumImpact();
    final d = AgentDialer._(lead, onEnded);
    WidgetsBinding.instance.addObserver(d);
    // Emulators / web never leave the app: open the outcome sheet anyway after a moment.
    d._fallback = Timer(const Duration(milliseconds: kIsWeb ? 900 : 4000), () {
      if (!d._wentBackground) d._finish();
    });
    try {
      await launchUrl(Uri.parse('tel:$phone'));
    } catch (_) {}
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive || state == AppLifecycleState.hidden) {
      _wentBackground = true;
      _fallback?.cancel();
    } else if (state == AppLifecycleState.resumed && _wentBackground) {
      _finish();
    }
  }

  Future<void> _finish() async {
    if (_done) return;
    _done = true;
    _fallback?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    final elapsed = DateTime.now().difference(_startedAt).inSeconds;
    DeviceCallMetadata? meta;
    if (!kIsWeb) {
      // Give Android a moment to write the call log entry.
      await Future<void>.delayed(const Duration(milliseconds: 600));
      try {
        meta = await CallLogsService().captureAndSyncCallForLead(
          leadId: lead.id,
          leadName: lead.name,
          leadPhone: lead.phone,
          callStartedAt: _startedAt,
          projectName: lead.project,
        );
      } catch (_) {}
    }
    onEnded(meta, elapsed);
  }
}

Future<void> openWhatsApp(BuildContext context, LeadModel lead) async {
  HapticFeedback.selectionClick();
  await WhatsAppUtils.openWhatsAppChat(context, phone: lead.phone);
}

// ── Call target header ───────────────────────────────────────────────────────────────────────────

class CallTargetHeader extends StatelessWidget {
  const CallTargetHeader({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.watch<AgentController>();
    final done = c.targetReached;
    final color = done ? const Color(0xFF16A34A) : AppColors.neonLimeDark;
    final pct = (c.progress * 100).round();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
      color: done ? const Color(0xFF16A34A).withAlpha(30) : (isDark ? const Color(0xFF141820) : Colors.white),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(done ? LucideIcons.trophy : LucideIcons.phoneCall, size: 18, color: color),
              const SizedBox(width: 8),
              Expanded(
                child: Text.rich(
                  TextSpan(children: [
                    TextSpan(
                      text: '${c.callsToday} / ${c.target}',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                    ),
                    const TextSpan(text: '  مكالمة النهارده', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  ]),
                ),
              ),
              Text(
                done ? 'وصلت للتارجت 🎉' : '$pct% · فاضل ${c.remaining}',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: done ? color : null),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: c.progress),
              duration: const Duration(milliseconds: 450),
              builder: (_, v, __) => LinearProgressIndicator(
                value: v,
                minHeight: 10,
                color: color,
                backgroundColor: color.withAlpha(40),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Haptic + small celebration the first time the target is reached in a session.
class TargetCelebration extends StatefulWidget {
  const TargetCelebration({super.key, required this.child});
  final Widget child;

  @override
  State<TargetCelebration> createState() => _TargetCelebrationState();
}

class _TargetCelebrationState extends State<TargetCelebration> {
  ValueNotifier<int>? _hit;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final hit = context.read<AgentController>().targetHit;
    if (!identical(hit, _hit)) {
      _hit?.removeListener(_celebrate);
      _hit = hit..addListener(_celebrate);
    }
  }

  @override
  void dispose() {
    _hit?.removeListener(_celebrate);
    super.dispose();
  }

  void _celebrate() {
    if (!mounted) return;
    HapticFeedback.heavyImpact();
    showDialog<void>(
      context: context,
      builder: (ctx) {
        Future.delayed(const Duration(milliseconds: 1800), () {
          if (ctx.mounted) Navigator.of(ctx).maybePop();
        });
        return Dialog(
          backgroundColor: Colors.transparent,
          elevation: 0,
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: 0.6, end: 1),
            duration: const Duration(milliseconds: 500),
            curve: Curves.elasticOut,
            builder: (_, s, child) => Transform.scale(scale: s, child: child),
            child: Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(color: const Color(0xFF16A34A), borderRadius: BorderRadius.circular(24)),
              child: const Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('🎉', style: TextStyle(fontSize: 48)),
                  SizedBox(height: 8),
                  Text('برافو! وصلت للتارجت', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

// ── Stage cards ──────────────────────────────────────────────────────────────────────────────────

class StageCardsRow extends StatelessWidget {
  const StageCardsRow({super.key, required this.onCallStage});
  final void Function(String stage) onCallStage;

  @override
  Widget build(BuildContext context) {
    final c = context.watch<AgentController>();
    final cards = <Widget>[
      _StageCard(
        label: 'الكل',
        count: c.totalLeads,
        badge: c.totalNeedsAction,
        color: AppColors.neonLimeDark,
        selected: c.selectedStage == null,
        onTap: () => c.setStage(null),
      ),
      for (final s in c.stages)
        _StageCard(
          label: s.labelAr.isNotEmpty ? s.labelAr : s.labelEn,
          count: s.total,
          badge: s.needsAction,
          color: s.color,
          selected: c.selectedStage == s.key,
          onTap: () => c.setStage(s.key),
          onCall: s.total > 0 ? () => onCallStage(s.key) : null,
        ),
    ];
    return SizedBox(
      height: 92,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        itemCount: cards.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) => cards[i],
      ),
    );
  }
}

class _StageCard extends StatelessWidget {
  const _StageCard({
    required this.label,
    required this.count,
    required this.badge,
    required this.color,
    required this.selected,
    required this.onTap,
    this.onCall,
  });
  final String label;
  final int count;
  final int badge;
  final Color color;
  final bool selected;
  final VoidCallback onTap;
  final VoidCallback? onCall;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Material(
      color: selected ? color.withAlpha(45) : (isDark ? const Color(0xFF1C212B) : Colors.white),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: selected ? color : color.withAlpha(70), width: selected ? 2 : 1),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        onLongPress: onCall == null
            ? null
            : () {
                HapticFeedback.mediumImpact();
                onCall!();
              },
        child: Container(
          width: 120,
          padding: const EdgeInsets.fromLTRB(10, 8, 6, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
              Row(
                children: [
                  Text('$count', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                  const SizedBox(width: 6),
                  if (badge > 0)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(color: const Color(0xFFEF4444), borderRadius: BorderRadius.circular(10)),
                      child: Text('$badge', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
                    ),
                  const Spacer(),
                  if (onCall != null)
                    InkResponse(
                      onTap: onCall,
                      radius: 20,
                      child: Padding(
                        padding: const EdgeInsets.all(4),
                        child: Icon(LucideIcons.phoneCall, size: 16, color: color),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Lead card (Leads + Follow-ups) ───────────────────────────────────────────────────────────────

String relativeAr(String? iso) {
  if (iso == null || iso.isEmpty) return 'متكلمش قبل كده';
  final t = DateTime.tryParse(iso);
  if (t == null) return iso;
  final d = DateTime.now().difference(t.toLocal());
  if (d.inMinutes < 1) return 'دلوقتي';
  if (d.inMinutes < 60) return 'من ${d.inMinutes} دقيقة';
  if (d.inHours < 24) return 'من ${d.inHours} ساعة';
  if (d.inDays == 1) return 'إمبارح';
  return 'من ${d.inDays} يوم';
}

class AgentLeadCard extends StatelessWidget {
  const AgentLeadCard({
    super.key,
    required this.lead,
    required this.onCall,
    this.subtitle,
    this.subtitleColor,
    this.stageColor,
    this.stageLabel,
  });
  final LeadModel lead;
  final VoidCallback onCall;
  final String? subtitle;
  final Color? subtitleColor;
  final Color? stageColor;
  final String? stageLabel;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final sc = stageColor ?? AppColors.neonLimeDark;
    final interest = [lead.project, lead.propertyType].where((e) => (e ?? '').trim().isNotEmpty).join(' · ');
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      elevation: 0,
      color: isDark ? const Color(0xFF1C212B) : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: isDark ? const Color(0xFF282D38) : AppColors.lightBorder),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(lead.name.isEmpty ? 'عميل' : lead.name,
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: sc.withAlpha(35), borderRadius: BorderRadius.circular(10)),
                  child: Text(stageLabel ?? lead.status, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: sc)),
                ),
              ],
            ),
            if (interest.isNotEmpty) ...[
              const SizedBox(height: 3),
              Text(interest, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13)),
            ],
            const SizedBox(height: 3),
            Text(
              subtitle ?? 'آخر تواصل: ${relativeAr(lead.lastActionAt)}',
              style: TextStyle(fontSize: 12.5, color: subtitleColor ?? (isDark ? Colors.white60 : Colors.black54)),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: kTap,
                    child: FilledButton.icon(
                      onPressed: onCall,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.neonLimeDark,
                        foregroundColor: const Color(0xFF142407),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      icon: const Icon(LucideIcons.phone, size: 20),
                      label: const Text('اتصل', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: SizedBox(
                    height: kTap,
                    child: OutlinedButton.icon(
                      onPressed: () => openWhatsApp(context, lead),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF16A34A),
                        side: const BorderSide(color: Color(0xFF16A34A)),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      icon: const Icon(LucideIcons.messageCircle, size: 20),
                      label: const Text('واتساب', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
