import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/projects_models.dart';
import '../../data/services/projects_service.dart';
import 'projects_common.dart';

/// Add / edit project sheet. Returns true when saved.
/// Cover-image upload is not available in the app (no image picker dependency);
/// an existing cover is preserved on edit.
Future<bool?> showProjectFormSheet(
  BuildContext context, {
  required List<ProjectsDeveloper> developers,
  ProjectsProject? initial,
}) {
  return showPremiumSheet<bool>(context, builder: (_) => _ProjectForm(developers: developers, initial: initial));
}

class _ProjectForm extends StatefulWidget {
  final List<ProjectsDeveloper> developers;
  final ProjectsProject? initial;
  const _ProjectForm({required this.developers, this.initial});

  @override
  State<_ProjectForm> createState() => _ProjectFormState();
}

class _ProjectFormState extends State<_ProjectForm> {
  final _formKey = GlobalKey<FormState>();
  final _service = ProjectsService();
  late final TextEditingController _name;
  late final TextEditingController _location;
  late final TextEditingController _lat;
  late final TextEditingController _lng;
  late final TextEditingController _radius;
  late final TextEditingController _pitch;
  late final TextEditingController _full;
  late final TextEditingController _devDesc;
  late final TextEditingController _plan;
  late final TextEditingController _why;
  late final TextEditingController _points;
  late String _developerId;
  late String _status;
  bool _saving = false;
  bool _devMissing = false;
  String? _error;

  bool get _isEdit => widget.initial != null;

  @override
  void initState() {
    super.initState();
    final p = widget.initial;
    _name = TextEditingController(text: p?.name ?? '');
    _location = TextEditingController(text: p?.location ?? '');
    _lat = TextEditingController(text: p?.latitude?.toString() ?? '');
    _lng = TextEditingController(text: p?.longitude?.toString() ?? '');
    _radius = TextEditingController(text: p == null || !p.hasGps ? '' : p.radiusM.toString());
    _pitch = TextEditingController(text: p?.pitchSummary ?? '');
    _full = TextEditingController(text: p?.fullDescription ?? '');
    _devDesc = TextEditingController(text: p?.developerDescription ?? '');
    _plan = TextEditingController(text: p?.paymentPlanSummary ?? '');
    _why = TextEditingController(text: p?.whyBuy ?? '');
    _points = TextEditingController(text: (p?.sellingPoints ?? const []).join('\n'));
    _developerId = p?.developerId ?? (widget.developers.where((d) => d.isActive).firstOrNull?.id ?? '');
    _status = p?.status == 'Inactive' ? 'Inactive' : 'Active';
  }

  @override
  void dispose() {
    for (final c in [_name, _location, _lat, _lng, _radius, _pitch, _full, _devDesc, _plan, _why, _points]) {
      c.dispose();
    }
    super.dispose();
  }

  String _developerName() {
    for (final d in widget.developers) {
      if (d.id == _developerId) return d.name;
    }
    return widget.initial?.developerName ?? '';
  }

  double? _num(TextEditingController c) => double.tryParse(c.text.trim().replaceAll(',', '.'));

  String? _coord(String? v, double min, double max, String what) {
    if (v == null || v.trim().isEmpty) return null;
    final n = double.tryParse(v.trim().replaceAll(',', '.'));
    if (n == null || n < min || n > max) return 'Invalid $what';
    return null;
  }

