import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart' show DateFormat, NumberFormat;
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/premium.dart';

/// Brand chart palette (lime first, like the web `COLORS`).
const List<Color> kChartColors = [
  Color(0xFF84CC16),
  Color(0xFF06B6D4),
  Color(0xFFF59E0B),
  Color(0xFF8B5CF6),
  Color(0xFF22C55E),
  Color(0xFFEF4444),
  Color(0xFF3B82F6),
  Color(0xFFEC4899),
];

const List<FontFeature> kTabular = [FontFeature.tabularFigures()];

final NumberFormat _intFmt = NumberFormat('#,###', 'en_US');
String fmtInt(num? n) => _intFmt.format((n ?? 0).round());
String fmtDec(num? n, [int digits = 1]) => (n ?? 0).toStringAsFixed(digits);

String fmtDuration(int seconds) {
  final s = seconds < 0 ? 0 : seconds;
  if (s == 0) return '-';
  final m = s ~/ 60;
  final r = s % 60;
  return m > 0 ? '${m}m ${r}s' : '${r}s';
}

String fmtMinutes(int seconds) {
  final m = (seconds / 60).round();
  if (m >= 60) return '${m ~/ 60}h ${m % 60}m';
  return '${m}m';
}

String fmtMmSs(int seconds) {
  final s = seconds < 0 ? 0 : seconds;
  return '${(s ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';
}

String fmtDateTime(DateTime? d) {
  if (d == null) return '—';
  return DateFormat('dd MMM, HH:mm').format(d.toLocal());
}

/// "+201012345678" -> "+20 10******" (same masking as the web analytics table).
String maskPhone(String? phone) {
  final raw = (phone ?? '').trim();
  if (raw.isEmpty) return '—';
  final digits = raw.replaceAll(RegExp(r'\D'), '');
  if (digits.length < 8) return raw;
  final national = digits.startsWith('0020')
      ? digits.substring(4)
      : (digits.startsWith('20') && digits.length >= 12)
          ? digits.substring(2)
          : digits.replaceFirst(RegExp('^0'), '');
  if (national.length < 2) return raw;
  return '+20 ${national.substring(0, 2)}${'*' * math.max(6, national.length - 2)}';
}

String initialsOf(String? name) {
  final parts = (name ?? '').trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).take(2).toList();
  if (parts.isEmpty) return '?';
  return parts.map((p) => p[0]).join().toUpperCase();
}

/// Builds CSV text (quoted values, formula injection neutralised) and copies it.
String toCsv(List<String> header, List<List<Object?>> rows) {
  String cell(Object? v) {
    var s = (v ?? '').toString();
    if (RegExp(r'^[=+\-@]').hasMatch(s)) s = "'$s";
    return '"${s.replaceAll('"', '""')}"';
  }

  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

Future<void> copyText(BuildContext context, String text, String message) async {
  await Clipboard.setData(ClipboardData(text: text));
  if (!context.mounted) return;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message), behavior: SnackBarBehavior.floating, duration: const Duration(seconds: 2)));
}

void showInfo(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message), behavior: SnackBarBehavior.floating, duration: const Duration(seconds: 3)));
}

/// Titled card used by every report block.
class ReportCard extends StatelessWidget {
  final String? title;
  final String? subtitle;
  final Widget? trailing;
  final Widget child;
  final EdgeInsetsGeometry padding;

  const ReportCard({super.key, this.title, this.subtitle, this.trailing, required this.child, this.padding = const EdgeInsets.all(16)});

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      padding: padding,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(title!, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: Surf.text(context))),
                    if (subtitle != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(subtitle!, style: TextStyle(fontSize: 12, height: 1.3, color: Surf.subtext(context))),
                      ),
                  ]),
                ),
                if (trailing != null) ...[const SizedBox(width: 8), trailing!],
              ]),
            ),
          child,
        ],
      ),
    );
  }
}

