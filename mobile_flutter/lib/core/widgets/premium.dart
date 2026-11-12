import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../theme/app_colors.dart';

/// Shared building blocks so every screen carries the same premium look
/// (same surfaces, radii, borders and type scale as the Leads / Dashboard cards).
class Surf {
  static bool dark(BuildContext c) => Theme.of(c).brightness == Brightness.dark;
  static Color card(BuildContext c) => dark(c) ? const Color(0xFF161920) : Colors.white;
  static Color border(BuildContext c) => dark(c) ? const Color(0xFF282D38) : AppColors.lightBorder;
  static Color muted(BuildContext c) => dark(c) ? AppColors.darkMuted : AppColors.lightMuted;
  static Color text(BuildContext c) => dark(c) ? AppColors.darkForeground : AppColors.lightForeground;
  static Color subtext(BuildContext c) => dark(c) ? AppColors.darkMutedForeground : AppColors.lightMutedForeground;
  static Color accent(BuildContext c) => dark(c) ? AppColors.neonLime : AppColors.primary;
}

/// Rounded, bordered surface. Tappable when [onTap] is set (min 48dp hit area comes from padding).
class PremiumCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry margin;
  final VoidCallback? onTap;
  final Color? tint;

  const PremiumCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.margin = const EdgeInsets.only(bottom: 12),
    this.onTap,
    this.tint,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Surf.dark(context);
    return Container(
      margin: margin,
      decoration: BoxDecoration(
        color: tint ?? Surf.card(context),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Surf.border(context)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(isDark ? 70 : 12),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(20),
        clipBehavior: Clip.antiAlias,
        child: InkWell(onTap: onTap, child: Padding(padding: padding, child: child)),
      ),
    );
  }
}

class SectionHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;

  const SectionHeader({super.key, required this.title, this.subtitle, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 8, 4, 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Surf.text(context))),
                if (subtitle != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(subtitle!, style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
                  ),
              ],
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

/// Small status label. Pass a lead/deal status string to get the pipeline colours,
/// or an explicit [color] for custom semantics.
class StatusPill extends StatelessWidget {
  final String label;
  final Color? color;
  final IconData? icon;

  const StatusPill(this.label, {super.key, this.color, this.icon});

  @override
  Widget build(BuildContext context) {
    final isDark = Surf.dark(context);
    final colors = AppColors.getStatusColors(label, isDark: isDark);
    final fg = color ?? colors.text;
    final bg = color != null ? color!.withAlpha(isDark ? 40 : 28) : colors.bg;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 12, color: fg), const SizedBox(width: 4)],
          Flexible(
            child: Text(label,
                maxLines: 1,
                softWrap: false,
                overflow: TextOverflow.fade,
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: fg)),
          ),
        ],
      ),
    );
  }
}

/// Number + label tile for KPI rows. Numbers use tabular figures so columns align.
class MetricTile extends StatelessWidget {
  final String label;
  final String value;
  final IconData? icon;
  final Color? color;
  final String? caption;

  const MetricTile({super.key, required this.label, required this.value, this.icon, this.color, this.caption});

  @override
  Widget build(BuildContext context) {
    final c = color ?? Surf.accent(context);
    return PremiumCard(
      margin: EdgeInsets.zero,
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            if (icon != null) ...[
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(color: c.withAlpha(32), borderRadius: BorderRadius.circular(9)),
                child: Icon(icon, size: 15, color: c),
              ),
              const SizedBox(width: 8),
            ],
            Expanded(
              child: Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Surf.subtext(context))),
            ),
          ]),
          const SizedBox(height: 10),
          Text(value,
              style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: Surf.text(context),
                  fontFeatures: const [FontFeature.tabularFigures()])),
          if (caption != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(caption!, style: TextStyle(fontSize: 11, color: Surf.subtext(context))),
            ),
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? message;
  final String? actionLabel;
  final VoidCallback? onAction;

  const EmptyState({super.key, this.icon = LucideIcons.inbox, required this.title, this.message, this.actionLabel, this.onAction});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(18)),
            child: Icon(icon, color: Surf.subtext(context)),
          ),
          const SizedBox(height: 14),
          Text(title, textAlign: TextAlign.center, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Surf.text(context))),
          if (message != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(message!, textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: Surf.subtext(context))),
            ),
          if (actionLabel != null && onAction != null)
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: FilledButton(onPressed: onAction, child: Text(actionLabel!)),
            ),
        ]),
      ),
    );
  }
}

class ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const ErrorState({super.key, required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) => EmptyState(
        icon: LucideIcons.triangleAlert,
        title: 'Something went wrong',
        message: message,
        actionLabel: 'Retry',
        onAction: onRetry,
      );
}

/// Placeholder rows while data loads (replaces bare spinners).
class SkeletonList extends StatelessWidget {
  final int count;
  final double height;
  const SkeletonList({super.key, this.count = 5, this.height = 88});

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      itemCount: count,
      itemBuilder: (_, __) => Container(
        height: height,
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(20)),
      ),
    );
  }
}

class AppSearchField extends StatelessWidget {
  final String hint;
  final ValueChanged<String> onChanged;
  final TextEditingController? controller;
  const AppSearchField({super.key, this.hint = 'Search', required this.onChanged, this.controller});

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      onChanged: onChanged,
      textInputAction: TextInputAction.search,
      decoration: InputDecoration(
        hintText: hint,
        prefixIcon: const Icon(LucideIcons.search, size: 18),
        filled: true,
        fillColor: Surf.muted(context),
        contentPadding: const EdgeInsets.symmetric(vertical: 12),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
      ),
    );
  }
}

/// Horizontally scrolling single-select chips (stage / status / period filters).
class FilterChipRow<T> extends StatelessWidget {
  final List<T> options;
  final T selected;
  final String Function(T) labelOf;
  final ValueChanged<T> onSelected;
  const FilterChipRow({super.key, required this.options, required this.selected, required this.labelOf, required this.onSelected});

  @override
  Widget build(BuildContext context) {
    final accent = Surf.accent(context);
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: options.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final o = options[i];
          final on = o == selected;
          return ChoiceChip(
            label: Text(labelOf(o)),
            selected: on,
            onSelected: (_) => onSelected(o),
            showCheckmark: false,
            labelStyle: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: on ? Colors.black : Surf.subtext(context)),
            selectedColor: accent,
            backgroundColor: Surf.muted(context),
            side: BorderSide.none,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
          );
        },
      ),
    );
  }
}

/// Label / value pair for detail sheets.
class DetailRow extends StatelessWidget {
  final String label;
  final String value;
  const DetailRow(this.label, this.value, {super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 110, child: Text(label, style: TextStyle(fontSize: 12.5, color: Surf.subtext(context)))),
        Expanded(child: Text(value.isEmpty ? '—' : value, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: Surf.text(context)))),
      ]),
    );
  }
}

/// Standard modal bottom sheet (rounded, drag handle, keyboard-safe, scroll-safe).
Future<T?> showPremiumSheet<T>(BuildContext context, {required Widget Function(BuildContext) builder}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Surf.card(context),
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const SizedBox(height: 10),
        Container(width: 40, height: 4, decoration: BoxDecoration(color: Surf.border(ctx), borderRadius: BorderRadius.circular(4))),
        Flexible(child: builder(ctx)),
      ]),
    ),
  );
}

/// Destructive / irreversible action guard.
Future<bool> confirmAction(BuildContext context, {required String title, required String message, String confirmLabel = 'Confirm', bool destructive = false}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
        FilledButton(
          style: destructive ? FilledButton.styleFrom(backgroundColor: AppColors.alertRed) : null,
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return ok ?? false;
}
