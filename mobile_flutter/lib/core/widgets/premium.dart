import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_theme.dart';
import '../utils/tr.dart';

/// Shared building blocks: every screen gets the website's surfaces, radii, borders and type.
/// All colours come from the theme ([AppPalette]); nothing here is hard-coded per mode.
class Surf {
  static bool dark(BuildContext c) => Theme.of(c).brightness == Brightness.dark;
  static Color card(BuildContext c) => c.palette.card;
  static Color border(BuildContext c) => c.palette.border;
  static Color muted(BuildContext c) => c.palette.muted;
  static Color text(BuildContext c) => c.palette.text;
  static Color subtext(BuildContext c) => c.palette.subtext;
  static Color accent(BuildContext c) => c.palette.accent;
}

/// Light haptic for taps that change data (done, save, delete).
void tapFeedback() => HapticFeedback.lightImpact();

/// Rounded, bordered surface. Tappable when [onTap] is set.
class PremiumCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry margin;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final Color? tint;
  final Color? borderColor;

  const PremiumCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpacing.lg),
    this.margin = const EdgeInsets.only(bottom: AppSpacing.md),
    this.onTap,
    this.onLongPress,
    this.tint,
    this.borderColor,
  });

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Container(
      margin: margin,
      decoration: BoxDecoration(
        color: tint ?? p.card,
        borderRadius: AppRadius.card,
        border: Border.all(color: borderColor ?? p.border),
        boxShadow: p.cardShadow,
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: AppRadius.card,
        clipBehavior: Clip.antiAlias,
        child: InkWell(onTap: onTap, onLongPress: onLongPress, child: Padding(padding: padding, child: child)),
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
    final t = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpacing.xs, AppSpacing.sm, AppSpacing.xs, AppSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(header: true, child: Text(title, style: t.titleMedium)),
                if (subtitle != null)
                  Padding(padding: const EdgeInsets.only(top: 2), child: Text(subtitle!, style: t.bodySmall)),
              ],
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

/// Stage / status label — same look as the website's StatusPill (tinted fill, border, dot).
/// Pass a lead/deal status to get the stage colours, or [color] for custom semantics.
class StatusPill extends StatelessWidget {
  final String label;
  final Color? color;
  final IconData? icon;
  final bool large;

  const StatusPill(this.label, {super.key, this.color, this.icon, this.large = false});

  @override
  Widget build(BuildContext context) {
    final isDark = Surf.dark(context);
    final tone = AppColors.stageTone(label, isDark: isDark);
    final fg = color ?? tone.text;
    final bg = color != null ? color!.withAlpha(38) : tone.bg;
    final bd = color != null ? color!.withAlpha(77) : tone.border;
    final dot = color ?? tone.dot;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: large ? 12 : 10, vertical: large ? 6 : 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(AppRadius.pill), border: Border.all(color: bd)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null)
            Icon(icon, size: large ? 14 : 12, color: fg)
          else
            Container(width: 6, height: 6, decoration: BoxDecoration(color: dot, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Flexible(
            child: Text(label,
                maxLines: 1,
                softWrap: false,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: large ? 13 : 12, fontWeight: FontWeight.w600, color: fg)),
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
  final VoidCallback? onTap;

  const MetricTile({super.key, required this.label, required this.value, this.icon, this.color, this.caption, this.onTap});

  @override
  Widget build(BuildContext context) {
    final c = color ?? Surf.accent(context);
    final t = Theme.of(context).textTheme;
    return PremiumCard(
      margin: EdgeInsets.zero,
      padding: const EdgeInsets.all(14),
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            if (icon != null) ...[
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(color: c.withAlpha(32), borderRadius: BorderRadius.circular(10)),
                child: Icon(icon, size: 16, color: c),
              ),
              const SizedBox(width: AppSpacing.sm),
            ],
            Expanded(child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.labelMedium?.copyWith(color: Surf.subtext(context)))),
          ]),
          const SizedBox(height: 10),
          Text(value, style: t.headlineSmall?.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
          if (caption != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(caption!, style: t.bodySmall)),
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
    final t = Theme.of(context).textTheme;
    final p = context.palette;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xxxl),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(color: p.accentSoft, borderRadius: BorderRadius.circular(AppRadius.lg)),
            child: Icon(icon, color: p.accent, size: 28),
          ),
          const SizedBox(height: AppSpacing.lg),
          Text(title, textAlign: TextAlign.center, style: t.titleMedium),
          if (message != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(message!, textAlign: TextAlign.center, style: t.bodyMedium?.copyWith(color: p.subtext)),
            ),
          if (actionLabel != null && onAction != null)
            Padding(padding: const EdgeInsets.only(top: AppSpacing.xl), child: FilledButton(onPressed: onAction, child: Text(actionLabel!))),
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
        title: tr('Something went wrong', 'حصلت مشكلة'),
        message: message,
        actionLabel: tr('Try again', 'حاول تاني'),
        onAction: onRetry,
      );
}

/// Placeholder rows while data loads (gentle pulse instead of a bare spinner).
class SkeletonList extends StatefulWidget {
  final int count;
  final double height;
  const SkeletonList({super.key, this.count = 5, this.height = 88});

