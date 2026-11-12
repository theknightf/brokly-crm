import 'package:flutter/material.dart';
import 'package:intl/intl.dart' show DateFormat, NumberFormat;
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';

/// Shared helpers for the Admin / Teams screens (formatting, forms, loaders).

class AdminFmt {
  static final NumberFormat _int = NumberFormat('#,##0', 'en_US');
  static final NumberFormat _dec = NumberFormat('#,##0.##', 'en_US');

  static String number(num? v) => _int.format(v ?? 0);
  static String decimal(num? v) => _dec.format(v ?? 0);
  static String money(num? v) => 'EGP ${_dec.format(v ?? 0)}';

  static String date(dynamic v) {
    final d = parse(v);
    return d == null ? '—' : DateFormat('d MMM yyyy').format(d);
  }

  static String dateTime(dynamic v) {
    final d = parse(v);
    return d == null ? '—' : DateFormat('d MMM yyyy, HH:mm').format(d.toLocal());
  }

  static String time(dynamic v) {
    final d = parse(v);
    return d == null ? '—' : DateFormat('HH:mm').format(d.toLocal());
  }

  static DateTime? parse(dynamic v) {
    if (v == null) return null;
    if (v is DateTime) return v;
    return DateTime.tryParse(v.toString());
  }

  static String iso(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

  static String duration(int seconds) {
    final h = seconds ~/ 3600;
    final m = ((seconds % 3600) / 60).round();
    return h > 0 ? '${h}h ${m}m' : '${m}m';
  }

  static String label(String? raw) {
    if (raw == null || raw.isEmpty) return '—';
    return raw
        .replaceAll('_', ' ')
        .split(' ')
        .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
        .join(' ');
  }

  static String initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
  }
}

const List<FontFeature> kTabular = [FontFeature.tabularFigures()];

void adminSnack(BuildContext context, String message, {bool error = false}) {
  if (!context.mounted) return;
  final m = ScaffoldMessenger.maybeOf(context);
  m?.hideCurrentSnackBar();
  m?.showSnackBar(SnackBar(
    content: Text(message),
    backgroundColor: error ? AppColors.alertRed : null,
    behavior: SnackBarBehavior.floating,
    duration: Duration(seconds: error ? 4 : 2),
  ));
}

String adminErr(Object e) {
  final s = e.toString();
  return s.replaceFirst('Exception: ', '').replaceFirst(RegExp(r'^PostgrestException\(message: '), '');
}

/// Shown when a non-admin reaches an admin-only screen.
class AdminAccessDenied extends StatelessWidget {
  final String message;
  const AdminAccessDenied({
    super.key,
    this.message = 'Only admins and owners can open this area. Contact your administrator if you need access.',
  });

  @override
  Widget build(BuildContext context) =>
      EmptyState(icon: LucideIcons.shieldAlert, title: 'Access denied', message: message);
}

/// Loads data once, shows skeleton / error+retry, and supports pull-to-refresh.
class AdminLoader<T> extends StatefulWidget {
  final Future<T> Function() loader;
  final List<Widget> Function(BuildContext context, T data, Future<void> Function() reload) builder;
  final EdgeInsets padding;
  final Widget? header;

  const AdminLoader({
    super.key,
    required this.loader,
    required this.builder,
    this.padding = const EdgeInsets.fromLTRB(16, 8, 16, 96),
    this.header,
  });

  @override
  State<AdminLoader<T>> createState() => AdminLoaderState<T>();
}

class AdminLoaderState<T> extends State<AdminLoader<T>> {
  T? _data;
  Object? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    reload(initial: true);
  }

  Future<void> reload({bool initial = false}) async {
    if (!initial && mounted) setState(() => _error = null);
    try {
      final d = await widget.loader();
      if (!mounted) return;
      setState(() {
        _data = d;
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    Widget body;
    if (_loading) {
      body = const SkeletonList();
    } else if (_error != null && _data == null) {
      body = ErrorState(
        message: adminErr(_error!),
        onRetry: () {
          setState(() => _loading = true);
          reload(initial: true);
        },
      );
    } else {
      final children = widget.builder(context, _data as T, reload);
      body = RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: widget.padding,
          children: children,
        ),
      );
    }
    if (widget.header == null) return body;
    return Column(children: [widget.header!, Expanded(child: body)]);
  }
}

