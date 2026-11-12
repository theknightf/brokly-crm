import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/projects_models.dart';
import '../../data/services/inventory_service.dart';
import '../../data/services/locations_service.dart';
import '../../data/services/projects_service.dart';
import '../../data/services/units_service.dart' show UnitModel;
import '../locations/locations_sheets.dart';
import '../units/unit_card.dart';
import '../units/unit_detail_sheet.dart';
import '../units/unit_form_sheet.dart';
import '../units/units_screen.dart';
import 'project_form_sheet.dart';
import 'projects_common.dart';

/// Project details (pushed page): cover, pitch, developer info, GPS pin,
/// selling points, payment plan and a units overview, with edit / delete /
/// site-visit / units actions (all roles, matching the website and RLS).
class ProjectDetailScreen extends StatefulWidget {
  final ProjectsProject project;
  final List<ProjectsDeveloper> developers;
  const ProjectDetailScreen({super.key, required this.project, this.developers = const []});

  @override
  State<ProjectDetailScreen> createState() => _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends State<ProjectDetailScreen> {
  final _projects = ProjectsService();
  final _inventory = InventoryService();
  late ProjectsProject _project = widget.project;
  List<ProjectsDeveloper> _developers = [];
  ProjectsUnitStats? _stats;
  bool _unitsError = false;
  bool _unitsLoading = true;

  @override
  void initState() {
    super.initState();
    _developers = widget.developers;
    _loadUnits();
    if (_developers.isEmpty) {
      _projects.fetchDevelopers().then((d) {
        if (mounted) setState(() => _developers = d);
      });
    }
  }

  Future<void> _loadUnits() async {
    setState(() {
      _unitsLoading = true;
      _unitsError = false;
    });
    try {
      final units = await _inventory.fetchUnits(projectId: _project.id);
      if (!mounted) return;
      setState(() {
        _stats = ProjectsUnitStats.build(units)[_project.id] ?? ProjectsUnitStats();
        _unitsLoading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _unitsLoading = false;
          _unitsError = true;
        });
      }
    }
  }

  Future<void> _refresh() async {
    final p = await _projects.fetchProject(_project.id);
    if (p != null && mounted) setState(() => _project = p);
    await _loadUnits();
  }

  Future<void> _edit() async {
    final ok = await showProjectFormSheet(context, developers: _developers, initial: _project);
    if (ok == true && mounted) {
      showModuleSnack(context, 'Project updated');
      await _refresh();
    }
  }

  Future<void> _delete() async {
    final ok = await confirmAction(context,
        title: 'Delete this project?',
        message: '"${_project.name}" will be permanently removed. This action cannot be undone.',
        confirmLabel: 'Remove project',
        destructive: true);
    if (!ok || !mounted) return;
    try {
      await _projects.deleteProject(_project.id);
      if (!mounted) return;
      Navigator.pop(context);
    } catch (e) {
      if (mounted) showModuleSnack(context, friendlyError(e), error: true);
    }
  }

  Future<void> _siteVisit() async {
    if (await LocationsService().hasActiveVisit()) {
      if (mounted) showModuleSnack(context, 'You already have a visit in progress. Check out first.', error: true);
      return;
    }
    if (!mounted) return;
    final visit = await showCheckInSheet(context, presetProjectId: _project.id);
    if (visit != null && mounted) {
      showModuleSnack(context, visit.verified ? 'Checked in, verified on site' : 'Checked in (outside the allowed radius)');
    }
  }

