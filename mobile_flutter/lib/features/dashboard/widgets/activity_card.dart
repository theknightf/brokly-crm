import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
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
      title: 'Daily Activity & SLA',
      trailing: StatusPill('Rank #$rank - $online online',
          color: DashColors.green),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: _Mini(
                    title: 'Calls logged',
                    value: CountUp(callsToday,
                        suffix: ' / $target',
                        style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                            color: accent)),
                    sub: '$callsThisMonth this month',
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _Mini(
                    title: 'SLA score',
                    value: CountUp(slaScorePct,
                        decimals: 1,
                        suffix: '%',
                        style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                            color: DashColors.blue)),
                    sub: overdueFollowUps == 0
                        ? 'All due items on track'
                        : '$overdueFollowUps overdue follow-ups',
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Text('Daily call quota',
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
