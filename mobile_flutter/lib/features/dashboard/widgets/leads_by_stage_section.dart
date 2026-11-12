import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../../core/constants/lead_stages.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/premium.dart';
import '../../../data/models/lead_model.dart';
import '../../../state/leads_provider.dart';
import '../../leads/widgets/leads_filter_sheet.dart';
import 'dash_kit.dart';

typedef LeadAction = void Function(LeadModel lead);

/// "Leads by Pipeline Stage": search, filters, stage chips and stage cards
/// (swipe / stacked / list). Owns only its own view state.
class LeadsByStageSection extends StatefulWidget {
  final LeadAction onCall;
  final LeadAction onWhatsApp;
  final LeadAction onOpen;
  final Future<void> Function(LeadModel lead, String nextStage) onAdvance;
  final VoidCallback onViewAllLeads;

  const LeadsByStageSection({
    super.key,
    required this.onCall,
    required this.onWhatsApp,
    required this.onOpen,
    required this.onAdvance,
    required this.onViewAllLeads,
  });

  @override
  State<LeadsByStageSection> createState() => _LeadsByStageSectionState();
}

class _LeadsByStageSectionState extends State<LeadsByStageSection> {
  final TextEditingController _search = TextEditingController();
  // 0 swipe cards, 1 stacked cards, 2 list
  int _mode = 0;
  bool _showEmptyStages = false;
  final Set<String> _expanded = {};

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<LeadsProvider>();
    final dark = Surf.dark(context);

    if (_search.text != p.searchQuery && !FocusScope.of(context).hasFocus) {
      _search.text = p.searchQuery;
    }

    final stageCounts = p.stageCounts;
    final grouped = p.leadsByStage;
    final filtered = p.leads;
    final selected = p.statusFilter;
    final specific = selected != 'All Leads';
    final stages = specific
        ? [selected]
        : LeadStages.allStatuses.where((s) {
            if (_showEmptyStages) return true;
            if (LeadStages.pipelineStages.contains(s)) return true;
            return grouped[s]?.isNotEmpty ?? false;
          }).toList();
    final total = p.allLeads.isNotEmpty ? p.allLeads.length : 1;

    Widget body;
    if (p.isLoading && p.allLeads.isEmpty) {
      body = const _StageSkeleton();
    } else if (filtered.isEmpty) {
      body = _EmptyFiltered(
        hasFilters: p.hasActiveFilters,
        onReset: () {
          _search.clear();
          p.clearFilters();
        },
      );
    } else if (_mode == 2) {
      body = _FlatList(
        leads: filtered,
        widget: widget,
        onAdvance: widget.onAdvance,
      );
    } else if (_mode == 0 && !specific) {
      body = SizedBox(
        height: 470,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: stages.length,
          separatorBuilder: (_, __) => const SizedBox(width: 12),
          itemBuilder: (context, i) => SizedBox(
            width: MediaQuery.sizeOf(context).width * 0.8,
            child: _StageCard(
              stage: stages[i],
              leads: grouped[stages[i]] ?? const [],
              total: total,
              horizontal: true,
              expanded: false,
              onToggleExpand: null,
              provider: p,
              section: widget,
            ),
          ),
        ),
      );
    } else {
      body = Column(
        children: [
          for (final s in stages)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _StageCard(
                stage: s,
                leads: grouped[s] ?? const [],
                total: total,
                horizontal: false,
                expanded: _expanded.contains(s),
                onToggleExpand: () => setState(() {
                  if (!_expanded.remove(s)) _expanded.add(s);
                }),
                provider: p,
                section: widget,
              ),
            ),
        ],
      );
    }

    return DashCard(
      icon: LucideIcons.layers,
      title: 'Leads by Pipeline Stage',
      subtitle: '${filtered.length} leads shown - ${stages.length} stages',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Align(
            alignment: Alignment.centerRight,
            child: _ModeSwitch(
              mode: _mode,
              onChanged: (m) => setState(() => _mode = m),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 48,
                  child: TextField(
                    controller: _search,
                    onChanged: p.setSearchQuery,
                    style: TextStyle(fontSize: 13.5, color: Surf.text(context)),
                    decoration: InputDecoration(
                      hintText: 'Search name, phone, project',
                      hintStyle:
                          TextStyle(fontSize: 13, color: Surf.subtext(context)),
                      prefixIcon: Icon(LucideIcons.search,
                          size: 16, color: Surf.subtext(context)),
                      suffixIcon: p.searchQuery.isNotEmpty
                          ? IconButton(
                              tooltip: 'Clear search',
                              icon: const Icon(LucideIcons.x, size: 16),
                              onPressed: () {
                                _search.clear();
                                p.setSearchQuery('');
                              },
                            )
                          : null,
                      filled: true,
                      fillColor: DashColors.inset(context),
                      contentPadding: EdgeInsets.zero,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(color: Surf.border(context)),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(color: Surf.border(context)),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              _FilterButton(count: p.activeFilterCount),
              if (p.hasActiveFilters) ...[
                const SizedBox(width: 6),
                SizedBox(
                  width: 48,
                  height: 48,
                  child: IconButton(
                    tooltip: 'Reset filters',
                    onPressed: () {
                      _search.clear();
                      p.clearFilters();
                    },
                    style: IconButton.styleFrom(
                      backgroundColor: AppColors.alertRed.withAlpha(22),
                      side: BorderSide(color: AppColors.alertRed.withAlpha(90)),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14)),
                    ),
                    icon: const Icon(LucideIcons.rotateCcw,
                        size: 16, color: AppColors.alertRed),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 48,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: LeadStages.allFilterOptions.length,
              separatorBuilder: (_, __) => const SizedBox(width: 6),
              itemBuilder: (context, i) {
                final opt = LeadStages.allFilterOptions[i];
                return _StageChip(
                  label: opt,
                  count: stageCounts[opt] ?? 0,
                  selected: selected == opt,
                  dark: dark,
                  onTap: () => p.setStatusFilter(opt),
                );
              },
            ),
          ),
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 48,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      for (final v in const [
                        'All Leads',
                        'Action Today',
                        'Called',
                        'Not Called',
                        'Overdue'
                      ])
                        Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: _ActivityChip(
                            label: v,
                            active: p.activityFilter == v,
                            onTap: () => p.setActivityFilter(v),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              if (!specific && _mode != 2)
                TextButton(
                  onPressed: () =>
                      setState(() => _showEmptyStages = !_showEmptyStages),
                  style: TextButton.styleFrom(
                    minimumSize: const Size(48, 48),
                    foregroundColor: Surf.accent(context),
                    textStyle: const TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w700),
                  ),
                  child: Text(_showEmptyStages ? 'Hide empty' : 'All stages'),
                ),
            ],
          ),
          const SizedBox(height: 6),
          body,
        ],
      ),
    );
  }
}

