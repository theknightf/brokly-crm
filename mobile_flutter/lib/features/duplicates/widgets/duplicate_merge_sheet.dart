import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/premium.dart';
import '../../../data/models/duplicates_models.dart';

class MergeChoice {
  final Map<String, String> choices;
  final bool appendNotes;
  const MergeChoice(this.choices, this.appendNotes);
}

/// Field-by-field merge picker. Keep-existing is the default for every differing field; where the
/// existing lead has no value yet the new one is pre-selected. Ownership never changes.
/// Returns null when cancelled. Actual submission (and double-tap guarding) is done by the caller
/// after the sheet closes, so this sheet only collects choices.
Future<MergeChoice?> showDuplicateMergeSheet(BuildContext context, DuplicateItem item) {
  return showPremiumSheet<MergeChoice>(context, builder: (_) => _MergeBody(item: item));
}

class _MergeBody extends StatefulWidget {
  final DuplicateItem item;
  const _MergeBody({required this.item});

  @override
  State<_MergeBody> createState() => _MergeBodyState();
}

class _MergeBodyState extends State<_MergeBody> {
  late final List<String> _fields;
  late final Map<String, String> _choices;
  late bool _append;
  late final String _newNotes;

  @override
  void initState() {
    super.initState();
    final item = widget.item;
    _fields = differingDuplicateFields(item.existing, item.submitted);
    _choices = {
      for (final k in _fields) k: duplicateDisplayValue(k, item.existing?[k]).isNotEmpty ? 'existing' : 'new',
    };
    _newNotes = item.submitted['notes']?.toString().trim() ?? '';
    _append = _newNotes.isNotEmpty;
  }

  String _label(String k) => kDuplicateFields.firstWhere((f) => f.key == k, orElse: () => DuplicateField(k, k)).label;

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final changing = _fields.where((k) => _choices[k] == 'new').length;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Merge into existing lead',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Surf.text(context))),
        const SizedBox(height: 2),
        Text('Keep existing values or pick the new ones, field by field',
            style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
        const SizedBox(height: 16),
        if (_fields.isEmpty)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(12)),
            child: Text(
              'The new submission has no field that differs from the existing lead.'
              '${_newNotes.isNotEmpty ? ' Only the notes can be appended.' : ' Merging will just close this duplicate.'}',
              style: TextStyle(fontSize: 13, color: Surf.subtext(context)),
            ),
          )
        else
          for (final k in _fields)
            Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.amber.withAlpha(20),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.amber.withAlpha(80)),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(_label(k).toUpperCase(),
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: .4, color: Surf.subtext(context))),
                const SizedBox(height: 8),
                _Option(
                  title: 'Keep existing',
                  text: duplicateDisplayValue(k, item.existing?[k]),
                  selected: _choices[k] == 'existing',
                  onTap: () => setState(() => _choices[k] = 'existing'),
                ),
                const SizedBox(height: 6),
                _Option(
                  title: 'Use new',
                  text: duplicateDisplayValue(k, item.submitted[k]),
                  selected: _choices[k] == 'new',
                  onTap: () => setState(() => _choices[k] = 'new'),
                ),
              ]),
            ),
        if (_newNotes.isNotEmpty)
          InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () => setState(() => _append = !_append),
            child: Container(
              constraints: const BoxConstraints(minHeight: 48),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Surf.border(context)),
              ),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(_append ? LucideIcons.squareCheck : LucideIcons.square, size: 20, color: Surf.accent(context)),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Append the new notes to the lead',
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Surf.text(context))),
                    const SizedBox(height: 4),
                    Text(_newNotes, style: TextStyle(fontSize: 13, color: Surf.subtext(context))),
                  ]),
                ),
              ]),
            ),
          ),
        const SizedBox(height: 12),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(LucideIcons.shieldCheck, size: 14, color: Surf.accent(context)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Ownership of the lead does not change. The merge is written to the lead\'s activity history.',
              style: TextStyle(fontSize: 12, color: Surf.subtext(context)),
            ),
          ),
        ]),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(
            child: OutlinedButton(
              onPressed: () => Navigator.pop(context),
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              child: const Text('Cancel'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            flex: 2,
            child: FilledButton.icon(
              onPressed: () => Navigator.pop(context, MergeChoice(Map.of(_choices), _append)),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              icon: const Icon(LucideIcons.gitMerge, size: 16),
              label: Text(changing > 0 ? 'Merge ($changing updated)' : 'Merge'),
            ),
          ),
        ]),
      ]),
    );
  }
}

class _Option extends StatelessWidget {
  final String title;
  final String text;
  final bool selected;
  final VoidCallback onTap;
  const _Option({required this.title, required this.text, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final accent = Surf.accent(context);
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 48),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? accent.withAlpha(30) : Surf.card(context),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: selected ? accent : Surf.border(context), width: selected ? 1.5 : 1),
        ),
        child: Row(children: [
          Icon(selected ? LucideIcons.circleCheck : LucideIcons.circle, size: 18, color: selected ? accent : Surf.subtext(context)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Surf.subtext(context))),
              Text(text.isEmpty ? '—' : text,
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Surf.text(context))),
            ]),
          ),
        ]),
      ),
    );
  }
}