  Future<void> _openMaps() async {
    final uri = Uri.parse('https://www.google.com/maps?q=${_project.latitude},${_project.longitude}');
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) showModuleSnack(context, 'Could not open Maps', error: true);
  }

  void _openUnits() {
    Navigator.of(context)
        .push(MaterialPageRoute<void>(
            builder: (_) => UnitsScreen(projectId: _project.id, projectName: _project.name, showAppBar: true)))
        .then((_) => _loadUnits());
  }

  List<UnitProjectOption> get _unitProjectOption => [(id: _project.id, name: _project.name)];

  Future<void> _openUnit(UnitModel u) async {
    final r = await showUnitDetailSheet(context, u);
    if (r == null || !mounted) return;
    try {
      switch (r.action) {
        case UnitSheetAction.reserve:
          await _inventory.reserve(u.id);
          if (mounted) showModuleSnack(context, '"${u.name}" reserved');
        case UnitSheetAction.edit:
          final ok = await showUnitFormSheet(context, projects: _unitProjectOption, initial: u);
          if (ok == true && mounted) showModuleSnack(context, 'Unit updated');
        case UnitSheetAction.delete:
          final ok = await confirmAction(context,
              title: 'Delete unit?', message: 'Delete "${u.name}"?', confirmLabel: 'Delete', destructive: true);
          if (!ok) return;
          await _inventory.deleteUnit(u.id);
          if (mounted) showModuleSnack(context, 'Unit deleted');
        case UnitSheetAction.none:
          break;
      }
    } catch (e) {
      if (mounted) showModuleSnack(context, friendlyError(e), error: true);
    }
    await _loadUnits();
  }

  Widget _meta(IconData icon, String text) => Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 14, color: Surf.accent(context)),
        const SizedBox(width: 5),
        Flexible(child: Text(text, style: TextStyle(fontSize: 13, color: Surf.subtext(context)))),
      ]);

  Widget _stat(String label, String value) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(14)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11, color: Surf.subtext(context))),
            const SizedBox(height: 3),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(value,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Surf.text(context), fontFeatures: tabularFigures)),
            ),
          ]),
        ),
      );

  Widget _unitsSection() {
    final s = _stats;
    if (_unitsLoading && s == null) {
      return const Padding(padding: EdgeInsets.symmetric(vertical: 16), child: LinearProgressIndicator(minHeight: 3));
    }
    if (_unitsError) {
      return Row(children: [
        Expanded(child: Text('Could not load units.', style: TextStyle(color: Surf.subtext(context)))),
        TextButton(onPressed: _loadUnits, child: const Text('Retry')),
      ]);
    }
    final units = s?.units ?? const <UnitModel>[];
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        _stat('Starting price', formatEgp(s?.minPrice)),
        const SizedBox(width: 8),
        _stat('Available', '${s?.available ?? 0}'),
        const SizedBox(width: 8),
        _stat('Reserved', '${s?.reserved ?? 0}'),
      ]),
      const SizedBox(height: 12),
      if (units.isEmpty)
        Text('No units added yet. Add units to keep track of availability and pricing.',
            style: TextStyle(fontSize: 13.5, color: Surf.subtext(context)))
      else ...[
        for (final u in units.take(8)) UnitCard(key: ValueKey(u.id), unit: u, showProject: false, onTap: () => _openUnit(u)),
        if (units.length > 8)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text('+${units.length - 8} more units', style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
          ),
      ],
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final p = _project;
    final statusColor = moduleStatusColor(p.status);
    return Scaffold(
      appBar: AppBar(
        title: Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(
              tooltip: 'Edit project',
              constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
              onPressed: _edit,
              icon: const Icon(LucideIcons.pencil, size: 19)),
          IconButton(
              tooltip: 'Delete project',
              constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
              onPressed: _delete,
              icon: const Icon(LucideIcons.trash2, size: 19, color: AppColors.alertRed)),
        ],
      ),
      body: SafeArea(
        child: Column(children: [
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                children: [
                  Stack(children: [
                    BucketImage(
                      bucket: InventoryStorage.projectBucket,
                      path: p.imagePath,
                      width: double.infinity,
                      height: 190,
                      radius: 20,
                      fallbackIcon: LucideIcons.building,
                    ),
                    Positioned(top: 12, right: 12, child: StatusPill(p.status, color: statusColor)),
                  ]),
                  const SizedBox(height: 14),
                  Text(p.name, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Surf.text(context))),
                  const SizedBox(height: 6),
                  Wrap(spacing: 16, runSpacing: 4, children: [
                    if (p.developerName.isNotEmpty) _meta(LucideIcons.building2, p.developerName),
                    if (p.location.isNotEmpty) _meta(LucideIcons.mapPin, p.location),
                    if (p.createdAt != null)
                      Text('Added ${DateFormat('d MMM yyyy').format(p.createdAt!.toLocal())}',
                          style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
                  ]),
                  const SizedBox(height: 16),
                  if (p.hasGps)
                    PremiumCard(
                      margin: const EdgeInsets.only(bottom: 18),
                      padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
                      child: Row(children: [
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('Site location',
                                style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Surf.text(context))),
                            const SizedBox(height: 2),
                            Text('${p.latitude!.toStringAsFixed(5)}, ${p.longitude!.toStringAsFixed(5)} · ±${p.radiusM} m',
                                style: TextStyle(fontSize: 12, color: Surf.subtext(context), fontFeatures: tabularFigures)),
                          ]),
                        ),
                        TextButton.icon(
                          style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
                          onPressed: _openMaps,
                          icon: const Icon(LucideIcons.externalLink, size: 15),
                          label: const Text('Maps'),
                        ),
                      ]),
                    ),
                  TextSection('Pitch', p.pitchSummary),
                  TextSection('About the project', p.fullDescription),
                  TextSection('About the developer', p.developerDescription),
                  TextSection('Why buy', p.whyBuy),
                  if (p.sellingPoints.isNotEmpty) ...[
                    Text('SELLING POINTS',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.8, color: Surf.subtext(context))),
                    const SizedBox(height: 8),
                    for (final sp in p.sellingPoints)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const Padding(
                              padding: EdgeInsets.only(top: 2),
                              child: Icon(LucideIcons.circleCheck, size: 16, color: Color(0xFF16A34A))),
                          const SizedBox(width: 8),
                          Expanded(child: Text(sp, style: TextStyle(fontSize: 14, color: Surf.text(context)))),
                        ]),
                      ),
                    const SizedBox(height: 12),
                  ],
                  TextSection('Payment plan', p.paymentPlanSummary),
                  Text('UNITS OVERVIEW',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.8, color: Surf.subtext(context))),
                  const SizedBox(height: 8),
                  _unitsSection(),
                ],
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
            decoration: BoxDecoration(color: Surf.card(context), border: Border(top: BorderSide(color: Surf.border(context)))),
            child: Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                  onPressed: _siteVisit,
                  icon: const Icon(LucideIcons.mapPin, size: 17),
                  label: const Text('Site visit'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                  onPressed: _openUnits,
                  icon: const Icon(LucideIcons.layers, size: 17),
                  label: const Text('Units & media'),
                ),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}