/// KPI with optional "vs previous period" delta.
class KpiCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final double? delta;

  const KpiCard({super.key, required this.label, required this.value, required this.icon, required this.color, this.delta});

  @override
  Widget build(BuildContext context) {
    Color? dc;
    String? dt;
    if (delta != null) {
      final abs = delta!.abs();
      final dir = abs < 0.05 ? 0 : (delta! > 0 ? 1 : -1);
      dc = dir > 0 ? AppColors.accent : (dir < 0 ? AppColors.alertRed : Surf.subtext(context));
      dt = '${dir > 0 ? '↑' : dir < 0 ? '↓' : '•'} ${delta! > 0 ? '+' : ''}${abs.toStringAsFixed(1)}%';
      if (Surf.dark(context) == false && dir > 0) dc = AppColors.primaryHover;
    }
    return PremiumCard(
      margin: EdgeInsets.zero,
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(color: color.withAlpha(34), borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, size: 16, color: color),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Surf.subtext(context))),
          ),
        ]),
        const SizedBox(height: 10),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: AlignmentDirectional.centerStart,
          child: Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Surf.text(context), fontFeatures: kTabular)),
        ),
        if (dt != null)
          Padding(
            padding: const EdgeInsets.only(top: 3),
            child: Text.rich(TextSpan(children: [
              TextSpan(text: dt, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: dc, fontFeatures: kTabular)),
              TextSpan(text: '  vs prev.', style: TextStyle(fontSize: 11, color: Surf.subtext(context))),
            ])),
          ),
      ]),
    );
  }
}

/// Two-up responsive grid that never overflows (children keep natural height).
class TwoUp extends StatelessWidget {
  final List<Widget> children;
  final double gap;
  const TwoUp({super.key, required this.children, this.gap = 12});

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (var i = 0; i < children.length; i += 2) {
      rows.add(Padding(
        padding: EdgeInsets.only(bottom: i + 2 < children.length ? gap : 0),
        child: IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Expanded(child: children[i]),
            SizedBox(width: gap),
            Expanded(child: i + 1 < children.length ? children[i + 1] : const SizedBox.shrink()),
          ]),
        ),
      ));
    }
    return Column(children: rows);
  }
}

/// Number + caption pill for dense rows (agent cards, funnel).
class MiniStat extends StatelessWidget {
  final String label;
  final String value;
  final Color? color;
  const MiniStat({super.key, required this.label, required this.value, this.color});

  @override
  Widget build(BuildContext context) {
    return Column(mainAxisSize: MainAxisSize.min, children: [
      FittedBox(
        fit: BoxFit.scaleDown,
        child: Text(value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: color ?? Surf.text(context), fontFeatures: kTabular)),
      ),
      const SizedBox(height: 2),
      Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 10.5, color: Surf.subtext(context))),
    ]);
  }
}

/// Stage / count chip. Tappable (48dp tall hit area) when [onTap] is given and count > 0.
class CountChip extends StatelessWidget {
  final String label;
  final int count;
  final Color? color;
  final VoidCallback? onTap;
  const CountChip({super.key, required this.label, required this.count, this.color, this.onTap});

  @override
  Widget build(BuildContext context) {
    final c = color ?? Surf.accent(context);
    final tappable = onTap != null && count > 0;
    final chip = Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: c.withAlpha(Surf.dark(context) ? 36 : 26),
        borderRadius: BorderRadius.circular(999),
        border: tappable ? Border.all(color: c.withAlpha(90)) : null,
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Flexible(
          child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: Surf.subtext(context))),
        ),
        const SizedBox(width: 6),
        Text('$count', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Surf.text(context), fontFeatures: kTabular)),
        if (tappable) ...[const SizedBox(width: 3), Icon(LucideIcons.arrowUpRight, size: 11, color: c)],
      ]),
    );
    if (!tappable) return chip;
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: onTap,
      child: ConstrainedBox(constraints: const BoxConstraints(minHeight: 40), child: Center(widthFactor: 1, child: chip)),
    );
  }
}

class ProgressBar extends StatelessWidget {
  final double value; // 0..1
  final Color? color;
  final double height;
  const ProgressBar({super.key, required this.value, this.color, this.height = 8});

  @override
  Widget build(BuildContext context) {
    final c = color ?? Surf.accent(context);
    return ClipRRect(
      borderRadius: BorderRadius.circular(height),
      child: Stack(children: [
        Container(height: height, color: Surf.muted(context)),
        FractionallySizedBox(widthFactor: value.clamp(0, 1).toDouble(), child: Container(height: height, color: c)),
      ]),
    );
  }
}

