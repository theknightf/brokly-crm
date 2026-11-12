import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/teams_models.dart';
import '../../data/services/teams_service.dart';
import '../admin/admin_ui.dart';

/// One team: Members tab + Performance & profitability tab.
/// Pushed from [TeamsScreen]; has its own Scaffold/app bar.
class TeamDetailScreen extends StatefulWidget {
  final TeamsTeam team;
  final bool canManage;
  const TeamDetailScreen({super.key, required this.team, required this.canManage});

  @override
  State<TeamDetailScreen> createState() => _TeamDetailScreenState();
}

class _TeamDetailScreenState extends State<TeamDetailScreen> {
  final TeamsService _service = TeamsService();
  String _tab = 'members';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.team.name, overflow: TextOverflow.ellipsis)),
      body: SafeArea(
        child: Column(children: [
          const SizedBox(height: 8),
          FilterChipRow<String>(
            options: const ['members', 'performance'],
            selected: _tab,
            labelOf: (v) => v == 'members' ? 'Members' : 'Performance',
            onSelected: (v) => setState(() => _tab = v),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: _tab == 'members'
                ? _MembersTab(key: const ValueKey('m'), service: _service, team: widget.team, canManage: widget.canManage)
                : _PerformanceTab(key: const ValueKey('p'), service: _service, team: widget.team, canRate: widget.canManage),
          ),
        ]),
      ),
    );
  }
}

// ─── Members ────────────────────────────────────────────────────────────────

class _MembersTab extends StatelessWidget {
  final TeamsService service;
  final TeamsTeam team;
  final bool canManage;
  const _MembersTab({super.key, required this.service, required this.team, required this.canManage});

  @override
  Widget build(BuildContext context) {
    return AdminLoader<List<TeamsMember>>(
      loader: () => service.getMembers(team.id),
      builder: (context, members, reload) => [
        SectionHeader(
          title: '${members.length} member${members.length == 1 ? '' : 's'}',
          subtitle: canManage ? 'Add, remove or promote members' : 'Read-only view',
          trailing: canManage
              ? AdminButton(
                  label: 'Add',
                  icon: LucideIcons.userPlus,
                  onPressed: () => _add(context, members, reload),
                )
              : null,
        ),
        if (members.isEmpty)
          const AdminEmptyBlock(icon: LucideIcons.users, title: 'No members yet', message: 'This team has no members.')
        else
          for (final m in members)
            PremiumCard(
              padding: const EdgeInsets.all(12),
              child: Row(children: [
                AdminAvatar(m.name.isEmpty ? m.email : m.name),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Flexible(
                        child: Text(m.name.isEmpty ? m.email : m.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: Surf.text(context))),
                      ),
                      if (m.isLeader) ...[
                        const SizedBox(width: 6),
                        const StatusPill('Leader', color: AppColors.amber, icon: LucideIcons.crown),
                      ],
                    ]),
                    const SizedBox(height: 2),
                    Text('${AdminFmt.label(m.role)}  ·  ${m.email}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
                  ]),
                ),
                if (canManage)
                  PopupMenuButton<String>(
                    tooltip: 'Member actions',
                    icon: const Icon(LucideIcons.ellipsisVertical, size: 20),
                    onSelected: (v) => v == 'leader' ? _makeLeader(context, m, reload) : _remove(context, m, reload),
                    itemBuilder: (_) => [
                      if (!m.isLeader) const PopupMenuItem(value: 'leader', height: 48, child: Text('Make team leader')),
                      const PopupMenuItem(
                        value: 'remove',
                        height: 48,
                        child: Text('Remove from team', style: TextStyle(color: AppColors.alertRed)),
                      ),
                    ],
                  ),
              ]),
            ),
      ],
    );
  }

  Future<void> _makeLeader(BuildContext context, TeamsMember m, Future<void> Function() reload) async {
    try {
      await service.setLeader(team.id, m.userId);
      if (context.mounted) adminSnack(context, 'Team leader updated');
      await reload();
    } catch (e) {
      if (context.mounted) adminSnack(context, adminErr(e), error: true);
    }
  }

  Future<void> _remove(BuildContext context, TeamsMember m, Future<void> Function() reload) async {
    final name = m.name.isEmpty ? m.email : m.name;
    final ok = await confirmAction(
      context,
      title: 'Remove $name?',
      message: 'They will no longer belong to "${team.name}".',
      confirmLabel: 'Remove',
      destructive: true,
    );
    if (!ok) return;
    try {
      await service.removeMember(team.id, m.userId);
      if (context.mounted) adminSnack(context, '$name removed from team');
      await reload();
    } catch (e) {
      if (context.mounted) adminSnack(context, adminErr(e), error: true);
    }
  }

  Future<void> _add(BuildContext context, List<TeamsMember> members, Future<void> Function() reload) async {
    final added = await showPremiumSheet<bool>(
      context,
      builder: (ctx) => _AddMemberSheet(
        service: service,
        team: team,
        existingIds: members.map((m) => m.userId).toSet(),
      ),
    );
    if (added == true) {
      if (context.mounted) adminSnack(context, 'Member added to team');
      await reload();
    }
  }
}

