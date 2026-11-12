import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/duplicates_models.dart';
import 'supabase_service.dart';

class DuplicatesException implements Exception {
  final String message;
  DuplicatesException(this.message);
  @override
  String toString() => message;
}

String duplicatesErrorMessage(Object e, {String fallback = 'Something went wrong'}) {
  if (e is DuplicatesException) return e.message;
  if (e is PostgrestException) {
    switch (e.code) {
      case '42501':
        return 'You are not allowed to do this.';
      case 'P0001':
        return 'This duplicate was already resolved by someone else.';
      case 'P0002':
        return 'This duplicate no longer exists.';
    }
    return e.message.isEmpty ? fallback : e.message;
  }
  return fallback;
}

const _leadFields =
    'id, name, phone, email, source, project, developer, location, property_type, unit, budget_min, budget_max, notes, crm_status, created_at, created_by, assigned_to';

/// Reads and resolves duplicates.
///
/// Mirrors web `/api/duplicates` (GET/POST) and `/api/duplicate-leads`. Everything runs with the
/// signed-in user's session, so RLS and the SECURITY DEFINER RPC `resolve_duplicate_lead`
/// decide what is allowed. No service-role key is used.
class DuplicatesService {
  SupabaseClient get _db => SupabaseService().client;

  // ─────────────────────────── Review queue (/duplicates) ───────────────────────────

  Future<int> pendingCount() async {
    try {
      final res = await _db.from('duplicate_leads').select('id').eq('status', 'pending').count(CountOption.exact);
      return res.count;
    } catch (_) {
      return 0;
    }
  }

  /// [status] is pending | merged | separated | dismissed | all.
  Future<List<DuplicateItem>> fetchItems(String status, {int limit = 100}) async {
    dynamic q = _db.from('duplicate_leads').select('*');
    if (status != 'all') q = q.eq('status', status);
    final rows = List<Map<String, dynamic>>.from(await q.order('created_at', ascending: false).limit(limit) as List);
    if (rows.isEmpty) return [];

    final leadIds = <String>{};
    final dupIds = <String>{};
    for (final r in rows) {
      final o = r['original_lead_id']?.toString();
      final d = r['duplicate_lead_id']?.toString();
      if (o != null && o.isNotEmpty) leadIds.add(o);
      if (d != null && d.isNotEmpty) dupIds.add(d);
    }

    final leadById = await _leadsById(leadIds);
    final dupById = await _leadsById(dupIds);

    // Action counters (single validated action log). Optional: blocked by RLS for some roles.
    final counts = <String, Map<String, int>>{};
    final all = {...leadIds, ...dupIds}.toList();
    if (all.isNotEmpty) {
      try {
        final acts = await _db.from('user_actions').select('lead_id, action_type').inFilter('lead_id', all).limit(20000);
        for (final a in List<Map<String, dynamic>>.from(acts as List)) {
          final id = a['lead_id']?.toString() ?? '';
          final t = a['action_type']?.toString() ?? '';
          final m = counts.putIfAbsent(id, () => {});
          m[t] = (m[t] ?? 0) + 1;
        }
      } catch (_) {}
    }
    DuplicateActionCounts countsFor(String? id) {
      final c = (id == null ? null : counts[id]) ?? const <String, int>{};
      return DuplicateActionCounts(
        calls: c['CALL'] ?? 0,
        meetings: c['MEETING'] ?? 0,
        notes: c['NOTE'] ?? 0,
        statusChanges: c['STATUS_CHANGE'] ?? 0,
      );
    }

    final peopleIds = <String>{};
    void addId(Object? x) {
      final s = x?.toString();
      if (s != null && s.isNotEmpty) peopleIds.add(s);
    }

    for (final r in rows) {
      for (final k in ['attempted_by', 'original_owner_id', 'original_added_by', 'resolved_by']) {
        addId(r[k]);
      }
      final l = leadById[r['original_lead_id']?.toString()];
      if (l != null) {
        addId(l['created_by']);
        addId(l['assigned_to']);
      }
      final dl = dupById[r['duplicate_lead_id']?.toString()];
      if (dl != null) {
        addId(dl['created_by']);
        addId(dl['assigned_to']);
      }
    }
    final people = await _people(peopleIds);
    DuplicatePerson? person(Object? id) => id == null ? null : people[id.toString()];

    return rows.map((r) {
      final l = leadById[r['original_lead_id']?.toString()];
      final dl = dupById[r['duplicate_lead_id']?.toString()];
      final submitted = r['attempted_data'] is Map ? Map<String, dynamic>.from(r['attempted_data'] as Map) : <String, dynamic>{};
      return DuplicateItem(
        id: r['id'].toString(),
        status: r['status']?.toString() ?? 'pending',
        source: r['source']?.toString() ?? 'attempt',
        duplicateLead: dl == null
            ? null
            : DuplicateLeadRef(
                id: dl['id'].toString(),
                createdAt: dl['created_at']?.toString(),
                stage: dl['crm_status']?.toString(),
                source: dl['source']?.toString(),
                assignedTo: person(dl['assigned_to'] ?? dl['created_by']),
              ),
        originalActions: countsFor(r['original_lead_id']?.toString()),
        duplicateActions: dl == null ? null : countsFor(dl['id']?.toString()),
        createdAt: r['created_at']?.toString(),
        lastAttemptAt: r['last_attempt_at']?.toString(),
        attemptCount: (r['attempt_count'] as num?)?.toInt() ?? 1,
        matchType: r['match_type']?.toString() ?? 'phone',
        resolvedAt: r['resolved_at']?.toString(),
        resolvedBy: person(r['resolved_by']),
        attemptedBy: person(r['attempted_by']),
        originalAddedBy: person(r['original_added_by'] ?? l?['created_by']),
        firstOwner: person(r['original_owner_id']),
        currentOwner: l == null ? null : person(l['assigned_to'] ?? l['created_by']),
        existing: l,
        submitted: submitted,
      );
    }).toList();
  }

