import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/realtime_pause.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/tr.dart';
import '../../core/widgets/premium.dart';
import '../../data/services/pending_call_saves.dart';
import '../../data/services/supabase_service.dart';
import '../../state/auth_provider.dart';
import '../../state/leads_provider.dart';

/// Same closed stages as the Follow-ups screen: a lead in one of them has no live follow-up.
const _closedStages = {
  'done deal', 'won', 'lost', 'cancellation', 'not interested', 'duplicate leads', 'wrong number', 'closed number', 'low budget',
};

/// Home for sales agents: today's action counter and two big buttons, Dashboard (the stage picker / leads) and Workspace
/// (follow-ups).
class SalesHomeScreen extends StatefulWidget {
  final VoidCallback onOpenLeads;
  final VoidCallback onOpenFollowUps;

  const SalesHomeScreen({
    super.key,
    required this.onOpenLeads,
    required this.onOpenFollowUps,
  });

  @override
  State<SalesHomeScreen> createState() => _SalesHomeScreenState();
}

class _SalesHomeScreenState extends State<SalesHomeScreen> {
  // Today's numbers for this agent, from the same period_leaderboard() the website leaderboard uses.
  int? _actions;
  int? _calls;
  int? _stageUpdates;
  VoidCallback? _unregisterSaved;

  @override
  void initState() {
    super.initState();
    _loadActions();
    _unregisterSaved = PendingCallSaves.instance.addOnSaved(_loadActions);
    RealtimePause.resumed.addListener(_loadActions);
  }

  @override
  void dispose() {
    _unregisterSaved?.call();
    RealtimePause.resumed.removeListener(_loadActions);
    super.dispose();
  }

  Future<void> _loadActions() async {
    try {
      final client = SupabaseService().client;
      final uid = client.auth.currentUser?.id;
      if (uid == null) return;
      final now = DateTime.now();
      final day = '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
      final res = await client.rpc('period_leaderboard', params: {'p_from': day, 'p_to': day});
      final rows = (res as List).cast<Map<String, dynamic>>();
      final me = rows.where((r) => r['user_id']?.toString() == uid).firstOrNull;
      if (!mounted) return;
      setState(() {
        _actions = (me?['total_actions'] as num?)?.toInt() ?? 0;
        _calls = (me?['calls'] as num?)?.toInt() ?? 0;
        _stageUpdates = (me?['status_updates'] as num?)?.toInt() ?? 0;
      });
    } catch (_) {}
  }

  Future<void> _refresh(LeadsProvider leads) async {
    await Future.wait([leads.fetchLeads(silent: true), _loadActions()]);
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = Theme.of(context).textTheme;
    final leads = context.watch<LeadsProvider>();
    final profile = context.watch<AuthProvider>().profile;
    final firstName = (profile?.fullName ?? '').trim().split(RegExp(r'\s+')).first;

    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    var overdue = 0;
    var dueToday = 0;
    for (final l in leads.allLeads) {
      if (_closedStages.contains(l.status.toLowerCase().trim())) continue;
      final d = l.followUpDateTime?.toLocal();
      if (d == null) continue;
      final day = DateTime(d.year, d.month, d.day);
      if (day.isBefore(today)) {
        overdue++;
      } else if (day == today) {
        dueToday++;
      }
    }
    final loading = leads.isLoading && leads.allLeads.isEmpty;

    final greeting = now.hour < 12
        ? tr('Good morning', 'صباح الخير')
        : now.hour < 18
            ? tr('Good afternoon', 'مساء الخير')
            : tr('Good evening', 'مساء الخير');

    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: () => _refresh(leads),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.lg, AppSpacing.page, AppSpacing.listBottom),
          children: [
            Semantics(
              header: true,
              child: Text(
                firstName.isEmpty ? greeting : tr('$greeting, $firstName', '$greeting يا $firstName'),
                style: t.headlineSmall,
              ),
            ),
            const SizedBox(height: 2),
            Text(tr('What do you want to work on?', 'عايز تشتغل على إيه؟'), style: t.bodySmall),
            const SizedBox(height: AppSpacing.lg),

            // Today's action counter
            PremiumCard(
              tint: p.accentSoft,
              borderColor: p.accent.withAlpha(90),
              child: Row(
                children: [
                  Icon(LucideIcons.zap, size: 26, color: p.accent),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(tr('Your actions today', 'إجراءاتك النهارده'), style: t.bodySmall),
                        Text(_actions == null ? '–' : '$_actions', style: t.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
                      ],
                    ),
                  ),
                  _MiniStat(label: tr('Calls', 'مكالمات'), value: _calls),
                  const SizedBox(width: AppSpacing.lg),
                  _MiniStat(label: tr('Stage updates', 'تحديث مراحل'), value: _stageUpdates),
                ],
              ),
            ),

            _HomeButton(
              icon: LucideIcons.users,
              title: tr('Dashboard', 'لوحة التحكم'),
              subtitle: loading ? tr('Loading…', 'جاري التحميل…') : tr('${leads.allLeads.length} leads', '${leads.allLeads.length} عميل'),
              onTap: widget.onOpenLeads,
            ),
            _HomeButton(
              icon: LucideIcons.calendarClock,
              title: tr('Workspace', 'مساحة العمل'),
              subtitle: loading
                  ? tr('Loading…', 'جاري التحميل…')
                  : tr('$overdue late · $dueToday today', '$overdue متأخرة · $dueToday النهارده'),
              highlight: overdue > 0,
              onTap: widget.onOpenFollowUps,
            ),
          ],
        ),
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label;
  final int? value;
  const _MiniStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(value == null ? '–' : '$value', style: t.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
        Text(label, style: t.bodySmall),
      ],
    );
  }
}

class _HomeButton extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final bool highlight;
  final VoidCallback onTap;

  const _HomeButton({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.highlight = false,
  });

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = Theme.of(context).textTheme;
    return PremiumCard(
      onTap: onTap,
      padding: const EdgeInsets.all(AppSpacing.xl),
      child: Row(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(color: p.accentSoft, borderRadius: BorderRadius.circular(AppRadius.md)),
            child: Icon(icon, size: 28, color: p.accent),
          ),
          const SizedBox(width: AppSpacing.lg),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: t.titleLarge),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: t.bodyMedium?.copyWith(color: highlight ? p.danger : p.subtext, fontWeight: highlight ? FontWeight.w600 : null),
                ),
              ],
            ),
          ),
          Icon(Directionality.of(context) == TextDirection.rtl ? LucideIcons.chevronLeft : LucideIcons.chevronRight, color: p.subtext),
        ],
      ),
    );
  }
}