class InitialsAvatar extends StatelessWidget {
  final String name;
  final double size;
  const InitialsAvatar(this.name, {super.key, this.size = 38});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: Surf.accent(context).withAlpha(34), shape: BoxShape.circle),
      child: Text(initialsOf(name), style: TextStyle(fontSize: size * 0.34, fontWeight: FontWeight.w800, color: Surf.accent(context))),
    );
  }
}

/// Horizontal ranked bars with value + share, drawn with plain containers.
class HBarList extends StatelessWidget {
  final List<MapEntry<String, num>> items;
  final bool showShare;
  final String Function(num)? valueFormat;
  final void Function(String label)? onTap;
  const HBarList({super.key, required this.items, this.showShare = false, this.valueFormat, this.onTap});

  @override
  Widget build(BuildContext context) {
    final total = items.fold<num>(0, (s, e) => s + e.value);
    final maxV = items.fold<num>(0, (m, e) => math.max(m, e.value));
    return Column(children: [
      for (var i = 0; i < items.length; i++)
        InkWell(
          onTap: onTap == null ? null : () => onTap!(items[i].key),
          borderRadius: BorderRadius.circular(10),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 44),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(
                    child: Text(items[i].key, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Surf.text(context))),
                  ),
                  const SizedBox(width: 8),
                  Text(valueFormat != null ? valueFormat!(items[i].value) : fmtInt(items[i].value),
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Surf.text(context), fontFeatures: kTabular)),
                  if (showShare && total > 0) ...[
                    const SizedBox(width: 8),
                    SizedBox(
                      width: 46,
                      child: Text('${(items[i].value / total * 100).toStringAsFixed(1)}%',
                          textAlign: TextAlign.end, style: TextStyle(fontSize: 12, color: Surf.subtext(context), fontFeatures: kTabular)),
                    ),
                  ],
                ]),
                const SizedBox(height: 5),
                ProgressBar(value: maxV > 0 ? (items[i].value / maxV).toDouble() : 0, color: kChartColors[i % kChartColors.length], height: 6),
              ]),
            ),
          ),
        ),
    ]);
  }
}

// ───────────────────────── Charts (CustomPaint) ─────────────────────────

class DonutSlice {
  final String label;
  final num value;
  final Color color;
  const DonutSlice(this.label, this.value, this.color);
}

class DonutChart extends StatelessWidget {
  final List<DonutSlice> slices;
  final String centerLabel;
  final String centerValue;
  final double size;
  const DonutChart({super.key, required this.slices, required this.centerValue, this.centerLabel = 'Total', this.size = 140});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: Stack(alignment: Alignment.center, children: [
        CustomPaint(size: Size(size, size), painter: _DonutPainter(slices, Surf.muted(context))),
        Column(mainAxisSize: MainAxisSize.min, children: [
          Text(centerLabel, style: TextStyle(fontSize: 10.5, color: Surf.subtext(context))),
          Text(centerValue, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Surf.text(context), fontFeatures: kTabular)),
        ]),
      ]),
    );
  }
}

class _DonutPainter extends CustomPainter {
  final List<DonutSlice> slices;
  final Color track;
  _DonutPainter(this.slices, this.track);

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = size.width * 0.13;
    final rect = Rect.fromLTWH(stroke / 2, stroke / 2, size.width - stroke, size.height - stroke);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.butt;
    canvas.drawArc(rect, 0, math.pi * 2, false, paint..color = track);
    final total = slices.fold<num>(0, (s, e) => s + e.value);
    if (total <= 0) return;
    var start = -math.pi / 2;
    const gap = 0.03;
    for (final s in slices) {
      if (s.value <= 0) continue;
      final sweep = (s.value / total) * math.pi * 2;
      canvas.drawArc(rect, start, math.max(0.001, sweep - (slices.length > 1 ? gap : 0)), false, paint..color = s.color);
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(covariant _DonutPainter old) => old.slices != slices || old.track != track;
}

/// Donut + legend row (legend wraps under the chart on narrow widths).
class DonutWithLegend extends StatelessWidget {
  final List<DonutSlice> slices;
  final String centerLabel;
  final String? centerValueOverride;
  const DonutWithLegend({super.key, required this.slices, this.centerLabel = 'Total', this.centerValueOverride});