class _ModeSwitch extends StatelessWidget {
  final int mode;
  final ValueChanged<int> onChanged;
  const _ModeSwitch({required this.mode, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final dark = Surf.dark(context);
    final accent = Surf.accent(context);
    const icons = [
      LucideIcons.columns3,
      LucideIcons.layoutGrid,
      LucideIcons.list
    ];
    const tips = ['Swipable stage cards', 'Stacked stage cards', 'Lead list'];
    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: DashColors.inset(context),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Surf.border(context)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < 3; i++)
            Tooltip(
              message: tips[i],
              child: Tap48(
                onTap: () => onChanged(i),
                semanticLabel: tips[i],
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  width: 40,
                  height: 36,
                  decoration: BoxDecoration(
                    color: i == mode ? accent : Colors.transparent,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(icons[i],
                      size: 16,
                      color: i == mode
                          ? (dark ? DashColors.onLime : Colors.white)
                          : Surf.subtext(context)),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _FilterButton extends StatelessWidget {
  final int count;
  const _FilterButton({required this.count});

  @override
  Widget build(BuildContext context) {
    final on = count > 0;
    final accent = Surf.accent(context);
    return InkWell(
      onTap: () => LeadsFilterSheet.show(context),
      borderRadius: BorderRadius.circular(14),
      child: Container(
        height: 48,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(
          color: on ? accent.withAlpha(30) : DashColors.inset(context),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: on ? accent : Surf.border(context)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(LucideIcons.slidersHorizontal,
                size: 15, color: on ? accent : Surf.text(context)),
            const SizedBox(width: 6),
            Text(
              on ? 'Filters ($count)' : 'Filters',
              style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: on ? accent : Surf.text(context)),
            ),
          ],
        ),
      ),
    );
  }
}

class _StageChip extends StatelessWidget {
  final String label;
  final int count;
  final bool selected;
  final bool dark;
  final VoidCallback onTap;

  const _StageChip({
    required this.label,
    required this.count,
    required this.selected,
    required this.dark,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isAll = label == 'All Leads';
    final accent = Surf.accent(context);
    final sc = isAll
        ? (bg: accent.withAlpha(25), text: accent)
        : AppColors.getStatusColors(label, isDark: dark);
    final fgOn = dark ? DashColors.onLime : Colors.white;
    return Semantics(
      button: true,
      selected: selected,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Center(
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: selected ? accent : DashColors.inset(context),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: selected
                    ? accent
                    : (count > 0
                        ? sc.text.withAlpha(90)
                        : Surf.border(context)),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (!isAll) ...[
                  Container(
                    width: 7,
                    height: 7,
                    decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: selected ? fgOn : sc.text),
                  ),
                  const SizedBox(width: 6),
                ],
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                    color: selected ? fgOn : Surf.text(context),
                  ),
                ),
                const SizedBox(width: 6),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(
                    color: selected ? fgOn.withAlpha(36) : sc.bg,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '$count',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      fontFeatures: kTabular,
                      color: selected ? fgOn : sc.text,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ActivityChip extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _ActivityChip(
      {required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: active,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Center(
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(
              color: active
                  ? DashColors.blue.withAlpha(Surf.dark(context) ? 45 : 25)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                  color: active ? DashColors.blue : Surf.border(context)),
            ),
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: active ? FontWeight.w800 : FontWeight.w600,
                color: active ? DashColors.blue : Surf.subtext(context),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _StageCard extends StatelessWidget {
  final String stage;
  final List<LeadModel> leads;
  final int total;
  final bool horizontal;
  final bool expanded;
  final VoidCallback? onToggleExpand;
  final LeadsProvider provider;
  final LeadsByStageSection section;

  const _StageCard({
    required this.stage,
    required this.leads,
    required this.total,
    required this.horizontal,
    required this.expanded,
    required this.onToggleExpand,
    required this.provider,
    required this.section,
  });

  @override
  Widget build(BuildContext context) {
    final dark = Surf.dark(context);
    final sc = AppColors.getStatusColors(stage, isDark: dark);
    final count = leads.length;
    final pct = (count / total).clamp(0.0, 1.0);
    final limit = horizontal ? 6 : (expanded ? count : 3);
    final visible = leads.take(limit).toList();

    final header = InkWell(
      onTap: () => provider
          .setStatusFilter(provider.statusFilter == stage ? 'All Leads' : stage),
      borderRadius: BorderRadius.circular(12),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 48),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                  color: sc.bg, borderRadius: BorderRadius.circular(10)),
              child: Icon(LeadStages.iconFor(stage), size: 17, color: sc.text),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(stage,
                      style: TextStyle(
                          fontSize: 14,
                          height: 1.2,
                          fontWeight: FontWeight.w800,
                          color: Surf.text(context))),
                  Text(
                    '${LeadStages.categoryLabel(stage)} - ${(pct * 100).toStringAsFixed(0)}% of funnel',
                    style:
                        TextStyle(fontSize: 11, color: Surf.subtext(context)),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: sc.bg,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: sc.text.withAlpha(70)),
              ),
              child: Text(
                '$count',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    fontFeatures: kTabular,
                    color: sc.text),
              ),
            ),
          ],
        ),
      ),
    );

    final empty = Padding(
      padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 12),
      child: Center(
        child: Text('No leads currently in $stage',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
      ),
    );

    Widget card(LeadModel l) => _LeadRow(
          lead: l,
          stageColors: sc,
          onCall: () => section.onCall(l),
          onWhatsApp: () => section.onWhatsApp(l),
          onOpen: () => section.onOpen(l),
          onAdvance: (n) => section.onAdvance(l, n),
        );

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: DashColors.inset(context),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: count > 0
              ? sc.text.withAlpha(dark ? 95 : 80)
              : Surf.border(context),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: horizontal ? MainAxisSize.max : MainAxisSize.min,
        children: [
          header,
          const SizedBox(height: 8),
          GrowBar(
            value: count > 0 ? pct.clamp(0.06, 1.0) : 0.02,
            color: sc.text,
            track: Surf.card(context),
            height: 5,
          ),
          const SizedBox(height: 10),
          if (horizontal)
            Expanded(
              child: leads.isEmpty
                  ? empty
                  : ListView.separated(
                      padding: EdgeInsets.zero,
                      itemCount: visible.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) => card(visible[i]),
                    ),
            )
          else if (leads.isEmpty)
            empty
          else ...[
            for (final l in visible)
              Padding(padding: const EdgeInsets.only(bottom: 8), child: card(l)),
            if (leads.length > 3 && onToggleExpand != null)
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: onToggleExpand,
                  style: TextButton.styleFrom(
                      minimumSize: const Size(48, 48),
                      foregroundColor: Surf.accent(context)),
                  icon: Icon(
                      expanded ? LucideIcons.chevronUp : LucideIcons.chevronDown,
                      size: 15),
                  label: Text(
                    expanded ? 'Show less' : 'Show all ${leads.length} leads',
                    style: const TextStyle(
                        fontSize: 12.5, fontWeight: FontWeight.w700),
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

/// Lead row: tap to open, with a 48dp action bar (call / WhatsApp / advance).
class _LeadRow extends StatelessWidget {
  final LeadModel lead;
  final ({Color bg, Color text}) stageColors;
  final VoidCallback onCall;
  final VoidCallback onWhatsApp;
  final VoidCallback onOpen;
  final Future<void> Function(String next) onAdvance;

  const _LeadRow({
    required this.lead,
    required this.stageColors,
    required this.onCall,
    required this.onWhatsApp,
    required this.onOpen,
    required this.onAdvance,
  });

  @override
  Widget build(BuildContext context) {
    final next = LeadStages.nextPipelineStage(lead.status);
    final parts = <String>[
      if (lead.project?.trim().isNotEmpty ?? false) lead.project!.trim(),
      if (lead.propertyType?.trim().isNotEmpty ?? false)
        lead.propertyType!.trim(),
      if (lead.source?.trim().isNotEmpty ?? false) lead.source!.trim(),
    ];
    final subtitle = parts.isNotEmpty ? parts.join(' - ') : lead.phone;

    Widget action(IconData icon, String label, Color color, VoidCallback f) =>
        Expanded(
          child: Tooltip(
            message: label,
            child: InkWell(
              onTap: f,
              borderRadius: BorderRadius.circular(10),
              child: SizedBox(
                height: 48,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(icon, size: 15, color: color),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: color),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );

    return Container(
      decoration: BoxDecoration(
        color: Surf.card(context),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Surf.border(context)),
      ),
      child: Column(
        children: [
          InkWell(
            onTap: onOpen,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(14)),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 17,
                    backgroundColor: stageColors.bg,
                    child: Text(
                      lead.name.isNotEmpty ? lead.name[0].toUpperCase() : 'L',
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: stageColors.text),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          lead.name.isNotEmpty ? lead.name : 'Unnamed Lead',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 13.5,
                              height: 1.2,
                              fontWeight: FontWeight.w800,
                              color: Surf.text(context)),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          subtitle,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 11.5, color: Surf.subtext(context)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          Divider(height: 1, color: Surf.border(context)),
          Row(
            children: [
              action(LucideIcons.phoneCall, 'Call', Surf.accent(context),
                  onCall),
              action(LucideIcons.messageCircle, 'WhatsApp',
                  DashColors.whatsapp, onWhatsApp),
              if (next != null)
                action(LucideIcons.arrowRightCircle, 'Advance',
                    stageColors.text, () => onAdvance(next)),
            ],
          ),
        ],
      ),
    );
  }
}

class _FlatList extends StatelessWidget {
  final List<LeadModel> leads;
  final LeadsByStageSection widget;
  final Future<void> Function(LeadModel lead, String next) onAdvance;
  const _FlatList(
      {required this.leads, required this.widget, required this.onAdvance});

  @override
  Widget build(BuildContext context) {
    final dark = Surf.dark(context);
    final visible = leads.take(12).toList();
    return Column(
      children: [
        for (final l in visible)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _LeadRow(
              lead: l,
              stageColors: AppColors.getStatusColors(l.status, isDark: dark),
              onCall: () => widget.onCall(l),
              onWhatsApp: () => widget.onWhatsApp(l),
              onOpen: () => widget.onOpen(l),
              onAdvance: (n) => onAdvance(l, n),
            ),
          ),
        if (leads.length > 12)
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: widget.onViewAllLeads,
              style: TextButton.styleFrom(
                  minimumSize: const Size(48, 48),
                  foregroundColor: Surf.accent(context)),
              icon: const Icon(LucideIcons.arrowRight, size: 15),
              label: Text(
                'View all ${leads.length} filtered leads',
                style: const TextStyle(
                    fontSize: 12.5, fontWeight: FontWeight.w700),
              ),
            ),
          ),
      ],
    );
  }
}

class _EmptyFiltered extends StatelessWidget {
  final bool hasFilters;
  final VoidCallback onReset;
  const _EmptyFiltered({required this.hasFilters, required this.onReset});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: DashColors.inset(context),
        borderRadius: BorderRadius.circular(16),
      ),
      child: EmptyState(
        icon: LucideIcons.searchX,
        title: 'No leads match the selected stage or filters',
        message: 'Try selecting another stage chip or clearing active filters.',
        actionLabel: hasFilters ? 'Reset all filters' : null,
        onAction: hasFilters ? onReset : null,
      ),
    );
  }
}

class _StageSkeleton extends StatelessWidget {
  const _StageSkeleton();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var i = 0; i < 3; i++)
          Container(
            height: 84,
            margin: const EdgeInsets.only(bottom: 10),
            decoration: BoxDecoration(
              color: Surf.muted(context),
              borderRadius: BorderRadius.circular(16),
            ),
          ),
      ],
    );
  }
}
