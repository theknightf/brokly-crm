import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/tr.dart';
import '../../../core/widgets/premium.dart';
import 'dash_kit.dart';

/// Daily activity: calls vs quota, SLA score, rank.
class ActivityCard extends StatelessWidget {
  final int callsToday;
  final int targetCalls;
  final int callsThisMonth;
  final double slaScorePct;
  final int overdueFollowUps;
  final int rank;
  final int online;

  const ActivityCard({
    super.key,
    required this.callsToday,
    required this.targetCalls,
    required this.callsThisMonth,
    required this.slaScorePct,
    required this.overdueFollowUps,
    required this.rank,
    required this.online,
  });

  @override
  Widget build(BuildContext context) {
    final target = targetCalls > 0 ? targetCalls : 30;
    final progress = (callsToday / target).clamp(0.0, 1.0);
    final accent = Surf.accent(context);

    return DashCard(
      icon: LucideIcons.activity,
      title: tr('Daily Activity & SLA', 'النشاط اليومي والالتزام'),
      trailing: StatusPill(tr('Rank #$rank - $online online', 'الترتيب #$rank - $online أونلاين'),
          color: context.palette.success),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: _Mini(
                    title: tr('Calls logged', 'المكالمات المسجلة'),
                    value: CountUp(callsToday,
                        suffix: ' / $target',
                        style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                            color: accent)),
                    sub: tr('$callsThisMonth this month', '$callsThisMonth الشهر ده'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _Mini(
                    title: tr('SLA score', 'نسبة الالتزام'),
                    value: CountUp(slaScorePct,
                        decimals: 1,
                        suffix: '%',
                        style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                            color: context.palette.info)),
                    sub: overdueFollowUps == 0
                        ? tr('All due items on track', 'كل المطلوب ماشي في ميعاده')
                        : tr('$overdueFollowUps overdue follow-ups', '$overdueFollowUps متابعات متأخرة'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Text(tr('Daily call quota', 'هدف المكالمات اليومي'),
                    style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: Surf.subtext(context))),
              ),
              Text('${(progress * 100).toStringAsFixed(0)}%',
                  style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w800,
                      fontFeatures: kTabular,
                      color: accent)),
            ],
          ),
          const SizedBox(height: 8),
          GrowBar(value: progress, color: accent, height: 8),
        ],
      ),
    );
  }
}

class _Mini extends StatelessWidget {
  final String title;
  final Widget value;
  final String sub;
  const _Mini({required this.title, required this.value, required this.sub});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: DashColors.inset(context),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Surf.border(context)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title.toUpperCase(),
              style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.5,
                  color: Surf.subtext(context))),
          const SizedBox(height: 6),
          value,
          const SizedBox(height: 2),
          Text(sub,
              style: TextStyle(fontSize: 11.5, color: Surf.subtext(context))),
        ],
      ),
    );
  }
}
