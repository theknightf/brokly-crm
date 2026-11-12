import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/projects_models.dart';
import '../../data/services/inventory_service.dart';
import '../../data/services/projects_service.dart';
import '../../data/services/units_service.dart' show UnitModel;
import '../projects/projects_common.dart';
import 'unit_card.dart';
import 'unit_detail_sheet.dart';
import 'unit_form_sheet.dart';

/// Units inventory: search, status + project filters, detail, add / edit /
/// delete, quick status change and reserve. Visible to every signed-in role
/// (the website and RLS do not restrict units by role).
///
/// Pass [projectId] to scope the list to one project (used from project
/// details). Embedded in the shell by default; set [showAppBar] when pushed.
class UnitsScreen extends StatefulWidget {
  final String? projectId;
  final String? projectName;
  final bool showAppBar;
  const UnitsScreen({super.key, this.projectId, this.projectName, this.showAppBar = false});

  @override
  State<UnitsScreen> createState() => _UnitsScreenState();
}

class _UnitsScreenState extends State<UnitsScreen> {
  final _service = InventoryService();
  List<UnitModel> _units = [];
  List<ProjectsProject> _projects = [];
  bool _loading = true;
  String? _error;
  String _search = '';
  String _status = 'All';
  String _projectFilter = '';

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
      final unitsF = _service.fetchUnits(projectId: widget.projectId);
      final projectsF = widget.projectId != null
          ? Future.value(<ProjectsProject>[])
          : ProjectsService().fetchProjects().catchError((_) => <ProjectsProject>[]);
      final units = await unitsF;
      final projects = await projectsF;
      if (!mounted) return;
      setState(() {
        _units = units;
        _projects = projects;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        if (!silent || _units.isEmpty) _error = friendlyError(e);
      });
    }
  }

  List<UnitModel> get _filtered {
    final q = _search.trim().toLowerCase();
    return _units.where((u) {
      if (q.isNotEmpty) {
        final hay = [u.name, u.unitType, u.projectName, u.paymentPlan].where((s) => s.isNotEmpty).join(' ').toLowerCase();
        if (!hay.contains(q)) return false;
      }
      if (_status != 'All' && u.status != _status) return false;
      if (_projectFilter.isNotEmpty && u.projectId != _projectFilter) return false;
      return true;
    }).toList();
  }

  List<UnitProjectOption> get _projectOptions {
    if (widget.projectId != null) return [(id: widget.projectId!, name: widget.projectName ?? '')];
    return [for (final p in _projects) (id: p.id, name: p.name)];
  }

  Future<void> _add() async {
    final ok = await showUnitFormSheet(context, projects: _projectOptions, fixedProjectId: widget.projectId);
    if (ok == true && mounted) {
      showModuleSnack(context, 'Unit added');
      _load(silent: true);
    }
  }

  Future<void> _edit(UnitModel u) async {
    final ok = await showUnitFormSheet(context, projects: _projectOptions, initial: u);
    if (ok == true && mounted) {
      showModuleSnack(context, 'Unit updated');
      _load(silent: true);
    }
  }

  Future<void> _delete(UnitModel u) async {
    final ok = await confirmAction(context,
        title: 'Delete unit?',
        message: 'Delete "${u.name}"? This removes it from projects and the calculator suggestions.',
        confirmLabel: 'Delete',
        destructive: true);
    if (!ok || !mounted) return;
    try {
      await _service.deleteUnit(u.id);
      if (!mounted) return;
      setState(() => _units = _units.where((x) => x.id != u.id).toList());
      showModuleSnack(context, 'Unit deleted');
    } catch (e) {
      if (mounted) showModuleSnack(context, friendlyError(e), error: true);
    }
  }

  Future<void> _setStatus(UnitModel u, String status) async {
    final before = _units;
    setState(() => _units = [for (final x in _units) x.id == u.id ? x.copyWith(status: status) : x]);
    try {
      await _service.setStatus(u.id, status);
      if (mounted) showModuleSnack(context, '"${u.name}" marked $status');
    } catch (e) {
      if (!mounted) return;
      setState(() => _units = before);
      showModuleSnack(context, friendlyError(e), error: true);
    }
  }

  Future<void> _openDetail(UnitModel u) async {
    final r = await showUnitDetailSheet(context, u);
    if (r == null || !mounted) return;
    switch (r.action) {
      case UnitSheetAction.reserve:
        await _setStatus(u, 'Reserved');
      case UnitSheetAction.edit:
        await _edit(u);
      case UnitSheetAction.delete:
        await _delete(u);
      case UnitSheetAction.none:
        if (r.filesChanged) _load(silent: true);
    }
  }

  Future<void> _pickProject() async {
    final r = await pickOption(context, title: 'Project', selected: _projectFilter, options: [
      (value: '', label: 'All projects'),
      for (final p in _projects) (value: p.id, label: p.name),
    ]);
    if (r != null) setState(() => _projectFilter = r.value);
  }

  Widget _scrollable(Widget child) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [SizedBox(height: 420, child: child)],
      );

  Widget _header() {
    final total = _units.length;
    int count(String s) => _units.where((u) => u.status == s).length;
    final options = ['All', ...InventoryService.statuses];
    final projectLabel = _projects.where((p) => p.id == _projectFilter).map((p) => p.name).firstOrNull ?? 'All projects';
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
        child: SectionHeader(
          title: widget.projectName != null ? 'Units · ${widget.projectName}' : 'Units',
          subtitle: _loading ? null : '$total unit${total == 1 ? '' : 's'} in your CRM',
        ),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: AppSearchField(hint: 'Search unit, project, type…', onChanged: (v) => setState(() => _search = v)),
      ),
      const SizedBox(height: 10),
      FilterChipRow<String>(
        options: options,
        selected: _status,
        labelOf: (s) => s == 'All' ? 'All ($total)' : '$s (${count(s)})',
        onSelected: (s) => setState(() => _status = s),
      ),
      if (widget.projectId == null && _projects.isNotEmpty)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Align(
            alignment: Alignment.centerLeft,
            child: ActionChip(
              avatar: const Icon(LucideIcons.building, size: 15),
              label: Text(projectLabel, maxLines: 1, overflow: TextOverflow.ellipsis),
              onPressed: _pickProject,
              materialTapTargetSize: MaterialTapTargetSize.padded,
            ),
          ),
        ),
      const SizedBox(height: 8),
    ]);
  }

  Widget _body() {
    if (_loading) return const SkeletonList(count: 6, height: 96);
    if (_error != null) return _scrollable(ErrorState(message: _error!, onRetry: _load));
    final list = _filtered;
    if (list.isEmpty) {
      final filtered = _units.isNotEmpty;
      return _scrollable(EmptyState(
        icon: LucideIcons.building,
        title: filtered ? 'No units match your filters' : 'No units yet',
        message: filtered
            ? 'Try a different search, status or project.'
            : 'Add units to your inventory to recommend them in the calculator.',
        actionLabel: filtered ? null : 'Add unit',
        onAction: filtered ? null : _add,
      ));
    }
    return ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
      itemCount: list.length,
      itemBuilder: (_, i) {
        final u = list[i];
        return UnitCard(
          key: ValueKey(u.id),
          unit: u,
          showProject: widget.projectId == null,
          onTap: () => _openDetail(u),
          onStatus: (s) => _setStatus(u, s),
          onEdit: () => _edit(u),
          onDelete: () => _delete(u),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return ModulePage(
      title: 'Units',
      showAppBar: widget.showAppBar,
      fab: FloatingActionButton.extended(
        onPressed: _loading ? null : _add,
        icon: const Icon(LucideIcons.plus, size: 18),
        label: const Text('Add unit'),
      ),
      body: Column(children: [
        _header(),
        Expanded(child: RefreshIndicator(onRefresh: () => _load(silent: true), child: _body())),
      ]),
    );
  }
}