  @override
  Widget build(BuildContext context) {
    final total = slices.fold<num>(0, (s, e) => s + e.value);
    return LayoutBuilder(builder: (context, c) {
      final legend = Column(children: [
        for (final s in slices)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(children: [
              Container(width: 10, height: 10, decoration: BoxDecoration(color: s.color, shape: BoxShape.circle)),
              const SizedBox(width: 8),
              Expanded(child: Text(s.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, color: Surf.text(context)))),
              const SizedBox(width: 8),
              Text('${fmtInt(s.value)} (${total > 0 ? (s.value / total * 100).round() : 0}%)',
                  style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: Surf.subtext(context), fontFeatures: kTabular)),
            ]),
          ),
      ]);
      final donut = DonutChart(slices: slices, centerValue: centerValueOverride ?? fmtInt(total), centerLabel: centerLabel, size: 132);
      if (c.maxWidth < 330) {
        return Column(children: [donut, const SizedBox(height: 12), legend]);
      }
      return Row(children: [donut, const SizedBox(width: 16), Expanded(child: legend)]);
    });
  }
}

class BarPoint {
  final String label;
  final num value;
  const BarPoint(this.label, this.value);
}

/// Vertical bars with value labels (leads trend, calls per day).
class MiniBarChart extends StatelessWidget {
  final List<BarPoint> points;
  final double height;
  final Color? color;
  const MiniBarChart({super.key, required this.points, this.height = 130, this.color});

  @override
  Widget build(BuildContext context) {
    final maxV = points.fold<num>(0, (m, p) => math.max(m, p.value));
    final c = color ?? Surf.accent(context);
    return SizedBox(
      height: height,
      child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        for (final p in points)
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 3),
              child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                Text(fmtInt(p.value), style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: Surf.subtext(context), fontFeatures: kTabular)),
                const SizedBox(height: 3),
                Flexible(
                  child: FractionallySizedBox(
                    heightFactor: maxV > 0 ? math.max(0.04, (p.value / maxV).toDouble()) : 0.04,
                    child: Container(decoration: BoxDecoration(color: c, borderRadius: const BorderRadius.vertical(top: Radius.circular(6)))),
                  ),
                ),
                const SizedBox(height: 5),
                Text(p.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 10, color: Surf.subtext(context))),
              ]),
            ),
          ),
      ]),
    );
  }
}

class LineSeries {
  final String name;
  final List<num> values;
  final Color color;
  const LineSeries(this.name, this.values, this.color);
}

/// Multi-series line chart with dots, grid and x labels.
class MiniLineChart extends StatelessWidget {
  final List<String> labels;
  final List<LineSeries> series;
  final double height;
  final bool fill;
  const MiniLineChart({super.key, required this.labels, required this.series, this.height = 190, this.fill = false});

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      SizedBox(
        height: height,
        width: double.infinity,
        child: CustomPaint(
          painter: _LinePainter(labels, series, Surf.border(context), Surf.subtext(context), fill),
        ),
      ),
      if (series.length > 1)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Wrap(spacing: 16, runSpacing: 4, children: [
            for (final s in series)
              Row(mainAxisSize: MainAxisSize.min, children: [
                Container(width: 10, height: 10, decoration: BoxDecoration(color: s.color, shape: BoxShape.circle)),
                const SizedBox(width: 6),
                Text(s.name, style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
              ]),
          ]),
        ),
    ]);
  }
}

class _LinePainter extends CustomPainter {
  final List<String> labels;
  final List<LineSeries> series;
  final Color grid;
  final Color text;
  final bool fill;
  _LinePainter(this.labels, this.series, this.grid, this.text, this.fill);

