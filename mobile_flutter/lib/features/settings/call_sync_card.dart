import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/tr.dart';
import '../../data/services/device_call_sync_service.dart';

/// Settings card for the Android call-log sync. Renders nothing on iOS and web.
class CallSyncCard extends StatefulWidget {
  const CallSyncCard({super.key});

  @override
  State<CallSyncCard> createState() => _CallSyncCardState();
}

class _CallSyncCardState extends State<CallSyncCard> with WidgetsBindingObserver {
  final _sync = DeviceCallSyncService.instance;
  bool _hasPermission = true;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    if (!DeviceCallSyncService.isSupported) return;
    WidgetsBinding.instance.addObserver(this);
    _checkPermission();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // The agent may grant the permission from the system settings and come back.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _checkPermission();
  }

  Future<void> _checkPermission() async {
    final ok = await _sync.hasPermission();
    if (mounted) setState(() => _hasPermission = ok);
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message), behavior: SnackBarBehavior.floating));
  }

  String _summary(CallSyncResult r) {
    switch (r.status) {
      case CallSyncStatus.ok:
        return r.inserted == 0
            ? tr('Up to date: no new calls with your leads.', 'كل شيء محدّث: لا توجد مكالمات جديدة مع عملائك.')
            : tr('${r.inserted} calls added to ${r.leads} leads',
                'تمت إضافة ${r.inserted} مكالمة إلى ${r.leads} عميل');
      case CallSyncStatus.partial:
        return tr('${r.pending} calls are saved on this phone and will be sent when the connection is back.',
            '${r.pending} مكالمة محفوظة على الهاتف وستُرسل عند عودة الاتصال.');
      case CallSyncStatus.noPermission:
        return tr('Call log permission is off.', 'إذن سجل المكالمات غير مفعّل.');
      case CallSyncStatus.busy:
        return tr('A sync is already running.', 'هناك مزامنة قيد التنفيذ بالفعل.');
      default:
        return tr('Could not sync right now. We will try again.', 'تعذّرت المزامنة الآن، سنحاول مرة أخرى.');
    }
  }

  Future<void> _turnOn() async {
    final days = await CallSyncConsentSheet.show(context);
    if (days == null || !mounted) return; // "Not now": nothing was requested or changed

    setState(() => _busy = true);
    var granted = await _sync.requestPermission();
    if (!granted && await _sync.isPermanentlyDenied()) {
      if (mounted) {
        _toast(tr('Allow "Phone / Call logs" for Brokly in the system settings to use call sync.',
            'فعّل إذن "الهاتف / سجل المكالمات" لتطبيق Brokly من إعدادات النظام.'));
      }
      await openAppSettings();
      granted = await _sync.hasPermission();
    }
    await _checkPermission();
    if (!granted) {
      if (mounted) {
        setState(() => _busy = false);
        _toast(tr('Call sync stays off. The app keeps working normally.',
            'مزامنة المكالمات متوقفة. التطبيق يعمل بشكل طبيعي.'));
      }
      return;
    }
    final result = await _sync.enable(lookbackDays: days);
    if (!mounted) return;
    setState(() => _busy = false);
    _toast(_summary(result));
  }

  Future<void> _turnOff() async {
    await _sync.disable();
    if (mounted) _toast(tr('Call sync turned off.', 'تم إيقاف مزامنة المكالمات.'));
  }

  Future<void> _syncNow() async {
    setState(() => _busy = true);
    final result = await _sync.syncNow();
    if (!mounted) return;
    setState(() => _busy = false);
    _toast(_summary(result));
  }

  Future<void> _importHistory() async {
    final days = await CallSyncConsentSheet.pickRange(context);
    if (days == null || !mounted) return;
    setState(() => _busy = true);
    final result = await _sync.importHistory(lookbackDays: days);
    if (!mounted) return;
    setState(() => _busy = false);
    _toast(_summary(result));
  }

  @override
  Widget build(BuildContext context) {
    if (!DeviceCallSyncService.isSupported) return const SizedBox.shrink();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fg = isDark ? AppColors.darkForeground : AppColors.lightForeground;
    final muted = isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground;

    return ValueListenableBuilder<CallSyncState>(
      valueListenable: _sync.state,
      builder: (context, s, _) {
        final needsPermission = s.enabled && !_hasPermission;
        return Container(
          margin: const EdgeInsets.only(top: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkCard : Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.phoneCall, color: AppColors.primary, size: 22),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(tr('Call sync', 'مزامنة المكالمات'),
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: fg)),
                        const SizedBox(height: 2),
                        Text(
                          tr('Adds your calls with leads automatically', 'تضيف مكالماتك مع العملاء تلقائياً'),
                          style: TextStyle(fontSize: 12, color: muted),
                        ),
                      ],
                    ),
                  ),
                  Switch(
                    value: s.enabled,
                    activeThumbColor: AppColors.primary,
                    onChanged: _busy ? null : (on) => on ? _turnOn() : _turnOff(),
                  ),
                ],
              ),
              if (needsPermission) ...[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF59E0B).withAlpha(25),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFF59E0B).withAlpha(90)),
                  ),
                  child: Row(
                    children: [
                      const Icon(LucideIcons.alertCircle, size: 16, color: Color(0xFFF59E0B)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          tr('Call sync is on but the call log permission is off.',
                              'المزامنة مفعّلة لكن إذن سجل المكالمات غير مفعّل.'),
                          style: TextStyle(fontSize: 12, color: fg),
                        ),
                      ),
                      TextButton(
                        onPressed: _busy
                            ? null
                            : () async {
                                final ok = await _sync.requestPermission();
                                if (!ok) await openAppSettings();
                                await _checkPermission();
                              },
                        child: Text(tr('Enable', 'تفعيل')),
                      ),
                    ],
                  ),
                ),
              ],
              if (s.enabled) ...[
                const SizedBox(height: 12),
                Wrap(
                  spacing: 18,
                  runSpacing: 6,
                  children: [
                    _stat(tr('Last sync', 'آخر مزامنة'),
                        s.lastSyncAt == null ? tr('Never', 'لم تتم بعد') : DateFormat('MMM d, HH:mm').format(s.lastSyncAt!),
                        fg, muted),
                    _stat(tr('Calls synced', 'المكالمات المزامنة'), '${s.totalSynced}', fg, muted),
                    if (s.pending > 0) _stat(tr('Waiting to send', 'بانتظار الإرسال'), '${s.pending}', fg, muted),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: _busy || !_hasPermission ? null : _syncNow,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.neonLime,
                          foregroundColor: const Color(0xFF142407),
                        ),
                        icon: _busy
                            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(LucideIcons.refreshCw, size: 16),
                        label: Text(tr('Sync now', 'مزامنة الآن')),
                      ),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton.icon(
                      onPressed: _busy || !_hasPermission ? null : _importHistory,
                      icon: const Icon(LucideIcons.history, size: 16),
                      label: Text(tr('Import history', 'استيراد السجل')),
                    ),
                  ],
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _stat(String label, String value, Color fg, Color muted) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: TextStyle(fontSize: 11, color: muted)),
        Text(value, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: fg)),
      ],
    );
  }
}

