import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/duplicates_models.dart';
import '../../data/services/duplicates_service.dart';
import '../../state/auth_provider.dart';
import 'widgets/dup_screen_frame.dart';

enum _Filter { all, conflict, clean }

enum _HubAction { merge, keepBoth, discard, reassign }

class _HubResult {
  final _HubAction action;
  final bool lead1IsMaster;
  final DuplicatePerson? assignee;
  const _HubResult(this.action, this.lead1IsMaster, this.assignee);
}

/// Web `/duplicate-leads` (Duplicate Leads Resolution Hub). Owner / admin only.
/// Scans all active leads for shared phone / e-mail, lets an admin choose the master record and
/// Merge, Keep both, Discard the duplicate, or Reassign sole ownership. Runs under the admin's
/// own session (RLS), the same table writes the web API route performs.
class DuplicateCenterScreen extends StatefulWidget {
  const DuplicateCenterScreen({super.key});

  @override
  State<DuplicateCenterScreen> createState() => _DuplicateCenterScreenState();
}

class _DuplicateCenterScreenState extends State<DuplicateCenterScreen> {
  final _service = DuplicatesService();
  HubData? _data;
  bool _loading = true;
  String? _error;
  bool _busy = false;
  _Filter _filter = _Filter.all;
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (isAdminRoleKey(context.read<AuthProvider>().profile?.role)) {
      _load();
    } else {
      _loading = false;
    }
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) setState(() => _loading = true);
    try {
      final d = await _service.fetchHub();
      if (!mounted) return;
      setState(() {
        _data = d;
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = duplicatesErrorMessage(e, fallback: 'Failed to scan for duplicates');
        _loading = false;
      });
    }
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating));
  }

  Future<void> _open(HubCase c) async {
    if (_busy) return;
    final res = await showPremiumSheet<_HubResult>(context, builder: (_) => _CaseSheet(hubCase: c, agents: _data?.agents ?? const []));
    if (res == null || !mounted) return;
    final master = res.lead1IsMaster ? c.lead1 : c.lead2;
    final dup = res.lead1IsMaster ? c.lead2 : c.lead1;
    final String title, message, label, ok;
    switch (res.action) {
      case _HubAction.merge:
        title = 'Merge into master?';
        message = 'Notes, calls and follow-ups of "${dup.name}" move to "${master.name}", then the duplicate is removed.';
        label = 'Merge';
        ok = 'Merged duplicate into master record';
      case _HubAction.keepBoth:
        title = 'Keep both leads?';
        message = '"${dup.name}" is approved as an independent lead and leaves the duplicate queue.';
        label = 'Keep both';
        ok = 'Marked as reviewed and kept separate';
      case _HubAction.discard:
        title = 'Discard the duplicate?';
        message = '"${dup.name}" is deleted (or archived if it cannot be deleted). This cannot be undone.';
        label = 'Discard';
        ok = 'Duplicate lead discarded';
      case _HubAction.reassign:
        title = 'Reassign ownership?';
        message = '"${master.name}" is reassigned to ${res.assignee?.name ?? 'the selected agent'} and the duplicate is removed.';
        label = 'Reassign';
        ok = 'Ownership reassigned and duplicate resolved';
    }
    final go = await confirmAction(context,
        title: title, message: message, confirmLabel: label, destructive: res.action == _HubAction.discard);
    if (!go || !mounted || _busy) return;
    setState(() => _busy = true);
    try {
      switch (res.action) {
        case _HubAction.merge:
          await _service.hubMerge(master.id, dup.id);
        case _HubAction.keepBoth:
          await _service.hubKeepBoth(dup.id);
        case _HubAction.discard:
          await _service.hubDiscard(master.id, dup.id);
        case _HubAction.reassign:
          await _service.hubReassign(master.id, dup.id, res.assignee!);
      }
      if (!mounted) return;
      _toast(ok);
      await _load(silent: true);
    } catch (e) {
      if (mounted) _toast(duplicatesErrorMessage(e, fallback: 'Action failed. Please try again.'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final role = context.watch<AuthProvider>().profile?.role;
    if (!isAdminRoleKey(role)) {
      return const DupScreenFrame(
        title: 'Duplicate Center',
        subtitle: 'Admins and the Owner only',
        body: EmptyState(
          icon: LucideIcons.shieldAlert,
          title: 'Access restricted',
          message: 'The Duplicate Center is reserved for Administrators and the Company Owner to arbitrate lead ownership.',
        ),
      );
    }
    return DupScreenFrame(
      title: 'Duplicate Center',
      subtitle: 'Duplicates found by phone or e-mail, for review.',
      refreshing: _loading && _data != null,
      onRefresh: _load,
      body: _body(),
    );
  }

  Widget _body() {
    final d = _data;
    if (_loading && d == null) return const SkeletonList(count: 4, height: 150);
    if (_error != null && d == null) return ErrorState(message: _error!, onRetry: _load);
    if (d == null) return const SizedBox.shrink();
    final cases = d.cases.where((c) => _filter == _Filter.all || (_filter == _Filter.conflict ? c.conflict : !c.conflict)).toList();
    return RefreshIndicator(
      onRefresh: () => _load(silent: true),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Row(children: [
            Expanded(child: MetricTile(label: 'Queue', value: '${d.cases.length}', icon: LucideIcons.layers)),
            const SizedBox(width: 10),
            Expanded(
                child: MetricTile(
                    label: 'Clean', value: '${d.clean}', icon: LucideIcons.circleCheck, color: AppColors.statusInterested)),
            const SizedBox(width: 10),
            Expanded(
                child: MetricTile(label: 'Disputes', value: '${d.conflicts}', icon: LucideIcons.triangleAlert, color: AppColors.alertRed)),
          ]),
          const SizedBox(height: 12),
          SizedBox(
            height: 40,
            child: ListView(scrollDirection: Axis.horizontal, children: [
              _chip('All (${d.cases.length})', _Filter.all),
              const SizedBox(width: 8),
              _chip('Disputes (${d.conflicts})', _Filter.conflict),
              const SizedBox(width: 8),
              _chip('Clean (${d.clean})', _Filter.clean),
            ]),
          ),
          const SizedBox(height: 12),
          if (cases.isEmpty)
            const SizedBox(
              height: 300,
              child: EmptyState(
                icon: LucideIcons.circleCheck,
                title: 'No pending duplicate leads',
                message: 'Incoming duplicates are routed here automatically for review.',
              ),
            )
          else
            for (final c in cases) _CaseCard(hubCase: c, onTap: _busy ? null : () => _open(c)),
          if (d.logs.isNotEmpty) ...[
            const SectionHeader(title: 'Routing and resolution log', subtitle: 'Latest 40 entries'),
            for (final l in d.logs)
              PremiumCard(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(
                        child: Text(l.actionType,
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Surf.text(context)))),
                    Text(l.createdAt, style: TextStyle(fontSize: 11, color: Surf.subtext(context), fontFeatures: tabularFigures)),
                  ]),
                  if (l.detail.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(l.detail, style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
                    ),
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('by ${l.actorName}', style: TextStyle(fontSize: 11.5, color: Surf.subtext(context))),
                  ),
                ]),
              ),
          ],
        ],
      ),
    );
  }

  Widget _chip(String label, _Filter f) {
    final on = _filter == f;
    return ChoiceChip(
      label: Text(label),
      selected: on,
      onSelected: (_) => setState(() => _filter = f),
      showCheckmark: false,
      labelStyle: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: on ? Colors.black : Surf.subtext(context)),
      selectedColor: Surf.accent(context),
      backgroundColor: Surf.muted(context),
      side: BorderSide.none,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
    );
  }
}

