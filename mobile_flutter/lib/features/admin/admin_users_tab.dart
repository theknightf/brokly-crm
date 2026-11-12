import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/admin_models.dart';
import '../../data/models/teams_models.dart';
import '../../data/services/admin_service.dart';
import '../../data/services/teams_service.dart';
import '../../state/auth_provider.dart';
import 'admin_ui.dart';
import 'employee_360_screen.dart';

class _UsersData {
  final List<AdminUser> users;
  final List<TeamsTeam> teams;
  const _UsersData(this.users, this.teams);
}

/// Users & roles. Edit / activate / change team are done directly (RLS policy
/// admins_manage_profiles). Creating users, setting passwords and hard-deleting
/// accounts need the service-role key and therefore stay on the web.
class AdminUsersTab extends StatefulWidget {
  const AdminUsersTab({super.key});

  @override
  State<AdminUsersTab> createState() => _AdminUsersTabState();
}

class _AdminUsersTabState extends State<AdminUsersTab> {
  final AdminService _service = AdminService();
  final TeamsService _teams = TeamsService();
  String _query = '';
  String _filter = 'all';

  Future<_UsersData> _load() async {
    final r = await Future.wait([_service.getUsers(), _teams.getTeams(isAdmin: true, userId: '')]);
    return _UsersData(r[0] as List<AdminUser>, r[1] as List<TeamsTeam>);
  }

  @override
  Widget build(BuildContext context) {
    final me = context.watch<AuthProvider>().profile;
    final isOwner = (me?.role ?? '').trim().toLowerCase() == 'owner';
    return AdminLoader<_UsersData>(
      loader: _load,
      builder: (context, data, reload) {
        final q = _query.trim().toLowerCase();
        final teamName = {for (final t in data.teams) t.id: t.name};
        final list = data.users.where((u) {
          if (_filter == 'active' && !u.isActive) return false;
          if (_filter == 'inactive' && u.isActive) return false;
          if (_filter == 'admins' && !(u.role == 'admin' || u.role == 'owner')) return false;
          if (q.isEmpty) return true;
          return u.displayName.toLowerCase().contains(q) ||
              u.email.toLowerCase().contains(q) ||
              u.role.toLowerCase().contains(q) ||
              u.agentCode.toLowerCase().contains(q);
        }).toList();
        return [
          SectionHeader(title: 'Users', subtitle: '${data.users.length} accounts. Roles, team and access'),
          AppSearchField(hint: 'Search name, email, role or code', onChanged: (v) => setState(() => _query = v)),
          const SizedBox(height: 10),
          AdminChipRow<String>(
            options: const ['all', 'active', 'inactive', 'admins'],
            selected: _filter,
            labelOf: (v) => AdminFmt.label(v),
            onSelected: (v) => setState(() => _filter = v),
          ),
          const SizedBox(height: 12),
          const AdminNote('Creating users, setting passwords and deleting accounts are done on the web.'),
          if (list.isEmpty)
            const AdminEmptyBlock(icon: LucideIcons.users, title: 'No users found')
          else
            for (final u in list)
              _UserCard(
                user: u,
                teamName: u.teamId == null ? null : teamName[u.teamId],
                onTap: () => _edit(context, u, data, isOwner, me!.id, me.role, reload),
              ),
        ];
      },
    );
  }

  Future<void> _edit(BuildContext context, AdminUser u, _UsersData data, bool isOwner, String meId, String meRole,
      Future<void> Function() reload) async {
    final saved = await showPremiumSheet<bool>(
      context,
      builder: (ctx) => _UserEditSheet(
        service: _service,
        teamsService: _teams,
        user: u,
        teams: data.teams,
        isOwner: isOwner,
        actorId: meId,
        actorRole: meRole,
      ),
    );
    if (saved == true) {
      if (context.mounted) adminSnack(context, 'User updated');
      await reload();
    }
  }
}

class _UserCard extends StatelessWidget {
  final AdminUser user;
  final String? teamName;
  final VoidCallback onTap;
  const _UserCard({required this.user, required this.teamName, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isAdmin = user.role == 'admin' || user.role == 'owner';
    return PremiumCard(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      child: Row(children: [
        AdminAvatar(user.displayName),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(user.displayName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Surf.text(context))),
            const SizedBox(height: 2),
            Text(user.email, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
            const SizedBox(height: 8),
            Wrap(spacing: 6, runSpacing: 6, children: [
              StatusPill(AdminFmt.label(user.role), color: isAdmin ? AppColors.amber : Surf.accent(context)),
              StatusPill(user.isActive ? 'Active' : 'Inactive', color: user.isActive ? AppColors.statusInterested : AppColors.alertRed),
              if (teamName != null) StatusPill(teamName!, color: AppColors.tealCyan, icon: LucideIcons.users),
            ]),
          ]),
        ),
        Icon(LucideIcons.chevronRight, size: 18, color: Surf.subtext(context)),
      ]),
    );
  }
}

