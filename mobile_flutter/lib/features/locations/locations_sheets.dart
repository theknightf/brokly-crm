import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/locations_models.dart';
import '../../data/services/locations_service.dart';
import '../projects/projects_common.dart';

/// Check-in sheet (lead + project optional, GPS verified against the project
/// pin). Returns the created visit, or null if dismissed.
Future<LocationsVisit?> showCheckInSheet(BuildContext context, {String? presetProjectId}) {
  return showPremiumSheet<LocationsVisit>(context, builder: (_) => _CheckIn(presetProjectId: presetProjectId));
}

/// Check-out sheet. Returns true when the visit was completed.
Future<bool?> showCheckOutSheet(BuildContext context, LocationsVisit visit) {
  return showPremiumSheet<bool>(context, builder: (_) => _CheckOut(visit: visit));
}

class _CheckIn extends StatefulWidget {
  final String? presetProjectId;
  const _CheckIn({this.presetProjectId});

  @override
  State<_CheckIn> createState() => _CheckInState();
}

class _CheckInState extends State<_CheckIn> {
  final _service = LocationsService();
  final _leadCtl = TextEditingController();
  final _noteCtl = TextEditingController();
  Timer? _debounce;
  int _searchSeq = 0;
  LocationsLeadHit? _lead;
  List<LocationsLeadHit> _results = [];
  bool _searching = false;
  List<LocationsProjectOption> _projects = [];
  String _projectId = '';
  bool _submitting = false;
  String _gpsError = '';
  String _formError = '';

  @override
  void initState() {
    super.initState();
    _projectId = widget.presetProjectId ?? '';
    _service.fetchProjects().then((p) {
      if (mounted) setState(() => _projects = p);
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _leadCtl.dispose();
    _noteCtl.dispose();
    super.dispose();
  }

  LocationsProjectOption? get _project {
    for (final p in _projects) {
      if (p.id == _projectId) return p;
    }
    return null;
  }

  void _onLeadChanged(String q) {
    _debounce?.cancel();
    if (q.trim().length < 2) {
      setState(() {
        _results = [];
        _searching = false;
      });
      return;
    }
    setState(() => _searching = true);
    final seq = ++_searchSeq;
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      final r = await _service.searchLeads(q);
      if (!mounted || seq != _searchSeq) return;
      setState(() {
        _results = r;
        _searching = false;
      });
    });
  }

