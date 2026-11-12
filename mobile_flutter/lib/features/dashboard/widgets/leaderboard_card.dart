import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/premium.dart';
import '../../../data/models/dashboard_summary_model.dart';
import 'dash_kit.dart';

/// Action leaderboard (Dials / Site Tours) with avatars, rank badges and
/// progress bars relative to the leader.
class LeaderboardCard extends StatefulWidget {
  final List<LeaderboardEntryModel> entries;
  const LeaderboardCard({super.key, required this.entries});

  @override
  State<LeaderboardCard> createState() => _LeaderboardCardState();
}

class _LeaderboardCardState extends State<LeaderboardCard> {
  int _tab = 0; // 0 dials, 1 site tours

  static const _gold = Color(0xFFF59E0B);
  static const _silver = Color(0xFF94A3B8);
  static const _bronze = Color(0xFFB45309);

  int _metric(LeaderboardEntryModel e) =>
      _tab == 0 ? e.dialsCount : e.siteToursCount;

  @override
  Widget build(BuildContext context) {
    final sorted = List<LeaderboardEntryModel>.from(widget.entries)
      ..sort((a, b) {
        final c = _metric(b).compareTo(_metric(a));
        return c != 0 ? c : b.score.compareTo(a.score);
      });
    final top = sorted.take(6).toList();
    final leader = top.isEmpty ? 1 : (_metric(top.first) > 0 ? _metric(top.first) : 1);

    return DashCard(
      icon: LucideIcons.award,
      iconColor: AppColors.amber,
      title: 'Action Leaderboard',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: DashSegmented(
              labels: const ['Dials', 'Site Tours'],
              selected: _tab,
              onChanged: (i) => setState(() => _tab = i),
            ),
          ),
          const SizedBox(height: 12),
          if (top.isEmpty)
            const EmptyState(
              icon: LucideIcons.award,
              title: 'No leaderboard records yet',
              message: 'Activity will appear here as your team logs calls and tours.',
            )
          else
            for (var i = 0; i < top.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _Row(
                  entry: top[i],
                  index: i,
                  value: _metric(top[i]),
                  unit: _tab == 0 ? 'Dials' : 'Tours',
                  fraction: _metric(top[i]) / leader,
                ),
              ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  final LeaderboardEntryModel entry;
  final int index;
  final int value;
  final String unit;
  final double fraction;

  const _Row({
    required this.entry,
    required this.index,
    required this.value,
    required this.unit,
    required this.fraction,
  });

  @override
  Widget build(BuildContext context) {
    final dark = Surf.dark(context);
    final accent = Surf.accent(context);
    final me = entry.isCurrentUser;
    final medal = index == 0
        ? _LeaderboardCardState._gold
        : index == 1
            ? _LeaderboardCardState._silver
            : index == 2
                ? _LeaderboardCardState._bronze
                : null;
    final name = me ? '${entry.fullName} (You)' : entry.fullName;

    return Container(
      constraints: const BoxConstraints(minHeight: 64),
      padding: const EdgeInsets.fromLTRB(10, 10, 12, 10),
      decoration: BoxDecoration(
        color: me
            ? (dark ? const Color(0xFF16250F) : AppColors.secondary)
            : DashColors.inset(context),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
            color: me ? accent.withAlpha(110) : Surf.border(context)),
      ),
      child: Row(
        children: [
          Container(
            width: 26,
            height: 26,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: medal != null
                  ? medal.withAlpha(dark ? 50 : 38)
                  : Colors.transparent,
            ),
            child: Text(
              '${index + 1}',
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w800,
                fontFeatures: kTabular,
                color: medal ?? Surf.subtext(context),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Stack(
            children: [
              CircleAvatar(
                radius: 17,
                backgroundColor: me ? accent : DashColors.blue,
                child: Text(
                  entry.initials,
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w800,
                    color: me
                        ? (dark ? DashColors.onLime : Colors.white)
                        : Colors.white,
                  ),
                ),
              ),
              if (entry.isOnline)
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: DashColors.green,
                      shape: BoxShape.circle,
                      border: Border.all(
                          color: dark
                              ? AppColors.darkBackground
                              : Colors.white,
                          width: 1.5),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 13.5,
                    height: 1.2,
                    fontWeight: me ? FontWeight.w800 : FontWeight.w600,
                    color: Surf.text(context),
                  ),
                ),
                const SizedBox(height: 2),
                Text('${entry.leadsCount} leads - ${entry.score} pts',
                    style: TextStyle(
                        fontSize: 11.5, color: Surf.subtext(context))),
                const SizedBox(height: 6),
                GrowBar(
                  value: fraction,
                  color: medal ?? accent,
                  track: Surf.border(context),
                  height: 4,
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              CountUp(
                value,
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: Surf.text(context)),
              ),
              Text(unit,
                  style: TextStyle(
                      fontSize: 10.5, color: Surf.subtext(context))),
            ],
          ),
        ],
      ),
    );
  }
}