class _AddMemberSheet extends StatefulWidget {
  final TeamsService service;
  final TeamsTeam team;
  final Set<String> existingIds;
  const _AddMemberSheet({required this.service, required this.team, required this.existingIds});

  @override
  State<_AddMemberSheet> createState() => _AddMemberSheetState();
}

class _AddMemberSheetState extends State<_AddMemberSheet> {
  late final Future<List<TeamsCandidate>> _future = widget.service.getCandidates();
  String _query = '';
  String? _selected;
  bool _leader = false;
  bool _busy = false;

  Future<void> _submit() async {
    if (_selected == null) {
      adminSnack(context, 'Please select a user', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      await widget.service.addMember(widget.team.id, _selected!, _leader);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        adminSnack(context, adminErr(e), error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.of(context).size.height * 0.75;
    return SizedBox(
      height: height,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Add team member',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Surf.text(context))),
          const SizedBox(height: 4),
          Text('A user belongs to one team at a time; adding moves them here.',
              style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
          const SizedBox(height: 12),
          AppSearchField(hint: 'Search users', onChanged: (v) => setState(() => _query = v)),
          const SizedBox(height: 8),
          Expanded(
            child: FutureBuilder<List<TeamsCandidate>>(
              future: _future,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snap.hasError) {
                  return Center(child: Text(adminErr(snap.error!), style: TextStyle(color: Surf.subtext(context))));
                }
                final q = _query.trim().toLowerCase();
                final list = (snap.data ?? [])
                    .where((u) => !widget.existingIds.contains(u.id))
                    .where((u) => q.isEmpty || u.label.toLowerCase().contains(q) || u.email.toLowerCase().contains(q))
                    .toList();
                if (list.isEmpty) {
                  return const EmptyState(icon: LucideIcons.userX, title: 'No available users');
                }
                return ListView.builder(
                  itemCount: list.length,
                  itemBuilder: (_, i) {
                    final u = list[i];
                    final on = _selected == u.id;
                    return ListTile(
                      minVerticalPadding: 8,
                      contentPadding: EdgeInsets.zero,
                      leading: AdminAvatar(u.label, size: 38),
                      title: Text(u.label, maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text(
                        '${AdminFmt.label(u.role)}${u.teamId != null ? '  ·  already in a team' : ''}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      trailing: on ? Icon(LucideIcons.circleCheck, color: Surf.accent(context)) : null,
                      onTap: () => setState(() => _selected = u.id),
                    );
                  },
                );
              },
            ),
          ),
          AdminSwitchRow(label: 'Make team leader', value: _leader, onChanged: (v) => setState(() => _leader = v)),
          Row(children: [
            Expanded(child: AdminButton(label: 'Cancel', outlined: true, onPressed: () => Navigator.pop(context))),
            const SizedBox(width: 12),
            Expanded(child: AdminButton(label: 'Add member', icon: LucideIcons.userPlus, busy: _busy, onPressed: _submit)),
          ]),
        ]),
      ),
    );
  }
}

// ─── Performance ────────────────────────────────────────────────────────────

class _PerformanceTab extends StatefulWidget {
  final TeamsService service;
  final TeamsTeam team;
  final bool canRate;
  const _PerformanceTab({super.key, required this.service, required this.team, required this.canRate});

  @override
  State<_PerformanceTab> createState() => _PerformanceTabState();
}

class _PerformanceTabState extends State<_PerformanceTab> {
  String _range = 'all';
  final TextEditingController _comment = TextEditingController();
  double _rating = 0;
  bool _saving = false;
  String? _seededFor;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<TeamsPerformance?> _load() {
    final from = _range == '30' ? DateTime.now().subtract(const Duration(days: 30)) : null;
    return widget.service.getTeamPerformance(widget.team.id, from: from);
  }