class _CaseCard extends StatelessWidget {
  final HubCase hubCase;
  final VoidCallback? onTap;
  const _CaseCard({required this.hubCase, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final c = hubCase;
    return PremiumCard(
      onTap: onTap,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Text(c.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Surf.text(context))),
          ),
          const SizedBox(width: 8),
          Icon(LucideIcons.chevronRight, size: 18, color: Surf.subtext(context)),
        ]),
        const SizedBox(height: 4),
        Text(c.matchType == 'email' ? c.email : c.phone,
            style: TextStyle(fontSize: 13, color: Surf.subtext(context), fontFeatures: tabularFigures)),
        const SizedBox(height: 10),
        Wrap(spacing: 6, runSpacing: 6, children: [
          StatusPill(c.matchType == 'email' ? 'Email match' : 'Phone match', color: Surf.accent(context)),
          StatusPill(c.conflict ? 'Agent dispute' : 'Clean match', color: c.conflict ? AppColors.alertRed : AppColors.statusInterested),
          StatusPill(c.groupId, color: Surf.subtext(context)),
        ]),
        const SizedBox(height: 10),
        Text(c.disputeAgents, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Surf.text(context))),
        const SizedBox(height: 2),
        Text('Submitted by ${c.submittedBy} · ${c.routedAt}',
            style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
      ]),
    );
  }
}