  Future<Map<String, Map<String, dynamic>>> _leadsById(Set<String> ids) async {
    if (ids.isEmpty) return {};
    // RLS decides which originals are visible; invisible ones simply come back missing.
    final rows = await _db.from('leads').select(_leadFields).inFilter('id', ids.toList());
    return {
      for (final r in List<Map<String, dynamic>>.from(rows as List))
        r['id'].toString(): {...r, 'stage': r['crm_status']},
    };
  }

  Future<Map<String, DuplicatePerson>> _people(Set<String> ids) async {
    if (ids.isEmpty) return {};
    try {
      final rows = await _db.from('user_profiles').select('id, full_name, role').inFilter('id', ids.toList());
      return {
        for (final p in List<Map<String, dynamic>>.from(rows as List)) p['id'].toString(): DuplicatePerson.fromProfile(p),
      };
    } catch (_) {
      return {};
    }
  }

  /// Merge / separate / dismiss through the SECURITY DEFINER RPC (re-checks ownership and role).
  /// [choices] maps field key -> 'new' | 'existing'.
  Future<void> resolve(
    String id,
    String action, {
    Map<String, String> choices = const {},
    bool appendNotes = true,
  }) async {
    try {
      try {
        await _db.rpc('resolve_duplicate_lead', params: {
          'p_id': id,
          'p_action': action,
          'p_choices': choices,
          'p_append_notes': appendNotes,
        });
      } on PostgrestException catch (e) {
        // Migration 20261028060000 not applied: merge / dismiss still work via the original RPCs.
        final missing = RegExp('resolve_duplicate_lead|PGRST202|42883').hasMatch('${e.code} ${e.message}');
        if (!missing) rethrow;
        if (action == 'merge') {
          await _db.rpc('merge_duplicate_lead', params: {'p_id': id, 'p_choices': choices, 'p_append_notes': appendNotes});
        } else if (action == 'dismiss') {
          await _db.rpc('dismiss_duplicate_lead', params: {'p_id': id});
        } else {
          throw DuplicatesException('Separating is not available until the latest database update is applied.');
        }
      }
    } on PostgrestException catch (e) {
      throw DuplicatesException(duplicatesErrorMessage(e, fallback: 'Action failed'));
    }
  }