/// Scrollable empty placeholder that still allows pull-to-refresh.
class AdminEmptyBlock extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? message;
  const AdminEmptyBlock({super.key, this.icon = LucideIcons.inbox, required this.title, this.message});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 48),
        child: EmptyState(icon: icon, title: title, message: message),
      );
}

/// 48dp primary button with built-in busy state.
class AdminButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final bool busy;
  final bool outlined;
  final bool destructive;

  const AdminButton({
    super.key,
    required this.label,
    this.icon,
    this.onPressed,
    this.busy = false,
    this.outlined = false,
    this.destructive = false,
  });

  @override
  Widget build(BuildContext context) {
    final child = Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (busy)
          const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
        else if (icon != null)
          Icon(icon, size: 16),
        if (busy || icon != null) const SizedBox(width: 8),
        Flexible(child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis)),
      ],
    );
    const size = Size(48, 48);
    final cb = busy ? null : onPressed;
    if (outlined) {
      return OutlinedButton(
        onPressed: cb,
        style: OutlinedButton.styleFrom(
          minimumSize: size,
          foregroundColor: destructive ? AppColors.alertRed : null,
        ),
        child: child,
      );
    }
    return FilledButton(
      onPressed: cb,
      style: FilledButton.styleFrom(
        minimumSize: size,
        backgroundColor: destructive ? AppColors.alertRed : null,
        foregroundColor: destructive ? Colors.white : null,
      ),
      child: child,
    );
  }
}

/// Labelled text field used in every form sheet.
class AdminField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final String? hint;
  final TextInputType? keyboard;
  final int maxLines;
  final String? errorText;
  final bool obscure;
  final ValueChanged<String>? onChanged;
  final TextDirection? direction;

  const AdminField({
    super.key,
    required this.label,
    required this.controller,
    this.hint,
    this.keyboard,
    this.maxLines = 1,
    this.errorText,
    this.obscure = false,
    this.onChanged,
    this.direction,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextField(
        controller: controller,
        keyboardType: keyboard,
        maxLines: maxLines,
        obscureText: obscure,
        onChanged: onChanged,
        textDirection: direction,
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          errorText: errorText,
          filled: true,
          fillColor: Surf.muted(context),
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
        ),
      ),
    );
  }
}

/// Tap-to-pick date field. Value is an ISO yyyy-MM-dd string (or null).
class AdminDateField extends StatelessWidget {
  final String label;
  final String? value;
  final ValueChanged<String> onChanged;
  final DateTime? first;
  final DateTime? last;

  const AdminDateField({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.first,
    this.last,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () async {
          final initial = AdminFmt.parse(value) ?? DateTime.now();
          final d = await showDatePicker(
            context: context,
            initialDate: initial,
            firstDate: first ?? DateTime(2020),
            lastDate: last ?? DateTime(2100),
          );
          if (d != null) onChanged(AdminFmt.iso(d));
        },
        child: InputDecorator(
          decoration: InputDecoration(
            labelText: label,
            filled: true,
            fillColor: Surf.muted(context),
            suffixIcon: const Icon(LucideIcons.calendar, size: 18),
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
          ),
          child: Text(
            value == null || value!.isEmpty ? 'Select date' : AdminFmt.date(value),
            style: TextStyle(color: value == null ? Surf.subtext(context) : Surf.text(context)),
          ),
        ),
      ),
    );
  }
}

/// Labelled dropdown with 48dp+ height.
class AdminDropdown<T> extends StatelessWidget {
  final String label;
  final T? value;
  final List<DropdownMenuItem<T>> items;
  final ValueChanged<T?> onChanged;

  const AdminDropdown({
    super.key,
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: DropdownButtonFormField<T>(
        initialValue: value,
        isExpanded: true,
        items: items,
        onChanged: onChanged,
        decoration: InputDecoration(
          labelText: label,
          filled: true,
          fillColor: Surf.muted(context),
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
        ),
      ),
    );
  }
}