  @override
  void paint(Canvas canvas, Size size) {
    if (labels.isEmpty) return;
    const left = 30.0, bottom = 22.0, top = 8.0, right = 8.0;
    final w = size.width - left - right;
    final h = size.height - bottom - top;
    var maxV = 1.0;
    for (final s in series) {
      for (final v in s.values) {
        maxV = math.max(maxV, v.toDouble());
      }
    }
    // Nice-ish ceiling.
    final step = math.max(1, (maxV / 4).ceil());
    maxV = step * 4.0;

    final gridPaint = Paint()
      ..color = grid
      ..strokeWidth = 1;
    for (var i = 0; i <= 4; i++) {
      final y = top + h - (h * i / 4);
      canvas.drawLine(Offset(left, y), Offset(size.width - right, y), gridPaint);
      _text(canvas, '${step * i}', Offset(0, y - 6), 10, text, maxWidth: left - 4, alignRight: true);
    }

    final n = labels.length;
    double xAt(int i) => n == 1 ? left + w / 2 : left + w * i / (n - 1);
    double yAt(num v) => top + h - (h * (v.toDouble() / maxV));

    // x labels (thin out when crowded).
    final every = n > 8 ? (n / 6).ceil() : 1;
    for (var i = 0; i < n; i += every) {
      _text(canvas, labels[i], Offset(xAt(i) - 22, size.height - 15), 10, text, maxWidth: 44, center: true);
    }

    for (final s in series) {
      if (s.values.isEmpty) continue;
      final path = Path();
      for (var i = 0; i < s.values.length && i < n; i++) {
        final p = Offset(xAt(i), yAt(s.values[i]));
        if (i == 0) {
          path.moveTo(p.dx, p.dy);
        } else {
          path.lineTo(p.dx, p.dy);
        }
      }
      if (fill) {
        final area = Path.from(path)
          ..lineTo(xAt(math.min(s.values.length, n) - 1), top + h)
          ..lineTo(xAt(0), top + h)
          ..close();
        canvas.drawPath(area, Paint()..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [s.color.withAlpha(90), s.color.withAlpha(0)]).createShader(Rect.fromLTWH(left, top, w, h)));
      }
      canvas.drawPath(
        path,
        Paint()
          ..color = s.color
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.4
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round,
      );
      if (n <= 14) {
        for (var i = 0; i < s.values.length && i < n; i++) {
          canvas.drawCircle(Offset(xAt(i), yAt(s.values[i])), 3.4, Paint()..color = s.color);
        }
      }
    }
  }

  void _text(Canvas c, String t, Offset o, double size, Color color, {double maxWidth = 60, bool center = false, bool alignRight = false}) {
    final tp = TextPainter(
      text: TextSpan(text: t, style: TextStyle(fontSize: size, color: color, fontFeatures: kTabular)),
      textDirection: TextDirection.ltr,
      maxLines: 1,
      ellipsis: '…',
    )..layout(maxWidth: maxWidth);
    var dx = o.dx;
    if (center) dx = o.dx + (maxWidth - tp.width) / 2;
    if (alignRight) dx = o.dx + maxWidth - tp.width;
    tp.paint(c, Offset(dx, o.dy));
  }

  @override
  bool shouldRepaint(covariant _LinePainter old) => old.labels != labels || old.series != series || old.grid != grid || old.fill != fill;
}


// ───────────────────────── Pickers / sheets ─────────────────────────

/// Single-choice sheet (optionally searchable). Returns the chosen value; '' for "all".
Future<String?> pickOption(
  BuildContext context, {
  required String title,
  required List<({String value, String label})> options,
  required String selected,
  bool searchable = false,
}) {
  return showPremiumSheet<String>(context, builder: (ctx) {
    return _OptionSheet(title: title, options: options, selected: selected, searchable: searchable);
  });
}

class _OptionSheet extends StatefulWidget {
  final String title;
  final List<({String value, String label})> options;
  final String selected;
  final bool searchable;
  const _OptionSheet({required this.title, required this.options, required this.selected, required this.searchable});

  @override
  State<_OptionSheet> createState() => _OptionSheetState();
}

class _OptionSheetState extends State<_OptionSheet> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final list = widget.options.where((o) => _q.isEmpty || o.label.toLowerCase().contains(_q.toLowerCase())).toList();
    final maxH = MediaQuery.of(context).size.height * 0.7;
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: maxH),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 8),
          child: Align(alignment: Alignment.centerLeft, child: Text(widget.title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Surf.text(context)))),
        ),
        if (widget.searchable)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: AppSearchField(hint: 'Search', onChanged: (v) => setState(() => _q = v)),
          ),
        Flexible(
          child: list.isEmpty
              ? Padding(padding: const EdgeInsets.all(24), child: Text('No matches', style: TextStyle(color: Surf.subtext(context))))
              : ListView.builder(
                  shrinkWrap: true,
                  padding: const EdgeInsets.only(bottom: 16),
                  itemCount: list.length,
                  itemBuilder: (_, i) {
                    final o = list[i];
                    final on = o.value == widget.selected;
                    return ListTile(
                      minTileHeight: 48,
                      title: Text(o.label, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: on ? FontWeight.w800 : FontWeight.w500, color: Surf.text(context))),
                      trailing: on ? Icon(LucideIcons.check, size: 18, color: Surf.accent(context)) : null,
                      onTap: () => Navigator.of(context).pop(o.value),
                    );
                  },
                ),
        ),
      ]),
    );
  }
}