class _CaseSheet extends StatefulWidget {
  final HubCase hubCase;
  final List<DuplicatePerson> agents;
  const _CaseSheet({required this.hubCase, required this.agents});

  @override
  State<_CaseSheet> createState() => _CaseSheetState();
}

class _CaseSheetState extends State<_CaseSheet> {
  bool _lead1Master = true;
  String? _assignee;

  @override
  void initState() {
    super.initState();
    final c = widget.hubCase;
    final pref = c.lead1.assignedToId ?? c.lead2.assignedToId;
    if (pref != null && widget.agents.any((a) => a.id == pref)) {
      _assignee = pref;
    } else if (widget.agents.isNotEmpty) {
      _assignee = widget.agents.first.id;
    }
  }

  void _done(_HubAction a) {
    DuplicatePerson? who;
    if (a == _HubAction.reassign) {
      for (final p in widget.agents) {
        if (p.id == _assignee) who = p;
      }
      if (who == null) return;
    }
    Navigator.pop(context, _HubResult(a, _lead1Master, who));
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.hubCase;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(c.name, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Surf.text(context))),
        const SizedBox(height: 2),
        Text('${c.groupId} · ${c.territory}', style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
        if (c.conflict)
          Container(
            margin: const EdgeInsets.only(top: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.alertRed.withAlpha(24),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.alertRed.withAlpha(90)),
            ),
            child: Text('Agent dispute: ${c.disputeAgents}. Choose the master record, then merge, reassign or discard.',
                style: TextStyle(fontSize: 12.5, color: Surf.text(context))),
          ),
        const SizedBox(height: 14),
        _LeadPanel(label: 'Lead A', lead: c.lead1, master: _lead1Master, onPick: () => setState(() => _lead1Master = true)),
        const SizedBox(height: 10),
        _LeadPanel(label: 'Lead B', lead: c.lead2, master: !_lead1Master, onPick: () => setState(() => _lead1Master = false)),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: () => _done(_HubAction.merge),
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          icon: const Icon(LucideIcons.gitMerge, size: 16),
          label: const Text('Merge into master'),
        ),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => _done(_HubAction.keepBoth),
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              icon: const Icon(LucideIcons.eye, size: 16),
              label: const Text('Keep both'),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => _done(_HubAction.discard),
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48), foregroundColor: AppColors.alertRed),
              icon: const Icon(LucideIcons.trash2, size: 16),
              label: const Text('Discard dup.'),
            ),
          ),
        ]),
        const SizedBox(height: 16),
        Text('Reassign ownership', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Surf.text(context))),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: _assignee,
          isExpanded: true,
          decoration: InputDecoration(
            filled: true,
            fillColor: Surf.muted(context),
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
          ),
          items: [
            for (final a in widget.agents)
              DropdownMenuItem(value: a.id, child: Text(a.name, overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (v) => setState(() => _assignee = v),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: _assignee == null ? null : () => _done(_HubAction.reassign),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          icon: const Icon(LucideIcons.userCheck, size: 16),
          label: const Text('Reassign and resolve'),
        ),
      ]),
    );
  }
}

class _LeadPanel extends StatelessWidget {
  final String label;
  final HubLead lead;
  final bool master;
  final VoidCallback onPick;
  const _LeadPanel({required this.label, required this.lead, required this.master, required this.onPick});

  @override
  Widget build(BuildContext context) {
    final accent = Surf.accent(context);
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onPick,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: master ? accent.withAlpha(24) : Surf.card(context),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: master ? accent : Surf.border(context), width: master ? 1.5 : 1),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(master ? LucideIcons.circleCheck : LucideIcons.circle, size: 20, color: master ? accent : Surf.subtext(context)),
            const SizedBox(width: 8),
            Expanded(
              child: Text('$label · ${master ? 'Master' : 'Duplicate'}',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: master ? accent : Surf.subtext(context))),
            ),
            if (lead.stage.isNotEmpty) StatusPill(lead.stage),
          ]),
          const SizedBox(height: 6),
          DetailRow('Name', lead.name),
          DetailRow('Rep', '${lead.repName} (${lead.repRole})'),
          DetailRow('Added by', lead.createdByName),
          DetailRow('Ingested', lead.ingested),
          DetailRow('Source', lead.source),
          DetailRow('Project', lead.project),
          DetailRow('Budget', lead.budget),
          DetailRow('Notes', lead.notes),
        ]),
      ),
    );
  }
}