  Future<void> _submit({required bool withGps}) async {
    setState(() {
      _submitting = true;
      _gpsError = '';
      _formError = '';
    });
    double? lat;
    double? lng;
    if (withGps) {
      try {
        final pos = await _service.currentPosition();
        lat = pos.latitude;
        lng = pos.longitude;
      } on LocationsGpsException catch (e) {
        if (mounted) {
          setState(() {
            _submitting = false;
            _gpsError = e.message;
          });
        }
        return;
      }
    }
    try {
      final visit = await _service.checkIn(
        lead: _lead,
        project: _project,
        note: _noteCtl.text.trim(),
        lat: lat,
        lng: lng,
      );
      if (mounted) Navigator.pop(context, visit);
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _formError = friendlyError(e);
        });
      }
    }
  }

  Widget _leadPicker() {
    if (_lead != null) {
      return Container(
        padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
        decoration: BoxDecoration(
          color: const Color(0xFF16A34A).withAlpha(Surf.dark(context) ? 40 : 28),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(children: [
          const Icon(LucideIcons.circleCheck, size: 17, color: Color(0xFF16A34A)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '${_lead!.name}${_lead!.phone.isNotEmpty ? ' · ${_lead!.phone}' : ''}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontWeight: FontWeight.w700, color: Surf.text(context)),
            ),
          ),
          IconButton(
            tooltip: 'Remove lead',
            constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
            icon: const Icon(LucideIcons.x, size: 17),
            onPressed: () => setState(() {
              _lead = null;
              _leadCtl.clear();
              _results = [];
            }),
          ),
        ]),
      );
    }
    final q = _leadCtl.text.trim();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      TextField(
        controller: _leadCtl,
        onChanged: _onLeadChanged,
        decoration: moduleInput(context, 'Lead (optional)',
            hint: 'Search by name, phone, project or unit…',
            prefix: const Icon(LucideIcons.search, size: 18)),
      ),
      if (_searching)
        const Padding(padding: EdgeInsets.only(top: 6), child: LinearProgressIndicator(minHeight: 2))
      else if (q.length >= 2)
        Container(
          margin: const EdgeInsets.only(top: 6),
          constraints: const BoxConstraints(maxHeight: 220),
          decoration: BoxDecoration(
              color: Surf.muted(context), borderRadius: BorderRadius.circular(14), border: Border.all(color: Surf.border(context))),
          child: _results.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(14),
                  child: Text('No leads found', style: TextStyle(color: Surf.subtext(context))))
              : ListView.builder(
                  shrinkWrap: true,
                  itemCount: _results.length,
                  itemBuilder: (_, i) {
                    final r = _results[i];
                    final sub = [r.project, r.unit, r.propertyType].where((s) => s.isNotEmpty).join(' · ');
                    return ListTile(
                      minTileHeight: 56,
                      title: Text(r.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text(sub.isNotEmpty ? sub : (r.phone.isNotEmpty ? r.phone : '—'),
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                      onTap: () => setState(() {
                        _lead = r;
                        _results = [];
                        _leadCtl.clear();
                      }),
                    );
                  },
                ),
        ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final p = _project;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Check in', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Surf.text(context))),
        const SizedBox(height: 2),
        Text("Start a site visit. We capture your location to confirm you're on site.",
            style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
        const SizedBox(height: 16),
        _leadPicker(),
        const SizedBox(height: 12),
        PickerField(
          label: 'Project (optional)',
          valueLabel: p?.name ?? '— No project —',
          onTap: () async {
            final r = await pickOption(context, title: 'Project', selected: _projectId, options: [
              (value: '', label: '— No project —'),
              for (final x in _projects) (value: x.id, label: x.name),
            ]);
            if (r != null) setState(() => _projectId = r.value);
          },
        ),
        if (p != null)
          Padding(
            padding: const EdgeInsets.only(top: 6, left: 4),
            child: Text(
              p.latitude != null && p.longitude != null
                  ? 'Verified within ${p.radiusM} m of ${p.name}'
                  : '${p.name} has no site pin yet, so this visit cannot be verified on-site.',
              style: TextStyle(fontSize: 11.5, color: Surf.subtext(context)),
            ),
          ),
        const SizedBox(height: 12),
        TextField(
          controller: _noteCtl,
          minLines: 2,
          maxLines: 4,
          textCapitalization: TextCapitalization.sentences,
          decoration: moduleInput(context, 'Note', hint: 'Optional note for this visit…'),
        ),
        if (_gpsError.isNotEmpty) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
                color: AppColors.alertRed.withAlpha(Surf.dark(context) ? 36 : 22), borderRadius: BorderRadius.circular(14)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(_gpsError, style: const TextStyle(color: AppColors.alertRed, fontSize: 13)),
              const SizedBox(height: 4),
              TextButton(
                onPressed: _submitting ? null : () => _submit(withGps: false),
                child: const Text('Continue without GPS instead'),
              ),
            ]),
          ),
        ],
        if (_formError.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text(_formError, style: const TextStyle(color: AppColors.alertRed, fontSize: 13)),
        ],
        const SizedBox(height: 20),
        Row(children: [
          Expanded(
            child: OutlinedButton(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              onPressed: _submitting ? null : () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 2,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              onPressed: _submitting ? null : () => _submit(withGps: true),
              icon: _submitting
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.2))
                  : const Icon(LucideIcons.logIn, size: 17),
              label: const Text('Check in with GPS'),
            ),
          ),
        ]),
      ]),
    );
  }
}

const List<String> _outcomes = ['Completed', 'Not Interested', 'Sold', 'Lost', 'Rescheduled'];

class _CheckOut extends StatefulWidget {
  final LocationsVisit visit;
  const _CheckOut({required this.visit});

  @override
  State<_CheckOut> createState() => _CheckOutState();
}

class _CheckOutState extends State<_CheckOut> {
  final _service = LocationsService();
  final _noteCtl = TextEditingController();
  String _outcome = 'Completed';
  bool _submitting = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _noteCtl.text = widget.visit.note;
  }

  @override
  void dispose() {
    _noteCtl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _error = '';
    });
    double? lat;
    double? lng;
    try {
      final pos = await _service.currentPosition();
      lat = pos.latitude;
      lng = pos.longitude;
    } catch (_) {
      // Check-out still works without GPS.
    }
    try {
      await _service.checkOut(widget.visit, outcome: _outcome, note: _noteCtl.text.trim(), lat: lat, lng: lng);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = friendlyError(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Check out', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Surf.text(context))),
        const SizedBox(height: 2),
        Text(widget.visit.projectName.isEmpty ? 'Complete the visit' : widget.visit.projectName,
            maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
        const SizedBox(height: 16),
        PickerField(
          label: 'Outcome',
          valueLabel: _outcome,
          onTap: () async {
            final r = await pickOption(context,
                title: 'Outcome', selected: _outcome, options: [for (final o in _outcomes) (value: o, label: o)]);
            if (r != null) setState(() => _outcome = r.value);
          },
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _noteCtl,
          minLines: 2,
          maxLines: 4,
          textCapitalization: TextCapitalization.sentences,
          decoration: moduleInput(context, 'Note', hint: 'Optional summary…'),
        ),
        if (_error.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text(_error, style: const TextStyle(color: AppColors.alertRed, fontSize: 13)),
        ],
        const SizedBox(height: 20),
        Row(children: [
          Expanded(
            child: OutlinedButton(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              onPressed: _submitting ? null : () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 2,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              onPressed: _submitting ? null : _submit,
              icon: _submitting
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.2))
                  : const Icon(LucideIcons.logOut, size: 17),
              label: const Text('Complete visit'),
            ),
          ),
        ]),
      ]),
    );
  }
}