/// Pill button that opens a picker (used for filters). 48dp tall.
class FilterField extends StatelessWidget {
  final String label;
  final String value;
  final bool active;
  final VoidCallback onTap;
  final IconData icon;
  const FilterField({super.key, required this.label, required this.value, required this.active, required this.onTap, this.icon = LucideIcons.chevronDown});

  @override
  Widget build(BuildContext context) {
    final accent = Surf.accent(context);
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 48),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: active ? accent.withAlpha(30) : Surf.muted(context),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: active ? accent.withAlpha(140) : Surf.border(context)),
        ),
        child: Row(children: [
          Expanded(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: TextStyle(fontSize: 10.5, color: Surf.subtext(context))),
              Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Surf.text(context))),
            ]),
          ),
          Icon(icon, size: 16, color: Surf.subtext(context)),
        ]),
      ),
    );
  }
}

/// Date field that opens the Material date picker. Value is 'YYYY-MM-DD' or ''.
class DateFieldButton extends StatelessWidget {
  final String label;
  final String value;
  final ValueChanged<String> onChanged;
  final DateTime? firstDate;
  final DateTime? lastDate;
  const DateFieldButton({super.key, required this.label, required this.value, required this.onChanged, this.firstDate, this.lastDate});

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Expanded(
        child: FilterField(
          label: label,
          value: value.isEmpty ? 'Any' : value,
          active: value.isNotEmpty,
          icon: LucideIcons.calendar,
          onTap: () async {
            final now = DateTime.now();
            final picked = await showDatePicker(
              context: context,
              initialDate: DateTime.tryParse(value) ?? now,
              firstDate: firstDate ?? DateTime(2020),
              lastDate: lastDate ?? DateTime(now.year + 1, 12, 31),
            );
            if (picked != null) {
              onChanged('${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}');
            }
          },
        ),
      ),
      if (value.isNotEmpty)
        IconButton(
          tooltip: 'Clear $label',
          constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
          onPressed: () => onChanged(''),
          icon: const Icon(LucideIcons.x, size: 18),
        ),
    ]);
  }
}

/// Centered loading / empty / error switcher used by every async view.
class AsyncBody extends StatelessWidget {
  final bool loading;
  final String? error;
  final bool empty;
  final String emptyTitle;
  final String? emptyMessage;
  final VoidCallback onRetry;
  final WidgetBuilder builder;
  final int skeletonCount;

  const AsyncBody({
    super.key,
    required this.loading,
    required this.error,
    required this.empty,
    required this.onRetry,
    required this.builder,
    this.emptyTitle = 'No data',
    this.emptyMessage,
    this.skeletonCount = 4,
  });

  @override
  Widget build(BuildContext context) {
    if (loading) return SizedBox(height: skeletonCount * 100.0, child: SkeletonList(count: skeletonCount, height: 88));
    if (error != null) return Padding(padding: const EdgeInsets.symmetric(vertical: 24), child: ErrorState(message: error!, onRetry: onRetry));
    if (empty) return Padding(padding: const EdgeInsets.symmetric(vertical: 24), child: EmptyState(icon: LucideIcons.chartColumn, title: emptyTitle, message: emptyMessage));
    return builder(context);
  }
}

/// Zero-padding variant of [FilterChipRow] for use inside already padded lists.
class InlineChips<T> extends StatelessWidget {
  final List<T> options;
  final T selected;
  final String Function(T) labelOf;
  final ValueChanged<T> onSelected;
  const InlineChips({super.key, required this.options, required this.selected, required this.labelOf, required this.onSelected});

  @override
  Widget build(BuildContext context) {
    final accent = Surf.accent(context);
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
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
            materialTapTargetSize: MaterialTapTargetSize.padded,
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

/// Opens the Leads list filtered to an agent and/or pipeline stage (wired by the shell).
typedef OpenLeadsCallback = void Function({String? agentName, String? stage});