class _UserEditSheet extends StatefulWidget {
  final AdminService service;
  final TeamsService teamsService;
  final AdminUser user;
  final List<TeamsTeam> teams;
  final bool isOwner;
  final String actorId;
  final String actorRole;

  const _UserEditSheet({
    required this.service,
    required this.teamsService,
    required this.user,
    required this.teams,
    required this.isOwner,
    required this.actorId,
    required this.actorRole,
  });

  @override
  State<_UserEditSheet> createState() => _UserEditSheetState();
}

class _UserEditSheetState extends State<_UserEditSheet> {
  late final TextEditingController _name = TextEditingController(text: widget.user.fullName);
  late final TextEditingController _phone = TextEditingController(text: widget.user.phone);
  late String _role = adminAllowedRoles.contains(widget.user.role) ? widget.user.role : 'agent';
  late bool _active = widget.user.isActive;
  late String? _teamId = widget.teams.any((t) => t.id == widget.user.teamId) ? widget.user.teamId : null;
  bool _busy = false;

  bool get _isSelf => widget.user.id == widget.actorId;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) {
      adminSnack(context, 'Full name is required', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      final u = widget.user;
      await widget.service.updateUser(
        u.id,
        actorId: widget.actorId,
        actorRole: widget.actorRole,
        fullName: _name.text,
        phone: _phone.text,
        role: _role != u.role ? _role : null,
        isActive: _active != u.isActive ? _active : null,
      );
      if (_teamId != u.teamId) {
        if (_teamId == null) {
          if (u.teamId != null) await widget.teamsService.removeMember(u.teamId!, u.id);
        } else {
          await widget.teamsService.addMember(_teamId!, u.id, false);
        }
      }
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        adminSnack(context, adminErr(e), error: true);
      }
    }
  }

  Future<void> _reset() async {
    final ok = await confirmAction(
      context,
      title: 'Send password reset?',
      message: 'An email with a reset link will be sent to ${widget.user.email}.',
      confirmLabel: 'Send email',
    );
    if (!ok) return;
    try {
      await widget.service.sendPasswordReset(widget.user.email);
      if (mounted) adminSnack(context, 'Reset email sent');
    } catch (e) {
      if (mounted) adminSnack(context, adminErr(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final u = widget.user;
    // Only an owner may grant owner/admin (PATCH /api/admin/users rule).
    final roles = adminAllowedRoles.where((r) => widget.isOwner || (r != 'owner' && r != 'admin') || r == u.role).toList();
    return AdminSheetBody(
      title: 'Edit user',
      subtitle: u.email,
      children: [
        AdminField(label: 'Full name', controller: _name),
        AdminField(label: 'Phone', controller: _phone, keyboard: TextInputType.phone, direction: TextDirection.ltr),
        AdminDropdown<String>(
          label: _isSelf ? 'Role (you cannot change your own)' : 'Role',
          value: roles.contains(_role) ? _role : null,
          items: [for (final r in roles) DropdownMenuItem(value: r, child: Text(AdminFmt.label(r)))],
          onChanged: _isSelf ? (_) {} : (v) => setState(() => _role = v ?? _role),
        ),
        AdminDropdown<String?>(
          label: 'Team',
          value: _teamId,
          items: [
            const DropdownMenuItem<String?>(value: null, child: Text('No team')),
            for (final t in widget.teams) DropdownMenuItem<String?>(value: t.id, child: Text(t.name, overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (v) => setState(() => _teamId = v),
        ),
        AdminSwitchRow(
          label: _isSelf ? 'Active (you cannot deactivate yourself)' : 'Account active',
          value: _active,
          onChanged: _isSelf ? (_) {} : (v) => setState(() => _active = v),
        ),
        const SizedBox(height: 8),
        Wrap(spacing: 10, runSpacing: 10, children: [
          AdminButton(
            label: 'Open 360 profile',
            icon: LucideIcons.chartNoAxesCombined,
            outlined: true,
            onPressed: () {
              final nav = Navigator.of(context);
              nav.pop();
              nav.push(MaterialPageRoute(builder: (_) => Employee360Screen(employeeId: u.id, standalone: true)));
            },
          ),
          AdminButton(label: 'Send reset email', icon: LucideIcons.mail, outlined: true, onPressed: _reset),
        ]),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: AdminButton(label: 'Cancel', outlined: true, onPressed: () => Navigator.pop(context))),
          const SizedBox(width: 12),
          Expanded(child: AdminButton(label: 'Save', icon: LucideIcons.check, busy: _busy, onPressed: _save)),
        ]),
      ],
    );
  }
}
