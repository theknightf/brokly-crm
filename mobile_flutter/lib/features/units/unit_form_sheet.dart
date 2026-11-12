import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/services/inventory_service.dart';
import '../../data/services/units_service.dart' show UnitModel;
import '../projects/projects_common.dart';

typedef UnitProjectOption = ({String id, String name});

const Map<int, String> _freqLabels = {1: 'Annual', 2: 'Semi-annual', 4: 'Quarterly', 12: 'Monthly'};

/// Opens the add / edit unit sheet. Returns true when a unit was saved.
/// [initial] = edit mode. [fixedProjectId] locks the project (used from a
/// project's own unit list).
Future<bool?> showUnitFormSheet(
  BuildContext context, {
  required List<UnitProjectOption> projects,
  UnitModel? initial,
  String? fixedProjectId,
}) {
  return showPremiumSheet<bool>(
    context,
    builder: (_) => _UnitForm(projects: projects, initial: initial, fixedProjectId: fixedProjectId),
  );
}

class _UnitForm extends StatefulWidget {
  final List<UnitProjectOption> projects;
  final UnitModel? initial;
  final String? fixedProjectId;
  const _UnitForm({required this.projects, this.initial, this.fixedProjectId});

  @override
  State<_UnitForm> createState() => _UnitFormState();
}

class _UnitFormState extends State<_UnitForm> {
  final _formKey = GlobalKey<FormState>();
  final _service = InventoryService();
  late final TextEditingController _name;
  late final TextEditingController _area;
  late final TextEditingController _floor;
  late final TextEditingController _price;
  late final TextEditingController _plan;
  late final TextEditingController _down;
  late final TextEditingController _years;
  late final TextEditingController _notes;
  late String _projectId;
  late String _status;
  late String _type;
  late int _freq;
  bool _saving = false;
  String? _error;
  bool _projectMissing = false;

  bool get _isEdit => widget.initial != null;

  static String _n(num v) => v == 0 ? '' : (v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString());

  @override
  void initState() {
    super.initState();
    final u = widget.initial;
    _name = TextEditingController(text: u?.name ?? '');
    _area = TextEditingController(text: _n(u?.area ?? 0));
    _floor = TextEditingController(text: _n(u?.floor ?? 0));
    _price = TextEditingController(text: _n(u?.price ?? 0));
    _plan = TextEditingController(text: u?.paymentPlan ?? '');
    _down = TextEditingController(text: _n(u?.downPaymentPct ?? 0));
    _years = TextEditingController(text: _n(u?.installmentYears ?? 0));
    _notes = TextEditingController(text: u?.notes ?? '');
    _projectId = u?.projectId ?? widget.fixedProjectId ?? '';
    _status = InventoryService.statuses.contains(u?.status) ? u!.status : 'Available';
    _type = u?.unitType ?? '';
    final f = u?.installmentFrequency ?? 12;
    _freq = _freqLabels.containsKey(f) ? f : 12;
  }

  @override
  void dispose() {
    for (final c in [_name, _area, _floor, _price, _plan, _down, _years, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  double _d(TextEditingController c) => double.tryParse(c.text.trim().replaceAll(',', '')) ?? 0;

  String _projectName(String id) {
    for (final p in widget.projects) {
      if (p.id == id) return p.name;
    }
    return '';
  }

  Future<void> _save() async {
    final okForm = _formKey.currentState?.validate() ?? false;
    final missing = _projectId.isEmpty;
    setState(() => _projectMissing = missing);
    if (!okForm || missing) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final down = _d(_down).clamp(0, 100).toDouble();
    final input = InventoryUnitInput(
      projectId: _projectId,
      name: _name.text.trim(),
      unitType: _type,
      area: _d(_area),
      floor: _d(_floor).round(),
      price: _d(_price),
      paymentPlan: _plan.text.trim(),
      downPaymentPct: down,
      installmentYears: _d(_years).round(),
      installmentFrequency: _freq,
      status: _status,
      notes: _notes.text.trim(),
      imagePath: widget.initial?.imagePath ?? '',
    );
    try {
      if (_isEdit) {
        await _service.updateUnit(widget.initial!.id, input);
      } else {
        await _service.createUnit(input, userId: _service.currentUserId);
      }
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = friendlyError(e);
        });
      }
    }
  }

  Widget _gap([double h = 12]) => SizedBox(height: h);