  @override
  State<SkeletonList> createState() => _SkeletonListState();
}

class _SkeletonListState extends State<SkeletonList> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Semantics(
      label: tr('Loading', 'جاري التحميل'),
      child: FadeTransition(
        opacity: Tween(begin: 0.55, end: 1.0).animate(_c),
        child: ListView.builder(
          physics: const NeverScrollableScrollPhysics(),
          padding: AppSpacing.pagePadding,
          itemCount: widget.count,
          itemBuilder: (_, __) => Container(
            height: widget.height,
            margin: const EdgeInsets.only(bottom: AppSpacing.md),
            decoration: BoxDecoration(color: p.muted, borderRadius: AppRadius.card),
          ),
        ),
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
      style: Theme.of(context).textTheme.bodyLarge,
      decoration: InputDecoration(
        hintText: hint,
        prefixIcon: const Icon(LucideIcons.search, size: 18),
        contentPadding: const EdgeInsets.symmetric(vertical: 12),
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
  final int? Function(T)? countOf;
  const FilterChipRow({super.key, required this.options, required this.selected, required this.labelOf, required this.onSelected, this.countOf});

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
        itemCount: options.length,
        separatorBuilder: (_, __) => const SizedBox(width: AppSpacing.sm),
        itemBuilder: (_, i) {
          final o = options[i];
          final on = o == selected;
          final n = countOf?.call(o);
          return ChoiceChip(
            label: Text(n == null ? labelOf(o) : '${labelOf(o)}  $n'),
            selected: on,
            onSelected: (_) => onSelected(o),
            labelStyle: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: on ? p.onAccent : p.subtext),
            selectedColor: p.accent,
            backgroundColor: p.card,
            side: BorderSide(color: on ? p.accent : p.border),
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
    final t = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 110, child: Text(label, style: t.bodyMedium?.copyWith(color: Surf.subtext(context)))),
        Expanded(child: Text(value.isEmpty ? '—' : value, style: t.titleSmall)),
      ]),
    );
  }
}

/// Website-style button. [AppButtonKind.primary] = lime fill, secondary = outlined card, danger = red.
enum AppButtonKind { primary, secondary, danger, ghost }

class AppButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final AppButtonKind kind;
  final bool loading;
  final bool expand;

  const AppButton(this.label, {super.key, this.onPressed, this.icon, this.kind = AppButtonKind.primary, this.loading = false, this.expand = false});

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final child = Row(mainAxisSize: MainAxisSize.min, mainAxisAlignment: MainAxisAlignment.center, children: [
      if (loading)
        const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
      else if (icon != null)
        Icon(icon, size: 18),
      if (loading || icon != null) const SizedBox(width: AppSpacing.sm),
      Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
    ]);
    final onTap = loading ? null : onPressed;
    final Widget btn = switch (kind) {
      AppButtonKind.primary => FilledButton(onPressed: onTap, child: child),
      AppButtonKind.secondary => OutlinedButton(onPressed: onTap, child: child),
      AppButtonKind.danger => FilledButton(style: FilledButton.styleFrom(backgroundColor: p.danger, foregroundColor: Colors.white), onPressed: onTap, child: child),
      AppButtonKind.ghost => TextButton(onPressed: onTap, child: child),
    };
    return expand ? SizedBox(width: double.infinity, child: btn) : btn;
  }
}

/// Round icon action with a label underneath (Call / WhatsApp / Note rows).
class QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final Color? color;
  const QuickAction({super.key, required this.icon, required this.label, this.onTap, this.color});

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final c = color ?? p.text;
    return Semantics(
      button: true,
      label: label,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSpacing.tap, minWidth: AppSpacing.tap),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Icon(icon, size: 20, color: c),
              const SizedBox(height: 4),
              Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c)),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Snackbar helper: success / error / info, optional action (e.g. Undo).
void showAppSnack(BuildContext context, String message, {bool error = false, String? actionLabel, VoidCallback? onAction}) {
  final m = ScaffoldMessenger.maybeOf(context);
  if (m == null) return;
  m.hideCurrentSnackBar();
  m.showSnackBar(SnackBar(
    content: Row(children: [
      Icon(error ? LucideIcons.circleAlert : LucideIcons.circleCheck, size: 18, color: error ? context.palette.danger : AppColors.primaryDark),
      const SizedBox(width: 10),
      Expanded(child: Text(message)),
    ]),
    duration: Duration(seconds: actionLabel != null ? 5 : 3),
    action: actionLabel != null && onAction != null ? SnackBarAction(label: actionLabel, onPressed: onAction) : null,
  ));
}

/// Standard modal bottom sheet (rounded, drag handle, keyboard-safe, scroll-safe).
Future<T?> showPremiumSheet<T>(BuildContext context, {required Widget Function(BuildContext) builder}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
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
Future<bool> confirmAction(BuildContext context, {required String title, required String message, String? confirmLabel, bool destructive = false}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actionsPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('Cancel', 'إلغاء'))),
        FilledButton(
          style: destructive ? FilledButton.styleFrom(backgroundColor: ctx.palette.danger, foregroundColor: Colors.white) : null,
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(confirmLabel ?? tr('Confirm', 'تأكيد')),
        ),
      ],
    ),
  );
  return ok ?? false;
}