/// Standard sheet body: title, scrollable content, bottom padding.
class AdminSheetBody extends StatelessWidget {
  final String title;
  final String? subtitle;
  final List<Widget> children;
  const AdminSheetBody({super.key, required this.title, this.subtitle, required this.children});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(title, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Surf.text(context))),
          if (subtitle != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(subtitle!, style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
            ),
          const SizedBox(height: 16),
          ...children,
        ],
      ),
    );
  }
}

class AdminAvatar extends StatelessWidget {
  final String name;
  final double size;
  const AdminAvatar(this.name, {super.key, this.size = 42});

  @override
  Widget build(BuildContext context) {
    final accent = Surf.accent(context);
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: accent.withAlpha(36), shape: BoxShape.circle),
      child: Text(
        AdminFmt.initials(name),
        style: TextStyle(fontSize: size * 0.34, fontWeight: FontWeight.w800, color: accent),
      ),
    );
  }
}

/// Horizontal score bar (0-100).
class AdminScoreBar extends StatelessWidget {
  final String label;
  final num value;
  final Color color;
  const AdminScoreBar({super.key, required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    final v = value.clamp(0, 100).toDouble();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Expanded(
            child: Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 11.5, color: Surf.subtext(context))),
          ),
          Text('${value.round()}',
              style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w800, color: Surf.text(context), fontFeatures: kTabular)),
        ]),
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(99),
          child: LinearProgressIndicator(
            value: v / 100,
            minHeight: 6,
            color: color,
            backgroundColor: Surf.muted(context),
          ),
        ),
      ],
    );
  }
}

/// Five-star picker / display.
class AdminStars extends StatelessWidget {
  final double value;
  final ValueChanged<int>? onChanged;
  const AdminStars({super.key, required this.value, this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (i) {
        final on = i < value.round();
        final icon = Icon(
          on ? Icons.star_rounded : Icons.star_outline_rounded,
          size: 28,
          color: on ? AppColors.amber : Surf.subtext(context),
        );
        if (onChanged == null) return icon;
        return InkResponse(
          onTap: () => onChanged!(i + 1),
          radius: 24,
          child: SizedBox(width: 48, height: 48, child: Center(child: icon)),
        );
      }),
    );
  }
}

/// Switch tile used in settings forms.
class AdminSwitchRow extends StatelessWidget {
  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;
  const AdminSwitchRow({super.key, required this.label, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return SwitchListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Surf.text(context))),
      value: value,
      onChanged: onChanged,
    );
  }
}

/// Two-up grid of metric tiles that never overflows.
class AdminMetricGrid extends StatelessWidget {
  final List<Widget> tiles;
  const AdminMetricGrid({super.key, required this.tiles});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      final w = (c.maxWidth - 10) / 2;
      return Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [for (final t in tiles) SizedBox(width: w, child: t)],
      );
    });
  }
}

/// Chip row for use INSIDE a padded list (no extra side inset), 48dp tall.
class AdminChipRow<T> extends StatelessWidget {
  final List<T> options;
  final T selected;
  final String Function(T) labelOf;
  final ValueChanged<T> onSelected;
  const AdminChipRow({
    super.key,
    required this.options,
    required this.selected,
    required this.labelOf,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    final accent = Surf.accent(context);
    return SizedBox(
      height: 48,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: options.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final o = options[i];
          final on = o == selected;
          return Center(
            child: ChoiceChip(
              label: Text(labelOf(o)),
              selected: on,
              onSelected: (_) => onSelected(o),
              showCheckmark: false,
              materialTapTargetSize: MaterialTapTargetSize.padded,
              labelStyle: TextStyle(
                  fontSize: 12.5, fontWeight: FontWeight.w700, color: on ? Colors.black : Surf.subtext(context)),
              selectedColor: accent,
              backgroundColor: Surf.muted(context),
              side: BorderSide.none,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
            ),
          );
        },
      ),
    );
  }
}

/// Muted info banner (used for "available on web only" notes).
class AdminNote extends StatelessWidget {
  final String text;
  final IconData icon;
  const AdminNote(this.text, {super.key, this.icon = LucideIcons.info});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(14)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, size: 16, color: Surf.subtext(context)),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: TextStyle(fontSize: 12.5, color: Surf.subtext(context)))),
      ]),
    );
  }
}