/// Explains what is read and what is uploaded BEFORE the permission is requested, and asks how far back to import.
class CallSyncConsentSheet extends StatefulWidget {
  final bool rangeOnly;
  const CallSyncConsentSheet({super.key, this.rangeOnly = false});

  /// Returns the chosen look-back in days (0 = today) or null if the agent chose "Not now".
  static Future<int?> show(BuildContext context) => showModalBottomSheet<int>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (_) => const CallSyncConsentSheet(),
      );

  /// Only the "how far back" choice (used by "Import history").
  static Future<int?> pickRange(BuildContext context) => showModalBottomSheet<int>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (_) => const CallSyncConsentSheet(rangeOnly: true),
      );

  @override
  State<CallSyncConsentSheet> createState() => _CallSyncConsentSheetState();
}

class _CallSyncConsentSheetState extends State<CallSyncConsentSheet> {
  int _days = 7;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fg = isDark ? AppColors.darkForeground : AppColors.lightForeground;
    final muted = isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground;

    Widget bullet(IconData icon, String text) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, size: 16, color: AppColors.primary),
              const SizedBox(width: 10),
              Expanded(child: Text(text, style: TextStyle(fontSize: 13, color: fg, height: 1.35))),
            ],
          ),
        );

    final ranges = <(int, String)>[
      (0, tr('Today', 'اليوم')),
      (7, tr('Last 7 days', 'آخر 7 أيام')),
      (30, tr('Last 30 days', 'آخر 30 يوماً')),
    ];

    return Container(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                widget.rangeOnly ? tr('Import older calls', 'استيراد مكالمات أقدم') : tr('Sync calls with your leads', 'مزامنة مكالماتك مع العملاء'),
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: fg),
              ),
              const SizedBox(height: 12),
              if (!widget.rangeOnly) ...[
                bullet(LucideIcons.eye,
                    tr('Brokly reads your phone\'s call log on this device only.', 'يقرأ Brokly سجل مكالمات هاتفك على الجهاز نفسه فقط.')),
                bullet(LucideIcons.users,
                    tr('Only calls with numbers that belong to your leads are uploaded.', 'يتم رفع المكالمات مع أرقام عملائك فقط.')),
                bullet(LucideIcons.lock,
                    tr('All your other calls are never sent. Contact names are never read or sent.', 'باقي مكالماتك لا يتم إرسالها أبداً، وأسماء جهات الاتصال لا تُقرأ ولا تُرسل.')),
                bullet(LucideIcons.listChecks,
                    tr('What is sent: the lead, number, direction, time and duration. You can turn it off any time.', 'ما يُرسل: العميل والرقم ونوع المكالمة ووقتها ومدتها. يمكنك إيقافها في أي وقت.')),
                const SizedBox(height: 6),
              ],
              Text(tr('Import calls from', 'استيراد المكالمات من'),
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: muted)),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                children: [
                  for (final r in ranges)
                    ChoiceChip(
                      label: Text(r.$2),
                      selected: _days == r.$1,
                      onSelected: (_) => setState(() => _days = r.$1),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              SizedBox(
                height: 46,
                child: ElevatedButton(
                  onPressed: () => Navigator.pop(context, _days),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.neonLime,
                    foregroundColor: const Color(0xFF142407),
                  ),
                  child: Text(
                    widget.rangeOnly ? tr('Import', 'استيراد') : tr('Continue', 'متابعة'),
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
              ),
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: Text(tr('Not now', 'ليس الآن')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
