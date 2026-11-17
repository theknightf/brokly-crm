import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/constants/lead_stages.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/tr.dart';
import '../../core/widgets/premium.dart';
import '../../state/leads_provider.dart';
import '../leads/leads_screen.dart';

/// The sales agent's "Dashboard" (the old Leads tab): pick a stage card first, then the lead list for that
/// stage opens. The list is the normal Leads screen with the stage filter applied.
class SalesDashboardScreen extends StatefulWidget {
  /// True while this tab is the one on screen (so the Android back button only steps back from the list here).
  final bool active;

  const SalesDashboardScreen({super.key, required this.active});

  @override
  State<SalesDashboardScreen> createState() => _SalesDashboardScreenState();
}

class _SalesDashboardScreenState extends State<SalesDashboardScreen> {
  bool _showAll = false;

  bool _inList(LeadsProvider p) => _showAll || p.statusFilter != LeadStages.allLeads;

  void _openStage(String stage) {
    final provider = context.read<LeadsProvider>();
    provider.setViewMode('list');
    provider.setStatusFilter(stage);
  }

  void _openAll() {
    context.read<LeadsProvider>().setViewMode('list');
    setState(() => _showAll = true);
  }

  void _back() {
    context.read<LeadsProvider>().setStatusFilter('');
    setState(() => _showAll = false);
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<LeadsProvider>();
    final inList = _inList(provider);
    return PopScope(
      canPop: !(inList && widget.active),
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: inList ? _list() : _picker(provider),
    );
  }

  Widget _list() {
    final rtl = Directionality.of(context) == TextDirection.rtl;
    return Column(
      children: [
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.sm, AppSpacing.xs, AppSpacing.sm, 0),
            child: TextButton.icon(
              onPressed: _back,
              icon: Icon(rtl ? LucideIcons.arrowRight : LucideIcons.arrowLeft, size: 18),
              label: Text(tr('All stages', 'كل المراحل')),
            ),
          ),
        ),
        const Expanded(child: LeadsScreen()),
      ],
    );
  }

  Widget _picker(LeadsProvider provider) {
    final t = Theme.of(context).textTheme;
    final p = context.palette;
    final counts = <String, int>{};
    for (final l in provider.allLeads) {
      final stage = LeadStages.normalize(l.status);
      counts[stage] = (counts[stage] ?? 0) + 1;
    }
    final total = provider.allLeads.length;
    final loading = provider.isLoading && provider.allLeads.isEmpty;

    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: () => provider.fetchLeads(silent: true),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.lg, AppSpacing.page, AppSpacing.listBottom),
          children: [
            Semantics(header: true, child: Text(tr('Dashboard', 'لوحة التحكم'), style: t.headlineSmall)),
            const SizedBox(height: 2),
            Text(tr('Pick a stage to open its leads', 'اختار مرحلة تفتح عملاءها'), style: t.bodySmall),
            const SizedBox(height: AppSpacing.lg),
            PremiumCard(
              onTap: _openAll,
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(color: p.accentSoft, borderRadius: BorderRadius.circular(AppRadius.sm)),
                    child: Icon(LucideIcons.users, size: 22, color: p.accent),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(child: Text(tr('All leads', 'كل العملاء'), style: t.titleMedium)),
                  Text(loading ? '–' : '$total', style: t.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                ],
              ),
            ),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: AppSpacing.sm,
              crossAxisSpacing: AppSpacing.sm,
              childAspectRatio: 2.3,
              children: [
                for (final s in LeadStages.allStatuses)
                  _StageCard(stage: s, count: loading ? null : (counts[s] ?? 0), onTap: () => _openStage(s)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StageCard extends StatelessWidget {
  final String stage;
  final int? count;
  final VoidCallback onTap;

  const _StageCard({required this.stage, required this.count, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final tone = AppColors.stageTone(stage, isDark: context.isDark);
    return Opacity(
      // Empty stages stay visible (and tappable) but step back.
      opacity: count == 0 ? 0.55 : 1,
      child: PremiumCard(
        onTap: onTap,
        margin: EdgeInsets.zero,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(color: tone.bg, borderRadius: BorderRadius.circular(AppRadius.sm)),
              child: Icon(LeadStages.iconFor(stage), size: 18, color: tone.text),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(count == null ? '–' : '$count', style: t.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                  Text(LeadStages.label(stage), maxLines: 1, overflow: TextOverflow.ellipsis, style: t.bodySmall),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