  Future<void> _save(TeamsPerformance p, Future<void> Function() reload) async {
    if (p.leaderId == null || _rating < 1) return;
    setState(() => _saving = true);
    try {
      await widget.service.rateLeader(
        teamId: p.teamId,
        leaderId: p.leaderId!,
        rating: _rating,
        comment: _comment.text,
      );
      if (mounted) adminSnack(context, 'Leader rating saved');
      _seededFor = null;
      await reload();
    } catch (e) {
      if (mounted) adminSnack(context, adminErr(e), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AdminLoader<TeamsPerformance?>(
      key: ValueKey(_range),
      loader: _load,
      header: Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: FilterChipRow<String>(
          options: const ['all', '30'],
          selected: _range,
          labelOf: (v) => v == 'all' ? 'All time' : 'Last 30 days',
          onSelected: (v) => setState(() {
            _range = v;
            _seededFor = null;
          }),
        ),
      ),
      builder: (context, p, reload) {
        if (p == null) {
          return const [AdminEmptyBlock(icon: LucideIcons.chartBar, title: 'No performance data')];
        }
        if (_seededFor != '${p.teamId}$_range') {
          _seededFor = '${p.teamId}$_range';
          _rating = p.rating?.rating ?? 0;
          _comment.text = p.rating?.comment ?? '';
        }
        final s = p.stats;
        final accent = Surf.accent(context);
        return [
          const SectionHeader(title: 'Performance & profitability', subtitle: 'Team KPIs, leader performance and rating'),
          AdminMetricGrid(tiles: [
            MetricTile(label: 'Members', value: AdminFmt.number(p.memberCount), icon: LucideIcons.users, color: accent),
            MetricTile(label: 'Calls', value: AdminFmt.number(s.calls), icon: LucideIcons.phone, color: AppColors.tealCyan, caption: AdminFmt.duration(s.callSeconds)),
            MetricTile(label: 'Leads', value: AdminFmt.number(s.leads), icon: LucideIcons.target, color: AppColors.amber),
            MetricTile(label: 'Won deals', value: AdminFmt.number(s.won), icon: LucideIcons.trophy, color: accent, caption: '${s.conversion.toStringAsFixed(1)}% conversion'),
            MetricTile(label: 'Revenue', value: AdminFmt.money(s.revenue), icon: LucideIcons.wallet, color: accent),
            MetricTile(label: 'Expenses', value: AdminFmt.money(s.expenses), icon: LucideIcons.receipt, color: AppColors.alertRed),
          ]),
          const SizedBox(height: 10),
          MetricTile(
            label: 'Profit',
            value: AdminFmt.money(s.profit),
            icon: LucideIcons.trendingUp,
            color: s.profit >= 0 ? accent : AppColors.alertRed,
            caption: '${s.profitMargin.toStringAsFixed(1)}% margin',
          ),
          const SizedBox(height: 12),
          PremiumCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                const Icon(LucideIcons.crown, size: 18, color: AppColors.amber),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(p.leaderName.isEmpty ? 'No team leader' : p.leaderName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Surf.text(context))),
                ),
              ]),
              if (p.leaderStats != null) ...[
                const SizedBox(height: 10),
                Text(
                  '${AdminFmt.number(p.leaderStats!.calls)} calls  ·  ${AdminFmt.number(p.leaderStats!.leads)} leads  ·  '
                  '${AdminFmt.number(p.leaderStats!.won)} won  ·  ${AdminFmt.money(p.leaderStats!.revenue)}',
                  style: TextStyle(fontSize: 12.5, color: Surf.subtext(context)),
                ),
              ],
              const Divider(height: 28),
              Text('Leader rating', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Surf.text(context))),
              const SizedBox(height: 6),
              AdminStars(
                value: widget.canRate ? _rating : (p.rating?.rating ?? 0),
                onChanged: widget.canRate && p.leaderId != null ? (v) => setState(() => _rating = v.toDouble()) : null,
              ),
              if (p.rating != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    'Rated ${p.rating!.rating.toStringAsFixed(1)}/5${p.rating!.ratedByName.isEmpty ? '' : ' by ${p.rating!.ratedByName}'}',
                    style: TextStyle(fontSize: 12, color: Surf.subtext(context)),
                  ),
                ),
              if (widget.canRate) ...[
                const SizedBox(height: 12),
                AdminField(label: 'Comment (optional)', controller: _comment, maxLines: 2),
                AdminButton(
                  label: 'Save rating',
                  icon: LucideIcons.check,
                  busy: _saving,
                  onPressed: p.leaderId == null || _rating < 1 ? null : () => _save(p, reload),
                ),
              ] else if (p.rating == null)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text('Rating not set yet. Ask your owner or admin.',
                      style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
                )
              else if (p.rating!.comment.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text('"${p.rating!.comment}"',
                      style: TextStyle(fontSize: 12.5, fontStyle: FontStyle.italic, color: Surf.subtext(context))),
                ),
            ]),
          ),
        ];
      },
    );
  }
}