  // ─────────────────────────── Duplicate Center hub (/duplicate-leads) ───────────────────────────

  static String _hubPhone(Object? p) {
    final digits = (p?.toString() ?? '').replaceAll(RegExp(r'\D'), '');
    if (digits.length >= 8) return digits.substring(digits.length - 10 < 0 ? 0 : digits.length - 10);
    return digits;
  }

  static String _budget(Map<String, dynamic> l) {
    final max = num.tryParse('${l['budget_max'] ?? ''}') ?? 0;
    final min = num.tryParse('${l['budget_min'] ?? ''}') ?? 0;
    final f = NumberFormat.decimalPattern();
    if (max != 0) return '${f.format(max)} EGP';
    if (min != 0) return '${f.format(min)} EGP';
    return 'Not specified';
  }

  /// Scan of all active leads grouped by phone / email, like web GET /api/duplicate-leads.
  /// Admin / owner only (the screen guards this; RLS still applies).
  Future<HubData> fetchHub() async {
    // Leads, paged because PostgREST caps a single response.
    final leads = <Map<String, dynamic>>[];
    const page = 1000;
    for (var from = 0; from < 20000; from += page) {
      final chunk = await _db
          .from('leads')
          .select(
              'id, name, phone, email, property_type, project, budget_min, budget_max, source, crm_status, is_duplicate, duplicate_of_lead_id, routed_to_duplicate_center_at, notes, location, created_at, created_by, assigned_to, agent')
          .order('created_at', ascending: false)
          .range(from, from + page - 1);
      final list = List<Map<String, dynamic>>.from(chunk as List);
      leads.addAll(list);
      if (list.length < page) break;
    }

    final agentsRows = await _db.from('user_profiles').select('id, full_name, role, is_active').eq('is_active', true).order('full_name');
    final agents = List<Map<String, dynamic>>.from(agentsRows as List).map(DuplicatePerson.fromProfile).toList();
    final profile = {for (final a in agents) a.id: a};

    var attempts = <Map<String, dynamic>>[];
    try {
      final r = await _db
          .from('duplicate_lead_attempts')
          .select('id, matched_lead_id, attempted_lead_id, attempted_by, status, created_at')
          .eq('status', 'flagged')
          .order('created_at', ascending: false)
          .limit(200);
      attempts = List<Map<String, dynamic>>.from(r as List);
    } catch (_) {}
    final attemptByDup = {
      for (final a in attempts)
        if (a['attempted_lead_id'] != null) a['attempted_lead_id'].toString(): a,
    };

    var logs = <HubAuditLog>[];
    try {
      final r = await _db
          .from('activity_log')
          .select('id, user_id, action_type, entity_id, detail, created_at')
          .inFilter('action_type', [
            'Duplicate Routed to Center',
            'Duplicate Lead Flagged',
            'Duplicate Merged',
            'Duplicate Reassigned',
            'Duplicate Discarded',
            'Duplicate Reviewed',
          ])
          .order('created_at', ascending: false)
          .limit(40);
      logs = List<Map<String, dynamic>>.from(r as List)
          .map((l) => HubAuditLog(
                id: l['id'].toString(),
                actionType: l['action_type']?.toString() ?? '',
                detail: l['detail']?.toString() ?? '',
                actorName: profile[l['user_id']?.toString()]?.name ?? 'CRM System',
                createdAt: fmtDateTime(l['created_at']?.toString()),
              ))
          .toList();
    } catch (_) {}

    final active = leads.where((l) => !(l['notes']?.toString() ?? '').contains('[ARCHIVED DUPLICATE]')).toList();
    final byId = {for (final l in active) l['id'].toString(): l};
    final phoneGroups = <String, List<Map<String, dynamic>>>{};
    final emailGroups = <String, List<Map<String, dynamic>>>{};
    for (final l in active) {
      final np = _hubPhone(l['phone']);
      if (np.length >= 8) phoneGroups.putIfAbsent(np, () => []).add(l);
      final ne = (l['email']?.toString() ?? '').trim().toLowerCase();
      if (ne.contains('@')) emailGroups.putIfAbsent(ne, () => []).add(l);
    }

    final seen = <String>{};
    final cases = <HubCase>[];
    var clean = 0;
    var conflicts = 0;

    String repNameOf(Map<String, dynamic> l) {
      final p = profile[l['assigned_to']?.toString()];
      if (p != null) return p.name;
      final a = l['agent']?.toString().trim() ?? '';
      return a.isEmpty ? 'Unassigned' : a;
    }

    HubLead hubLead(Map<String, dynamic> l, String submittedName, {required bool isDup}) {
      final project = (l['project']?.toString().trim().isNotEmpty ?? false) ? l['project'].toString() : (l['property_type']?.toString() ?? '');
      final notes = l['notes']?.toString().trim() ?? '';
      return HubLead(
        id: l['id'].toString(),
        name: (l['name']?.toString().trim().isNotEmpty ?? false) ? l['name'].toString() : '—',
        ingested: fmtDateTime(l['created_at']?.toString()),
        repName: repNameOf(l),
        repRole: profile[l['assigned_to']?.toString()]?.role ?? 'Agent',
        assignedToId: l['assigned_to']?.toString(),
        createdByName: isDup ? submittedName : (profile[l['created_by']?.toString()]?.name ?? repNameOf(l)),
        source: (l['source']?.toString().trim().isNotEmpty ?? false) ? l['source'].toString() : (isDup ? 'Duplicate Submission' : 'Direct Ingest'),
        stage: (l['crm_status']?.toString().trim().isNotEmpty ?? false) ? l['crm_status'].toString() : (isDup ? 'Duplicate Leads' : 'Fresh Leads'),
        budget: _budget(l),
        project: project.isEmpty ? 'General Inquiry' : project,
        notes: notes.isEmpty ? 'No notes logged.' : notes,
      );
    }

    String firstNonEmpty(List<Object?> xs, String fb) {
      for (final x in xs) {
        final s = x?.toString().trim() ?? '';
        if (s.isNotEmpty) return s;
      }
      return fb;
    }

    void pushPair(Map<String, dynamic>? primary, Map<String, dynamic>? dup, String matchType) {
      if (primary == null || dup == null || primary['id'] == dup['id']) return;
      final key = '${primary['id']}_${dup['id']}';
      final rev = '${dup['id']}_${primary['id']}';
      if (seen.contains(key) || seen.contains(rev)) return;
      seen.add(key);

      final a1 = repNameOf(primary);
      final a2 = repNameOf(dup);
      final dispute = primary['assigned_to'] != null && dup['assigned_to'] != null && primary['assigned_to'] != dup['assigned_to'];
      if (dispute) {
        conflicts++;
      } else {
        clean++;
      }
      final attempt = attemptByDup[dup['id'].toString()];
      final submittedBy = firstNonEmpty([
        profile[dup['created_by']?.toString()]?.name,
        profile[attempt?['attempted_by']?.toString()]?.name,
        a2 == 'Unassigned' ? null : a2,
      ], 'System / Import');
      final submittedRole = firstNonEmpty([
        profile[dup['created_by']?.toString()]?.role,
        profile[attempt?['attempted_by']?.toString()]?.role,
        profile[dup['assigned_to']?.toString()]?.role,
      ], 'Agent');
      final routedIso = firstNonEmpty([dup['routed_to_duplicate_center_at'], attempt?['created_at'], dup['created_at']], '');
      cases.add(HubCase(
        id: 'case-$key',
        groupId: 'DUP-${primary['id'].toString().substring(0, 6).toUpperCase()}',
        matchType: matchType,
        name: firstNonEmpty([primary['name'], dup['name']], 'Unnamed Client'),
        phone: firstNonEmpty([primary['phone'], dup['phone']], '—'),
        email: firstNonEmpty([primary['email'], dup['email']], '—'),
        territory: firstNonEmpty([primary['location'], dup['location']], 'General Territory'),
        conflict: dispute,
        disputeAgents: dispute ? '$a1 vs $a2' : (a1 != 'Unassigned' ? a1 : a2),
        submittedBy: submittedBy,
        submittedByRole: submittedRole,
        routedAt: fmtDateTime(routedIso),
        routedAtDate: DateTime.tryParse(routedIso),
        lead1: hubLead(primary, submittedBy, isDup: false),
        lead2: hubLead(dup, submittedBy, isDup: true),
      ));
    }

    // 1) Explicit duplicate_of_lead_id links.
    for (final l in active) {
      final ref = l['duplicate_of_lead_id']?.toString();
      if (ref != null && byId.containsKey(ref)) {
        final orig = byId[ref]!;
        final op = _hubPhone(orig['phone']);
        final mt = op.isNotEmpty && op == _hubPhone(l['phone']) ? 'phone' : 'email';
        pushPair(orig, l, mt);
      }
    }
    // 2) Phone and e-mail clusters: oldest lead is the primary.
    void cluster(List<Map<String, dynamic>> list, String mt) {
      if (list.length < 2) return;
      final sorted = [...list]..sort((a, b) => (DateTime.tryParse('${a['created_at']}') ?? DateTime(1970))
          .compareTo(DateTime.tryParse('${b['created_at']}') ?? DateTime(1970)));
      for (var i = 1; i < sorted.length; i++) {
        pushPair(sorted.first, sorted[i], mt);
      }
    }

    for (final l in phoneGroups.values) {
      cluster(l, 'phone');
    }
    for (final l in emailGroups.values) {
      cluster(l, 'email');
    }

    cases.sort((a, b) => (b.routedAtDate ?? DateTime(1970)).compareTo(a.routedAtDate ?? DateTime(1970)));
    return HubData(cases: cases, agents: agents, logs: logs, clean: clean, conflicts: conflicts);
  }

