import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/tr.dart';
import '../../core/widgets/premium.dart';
import '../../state/auth_provider.dart';
import 'shell_destinations.dart';

/// "More" tab: every other screen as big tiles, grouped like the website sidebar and filtered by role.
/// Returns the chosen page id.
Future<int?> showMoreSheet(BuildContext context, {required int currentPage}) {
  return showPremiumSheet<int>(context, builder: (ctx) {
    final profile = ctx.watch<AuthProvider>().profile;
    final p = ctx.palette;
    final t = Theme.of(ctx).textTheme;
    final sections = drawerSections
        .map((s) => (s, s.entries.where((e) => e.visible(profile) && e.page > Pg.followUps).toList()))
        .where((x) => x.$2.isNotEmpty)
        .toList();
    return SizedBox(
      height: MediaQuery.of(ctx).size.height * 0.8,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.md, AppSpacing.page, AppSpacing.xxl),
        children: [
          Text(tr('More', 'المزيد'), style: t.headlineSmall),
          const SizedBox(height: AppSpacing.md),
          for (final (section, entries) in sections) ...[
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.md, bottom: AppSpacing.sm),
              child: Text(sectionLabel(section.title), style: t.labelSmall),
            ),
            GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: AppSpacing.sm,
              crossAxisSpacing: AppSpacing.sm,
              childAspectRatio: 1.05,
              children: [
                for (final e in entries)
                  _Tile(
                    icon: e.icon,
                    label: pageLabel(e.page, e.label),
                    selected: e.page == currentPage,
                    onTap: () => Navigator.pop(ctx, e.page),
                    accent: p.accent,
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  });
}

class _Tile extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color accent;
  const _Tile({required this.icon, required this.label, required this.selected, required this.onTap, required this.accent});

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return PremiumCard(
      margin: EdgeInsets.zero,
      padding: const EdgeInsets.all(AppSpacing.sm),
      tint: selected ? p.accentSoft : null,
      borderColor: selected ? accent.withAlpha(120) : null,
      onTap: onTap,
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(color: p.accentSoft, borderRadius: BorderRadius.circular(AppRadius.sm)),
          child: Icon(icon, size: 20, color: accent),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(label, textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.labelMedium),
      ]),
    );
  }
}
