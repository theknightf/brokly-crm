import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/teams_models.dart';
import '../../data/services/teams_service.dart';
import '../../state/auth_provider.dart';
import '../admin/admin_ui.dart';
import 'team_detail_screen.dart';

/// Teams list. Mirrors web `/teams` (TeamsManagementScreen).
///  - owners & admins: all teams, can create / edit / delete / manage members
///  - team leaders: only their own team(s), read-only
///  - everyone else: refused with a clear message
///
/// Works embedded in the shell (no app bar) and when pushed standalone.
class TeamsScreen extends StatefulWidget {
  const TeamsScreen({super.key});

  @override
  State<TeamsScreen> createState() => _TeamsScreenState();
}

bool teamsCanView(String? role) {
  final r = (role ?? '').trim().toLowerCase().replaceAll(RegExp(r'[\s-]+'), '_');
  return r == 'owner' || r == 'admin' || r == 'owner_admin' || r == 'owneradmin' || r == 'team_leader' || r == 'team_lead';
}

bool teamsCanManage(String? role) {
  final r = (role ?? '').trim().toLowerCase().replaceAll(RegExp(r'[\s-]+'), '_');
  return r == 'owner' || r == 'admin' || r == 'owner_admin' || r == 'owneradmin';
}

class _TeamsScreenState extends State<TeamsScreen> {
  final TeamsService _service = TeamsService();
  final GlobalKey<AdminLoaderState<List<TeamsTeam>>> _loaderKey = GlobalKey();
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final profile = context.watch<AuthProvider>().profile;
    if (profile == null) return const SkeletonList();
    if (!teamsCanView(profile.role)) {
      return const AdminAccessDenied(
        message: 'The Teams page is available to owners, admins and team leaders only.',
      );
    }
    final canManage = teamsCanManage(profile.role);

    return AdminLoader<List<TeamsTeam>>(
      key: _loaderKey,
      loader: () => _service.getTeams(isAdmin: canManage, userId: profile.id),
      builder: (context, teams, reload) {
        final q = _query.trim().toLowerCase();
        final list = q.isEmpty
            ? teams
            : teams.where((t) => t.name.toLowerCase().contains(q) || t.leaderName.toLowerCase().contains(q)).toList();
        return [
          SectionHeader(
            title: 'Teams',
            subtitle: canManage ? 'Create teams and manage their members' : 'Your team and its performance',
            trailing: canManage
                ? AdminButton(label: 'New team', icon: LucideIcons.plus, onPressed: () => _editTeam(context, null, reload))
                : null,
          ),
          AppSearchField(hint: 'Search teams or leaders', onChanged: (v) => setState(() => _query = v)),
          const SizedBox(height: 14),
          if (list.isEmpty)
            AdminEmptyBlock(
              icon: LucideIcons.users,
              title: teams.isEmpty ? 'No teams yet' : 'No matching teams',
              message: teams.isEmpty
                  ? (canManage ? 'Tap "New team" to create the first one.' : 'You are not part of a team yet.')
                  : 'Try a different search.',
            )
          else
            for (final t in list)
              _TeamCard(
                team: t,
                canManage: canManage,
                onOpen: () async {
                  await Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => TeamDetailScreen(team: t, canManage: canManage),
                  ));
                  reload();
                },
                onEdit: () => _editTeam(context, t, reload),
                onDelete: () => _deleteTeam(context, t, reload),
              ),
        ];
      },
    );
  }

  Future<void> _editTeam(BuildContext context, TeamsTeam? team, Future<void> Function() reload) async {
    final saved = await showPremiumSheet<bool>(
      context,
      builder: (ctx) => _TeamForm(service: _service, team: team),
    );
    if (saved == true) {
      if (context.mounted) adminSnack(context, team == null ? 'Team created' : 'Team updated');
      await reload();
    }
  }

  Future<void> _deleteTeam(BuildContext context, TeamsTeam team, Future<void> Function() reload) async {
    final ok = await confirmAction(
      context,
      title: 'Delete "${team.name}"?',
      message: 'All members will be released from this team. This cannot be undone.',
      confirmLabel: 'Delete team',
      destructive: true,
    );
    if (!ok) return;
    try {
      await _service.deleteTeam(team.id);
      if (context.mounted) adminSnack(context, 'Team deleted');
      await reload();
    } catch (e) {
      if (context.mounted) adminSnack(context, adminErr(e), error: true);
    }
  }
}

