import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/services/inventory_service.dart';

/// Shared UI helpers for the Projects / Units / Locations / Workspace modules.

final NumberFormat _egpFmt = NumberFormat('#,###', 'en_US');

/// "EGP 1,250,000", or an em dash when missing / not positive.
String formatEgp(num? n) {
  if (n == null || !n.isFinite || n <= 0) return '—';
  return 'EGP ${_egpFmt.format(n.round())}';
}

/// "1,250,000" without the currency prefix (null-safe).
String formatNumber(num? n) => (n == null || !n.isFinite) ? '—' : _egpFmt.format(n.round());

const List<FontFeature> tabularFigures = [FontFeature.tabularFigures()];

/// Status colours shared by projects and units.
Color moduleStatusColor(String status) {
  switch (status) {
    case 'Available':
    case 'Active':
      return const Color(0xFF16A34A);
    case 'Reserved':
      return AppColors.amber;
    case 'Sold':
      return const Color(0xFF2563EB);
    case 'Inactive':
      return const Color(0xFF64748B);
    default:
      return const Color(0xFF64748B);
  }
}

void showModuleSnack(BuildContext context, String message, {bool error = false}) {
  final m = ScaffoldMessenger.maybeOf(context);
  if (m == null) return;
  m.hideCurrentSnackBar();
  m.showSnackBar(SnackBar(
    content: Text(message),
    behavior: SnackBarBehavior.floating,
    backgroundColor: error ? AppColors.alertRed : null,
    duration: const Duration(seconds: 3),
  ));
}

String friendlyError(Object e) {
  final s = e.toString();
  if (s.startsWith('Exception: ')) return s.substring(11);
  if (e is Error) return 'Something went wrong. Please try again.';
  return s.length > 160 ? '${s.substring(0, 160)}…' : s;
}

/// Page wrapper: transparent and app-bar-less when embedded in the shell, with
/// its own app bar when pushed standalone ([showAppBar] = true).
class ModulePage extends StatelessWidget {
  final String title;
  final bool showAppBar;
  final Widget body;
  final Widget? fab;
  final List<Widget>? actions;

  const ModulePage({
    super.key,
    required this.title,
    required this.showAppBar,
    required this.body,
    this.fab,
    this.actions,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: showAppBar ? null : Colors.transparent,
      appBar: showAppBar ? AppBar(title: Text(title), actions: actions) : null,
      floatingActionButton: fab,
      body: body,
    );
  }
}

/// Image resolved from a private storage bucket (signed URL) with a branded fallback.
class BucketImage extends StatelessWidget {
  final String bucket;
  final String path;
  final double? width;
  final double? height;
  final double radius;
  final IconData fallbackIcon;
  final BoxFit fit;

  const BucketImage({
    super.key,
    required this.bucket,
    required this.path,
    this.width,
    this.height,
    this.radius = 0,
    this.fallbackIcon = LucideIcons.building,
    this.fit = BoxFit.cover,
  });

  Widget _fallback(BuildContext context) {
    final dark = Surf.dark(context);
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: dark
              ? const [Color(0xFF1A2612), Color(0xFF13171F)]
              : const [Color(0xFFF2F7E8), Color(0xFFDDE9C6)],
        ),
      ),
      alignment: Alignment.center,
      child: Icon(fallbackIcon, size: ((height ?? 48) * 0.36).clamp(18, 40).toDouble(), color: Surf.subtext(context)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final child = path.isEmpty
        ? _fallback(context)
        : FutureBuilder<String>(
            future: InventoryStorage.signedUrl(bucket, path),
            builder: (ctx, snap) {
              final url = snap.data ?? '';
              if (url.isEmpty) return _fallback(ctx);
              return Image.network(
                url,
                width: width,
                height: height,
                fit: fit,
                gaplessPlayback: true,
                cacheWidth: width != null && width!.isFinite ? (width! * 2).round() : 800,
                errorBuilder: (c, _, __) => _fallback(c),
                loadingBuilder: (c, w, p) => p == null ? w : _fallback(c),
              );
            },
          );
    return ClipRRect(borderRadius: BorderRadius.circular(radius), child: child);
  }
}

/// Filled input decoration used by every form in these modules.
InputDecoration moduleInput(BuildContext context, String label, {String? hint, Widget? prefix, String? suffix}) {
  return InputDecoration(
    labelText: label,
    hintText: hint,
    prefixIcon: prefix,
    suffixText: suffix,
    filled: true,
    fillColor: Surf.muted(context),
    isDense: false,
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
    focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: Surf.accent(context), width: 1.5)),
    errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.alertRed)),
    focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.alertRed, width: 1.5)),
  );
}

typedef PickOption = ({String value, String label});

/// Bottom-sheet single select. Returns null when dismissed (so "All" with an
/// empty value is distinguishable from cancelling).
Future<({String value})?> pickOption(
  BuildContext context, {
  required String title,
  required List<PickOption> options,
  String? selected,
}) {
  return showPremiumSheet<({String value})>(
    context,
    builder: (ctx) => Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 6),
          child: Text(title, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Surf.text(ctx))),
        ),
        Flexible(
          child: ListView.builder(
            shrinkWrap: true,
            padding: const EdgeInsets.only(bottom: 16),
            itemCount: options.length,
            itemBuilder: (_, i) {
              final o = options[i];
              final on = o.value == selected;
              return ListTile(
                minTileHeight: 52,
                title: Text(o.label, maxLines: 2, overflow: TextOverflow.ellipsis),
                trailing: on ? Icon(LucideIcons.check, size: 18, color: Surf.accent(ctx)) : null,
                onTap: () => Navigator.pop(ctx, (value: o.value)),
              );
            },
          ),
        ),
      ],
    ),
  );
}

/// Tappable field that looks like an input and opens [pickOption].
class PickerField extends StatelessWidget {
  final String label;
  final String valueLabel;
  final VoidCallback onTap;
  final String? errorText;
  const PickerField({super.key, required this.label, required this.valueLabel, required this.onTap, this.errorText});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: InputDecorator(
        decoration: moduleInput(context, label).copyWith(
          errorText: errorText,
          suffixIcon: const Icon(LucideIcons.chevronDown, size: 18),
        ),
        child: Text(
          valueLabel.isEmpty ? '—' : valueLabel,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(fontSize: 15, color: Surf.text(context)),
        ),
      ),
    );
  }
}

/// Square-ish 48dp icon button used in card action rows.
class ModuleIconButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final Color? color;
  const ModuleIconButton({super.key, required this.icon, required this.tooltip, this.onPressed, this.color});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: tooltip,
      constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
      onPressed: onPressed,
      icon: Icon(icon, size: 19, color: color ?? Surf.subtext(context)),
    );
  }
}

/// Small coloured count chip ("12 Available").
class CountChip extends StatelessWidget {
  final String label;
  final Color color;
  const CountChip(this.label, this.color, {super.key});

  @override
  Widget build(BuildContext context) {
    final dark = Surf.dark(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withAlpha(dark ? 40 : 28), borderRadius: BorderRadius.circular(999)),
      child: Text(label,
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color, fontFeatures: tabularFigures)),
    );
  }
}

/// Section title + body for long-form text (hidden when empty).
class TextSection extends StatelessWidget {
  final String title;
  final String body;
  const TextSection(this.title, this.body, {super.key});

  @override
  Widget build(BuildContext context) {
    if (body.trim().isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title.toUpperCase(),
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.8, color: Surf.subtext(context))),
        const SizedBox(height: 6),
        Text(body, style: TextStyle(fontSize: 14, height: 1.45, color: Surf.text(context))),
      ]),
    );
  }
}
