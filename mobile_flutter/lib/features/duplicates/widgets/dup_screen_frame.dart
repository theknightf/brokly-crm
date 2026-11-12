import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../core/widgets/premium.dart';

/// Frame used by the duplicates / import-history screens.
///
/// Embedded in the shell it adds no app bar (only a subtitle row with refresh); when the screen is
/// pushed on its own (the navigator can pop) it also shows a back button and the title. It owns a
/// Scaffold so SnackBars and bottom sheets work in both situations.
class DupScreenFrame extends StatelessWidget {
  final String title;
  final String subtitle;
  final VoidCallback? onRefresh;
  final bool refreshing;
  final Widget body;
  const DupScreenFrame({
    super.key,
    required this.title,
    required this.subtitle,
    required this.body,
    this.onRefresh,
    this.refreshing = false,
  });

  @override
  Widget build(BuildContext context) {
    final standalone = Navigator.of(context).canPop();
    return Scaffold(
      backgroundColor: standalone ? Theme.of(context).scaffoldBackgroundColor : Colors.transparent,
      body: SafeArea(
        bottom: false,
        top: standalone,
        child: Column(
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(standalone ? 4 : 16, 6, 8, 0),
              child: Row(children: [
                if (standalone)
                  IconButton(
                    tooltip: 'Back',
                    constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: const Icon(LucideIcons.arrowLeft, size: 20),
                  ),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    if (standalone)
                      Text(title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Surf.text(context))),
                    Text(subtitle, style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
                  ]),
                ),
                IconButton(
                  tooltip: 'Refresh',
                  constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                  onPressed: refreshing ? null : onRefresh,
                  icon: refreshing
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(LucideIcons.refreshCw, size: 18),
                ),
              ]),
            ),
            Expanded(child: body),
          ],
        ),
      ),
    );
  }
}

/// Tiny uppercase caption + value block used inside cards.
class DupInfoBlock extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const DupInfoBlock({super.key, required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(12)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Row(children: [
          Icon(icon, size: 12, color: Surf.subtext(context)),
          const SizedBox(width: 5),
          Expanded(
            child: Text(label.toUpperCase(),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: .4, color: Surf.subtext(context))),
          ),
        ]),
        const SizedBox(height: 4),
        Text(value.isEmpty ? '—' : value,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Surf.text(context))),
      ]),
    );
  }
}

const tabularFigures = [FontFeature.tabularFigures()];
