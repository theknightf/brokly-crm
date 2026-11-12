import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/constants/lead_stages.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/lead_model.dart';
import '../../state/leads_provider.dart';
import 'lead_detail_screen.dart';
import 'widgets/lead_card.dart';
import 'widgets/lead_kanban_board.dart';
import 'widgets/leads_filter_sheet.dart';

const Color _onNeon = Color(0xFF142407);

const List<({String name, Color? color})> _quickActivityTags = [
  (name: 'All Leads', color: null),
  (name: 'Action Today', color: Color(0xFFF59E0B)),
  (name: 'Called', color: Color(0xFF10B981)),
  (name: 'Not Called', color: Color(0xFFF43F5E)),
  (name: 'Overdue', color: Color(0xFFEF4444)),
];

class LeadsScreen extends StatefulWidget {
  const LeadsScreen({super.key});

  @override
  State<LeadsScreen> createState() => _LeadsScreenState();
}

class _LeadsScreenState extends State<LeadsScreen> {
  final Set<String> _collapsedStages = {};

  void _openLeadDetail(LeadModel lead) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => LeadDetailScreen(leadId: lead.id)),
    );
  }

  void _toggleStage(String stage) {
    setState(() {
      if (!_collapsedStages.remove(stage)) _collapsedStages.add(stage);
    });
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Surf.dark(context);
    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0B0D10) : const Color(0xFFF8FAFC),
      body: SafeArea(
        child: Column(
          children: [
            const _LeadsHeader(),
            const _LeadsSearchBar(),
            const _StageChipsBar(),
            const _ActivityChipsBar(),
            const _ActiveFiltersBar(),
            Expanded(
              child: _LeadsBody(
                collapsed: _collapsedStages,
                onToggleStage: _toggleStage,
                onOpen: _openLeadDetail,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Header: title, count, view-mode toggle ─────────────────────────────────

class _LeadsHeader extends StatelessWidget {
  const _LeadsHeader();

  @override
  Widget build(BuildContext context) {
    final text = Surf.text(context);
    final sub = Surf.subtext(context);
    final data = context.select<LeadsProvider, ({int shown, int total, String stage, String mode})>(
      (p) => (shown: p.leads.length, total: p.allLeads.length, stage: p.statusFilter, mode: p.viewMode),
    );
    final provider = context.read<LeadsProvider>();
    final isAll = data.stage == LeadStages.allLeads;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 12, 4),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      'Leads',
                      style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -0.5, color: text),
                    ),
                    const SizedBox(width: 8),
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 200),
                      child: Container(
                        key: ValueKey('${data.shown}/${data.total}'),
                        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                        decoration: BoxDecoration(
                          color: Surf.accent(context).withAlpha(28),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          data.shown == data.total ? '${data.total}' : '${data.shown} of ${data.total}',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: Surf.accent(context),
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                Text(
                  isAll ? 'All pipeline stages' : data.stage,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, color: sub),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(
              color: Surf.muted(context),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Surf.border(context)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _ViewModeButton(
                  icon: LucideIcons.layers,
                  tooltip: 'Stage Cards View',
                  active: data.mode == 'stages',
                  onTap: () => provider.setViewMode('stages'),
                ),
                _ViewModeButton(
                  icon: LucideIcons.list,
                  tooltip: 'List View',
                  active: data.mode == 'list',
                  onTap: () => provider.setViewMode('list'),
                ),
                _ViewModeButton(
                  icon: LucideIcons.columns,
                  tooltip: 'Kanban Board',
                  active: data.mode == 'kanban',
                  onTap: () => provider.setViewMode('kanban'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ViewModeButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final bool active;
  final VoidCallback onTap;
  const _ViewModeButton({required this.icon, required this.tooltip, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(11),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
          width: 44,
          height: 42,
          decoration: BoxDecoration(
            color: active ? AppColors.neonLime : Colors.transparent,
            borderRadius: BorderRadius.circular(11),
          ),
          child: Icon(icon, size: 18, color: active ? _onNeon : Surf.subtext(context)),
        ),
      ),
    );
  }
}

// ── Sticky search + filter button ──────────────────────────────────────────

class _LeadsSearchBar extends StatefulWidget {
  const _LeadsSearchBar();

  @override
  State<_LeadsSearchBar> createState() => _LeadsSearchBarState();
}

class _LeadsSearchBarState extends State<_LeadsSearchBar> {
  final TextEditingController _controller = TextEditingController();
  Timer? _debounce;
  String _lastSent = '';

  @override
  void initState() {
    super.initState();
    final q = context.read<LeadsProvider>().searchQuery;
    _controller.text = q;
    _lastSent = q;
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 250), () {
      if (!mounted) return;
      _lastSent = value;
      context.read<LeadsProvider>().setSearchQuery(value);
    });
  }

  void _clear() {
    _debounce?.cancel();
    _controller.clear();
    _lastSent = '';
    context.read<LeadsProvider>().setSearchQuery('');
  }

  @override
  Widget build(BuildContext context) {
    final query = context.select<LeadsProvider, String>((p) => p.searchQuery);
    final filterCount = context.select<LeadsProvider, int>((p) => p.activeFilterCount);
    // External change (e.g. "Clear all"): reflect it in the field.
    if (query != _lastSent && query != _controller.text) {
      _lastSent = query;
      _debounce?.cancel();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _controller.text != query) {
          _controller.value = TextEditingValue(
            text: query,
            selection: TextSelection.collapsed(offset: query.length),
          );
        }
      });
    }

    final hasFilters = filterCount > 0;
    final sub = Surf.subtext(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 4),
      child: Row(
        children: [
          Expanded(
            child: Container(
              height: 48,
              decoration: BoxDecoration(
                color: Surf.card(context),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Surf.border(context)),
              ),
              child: Row(
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                    child: Icon(LucideIcons.search, size: 18, color: sub),
                  ),
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      onChanged: _onChanged,
                      textInputAction: TextInputAction.search,
                      style: TextStyle(fontSize: 14, color: Surf.text(context)),
                      decoration: InputDecoration(
                        hintText: 'Search name, phone, project...',
                        hintStyle: TextStyle(fontSize: 13.5, color: sub),
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        filled: false,
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                  ValueListenableBuilder<TextEditingValue>(
                    valueListenable: _controller,
                    builder: (_, v, __) => v.text.isEmpty
                        ? const SizedBox(width: 8)
                        : IconButton(
                            tooltip: 'Clear search',
                            onPressed: _clear,
                            icon: Icon(LucideIcons.xCircle, size: 18, color: sub),
                          ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          Tooltip(
            message: 'Filters',
            child: InkWell(
              onTap: () => LeadsFilterSheet.show(context),
              borderRadius: BorderRadius.circular(14),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOut,
                height: 48,
                constraints: const BoxConstraints(minWidth: 48),
                padding: const EdgeInsets.symmetric(horizontal: 14),
                decoration: BoxDecoration(
                  color: hasFilters ? AppColors.neonLime : Surf.card(context),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: hasFilters ? AppColors.neonLime : Surf.border(context)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(LucideIcons.slidersHorizontal, size: 18, color: hasFilters ? _onNeon : sub),
                    if (hasFilters) ...[
                      const SizedBox(width: 6),
                      Text(
                        '$filterCount',
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: _onNeon),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Stage chips with live counts ───────────────────────────────────────────

class _StageChipsBar extends StatelessWidget {
  const _StageChipsBar();

  @override
  Widget build(BuildContext context) {
    final isDark = Surf.dark(context);
    final selectedStage = context.select<LeadsProvider, String>((p) => p.statusFilter);
    final counts = context.select<LeadsProvider, Map<String, int>>(
      (p) => p.stageCounts,
    );
    final provider = context.read<LeadsProvider>();

    // Cap text scaling so counts never clip inside the chip row.
    final mq = MediaQuery.of(context);
    return MediaQuery(
      data: mq.copyWith(textScaler: mq.textScaler.clamp(maxScaleFactor: 1.2)),
      child: SizedBox(
        height: 48,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          itemCount: LeadStages.allFilterOptions.length,
          separatorBuilder: (_, __) => const SizedBox(width: 6),
          itemBuilder: (context, index) {
            final stage = LeadStages.allFilterOptions[index];
            return _StageChip(
              key: ValueKey(stage),
              stage: stage,
              count: counts[stage] ?? 0,
              selected: selectedStage == stage,
              isDark: isDark,
              onTap: () => provider.setStatusFilter(stage),
            );
          },
        ),
      ),
    );
  }
}

class _StageChip extends StatelessWidget {
  final String stage;
  final int count;
  final bool selected;
  final bool isDark;
  final VoidCallback onTap;
  const _StageChip({
    super.key,
    required this.stage,
    required this.count,
    required this.selected,
    required this.isDark,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isAll = stage == LeadStages.allLeads;
    final colors = isAll
        ? (text: Surf.text(context), bg: Surf.muted(context))
        : AppColors.getStatusColors(stage, isDark: isDark);
    final fg = selected ? _onNeon : Surf.text(context);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
        constraints: const BoxConstraints(minHeight: 40),
        padding: const EdgeInsets.only(left: 11, right: 6),
        decoration: BoxDecoration(
          color: selected ? AppColors.neonLime : Surf.card(context),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: selected ? AppColors.neonLime : colors.text.withAlpha(isDark ? 80 : 60),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(LeadStages.iconFor(stage), size: 14, color: selected ? _onNeon : colors.text),
            const SizedBox(width: 6),
            Text(
              stage,
              softWrap: false,
              style: TextStyle(fontSize: 12.5, fontWeight: selected ? FontWeight.w800 : FontWeight.w600, color: fg),
            ),
            const SizedBox(width: 6),
            Container(
              constraints: const BoxConstraints(minWidth: 24),
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: selected ? _onNeon.withAlpha(30) : colors.bg,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                '$count',
                textAlign: TextAlign.center,
                softWrap: false,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: selected ? _onNeon : colors.text,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Activity quick filters ─────────────────────────────────────────────────

class _ActivityChipsBar extends StatelessWidget {
  const _ActivityChipsBar();

  @override
  Widget build(BuildContext context) {
    final selected = context.select<LeadsProvider, String>((p) => p.activityFilter);
    final provider = context.read<LeadsProvider>();
    final accent = Surf.accent(context);

    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        itemCount: _quickActivityTags.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (context, i) {
          final tag = _quickActivityTags[i];
          final on = selected == tag.name;
          return InkWell(
            onTap: () => provider.setActivityFilter(tag.name),
            borderRadius: BorderRadius.circular(12),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeOut,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: on ? accent.withAlpha(32) : Colors.transparent,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: on ? accent : Surf.border(context)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (tag.color != null) ...[
                    Container(
                      width: 7,
                      height: 7,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: tag.color),
                    ),
                    const SizedBox(width: 6),
                  ],
                  Text(
                    tag.name == 'All Leads' ? 'All Activity' : tag.name,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: on ? FontWeight.w800 : FontWeight.w600,
                      color: on ? accent : Surf.subtext(context),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// ── Active filter chips + clear all ────────────────────────────────────────

typedef _ActiveFilters = ({
  String query,
  String stage,
  String activity,
  String project,
  String type,
  String source,
  bool assignee,
});

class _ActiveFiltersBar extends StatelessWidget {
  const _ActiveFiltersBar();

  @override
  Widget build(BuildContext context) {
    final f = context.select<LeadsProvider, _ActiveFilters>(
      (p) => (
        query: p.searchQuery.trim(),
        stage: p.statusFilter,
        activity: p.activityFilter,
        project: p.projectFilter,
        type: p.propertyTypeFilter,
        source: p.sourceFilter,
        assignee: p.assigneeFilter != null && p.assigneeFilter!.isNotEmpty,
      ),
    );
    final provider = context.read<LeadsProvider>();

    final chips = <Widget>[
      if (f.query.isNotEmpty)
        _RemovableChip(
          label: '"${f.query}"',
          onRemove: () => provider.setSearchQuery(''),
        ),
      if (f.stage != LeadStages.allLeads)
        _RemovableChip(label: f.stage, onRemove: () => provider.setStatusFilter(LeadStages.allLeads)),
      if (f.activity != 'All Leads')
        _RemovableChip(label: f.activity, onRemove: () => provider.setActivityFilter('All Leads')),
      if (f.project != 'All Projects')
        _RemovableChip(label: f.project, onRemove: () => provider.setProjectFilter('All Projects')),
      if (f.type != 'All Types')
        _RemovableChip(label: f.type, onRemove: () => provider.setPropertyTypeFilter('All Types')),
      if (f.source != 'All Sources')
        _RemovableChip(label: f.source, onRemove: () => provider.setSourceFilter('All Sources')),
      if (f.assignee) _RemovableChip(label: 'Assignee', onRemove: () => provider.setAssigneeFilter(null)),
    ];

    return AnimatedSize(
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOut,
      alignment: Alignment.topCenter,
      child: chips.isEmpty
          ? const SizedBox(width: double.infinity)
          : SizedBox(
              height: 44,
              child: Row(
                children: [
                  Expanded(
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.fromLTRB(16, 4, 4, 4),
                      itemCount: chips.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 6),
                      itemBuilder: (_, i) => Center(child: chips[i]),
                    ),
                  ),
                  TextButton(
                    onPressed: provider.clearFilters,
                    style: TextButton.styleFrom(
                      minimumSize: const Size(48, 48),
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      foregroundColor: AppColors.alertRed,
                    ),
                    child: const Text('Clear all', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800)),
                  ),
                  const SizedBox(width: 4),
                ],
              ),
            ),
    );
  }
}

class _RemovableChip extends StatelessWidget {
  final String label;
  final VoidCallback onRemove;
  const _RemovableChip({required this.label, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    final accent = Surf.accent(context);
    return InkWell(
      onTap: onRemove,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        height: 32,
        constraints: const BoxConstraints(maxWidth: 200),
        padding: const EdgeInsets.only(left: 12, right: 8),
        decoration: BoxDecoration(
          color: accent.withAlpha(26),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: accent.withAlpha(90)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Surf.text(context)),
              ),
            ),
            const SizedBox(width: 6),
            Icon(LucideIcons.x, size: 14, color: Surf.subtext(context)),
          ],
        ),
      ),
    );
  }
}

// ── Body: loading / error / empty / list / kanban ──────────────────────────

class _StageHeaderItem {
  final String stage;
  final int count;
  final bool collapsed;
  const _StageHeaderItem(this.stage, this.count, this.collapsed);
}

class _EmptyStageItem {
  final String stage;
  const _EmptyStageItem(this.stage);
}

class _LeadsBody extends StatelessWidget {
  final Set<String> collapsed;
  final ValueChanged<String> onToggleStage;
  final ValueChanged<LeadModel> onOpen;

  const _LeadsBody({
    required this.collapsed,
    required this.onToggleStage,
    required this.onOpen,
  });

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<LeadsProvider>();
    final isDark = Surf.dark(context);

    if (provider.isLoading && provider.allLeads.isEmpty) {
      return const SkeletonList(count: 5, height: 168);
    }
    if (provider.error != null && provider.allLeads.isEmpty) {
      return ErrorState(
        message: 'We could not load your leads. Check your connection and try again.',
        onRetry: () => provider.fetchLeads(),
      );
    }

    final displayed = provider.leads;

    Widget content;
    if (displayed.isEmpty) {
      content = _scrollableCentered(
        provider.allLeads.isEmpty
            ? const EmptyState(
                icon: LucideIcons.users,
                title: 'No leads yet',
                message: 'Tap the + button to add your first lead.',
              )
            : EmptyState(
                icon: LucideIcons.searchX,
                title: provider.statusFilter != LeadStages.allLeads
                    ? 'No leads in "${provider.statusFilter}"'
                    : 'No leads match your filters',
                message: 'Try another stage or clear the active filters.',
                actionLabel: provider.hasActiveFilters ? 'Clear all filters' : null,
                onAction: provider.hasActiveFilters ? provider.clearFilters : null,
              ),
      );
    } else if (provider.isKanban) {
      content = LeadKanbanBoard(leads: displayed, onLeadTap: onOpen);
    } else if (provider.isStagesView) {
      content = _buildStageList(provider, isDark);
    } else {
      content = ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 96),
        itemCount: displayed.length,
        itemBuilder: (context, i) {
          final lead = displayed[i];
          return LeadCard(key: ValueKey(lead.id), lead: lead, onTap: () => onOpen(lead));
        },
      );
    }

    return RefreshIndicator(
      onRefresh: () => provider.fetchLeads(),
      color: AppColors.neonLime,
      backgroundColor: Surf.card(context),
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 200),
        switchInCurve: Curves.easeOut,
        child: KeyedSubtree(key: ValueKey(provider.viewMode), child: content),
      ),
    );
  }

  Widget _scrollableCentered(Widget child) {
    return LayoutBuilder(
      builder: (context, c) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: c.maxHeight),
          child: Center(child: child),
        ),
      ),
    );
  }

  Widget _buildStageList(LeadsProvider provider, bool isDark) {
    final byStage = provider.leadsByStage;
    final stages = provider.statusFilter != LeadStages.allLeads
        ? <String>[provider.statusFilter]
        : LeadStages.allStatuses
            .where((s) => (byStage[s]?.isNotEmpty ?? false) || LeadStages.pipelineStages.contains(s))
            .toList();

    final items = <Object>[];
    for (final stage in stages) {
      final leads = byStage[LeadStages.normalize(stage)] ?? const <LeadModel>[];
      final isCollapsed = collapsed.contains(stage);
      items.add(_StageHeaderItem(stage, leads.length, isCollapsed));
      if (isCollapsed) continue;
      if (leads.isEmpty) {
        items.add(_EmptyStageItem(stage));
      } else {
        items.addAll(leads);
      }
    }

    return ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 96),
      itemCount: items.length,
      itemBuilder: (context, i) {
        final item = items[i];
        if (item is _StageHeaderItem) {
          return _StageHeader(
            key: ValueKey('stage-${item.stage}'),
            stage: item.stage,
            count: item.count,
            collapsed: item.collapsed,
            isDark: isDark,
            onTap: () => onToggleStage(item.stage),
          );
        }
        if (item is _EmptyStageItem) {
          return Padding(
            key: ValueKey('empty-${item.stage}'),
            padding: const EdgeInsets.fromLTRB(4, 4, 4, 16),
            child: Text(
              'No leads currently in ${item.stage}',
              style: TextStyle(fontSize: 12.5, color: Surf.subtext(context)),
            ),
          );
        }
        final lead = item as LeadModel;
        return LeadCard(key: ValueKey(lead.id), lead: lead, onTap: () => onOpen(lead));
      },
    );
  }
}

class _StageHeader extends StatelessWidget {
  final String stage;
  final int count;
  final bool collapsed;
  final bool isDark;
  final VoidCallback onTap;

  const _StageHeader({
    super.key,
    required this.stage,
    required this.count,
    required this.collapsed,
    required this.isDark,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.getStatusColors(stage, isDark: isDark);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10, top: 4),
      child: Material(
        color: colors.bg.withAlpha(isDark ? 110 : 170),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 56),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: colors.text.withAlpha(30),
                      borderRadius: BorderRadius.circular(11),
                    ),
                    child: Icon(LeadStages.iconFor(stage), size: 17, color: colors.text),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          stage,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: Surf.text(context)),
                        ),
                        Text(
                          LeadStages.categoryLabel(stage),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 11.5, color: Surf.subtext(context)),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: colors.text.withAlpha(30),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      '$count',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
                        color: colors.text,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  AnimatedRotation(
                    turns: collapsed ? 0.5 : 0,
                    duration: const Duration(milliseconds: 200),
                    curve: Curves.easeOut,
                    child: Icon(LucideIcons.chevronUp, size: 18, color: Surf.subtext(context)),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
