import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/premium.dart';
import '../../../data/models/duplicates_models.dart';
import 'dup_screen_frame.dart';

class DuplicateCard extends StatelessWidget {
  final DuplicateItem item;
  final bool busy;
  final VoidCallback onMerge;
  final VoidCallback onSeparate;
  final VoidCallback onDismiss;
  final VoidCallback? onOpenLead;

  const DuplicateCard({
    super.key,
    required this.item,
    required this.busy,
    required this.onMerge,
    required this.onSeparate,
    required this.onDismiss,
    this.onOpenLead,
  });

  @override
  Widget build(BuildContext context) {
    final diffs = differingDuplicateFields(item.existing, item.submitted).toSet();
    final rows = kDuplicateFields
        .where((f) =>
            duplicateDisplayValue(f.key, item.existing?[f.key]).isNotEmpty ||
            duplicateDisplayValue(f.key, item.submitted[f.key]).isNotEmpty)
        .toList();
    final newNotes = item.submitted['notes']?.toString().trim() ?? '';
    final oldNotes = item.existing?['notes']?.toString().trim() ?? '';
    final dup = item.duplicateLead;
    final repOriginal = item.currentOwner?.name ?? '—';
    final repDuplicate = dup?.assignedTo?.name ?? item.attemptedBy?.name ?? '—';
    final stageOriginal = item.existing?['stage']?.toString() ?? '—';
    final stageDuplicate = dup?.stage ?? item.submitted['stage']?.toString() ?? '—';
    final isExisting = item.source == 'existing';

    final meta = <_Cmp>[
      _Cmp('Created', fmtDateTime(item.existing?['created_at']?.toString()), fmtDateTime(dup?.createdAt ?? item.createdAt), false),
      _Cmp('Assigned rep', repOriginal, repDuplicate, repOriginal != repDuplicate),
      _Cmp('Status', stageOriginal, stageDuplicate, stageOriginal != stageDuplicate),
      _Cmp('Actions', item.originalActions.label, isExisting ? (item.duplicateActions?.label ?? '—') : '—', false),
    ];

    return PremiumCard(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(item.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Surf.text(context))),
        const SizedBox(height: 8),
        Wrap(spacing: 6, runSpacing: 6, children: [
          StatusPill(item.matchType == 'email' ? 'Email match' : 'Phone match',
              color: Surf.accent(context), icon: item.matchType == 'email' ? LucideIcons.mail : LucideIcons.phone),
          if (item.attemptCount > 1)
            StatusPill('Tried ${item.attemptCount}×', color: AppColors.amber, icon: LucideIcons.repeat),
          if (!item.isPending)
            StatusPill(
              '${_statusLabel(item.status)}${item.resolvedBy != null ? ' by ${item.resolvedBy!.name}' : ''} · ${fmtDateTime(item.resolvedAt)}',
              color: item.status == 'dismissed' ? Surf.subtext(context) : AppColors.statusInterested,
            ),
        ]),
        const SizedBox(height: 14),
        LayoutBuilder(builder: (context, c) {
          final w = (c.maxWidth - 8) / 2;
          Widget cell(Widget child) => SizedBox(width: w, child: child);
          return Wrap(spacing: 8, runSpacing: 8, children: [
            cell(DupInfoBlock(icon: LucideIcons.userPlus, label: 'Original added by', value: item.originalAddedBy?.name ?? '')),
            cell(DupInfoBlock(icon: LucideIcons.userCheck, label: 'First owner', value: item.firstOwner?.name ?? '')),
            cell(DupInfoBlock(
                icon: LucideIcons.userPlus,
                label: isExisting ? 'Duplicate added by' : 'Duplicate attempted by',
                value: item.attemptedBy?.name ?? '')),
            cell(DupInfoBlock(
                icon: LucideIcons.clock,
                label: isExisting ? 'Added' : 'Attempted',
                value: fmtDateTime(item.createdAt) +
                    (item.attemptCount > 1 ? '\nLast: ${fmtDateTime(item.lastAttemptAt)}' : ''))),
          ]);
        }),
        if (item.currentOwner != null && item.firstOwner != null && item.currentOwner!.id != item.firstOwner!.id)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text('Current owner of the lead: ${item.currentOwner!.name}',
                style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
          ),
        const SizedBox(height: 14),
        if (item.existing == null)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(12)),
            child: Text(
              'The original lead is no longer available to your account.',
              style: TextStyle(fontSize: 13, color: Surf.subtext(context)),
            ),
          )
        else ...[
          for (final m in meta) _CompareRow(label: m.label, existing: m.existing, incoming: m.incoming, differs: m.differs),
          for (final f in rows)
            _CompareRow(
              label: f.label,
              existing: duplicateDisplayValue(f.key, item.existing?[f.key]),
              incoming: duplicateDisplayValue(f.key, item.submitted[f.key]),
              differs: diffs.contains(f.key),
              strongIncoming: diffs.contains(f.key),
            ),
          if (newNotes.isNotEmpty || oldNotes.isNotEmpty)
            _CompareRow(label: 'Notes', existing: oldNotes, incoming: newNotes, differs: newNotes.isNotEmpty && newNotes != oldNotes),
          if (onOpenLead != null)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: onOpenLead,
                icon: const Icon(LucideIcons.externalLink, size: 14),
                label: const Text('Open the existing lead'),
              ),
            ),
        ],
        if (item.isPending) ...[
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: busy ? null : onDismiss,
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                icon: const Icon(LucideIcons.x, size: 16),
                label: const Text('Dismiss'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: busy ? null : onSeparate,
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                icon: const Icon(LucideIcons.split, size: 16),
                label: const Text('Separate'),
              ),
            ),
          ]),
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed: busy || item.existing == null ? null : onMerge,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            icon: busy
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(LucideIcons.gitMerge, size: 16),
            label: const Text('Merge'),
          ),
        ],
      ]),
    );
  }

  static String _statusLabel(String s) =>
      s == 'merged' ? 'Merged' : (s == 'separated' ? 'Separated' : 'Dismissed');
}

class _Cmp {
  final String label;
  final String existing;
  final String incoming;
  final bool differs;
  _Cmp(this.label, this.existing, this.incoming, this.differs);
}

class _CompareRow extends StatelessWidget {
  final String label;
  final String existing;
  final String incoming;
  final bool differs;
  final bool strongIncoming;
  const _CompareRow({
    required this.label,
    required this.existing,
    required this.incoming,
    required this.differs,
    this.strongIncoming = false,
  });

  @override
  Widget build(BuildContext context) {
    Widget side(String caption, String v, {bool strong = false}) => Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(caption.toUpperCase(),
                style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w700, letterSpacing: .4, color: Surf.subtext(context))),
            const SizedBox(height: 2),
            Text(v.isEmpty ? '—' : v,
                style: TextStyle(
                    fontSize: 13,
                    height: 1.3,
                    fontWeight: strong ? FontWeight.w800 : FontWeight.w500,
                    color: v.isEmpty ? Surf.subtext(context) : Surf.text(context),
                    fontFeatures: tabularFigures)),
          ]),
        );
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: differs ? AppColors.amber.withAlpha(Surf.dark(context) ? 28 : 22) : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: differs ? AppColors.amber.withAlpha(110) : Surf.border(context)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(differs ? '$label (differs)' : label,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Surf.subtext(context))),
        const SizedBox(height: 6),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          side('Original', existing),
          const SizedBox(width: 10),
          side('Duplicate', incoming, strong: strongIncoming),
        ]),
      ]),
    );
  }
}
