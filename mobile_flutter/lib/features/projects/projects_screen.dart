import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/projects_models.dart';
import '../../data/services/inventory_service.dart';
import '../../data/services/locations_service.dart';
import '../../data/services/projects_service.dart';
import '../locations/locations_sheets.dart';
import '../units/units_screen.dart';
import 'project_detail_screen.dart';
import 'project_form_sheet.dart';
import 'projects_common.dart';

/// Projects list with developers: KPIs, search, developer + status filters,
/// cards with starting price and unit availability, details, add / edit /
/// delete, units and site-visit shortcuts. Every signed-in role has the same
/// access (the website and RLS do not restrict projects by role).
class ProjectsScreen extends StatefulWidget {
  final bool showAppBar;
  const ProjectsScreen({super.key, this.showAppBar = false});

  @override
  State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  final _service = ProjectsService();
  List<ProjectsProject> _projects = [];
  List<ProjectsDeveloper> _developers = [];
  Map<String, ProjectsUnitStats> _stats = {};
  bool _loading = true;
  String? _error;
  String _search = '';
  String _devFilter = '';
  String _status = 'All';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final projectsF = _service.fetchProjects();
      final devsF = _service.fetchDevelopers();
      final unitsF = _service.fetchUnits().then((u) => ProjectsUnitStats.build(u)).catchError((_) => <String, ProjectsUnitStats>{});
      final projects = await projectsF;
      final devs = await devsF;
      final stats = await unitsF;
      if (!mounted) return;
      setState(() {
        _projects = projects;
        _developers = devs;
        _stats = stats;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        if (!silent || _projects.isEmpty) _error = friendlyError(e);
      });
    }
  }

  List<ProjectsProject> get _filtered {
    final q = _search.trim().toLowerCase();
    return _projects.where((p) {
      if (q.isNotEmpty &&
          !(p.name.toLowerCase().contains(q) ||
              p.developerName.toLowerCase().contains(q) ||
              p.location.toLowerCase().contains(q))) {
        return false;
      }
      if (_devFilter.isNotEmpty && p.developerId != _devFilter) return false;
      if (_status != 'All' && p.status != _status) return false;
      return true;
    }).toList();
  }

  Future<void> _add() async {
    final ok = await showProjectFormSheet(context, developers: _developers);
    if (ok == true && mounted) {
      showModuleSnack(context, 'Project added');
      _load(silent: true);
    }
  }

  Future<void> _edit(ProjectsProject p) async {
    final ok = await showProjectFormSheet(context, developers: _developers, initial: p);
    if (ok == true && mounted) {
      showModuleSnack(context, 'Project updated');
      _load(silent: true);
    }
  }

  Future<void> _delete(ProjectsProject p) async {
    final ok = await confirmAction(context,
        title: 'Delete this project?',
        message: '"${p.name}" will be permanently removed. This action cannot be undone.',
        confirmLabel: 'Remove project',
        destructive: true);
    if (!ok || !mounted) return;
    try {
      await _service.deleteProject(p.id);
      if (!mounted) return;
      setState(() => _projects = _projects.where((x) => x.id != p.id).toList());
      showModuleSnack(context, 'Project "${p.name}" deleted');
    } catch (e) {
      if (mounted) showModuleSnack(context, friendlyError(e), error: true);
    }
  }

  Future<void> _openDetail(ProjectsProject p) async {
    await Navigator.of(context)
        .push(MaterialPageRoute<void>(builder: (_) => ProjectDetailScreen(project: p, developers: _developers)));
    if (mounted) _load(silent: true);
  }

  Future<void> _openUnits(ProjectsProject p) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) => UnitsScreen(projectId: p.id, projectName: p.name, showAppBar: true)));
    if (mounted) _load(silent: true);
  }

  Future<void> _siteVisit(ProjectsProject p) async {
    if (await LocationsService().hasActiveVisit()) {
      if (mounted) showModuleSnack(context, 'You already have a visit in progress. Check out first.', error: true);
      return;
    }
    if (!mounted) return;
    final v = await showCheckInSheet(context, presetProjectId: p.id);
    if (v != null && mounted) {
      showModuleSnack(context, v.verified ? 'Checked in, verified on site' : 'Checked in (outside the allowed radius)');
    }
  }

  Future<void> _pickDeveloper() async {
    final r = await pickOption(context, title: 'Developer', selected: _devFilter, options: [
      (value: '', label: 'All developers'),
      for (final d in _developers) (value: d.id, label: d.name),
    ]);
    if (r != null) setState(() => _devFilter = r.value);
  }

  Widget _kpis() {
    final active = _projects.where((p) => p.isActive).length;
    final inactive = _projects.where((p) => p.status == 'Inactive').length;
    final devCount = _projects.map((p) => p.developerId).toSet().length;
    Widget row(Widget a, Widget b) => Row(children: [Expanded(child: a), const SizedBox(width: 10), Expanded(child: b)]);
    return Column(children: [
      row(MetricTile(label: 'Total projects', value: '${_projects.length}', icon: LucideIcons.building),
          MetricTile(label: 'Active', value: '$active', icon: LucideIcons.circleCheck, color: const Color(0xFF16A34A))),
      const SizedBox(height: 10),
      row(MetricTile(label: 'Inactive', value: '$inactive', icon: LucideIcons.circle, color: const Color(0xFF64748B)),
          MetricTile(label: 'Developers', value: '$devCount', icon: LucideIcons.building2, color: AppColors.statusFollowingUp)),
    ]);
  }

  Widget _header() {
    final devName = _developers.where((d) => d.id == _devFilter).map((d) => d.name).firstOrNull ?? 'All developers';
    final active = _projects.where((p) => p.isActive).length;
    final devCount = _projects.map((p) => p.developerId).toSet().length;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SectionHeader(
        title: 'Projects',
        subtitle: _loading ? null : '$active active project${active == 1 ? '' : 's'} across $devCount developer${devCount == 1 ? '' : 's'}',
      ),
      if (!_loading && _error == null) ...[
        _kpis(),
        const SizedBox(height: 14),
      ],
      AppSearchField(hint: 'Search projects, developers or locations…', onChanged: (v) => setState(() => _search = v)),
      const SizedBox(height: 10),
      SizedBox(
        height: 40,
        child: ListView(
          scrollDirection: Axis.horizontal,
          children: [
            for (final s in ['All', 'Active', 'Inactive']) ...[
              ChoiceChip(
                label: Text(s),
                selected: _status == s,
                showCheckmark: false,
                onSelected: (_) => setState(() => _status = s),
                labelStyle: TextStyle(
                    fontSize: 12.5, fontWeight: FontWeight.w700, color: _status == s ? Colors.black : Surf.subtext(context)),
                selectedColor: Surf.accent(context),
                backgroundColor: Surf.muted(context),
                side: BorderSide.none,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
              ),
              const SizedBox(width: 8),
            ],
            if (_developers.isNotEmpty)
              ActionChip(
                avatar: const Icon(LucideIcons.building2, size: 15),
                label: Text(devName, maxLines: 1, overflow: TextOverflow.ellipsis),
                onPressed: _pickDeveloper,
                side: BorderSide.none,
                backgroundColor: _devFilter.isEmpty ? Surf.muted(context) : Surf.accent(context).withAlpha(60),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
              ),
          ],
        ),
      ),
      const SizedBox(height: 14),
    ]);
  }

  Widget _card(ProjectsProject p) {
    final stats = _stats[p.id];
    return PremiumCard(
      padding: EdgeInsets.zero,
      onTap: () => _openDetail(p),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Stack(children: [
          BucketImage(
            bucket: InventoryStorage.projectBucket,
            path: p.imagePath,
            width: double.infinity,
            height: 150,
            fallbackIcon: LucideIcons.building,
          ),
          Positioned(top: 10, right: 10, child: StatusPill(p.status, color: moduleStatusColor(p.status))),
        ]),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(p.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Surf.text(context))),
            const SizedBox(height: 4),
            Wrap(spacing: 12, runSpacing: 2, children: [
              if (p.developerName.isNotEmpty)
                Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(LucideIcons.building2, size: 13, color: Surf.accent(context)),
                  const SizedBox(width: 4),
                  Flexible(child: Text(p.developerName, style: TextStyle(fontSize: 12.5, color: Surf.subtext(context)))),
                ]),
              if (p.location.isNotEmpty)
                Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(LucideIcons.mapPin, size: 13, color: Surf.accent(context)),
                  const SizedBox(width: 4),
                  Flexible(child: Text(p.location, style: TextStyle(fontSize: 12.5, color: Surf.subtext(context)))),
                ]),
            ]),
            if (p.pitchSummary.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(p.pitchSummary,
                    maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, color: Surf.subtext(context))),
              ),
            if (p.paymentPlanSummary.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(p.paymentPlanSummary,
                    maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
              ),
            const SizedBox(height: 10),
            Divider(height: 1, color: Surf.border(context)),
            const SizedBox(height: 10),
            Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('STARTING FROM',
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: Surf.subtext(context))),
                  const SizedBox(height: 2),
                  Text(formatEgp(stats?.minPrice),
                      style: TextStyle(
                          fontSize: 15, fontWeight: FontWeight.w800, color: Surf.text(context), fontFeatures: tabularFigures)),
                ]),
              ),
            ]),
            const SizedBox(height: 8),
            Wrap(spacing: 6, runSpacing: 6, children: [
              if (stats == null)
                CountChip('No units', Surf.subtext(context))
              else ...[
                CountChip('${stats.available} Available', moduleStatusColor('Available')),
                CountChip('${stats.reserved} Reserved', moduleStatusColor('Reserved')),
                CountChip('${stats.sold} Sold', moduleStatusColor('Sold')),
              ],
            ]),
            if (p.sellingPoints.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Wrap(spacing: 6, runSpacing: 6, children: [
                  for (final sp in p.sellingPoints.take(3))
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 220),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(999)),
                        child: Text(sp,
                            maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11, color: Surf.subtext(context))),
                      ),
                    ),
                  if (p.sellingPoints.length > 3) CountChip('+${p.sellingPoints.length - 3}', Surf.subtext(context)),
                ]),
              ),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 6, 4, 8),
          child: Row(children: [
            Expanded(
              child: FilledButton.icon(
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                onPressed: () => _openDetail(p),
                icon: const Icon(LucideIcons.eye, size: 16),
                label: const Text('View details'),
              ),
            ),
            ModuleIconButton(icon: LucideIcons.layers, tooltip: 'Units & media', color: Surf.accent(context), onPressed: () => _openUnits(p)),
            ModuleIconButton(icon: LucideIcons.mapPin, tooltip: 'Site visit', color: const Color(0xFF16A34A), onPressed: () => _siteVisit(p)),
            PopupMenuButton<String>(
              tooltip: 'More',
              constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
              icon: Icon(LucideIcons.ellipsisVertical, size: 19, color: Surf.subtext(context)),
              onSelected: (v) => v == 'edit' ? _edit(p) : _delete(p),
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'edit', height: 48, child: Text('Edit project')),
                PopupMenuItem(value: 'delete', height: 48, child: Text('Delete project', style: TextStyle(color: AppColors.alertRed))),
              ],
            ),
          ]),
        ),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final list = _filtered;
    Widget? state;
    if (_loading) {
      state = null;
    } else if (_error != null) {
      state = SizedBox(height: 360, child: ErrorState(message: _error!, onRetry: _load));
    } else if (list.isEmpty) {
      final filtered = _projects.isNotEmpty;
      state = SizedBox(
        height: 360,
        child: EmptyState(
          icon: LucideIcons.folderOpen,
          title: filtered ? 'No projects found' : 'No projects yet',
          message: filtered ? 'Try adjusting your filters.' : 'Add a project to get started.',
          actionLabel: filtered ? null : 'Add project',
          onAction: filtered ? null : _add,
        ),
      );
    }

    return ModulePage(
      title: 'Projects',
      showAppBar: widget.showAppBar,
      fab: FloatingActionButton.extended(
        onPressed: _loading ? null : _add,
        icon: const Icon(LucideIcons.plus, size: 18),
        label: const Text('Add project'),
      ),
      body: RefreshIndicator(
        onRefresh: () => _load(silent: true),
        child: _loading
            ? ListView(
                physics: const NeverScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                children: [
                  _header(),
                  for (var i = 0; i < 3; i++)
                    Container(
                      height: 280,
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(20)),
                    ),
                ],
              )
            : ListView.builder(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                itemCount: 1 + (state != null ? 1 : list.length),
                itemBuilder: (_, i) {
                  if (i == 0) return _header();
                  if (state != null) return state;
                  return _card(list[i - 1]);
                },
              ),
      ),
    );
  }
}
