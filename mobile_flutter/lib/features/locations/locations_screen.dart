import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/locations_models.dart';
import '../../data/models/user_profile_model.dart';
import '../../data/services/locations_service.dart';
import '../../data/services/users_service.dart';
import '../../state/auth_provider.dart';
import '../projects/projects_common.dart';
import 'locations_sheets.dart';

const _violet = Color(0xFF7C3AED);

/// Site-visit locations: check in / out with GPS, share location, active
/// visits and a filterable history with map / navigate shortcuts.
///
/// Roles (same as the website + RLS): owners and admins see every visit and
/// can filter by agent; everyone else sees only their own visits.
class LocationsScreen extends StatefulWidget {
  final bool showAppBar;
  const LocationsScreen({super.key, this.showAppBar = false});

  @override
  State<LocationsScreen> createState() => _LocationsScreenState();
}

class _LocationsScreenState extends State<LocationsScreen> {
  final _service = LocationsService();
  List<LocationsVisit> _visits = [];
  List<UserProfileModel> _users = [];
  bool _loading = true;
  String? _error;
  bool _isAdmin = false;
  String _myId = '';
  bool _started = false;
  String _filterUserId = '';
  String _search = '';
  String _statusFilter = '';
  DateTime? _from;
  DateTime? _to;
  DateTime _now = DateTime.now();
  Timer? _ticker;
  bool _sharing = false;
  String _shareError = '';

