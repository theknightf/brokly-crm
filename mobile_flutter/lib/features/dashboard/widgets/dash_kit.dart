import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/premium.dart';

/// Shared constants and tiny building blocks for the dashboard widgets.
class DashColors {
  DashColors._();
  static const Color blue = Color(0xFF3B82F6);
  static const Color green = Color(0xFF10B981);
  static const Color whatsapp = Color(0xFF25D366);
  static const Color slate = Color(0xFF94A3B8);

  /// Ink used on top of neon-lime fills.
  static const Color onLime = Color(0xFF142407);

  /// Sunken inner surface (inside a card).
  static Color inset(BuildContext c) =>
      Surf.dark(c) ? AppColors.darkBackground : AppColors.lightMuted;
}

const List<FontFeature> kTabular = [FontFeature.tabularFigures()];

const Duration kMotion = Duration(milliseconds: 450);

/// Card with an icon chip + title row (+ optional trailing widget).
class DashCard extends StatelessWidget {
  final IconData icon;
  final Color? iconColor;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final Widget child;

  const DashCard({
    super.key,
    required this.icon,
    required this.title,
    required this.child,
    this.iconColor,
    this.subtitle,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final c = iconColor ?? Surf.accent(context);
    return PremiumCard(
      margin: EdgeInsets.zero,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: c.withAlpha(Surf.dark(context) ? 38 : 26),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, size: 16, color: c),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.2,
                            color: Surf.text(context))),
                    if (subtitle != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 1),
                        child: Text(subtitle!,
                            style: TextStyle(
                                fontSize: 11.5,
                                color: Surf.subtext(context))),
                      ),
                  ],
                ),
              ),
              if (trailing != null) ...[const SizedBox(width: 8), trailing!],
            ],
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }
}

/// Animated integer (count-up on first paint, tweens on change).
class CountUp extends StatelessWidget {
  final num value;
  final TextStyle style;
  final String prefix;
  final String suffix;
  final int decimals;

  const CountUp(
    this.value, {
    super.key,
    required this.style,
    this.prefix = '',
    this.suffix = '',
    this.decimals = 0,
  });

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0, end: value.toDouble()),
      duration: kMotion,
      curve: Curves.easeOutCubic,
      builder: (_, v, __) => Text(
        '$prefix${v.toStringAsFixed(decimals)}$suffix',
        maxLines: 1,
        style: style.copyWith(fontFeatures: kTabular),
      ),
    );
  }
}

/// Rounded progress bar that grows to [value] (0..1) on first paint.
class GrowBar extends StatelessWidget {
  final double value;
  final Color color;
  final Color? track;
  final double height;

  const GrowBar({
    super.key,
    required this.value,
    required this.color,
    this.track,
    this.height = 6,
  });

  @override
  Widget build(BuildContext context) {
    final bg = track ?? Surf.muted(context);
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0, end: value.clamp(0.0, 1.0)),
      duration: kMotion,
      curve: Curves.easeOutCubic,
      builder: (_, v, __) => ClipRRect(
        borderRadius: BorderRadius.circular(height),
        child: Stack(
          children: [
            Container(height: height, color: bg),
            FractionallySizedBox(
              widthFactor: v,
              child: Container(height: height, color: color),
            ),
          ],
        ),
      ),
    );
  }
}

/// Wraps [child] in a >=48dp tap target without changing its visual size.
class Tap48 extends StatelessWidget {
  final VoidCallback? onTap;
  final Widget child;
  final String? semanticLabel;
  final double minWidth;

  const Tap48({
    super.key,
    required this.onTap,
    required this.child,
    this.semanticLabel,
    this.minWidth = 48,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semanticLabel,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: 48, minWidth: minWidth),
          child: Center(child: child),
        ),
      ),
    );
  }
}

/// Segmented pill control (used for layout / leaderboard tabs).
class DashSegmented extends StatelessWidget {
  final List<String> labels;
  final int selected;
  final ValueChanged<int> onChanged;

  const DashSegmented({
    super.key,
    required this.labels,
    required this.selected,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final accent = Surf.accent(context);
    final dark = Surf.dark(context);
    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: DashColors.inset(context),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Surf.border(context)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < labels.length; i++)
            Tap48(
              minWidth: 48,
              onTap: () => onChanged(i),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeOut,
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                decoration: BoxDecoration(
                  color: i == selected ? accent : Colors.transparent,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  labels[i],
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: i == selected
                        ? (dark ? DashColors.onLime : Colors.white)
                        : Surf.subtext(context),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