class _TeamCard extends StatelessWidget {
  final TeamsTeam team;
  final bool canManage;
  final VoidCallback onOpen;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const _TeamCard({
    required this.team,
    required this.canManage,
    required this.onOpen,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      onTap: onOpen,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: Surf.accent(context).withAlpha(32),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(LucideIcons.users, size: 20, color: Surf.accent(context)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(team.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Surf.text(context))),
                const SizedBox(height: 2),
                Text(
                  team.leaderName.isEmpty ? 'No leader assigned' : 'Led by ${team.leaderName}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12.5, color: Surf.subtext(context)),
                ),
              ]),
            ),
            if (canManage)
              PopupMenuButton<String>(
                tooltip: 'Team actions',
                icon: const Icon(LucideIcons.ellipsisVertical, size: 20),
                onSelected: (v) => v == 'edit' ? onEdit() : onDelete(),
                itemBuilder: (_) => [
                  const PopupMenuItem(value: 'edit', height: 48, child: Text('Edit team')),
                  const PopupMenuItem(
                    value: 'delete',
                    height: 48,
                    child: Text('Delete team', style: TextStyle(color: AppColors.alertRed)),
                  ),
                ],
              )
            else
              Icon(LucideIcons.chevronRight, size: 18, color: Surf.subtext(context)),
          ]),
          if (team.description.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(team.description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 13, color: Surf.subtext(context))),
          ],
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 6, children: [
            StatusPill('${team.memberCount} member${team.memberCount == 1 ? '' : 's'}',
                color: Surf.accent(context), icon: LucideIcons.user),
            if (team.leaderName.isNotEmpty) const StatusPill('Leader set', color: AppColors.tealCyan, icon: LucideIcons.crown),
          ]),
        ],
      ),
    );
  }
}

class _TeamForm extends StatefulWidget {
  final TeamsService service;
  final TeamsTeam? team;
  const _TeamForm({required this.service, this.team});

  @override
  State<_TeamForm> createState() => _TeamFormState();
}

class _TeamFormState extends State<_TeamForm> {
  late final TextEditingController _name = TextEditingController(text: widget.team?.name ?? '');
  late final TextEditingController _desc = TextEditingController(text: widget.team?.description ?? '');
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) {
      setState(() => _error = 'Team name is required');
      return;
    }
    setState(() => _busy = true);
    try {
      if (widget.team == null) {
        await widget.service.createTeam(_name.text.trim(), _desc.text.trim());
      } else {
        await widget.service.updateTeam(widget.team!.id, _name.text.trim(), _desc.text.trim());
      }
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
    return AdminSheetBody(
      title: widget.team == null ? 'Add new team' : 'Edit team',
      children: [
        AdminField(
          label: 'Team name *',
          controller: _name,
          hint: 'e.g. Cairo Sales Team',
          errorText: _error,
          onChanged: (_) => setState(() => _error = null),
        ),
        AdminField(label: 'Description (optional)', controller: _desc, maxLines: 3),
        Row(children: [
          Expanded(child: AdminButton(label: 'Cancel', outlined: true, onPressed: () => Navigator.pop(context))),
          const SizedBox(width: 12),
          Expanded(
            child: AdminButton(
              label: widget.team == null ? 'Add team' : 'Save changes',
              icon: LucideIcons.check,
              busy: _busy,
              onPressed: _save,
            ),
          ),
        ]),
      ],
    );
  }
}
