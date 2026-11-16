import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/realtime_pause.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/tr.dart';
import '../../data/services/pending_call_saves.dart';
import '../../data/services/supabase_service.dart';

/// Daily call target for sales agents, shown above Leads and Follow-ups: "23 / 120 calls today".
/// Numbers come from the my_call_progress() RPC (per-agent target, else the company daily_calls target).
/// Refreshes after every saved call, when the app comes back to the foreground, and every minute.
class SalesTargetBar extends StatefulWidget {
  const SalesTargetBar({super.key});

  @override
  State<SalesTargetBar> createState() => _SalesTargetBarState();
}

class _SalesTargetBarState extends State<SalesTargetBar> {
  int _target = 0;
  int _calls = 0;
  bool _celebrated = false;
  Timer? _timer;
  VoidCallback? _unregisterSaved;

  @override
  void initState() {
    super.initState();
    _load();
    _unregisterSaved = PendingCallSaves.instance.addOnSaved(_load);
    RealtimePause.resumed.addListener(_load);
    _timer = Timer.periodic(const Duration(minutes: 1), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    _unregisterSaved?.call();
    RealtimePause.resumed.removeListener(_load);
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final res = await SupabaseService().client.rpc('my_call_progress');
      if (!mounted || res is! List || res.isEmpty) return;
      final row = res.first as Map<String, dynamic>;
      final target = (row['target'] as num?)?.toInt() ?? 0;
      final calls = (row['calls_today'] as num?)?.toInt() ?? 0;
      final reachedNow = target > 0 && calls >= target;
      if (reachedNow && !_celebrated && _target > 0 && _calls < _target) {
        HapticFeedback.heavyImpact();
        ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(
          content: Text(tr('Daily target reached!', 'برافو! وصلت لتارجت النهارده')),
          backgroundColor: const Color(0xFF16A34A),
        ));
      }
      setState(() {
        _target = target;
        _calls = calls;
        if (reachedNow) _celebrated = true;
      });
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    if (_target <= 0) return const SizedBox.shrink();
    final done = _calls >= _target;
    final progress = (_calls / _target).clamp(0.0, 1.0);
    final color = done ? const Color(0xFF16A34A) : AppColors.neonLimeDark;
    final remaining = (_target - _calls).clamp(0, _target);
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
      color: color.withAlpha(done ? 30 : 15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(done ? LucideIcons.trophy : LucideIcons.phoneCall, size: 16, color: color),
              const SizedBox(width: 6),
              Text('$_calls / $_target', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
              const SizedBox(width: 4),
              Text(tr('calls today', 'مكالمة النهارده'), style: const TextStyle(fontSize: 12.5)),
              const Spacer(),
              Text(
                done
                    ? tr('Target reached', 'وصلت للتارجت')
                    : tr('${(progress * 100).round()}% · $remaining left', '${(progress * 100).round()}% · فاضل $remaining'),
                style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: done ? color : null),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(value: progress, minHeight: 6, color: color, backgroundColor: color.withAlpha(40)),
          ),
        ],
      ),
    );
  }
}