  Future<String> _actorName() async {
    final u = _db.auth.currentUser;
    if (u == null) throw DuplicatesException('You are signed out.');
    try {
      final p = await _db.from('user_profiles').select('full_name').eq('id', u.id).maybeSingle();
      final n = p?['full_name']?.toString().trim() ?? '';
      if (n.isNotEmpty) return n;
    } catch (_) {}
    return u.email ?? 'Admin';
  }

  Future<void> _quiet(Future<dynamic> f) async {
    try {
      await f;
    } catch (_) {}
  }

  Future<void> _log(String action, String entityId, String detail) => _quiet(_db.from('activity_log').insert({
        'user_id': _db.auth.currentUser?.id,
        'action_type': action,
        'entity_type': 'lead',
        'entity_id': entityId,
        'detail': detail,
      }));

  /// Removes the duplicate lead; if it cannot be deleted (FK / RLS) it is archived instead.
  Future<void> _removeOrArchive(String dupId, String archiveNote) async {
    var deleted = false;
    try {
      final r = await _db.from('leads').delete().eq('id', dupId).select('id');
      deleted = (r as List).isNotEmpty;
    } catch (_) {}
    if (!deleted) {
      await _db.from('leads').update({
        'crm_status': 'Duplicate Leads',
        'is_duplicate': false,
        'notes': archiveNote,
      }).eq('id', dupId);
    }
  }