  Future<void> _save() async {
    final ok = _formKey.currentState?.validate() ?? false;
    final devMissing = _developerId.isEmpty;
    setState(() => _devMissing = devMissing);
    if (!ok || devMissing) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final radius = int.tryParse(_radius.text.trim());
    final data = ProjectsFormData(
      name: _name.text.trim(),
      developerId: _developerId,
      status: _status,
      location: _location.text.trim(),
      latitude: _num(_lat),
      longitude: _num(_lng),
      radiusM: radius != null && radius > 0 ? radius : null,
      pitchSummary: _pitch.text.trim(),
      fullDescription: _full.text.trim(),
      developerDescription: _devDesc.text.trim(),
      paymentPlanSummary: _plan.text.trim(),
      whyBuy: _why.text.trim(),
      sellingPoints: _points.text,
    );
    try {
      if (_isEdit) {
        await _service.updateProject(widget.initial!.id, data, imagePath: widget.initial!.imagePath);
      } else {
        await _service.createProject(data);
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

  Widget _area(TextEditingController c, String label, {String? hint, int lines = 2}) => Padding(
        padding: const EdgeInsets.only(top: 12),
        child: TextFormField(
          controller: c,
          minLines: lines,
          maxLines: lines + 3,
          textCapitalization: TextCapitalization.sentences,
          decoration: moduleInput(context, label, hint: hint),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final decimal = [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,\-]'))];
    final activeDevs = widget.developers.where((d) => d.isActive || d.id == _developerId).toList();
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      child: Form(
        key: _formKey,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(_isEdit ? 'Edit project' : 'Add new project',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Surf.text(context))),
          const SizedBox(height: 16),
          PickerField(
            label: 'Developer',
            valueLabel: _developerName(),
            errorText: _devMissing && _developerId.isEmpty ? 'Select a developer' : null,
            onTap: () async {
              final r = await pickOption(context,
                  title: 'Developer',
                  selected: _developerId,
                  options: [for (final d in activeDevs) (value: d.id, label: d.name)]);
              if (r != null) setState(() => _developerId = r.value);
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _name,
            textInputAction: TextInputAction.next,
            decoration: moduleInput(context, 'Project name', hint: 'e.g. Palm Hills New Cairo'),
            validator: (v) => (v == null || v.trim().isEmpty) ? 'Project name is required' : null,
          ),
          const SizedBox(height: 12),
          SegmentedButton<String>(
            showSelectedIcon: false,
            style: SegmentedButton.styleFrom(minimumSize: const Size(0, 48)),
            segments: const [
              ButtonSegment(value: 'Active', label: Text('Active')),
              ButtonSegment(value: 'Inactive', label: Text('Inactive')),
            ],
            selected: {_status},
            onSelectionChanged: (s) => setState(() => _status = s.first),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _location,
            textInputAction: TextInputAction.next,
            decoration: moduleInput(context, 'Location', hint: 'e.g. South Investors Area, New Cairo'),
          ),
          const SizedBox(height: 18),
          Text('SITE LOCATION (OPTIONAL)',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.8, color: Surf.subtext(context))),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
              child: TextFormField(
                controller: _lat,
                keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                inputFormatters: decimal,
                decoration: moduleInput(context, 'Latitude'),
                validator: (v) => _coord(v, -90, 90, 'latitude'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: TextFormField(
                controller: _lng,
                keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                inputFormatters: decimal,
                decoration: moduleInput(context, 'Longitude'),
                validator: (v) => _coord(v, -180, 180, 'longitude'),
              ),
            ),
          ]),
          const SizedBox(height: 12),
          TextFormField(
            controller: _radius,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: moduleInput(context, 'Radius', suffix: 'm', hint: 'Default 300'),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 6, left: 4),
            child: Text('Radius used to confirm the site-visit location.',
                style: TextStyle(fontSize: 11.5, color: Surf.subtext(context))),
          ),
          const SizedBox(height: 6),
          _area(_pitch, 'Pitch summary (optional)', hint: 'One-liner agents read to the customer'),
          _area(_full, 'Full description (optional)', hint: 'Master plan, amenities, phases…', lines: 3),
          _area(_devDesc, 'Developer description (optional)', hint: 'Track record, portfolio…'),
          _area(_plan, 'Payment plan summary (optional)', hint: 'e.g. 0% down, 8-year installments'),
          _area(_why, 'Why buy (optional)', hint: 'The main buying reason'),
          _area(_points, 'Selling points (optional)', hint: 'One per line', lines: 3),
          Padding(
            padding: const EdgeInsets.only(top: 6, left: 4),
            child: Text('These show in the call summary while the agent is on a call.',
                style: TextStyle(fontSize: 11.5, color: Surf.subtext(context))),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: AppColors.alertRed, fontSize: 13)),
          ],
          const SizedBox(height: 20),
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
                    : const Text('Save project'),
              ),
            ),
          ]),
        ]),
      ),
    );
  }
}