  static const _statusOptions = <PickOption>[
    (value: '', label: 'All statuses'),
    (value: 'in_progress', label: 'In progress'),
    (value: 'scheduled', label: 'Scheduled'),
    (value: 'completed', label: 'Completed'),
    (value: 'no_show', label: 'No-show'),
    (value: 'cancelled', label: 'Cancelled'),
  ];

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted && _visits.any((v) => v.isActive)) setState(() => _now = DateTime.now());
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final p = context.watch<AuthProvider>().profile;
    final admin = p?.isAdmin ?? false;
    if (!_started || admin != _isAdmin) {
      _started = true;
      _isAdmin = admin;
      _myId = p?.id ?? _service.currentUserId ?? '';
      if (admin) _loadUsers();
      _load();
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  Future<void> _loadUsers() async {
    final u = await UsersService().getAssignableUsers();
    if (mounted) setState(() => _users = u);
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final v = await _service.fetchVisits(isAdmin: _isAdmin, filterUserId: _filterUserId);
      if (!mounted) return;
      setState(() {
        _visits = v;
        _loading = false;
        _error = null;
        _now = DateTime.now();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        if (!silent || _visits.isEmpty) _error = friendlyError(e);
      });
    }
  }

  List<LocationsVisit> get _myActive => _visits.where((v) => v.isActive && v.userId == _myId).toList();
  List<LocationsVisit> get _active => _visits.where((v) => v.isActive).toList();

  List<LocationsVisit> get _history {
    final mine = _myActive.firstOrNull?.id;
    final q = _search.trim().toLowerCase();
    final fromStart = _from == null ? null : DateTime(_from!.year, _from!.month, _from!.day);
    final toEnd = _to == null ? null : DateTime(_to!.year, _to!.month, _to!.day, 23, 59, 59);
    return _visits.where((v) {
      if (v.id == mine) return false;
      if (q.isNotEmpty &&
          !(v.projectName.toLowerCase().contains(q) ||
              v.leadName.toLowerCase().contains(q) ||
              v.agentName.toLowerCase().contains(q))) {
        return false;
      }
      if (_statusFilter.isNotEmpty && v.status != _statusFilter) return false;
      final at = v.checkInAt;
      if (at != null) {
        if (fromStart != null && at.isBefore(fromStart)) return false;
        if (toEnd != null && at.isAfter(toEnd)) return false;
      }
      return true;
    }).toList();
  }

  Future<void> _checkIn() async {
    if (_myActive.isNotEmpty) {
      showModuleSnack(context, 'You already have a visit in progress. Check out first.', error: true);
      return;
    }
    final v = await showCheckInSheet(context);
    if (v != null && mounted) {
      showModuleSnack(context, v.verified ? 'Checked in, verified on site' : 'Checked in (outside the allowed radius)');
      _load(silent: true);
    }
  }

  Future<void> _checkOut(LocationsVisit v) async {
    final ok = await showCheckOutSheet(context, v);
    if (ok == true && mounted) {
      showModuleSnack(context, 'Checked out. Visit completed');
      _load(silent: true);
    }
  }

  Future<void> _shareLocation() async {
    if (_sharing) return;
    setState(() {
      _sharing = true;
      _shareError = '';
    });
    try {
      final pos = await _service.currentPosition();
      await _service.shareLocation(pos.latitude, pos.longitude);
      if (!mounted) return;
      showModuleSnack(context, 'Location shared');
      _load(silent: true);
    } catch (e) {
      if (mounted) setState(() => _shareError = friendlyError(e));
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  Future<void> _openUrl(String url) async {
    final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!ok && mounted) showModuleSnack(context, 'Could not open Maps', error: true);
  }

  Future<void> _pickAgent() async {
    final r = await pickOption(context, title: 'Agent', selected: _filterUserId, options: [
      (value: '', label: 'Whole team'),
      for (final u in _users) (value: u.id, label: u.fullName.isEmpty ? u.email : u.fullName),
    ]);
    if (r != null && r.value != _filterUserId) {
      setState(() => _filterUserId = r.value);
      _load();
    }
  }

  Future<void> _pickDate(bool from) async {
    final initial = (from ? _from : _to) ?? DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (d != null && mounted) setState(() => from ? _from = d : _to = d);
  }

  String _fmtDateTime(DateTime? d) => d == null ? '—' : DateFormat('d MMM, HH:mm').format(d);

  String _fmtDuration(int? secs) {
    if (secs == null) return '—';
    if (secs < 60) return '${secs}s';
    if (secs < 3600) return '${secs ~/ 60}m';
    return '${secs ~/ 3600}h ${(secs % 3600) ~/ 60}m';
  }

  // ── UI pieces ──────────────────────────────────────────────────────────

  Widget _checkCard() {
    final mine = _myActive.firstOrNull;
    return PremiumCard(
      padding: const EdgeInsets.all(16),
      child: mine != null
          ? Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Container(width: 8, height: 8, decoration: const BoxDecoration(color: _violet, shape: BoxShape.circle)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text('Visit in progress · ${mine.projectName.isEmpty ? 'No project' : mine.projectName}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontWeight: FontWeight.w800, color: Surf.text(context))),
                    ),
                  ]),
                  const SizedBox(height: 4),
                  Text(
                    '${mine.leadName.isNotEmpty ? 'Lead: ${mine.leadName} · ' : ''}Started ${_fmtDateTime(mine.checkInAt)} · ${_fmtDuration(mine.durationSeconds(_now))}',
                    style: TextStyle(fontSize: 12, color: Surf.subtext(context), fontFeatures: tabularFigures),
                  ),
                ]),
              ),
              const SizedBox(width: 10),
              FilledButton.icon(
                style: FilledButton.styleFrom(minimumSize: const Size(48, 48)),
                onPressed: () => _checkOut(mine),
                icon: const Icon(LucideIcons.logOut, size: 16),
                label: const Text('Check out'),
              ),
            ])
          : Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Check in to a site visit', style: TextStyle(fontWeight: FontWeight.w800, color: Surf.text(context))),
                  const SizedBox(height: 4),
                  Text('Add an optional lead and project, capture your location and confirm you are on site.',
                      style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
                ]),
              ),
              const SizedBox(width: 10),
              FilledButton.icon(
                style: FilledButton.styleFrom(minimumSize: const Size(48, 48)),
                onPressed: _checkIn,
                icon: const Icon(LucideIcons.logIn, size: 16),
                label: const Text('Check in'),
              ),
            ]),
    );
  }

  Widget _visitCard(LocationsVisit v) {
    final String label;
    final Color color;
    if (v.isActive) {
      label = 'In progress';
      color = _violet;
    } else if (v.isDone) {
      label = 'Completed';
      color = const Color(0xFF16A34A);
    } else if (v.status == 'scheduled') {
      label = 'Scheduled';
      color = const Color(0xFF2563EB);
    } else if (v.status == 'no_show') {
      label = 'No-show';
      color = AppColors.alertRed;
    } else if (v.status == 'cancelled') {
      label = 'Cancelled';
      color = AppColors.alertRed;
    } else {
      label = 'In progress';
      color = _violet;
    }
    final dur = v.durationSeconds(_now);

    Widget line(String k, String val) => Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Row(children: [
            SizedBox(width: 74, child: Text(k, style: TextStyle(fontSize: 12, color: Surf.subtext(context)))),
            Expanded(
              child: Text(val,
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Surf.text(context), fontFeatures: tabularFigures)),
            ),
          ]),
        );

    return PremiumCard(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(v.projectName.isEmpty ? 'Unknown project' : v.projectName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Surf.text(context))),
              if (v.agentName.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Row(children: [
                    Icon(LucideIcons.users, size: 12, color: Surf.subtext(context)),
                    const SizedBox(width: 5),
                    Expanded(
                        child: Text(v.agentName,
                            maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: Surf.subtext(context)))),
                  ]),
                ),
              if (v.leadName.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text('Lead: ${v.leadName}',
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
                ),
            ]),
          ),
          const SizedBox(width: 8),
          StatusPill(label, color: color),
        ]),
        const SizedBox(height: 6),
        line('Check-in', _fmtDateTime(v.checkInAt)),
        if (!v.isActive) line('Check-out', _fmtDateTime(v.checkOutAt)),
        if (v.isActive || dur != null) line('Duration', _fmtDuration(dur)),
        if (v.outcome.isNotEmpty && v.isDone) line('Outcome', v.outcome),
        if (v.hasCoord)
          Container(
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
            decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(12)),
            child: Row(children: [
              Icon(LucideIcons.mapPin, size: 14, color: Surf.accent(context)),
              const SizedBox(width: 6),
              Expanded(
                child: Text('${v.lat!.toStringAsFixed(5)}, ${v.lng!.toStringAsFixed(5)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, color: Surf.text(context), fontFeatures: tabularFigures)),
              ),
              const SizedBox(width: 8),
              Text(
                v.verified ? 'On-site' : (v.distanceM != null ? '~${v.distanceM!.round()} m away' : '—'),
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: v.verified ? const Color(0xFF16A34A) : Surf.subtext(context)),
              ),
            ]),
          ),
        if (v.note.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(v.note, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
          ),
        if (v.hasCoord)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  onPressed: () => _openUrl('https://www.google.com/maps?q=${v.lat},${v.lng}'),
                  icon: const Icon(LucideIcons.externalLink, size: 15),
                  label: const Text('View on map'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  onPressed: () => _openUrl('https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}'),
                  icon: const Icon(LucideIcons.navigation, size: 15),
                  label: const Text('Navigate'),
                ),
              ),
            ]),
          ),
      ]),
    );
  }

  Widget _filters() {
    final df = DateFormat('d MMM');
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      AppSearchField(hint: 'Search project, lead or agent…', onChanged: (v) => setState(() => _search = v)),
      const SizedBox(height: 10),
      SizedBox(
        height: 40,
        child: ListView(scrollDirection: Axis.horizontal, children: [
          ActionChip(
            avatar: const Icon(LucideIcons.slidersHorizontal, size: 15),
            label: Text(_statusOptions.firstWhere((o) => o.value == _statusFilter).label),
            onPressed: () async {
              final r = await pickOption(context, title: 'Status', selected: _statusFilter, options: _statusOptions);
              if (r != null) setState(() => _statusFilter = r.value);
            },
          ),
          const SizedBox(width: 8),
          ActionChip(
            avatar: const Icon(LucideIcons.calendar, size: 15),
            label: Text(_from == null ? 'From' : df.format(_from!)),
            onPressed: () => _pickDate(true),
          ),
          const SizedBox(width: 8),
          ActionChip(
            avatar: const Icon(LucideIcons.calendar, size: 15),
            label: Text(_to == null ? 'To' : df.format(_to!)),
            onPressed: () => _pickDate(false),
          ),
          if (_from != null || _to != null || _statusFilter.isNotEmpty) ...[
            const SizedBox(width: 8),
            ActionChip(
              avatar: const Icon(LucideIcons.x, size: 14),
              label: const Text('Clear'),
              onPressed: () => setState(() {
                _from = null;
                _to = null;
                _statusFilter = '';
              }),
            ),
          ],
        ]),
      ),
    ]);
  }

  List<Widget> _content() {
    if (_loading) {
      return [
        for (var i = 0; i < 3; i++)
          Container(
            height: 150,
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(20)),
          ),
      ];
    }
    if (_error != null) {
      return [SizedBox(height: 320, child: ErrorState(message: _error!, onRetry: _load))];
    }
    final active = _active;
    final history = _history;
    return [
      if (active.isNotEmpty) ...[
        SectionHeader(title: 'Active visits (${active.length})'),
        for (final v in active) _visitCard(v),
      ],
      const SectionHeader(title: 'Visit history'),
      _filters(),
      const SizedBox(height: 12),
      if (history.isEmpty)
        SizedBox(
          height: 280,
          child: EmptyState(
            icon: LucideIcons.mapPin,
            title: _visits.isEmpty ? 'No site visits yet' : 'Nothing matches your filters',
            message: _visits.isEmpty
                ? 'Site visits recorded by the team appear here with their GPS location.'
                : 'Try adjusting the search, status or date filters.',
          ),
        )
      else
        for (final v in history) _visitCard(v),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final profile = context.read<AuthProvider>().profile;
    final agentName = _users.where((u) => u.id == _filterUserId).map((u) => u.fullName).firstOrNull ?? '';
    final subtitle = _isAdmin
        ? (agentName.isNotEmpty ? 'Site visits for $agentName' : 'Site visit locations for the whole team')
        : (profile?.fullName.isNotEmpty ?? false ? profile!.fullName : 'Your site visit locations');

    return ModulePage(
      title: 'Locations',
      showAppBar: widget.showAppBar,
      body: RefreshIndicator(
        onRefresh: () => _load(silent: true),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            SectionHeader(
              title: 'Locations',
              subtitle: subtitle,
              trailing: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(minimumSize: const Size(48, 48)),
                onPressed: _sharing ? null : _shareLocation,
                icon: _sharing
                    ? const SizedBox(width: 15, height: 15, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(LucideIcons.crosshair, size: 16),
                label: const Text('Share location'),
              ),
            ),
            if (_isAdmin && _users.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: ActionChip(
                    avatar: const Icon(LucideIcons.users, size: 15),
                    label: Text(agentName.isEmpty ? 'Whole team' : agentName, maxLines: 1, overflow: TextOverflow.ellipsis),
                    onPressed: _pickAgent,
                  ),
                ),
              ),
            if (_shareError.isNotEmpty)
              Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                    color: AppColors.alertRed.withAlpha(Surf.dark(context) ? 36 : 22), borderRadius: BorderRadius.circular(14)),
                child: Text(_shareError, style: const TextStyle(color: AppColors.alertRed, fontSize: 13)),
              ),
            _checkCard(),
            ..._content(),
          ],
        ),
      ),
    );
  }
}
