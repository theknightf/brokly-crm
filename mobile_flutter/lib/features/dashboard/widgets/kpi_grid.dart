import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/tr.dart';
import '../../../core/widgets/premium.dart';
import 'dash_kit.dart';

class _Kpi {
  final String label;
  final int value;
  final String badge;
  final Color color;
  final IconData icon;
  final int tab;
  const _Kpi(this.label, this.value, this.badge, this.color, this.icon, this.tab);
}

/// 2x2 KPI grid: full labels (no clipping), count-up values, large tap targets.
class KpiGrid extends StatelessWidget {
  final int totalLeads;
  final int newLeadsThisMonth;
  final int activeFollowUps;
  final int overdueFollowUps;
  final int siteVisits;
  final int scheduledVisits;
  final int wonDeals;
  final double conversionRate;
  final int answeredLeads;
  final int answeredCalls;
  final ValueChanged<int>? onNavigateTab;

  const KpiGrid({
    super.key,
    required this.totalLeads,
    required this.newLeadsThisMonth,
    required this.activeFollowUps,
    required this.overdueFollowUps,
    required this.siteVisits,
    required this.scheduledVisits,
    required this.wonDeals,
    required this.conversionRate,
    this.answeredLeads = 0,
    this.answeredCalls = 0,
    this.onNavigateTab,
  });

  @override
  Widget build(BuildContext context) {
    final lateFu = overdueFollowUps > 0;
    final items = [
      _Kpi(tr('Total Leads', 'إجمالي العملاء'), totalLeads, tr('+$newLeadsThisMonth this month', '+$newLeadsThisMonth الشهر ده'),
          Surf.accent(context), LucideIcons.users, 1),
      _Kpi(
          tr('Follow-ups', 'المتابعات'),
          activeFollowUps,
          lateFu ? tr('$overdueFollowUps late', '$overdueFollowUps متأخرة') : tr('On track', 'تمام'),
          lateFu ? context.palette.danger : context.palette.success,
          LucideIcons.calendarClock,
          3),
      _Kpi(tr('Site Visits', 'المعاينات'), siteVisits, tr('$scheduledVisits scheduled', '$scheduledVisits متحددة'),
          context.palette.info, LucideIcons.mapPin, 4),
      _Kpi(tr('Deals Won', 'صفقات مقفولة'), wonDeals,
          tr('${conversionRate.toStringAsFixed(0)}% conversion', 'تحويل ${conversionRate.toStringAsFixed(0)}%'), context.palette.success,
          LucideIcons.trophy, 5),
      // Leads (and calls) that actually picked up: "تم الرد"
      _Kpi(tr('Answered', 'تم الرد'), answeredLeads, tr('$answeredCalls calls', '$answeredCalls مكالمة'),
          context.palette.info, LucideIcons.phoneCall, 1),
    ];

    Widget tile(_Kpi k) => Expanded(
          child: _KpiTile(k: k, onTap: () => onNavigateTab?.call(k.tab)),
        );

    return Column(
      children: [
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [tile(items[0]), const SizedBox(width: 10), tile(items[1])],
          ),
        ),
        const SizedBox(height: 10),
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [tile(items[2]), const SizedBox(width: 10), tile(items[3])],
          ),
        ),
        const SizedBox(height: 10),
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [tile(items[4])],
          ),
        ),
      ],
    );
  }
}

class _KpiTile extends StatelessWidget {
  final _Kpi k;
  final VoidCallback onTap;
  const _KpiTile({required this.k, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      margin: EdgeInsets.zero,
      padding: const EdgeInsets.all(14),
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: k.color.withAlpha(Surf.dark(context) ? 38 : 26),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(k.icon, size: 15, color: k.color),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  k.label,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: Surf.subtext(context),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          CountUp(
            k.value,
            style: TextStyle(
              fontSize: 28,
              height: 1.0,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.8,
              color: Surf.text(context),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            k.badge,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              color: k.color,
            ),
          ),
        ],
      ),
    );
  }
}