  String _short(String id) => id.length > 8 ? id.substring(0, 8) : id;

  Future<void> hubMerge(String masterId, String dupId) async {
    final actor = await _actorName();
    try {
      final dup = await _db.from('leads').select('notes, name, phone').eq('id', dupId).maybeSingle();
      final master = await _db.from('leads').select('notes').eq('id', masterId).maybeSingle();
      final dupNotes = (dup?['notes']?.toString() ?? '').replaceAll(RegExp(r'\[Pending Review / Duplicate[^\]]*\]'), '').trim();
      if (dupNotes.isNotEmpty) {
        final merged =
            '${master?['notes'] ?? ''}\n[Merged from Duplicate #${_short(dupId)} by $actor]: $dupNotes'.trim();
        await _db.from('leads').update({
          'notes': merged,
          'last_action_at': DateTime.now().toUtc().toIso8601String(),
          'last_action_by': _db.auth.currentUser?.id,
        }).eq('id', masterId);
      }
      await _quiet(_db.from('call_logs').update({'entity_id': masterId}).eq('entity_type', 'lead').eq('entity_id', dupId));
      await _quiet(_db.from('follow_ups').update({'lead_id': masterId}).eq('lead_id', dupId));
      await _quiet(_db
          .from('duplicate_lead_attempts')
          .update({'status': 'merged', 'note': 'Merged into #$masterId by $actor'})
          .or('attempted_lead_id.eq.$dupId,matched_lead_id.eq.$dupId'));
      await _removeOrArchive(dupId, '[ARCHIVED DUPLICATE] Merged into master lead #$masterId by $actor');
      await _log('Duplicate Merged', masterId,
          'Duplicate lead "${dup?['name'] ?? dupId}" (${dup?['phone'] ?? '—'}) merged into master lead #${_short(masterId)} by $actor.');
    } on PostgrestException catch (e) {
      throw DuplicatesException(duplicatesErrorMessage(e, fallback: 'Merge failed'));
    }
  }