  @override
  Widget build(BuildContext context) {
    final decimal = [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))];
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      child: Form(
        key: _formKey,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(_isEdit ? 'Edit unit' : 'Add unit',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Surf.text(context))),
          const SizedBox(height: 2),
          Text('Shown to your sales team and the calculator',
              style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
          _gap(16),
          PickerField(
            label: 'Project',
            valueLabel: _projectName(_projectId),
            errorText: _projectMissing && _projectId.isEmpty ? 'Project is required' : null,
            onTap: widget.fixedProjectId != null
                ? () {}
                : () async {
                    final r = await pickOption(context,
                        title: 'Project',
                        selected: _projectId,
                        options: [for (final p in widget.projects) (value: p.id, label: p.name)]);
                    if (r != null) setState(() => _projectId = r.value);
                  },
          ),
          _gap(),
          TextFormField(
            controller: _name,
            textInputAction: TextInputAction.next,
            decoration: moduleInput(context, 'Unit name / number', hint: 'e.g. 14B / Apartment 12'),
            validator: (v) => (v == null || v.trim().isEmpty) ? 'Unit name / number is required' : null,
          ),
          _gap(),
          Row(children: [
            Expanded(
              child: PickerField(
                label: 'Unit type',
                valueLabel: _type,
                onTap: () async {
                  final r = await pickOption(context, title: 'Unit type', selected: _type, options: [
                    (value: '', label: '— None —'),
                    for (final t in InventoryService.unitTypes) (value: t, label: t),
                  ]);
                  if (r != null) setState(() => _type = r.value);
                },
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: PickerField(
                label: 'Status',
                valueLabel: _status,
                onTap: () async {
                  final r = await pickOption(context, title: 'Status', selected: _status, options: [
                    for (final s in InventoryService.statuses) (value: s, label: s),
                  ]);
                  if (r != null) setState(() => _status = r.value);
                },
              ),
            ),
          ]),
          _gap(),
          Row(children: [
            Expanded(
              child: TextFormField(
                controller: _area,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: decimal,
                textInputAction: TextInputAction.next,
                decoration: moduleInput(context, 'Area', suffix: 'm²'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: TextFormField(
                controller: _floor,
                keyboardType: const TextInputType.numberWithOptions(signed: true),
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9-]'))],
                textInputAction: TextInputAction.next,
                decoration: moduleInput(context, 'Floor'),
              ),
            ),
          ]),
          _gap(),
          TextFormField(
            controller: _price,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: decimal,
            textInputAction: TextInputAction.next,
            decoration: moduleInput(context, 'Price', suffix: 'EGP'),
          ),
          _gap(),
          TextFormField(
            controller: _plan,
            textInputAction: TextInputAction.next,
            decoration: moduleInput(context, 'Payment plan', hint: '10% down / 6 years / quarterly'),
          ),
          _gap(),
          Row(children: [
            Expanded(
              child: TextFormField(
                controller: _down,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: decimal,
                textInputAction: TextInputAction.next,
                decoration: moduleInput(context, 'Down payment', suffix: '%'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: TextFormField(
                controller: _years,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                textInputAction: TextInputAction.next,
                decoration: moduleInput(context, 'Years'),
              ),
            ),
          ]),
          _gap(),
          PickerField(
            label: 'Installments per year',
            valueLabel: _freqLabels[_freq] ?? '',
            onTap: () async {
              final r = await pickOption(context, title: 'Installments per year', selected: '$_freq', options: [
                for (final e in _freqLabels.entries) (value: '${e.key}', label: e.value),
              ]);
              if (r != null) setState(() => _freq = int.tryParse(r.value) ?? 12);
            },
          ),
          _gap(),
          TextFormField(
            controller: _notes,
            minLines: 2,
            maxLines: 4,
            textCapitalization: TextCapitalization.sentences,
            decoration: moduleInput(context, 'Notes', hint: 'Optional notes about this unit'),
          ),
          if (_error != null) ...[
            _gap(),
            Text(_error!, style: const TextStyle(color: AppColors.alertRed, fontSize: 13)),
          ],
          _gap(20),
          Row(children: [
            Expanded(
              child: OutlinedButton(
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                onPressed: _saving ? null : () => Navigator.pop(context, false),
                child: const Text('Cancel'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 2,
              child: FilledButton(
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.4))
                    : Text(_isEdit ? 'Save changes' : 'Add unit'),
              ),
            ),
          ]),
        ]),
      ),
    );
  }
}