  Future<void> hubDiscard(String masterId, String dupId) async {
    final actor = await _actorName();
    try {
      final dup = await _db.from('leads').select('name, phone').eq('id', dupId).maybeSingle();
      await _quiet(_db
          .from('duplicate_lead_attempts')
          .update({'status': 'discarded', 'note': 'Discarded by $actor'})
          .or('attempted_lead_id.eq.$dupId,matched_lead_id.eq.$dupId'));
      await _removeOrArchive(dupId, '[ARCHIVED DUPLICATE] Discarded by $actor');
      await _log('Duplicate Discarded', masterId,
          'Duplicate lead "${dup?['name'] ?? dupId}" (${dup?['phone'] ?? '—'}) discarded by $actor.');
    } on PostgrestException catch (e) {
      throw DuplicatesException(duplicatesErrorMessage(e, fallback: 'Discard failed'));
    }
  }

  Future<void> hubReassign(String masterId, String dupId, DuplicatePerson assignee) async {
    final actor = await _actorName();
    try {
      final initials = assignee.name
          .split(' ')
          .where((p) => p.isNotEmpty)
          .map((p) => p[0])
          .join()
          .toUpperCase();
      await _db.from('leads').update({
        'assigned_to': assignee.id,
        'agent': assignee.name,
        'agent_initials': initials.length > 2 ? initials.substring(0, 2) : initials,
        'last_action_at': DateTime.now().toUtc().toIso8601String(),
        'last_action_by': _db.auth.currentUser?.id,
      }).eq('id', masterId);
      if (dupId != masterId) {
        await _quiet(_db.from('call_logs').update({'entity_id': masterId}).eq('entity_type', 'lead').eq('entity_id', dupId));
        await _quiet(_db
            .from('duplicate_lead_attempts')
            .update({'status': 'reviewed', 'note': 'Reassigned to ${assignee.name} by $actor'})
            .or('attempted_lead_id.eq.$dupId,matched_lead_id.eq.$dupId'));
        await _removeOrArchive(dupId, '[ARCHIVED DUPLICATE] Reassigned to ${assignee.name} by $actor');
      }
      await _log('Duplicate Reassigned', masterId,
          'Duplicate case resolved and sole ownership reassigned to ${assignee.name} by $actor.');
    } on PostgrestException catch (e) {
      throw DuplicatesException(duplicatesErrorMessage(e, fallback: 'Reassign failed'));
    }
  }

  /// "Keep both" (web action `review`): approves the duplicate as an independent lead.
  Future<void> hubKeepBoth(String dupId) async {
    final actor = await _actorName();
    try {
      await _db.from('leads').update({
        'is_duplicate': false,
        'duplicate_of_lead_id': null,
        'crm_status': 'Fresh Leads',
        'notes': '[ARCHIVED DUPLICATE] Reviewed and approved as separate lead by $actor',
      }).eq('id', dupId);
      await _quiet(_db
          .from('duplicate_lead_attempts')
          .update({'status': 'reviewed', 'note': 'Approved by $actor'})
          .eq('attempted_lead_id', dupId));
      await _log('Duplicate Reviewed', dupId, 'Duplicate entry #${_short(dupId)} reviewed and kept by $actor.');
    } on PostgrestException catch (e) {
      throw DuplicatesException(duplicatesErrorMessage(e, fallback: 'Action failed'));
    }
  }
}
