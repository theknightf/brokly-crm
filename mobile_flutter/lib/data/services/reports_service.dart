import 'dart:async';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/reports_models.dart';
import 'reports_calculator.dart';
import 'supabase_service.dart';
import 'users_service.dart';

/// Data access for the Reports module. Talks to Supabase directly (RLS applies);
/// non-admin viewers are additionally scoped to their own / their team's ids.
class ReportsService {
  ReportsService();

  final SupabaseClient _client = SupabaseService().client;
  final UsersService _users = UsersService();

  static const int _pageSize = 1000;
  static const int _maxRows = 60000;
  static const Duration _timeout = Duration(seconds: 30);

  // ───────────────────────── helpers ─────────────────────────

  /// 'YYYY-MM-DD' -> local midnight.
  static DateTime parseDay(String iso) {
    final p = iso.split('-');
    if (p.length != 3) return DateTime.now();
    return DateTime(int.tryParse(p[0]) ?? 1970, int.tryParse(p[1]) ?? 1, int.tryParse(p[2]) ?? 1);
  }

  static String isoDay(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  static String _utc(DateTime d) => d.toUtc().toIso8601String();

  /// Resilient call: timeout + two retries with a short back-off.
  Future<T> _retry<T>(Future<T> Function() fn) async {
    Object? last;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        return await fn().timeout(_timeout);
      } catch (e) {
        last = e;
        // Permission / schema problems will not fix themselves.
        if (e is PostgrestException && (e.code == '42501' || e.code == 'PGRST202' || e.code == '42883' || e.code == '42P01')) {
          rethrow;
        }
        if (attempt < 2) await Future<void>.delayed(Duration(milliseconds: 500 * (attempt + 1)));
      }
    }
    throw last ?? Exception('Request failed');
  }

  Future<List<Map<String, dynamic>>> _fetchAll(PostgrestTransformBuilder<PostgrestList> Function(int from, int to) build) async {
    final out = <Map<String, dynamic>>[];
    for (var offset = 0; offset < _maxRows; offset += _pageSize) {
      final rows = await _retry<PostgrestList>(() => build(offset, offset + _pageSize - 1));
      out.addAll(rows);
      if (rows.length < _pageSize) break;
    }
    return out;
  }

  Future<List<Map<String, dynamic>>> _safeList(Future<List<Map<String, dynamic>>> Function() run) async {
    try {
      return await run();
    } catch (_) {
      return <Map<String, dynamic>>[];
    }
  }

  /// Human readable message for any failure (mirrors the web `rpcFailure`).
  static String friendlyError(Object e) {
    if (e is TimeoutException) return 'The server took too long to respond. Please try again.';
    if (e is PostgrestException) {
      final text = '${e.code ?? ''} ${e.message}';
      if (RegExp('PGRST202|42883').hasMatch(text) || RegExp('could not find the function', caseSensitive: false).hasMatch(text)) {
        return 'This report is not set up yet: the reporting functions are missing in the database.';
      }
      if (RegExp('permission denied|row-level security', caseSensitive: false).hasMatch(text) || e.code == '42501') {
        return 'You do not have access to this report.';
      }
      return e.message;
    }
    final s = e.toString();
    if (s.contains('SocketException') || s.contains('ClientException') || s.contains('Failed host lookup')) {
      return 'No connection. Check your internet and try again.';
    }
    return s.replaceFirst('Exception: ', '');
  }

  // ───────────────────────── dataset ─────────────────────────

  Future<ReportsDataset> fetchDataset(String from, String to) async {
    final ids = await _users.getAuthorizedUserIds(); // null => owner/admin
    final viewerId = _client.auth.currentUser?.id ?? '';
    final scope = ids?.toSet();
    final isAdmin = ids == null;

    final start = parseDay(from);
    final endDay = parseDay(to);
    final end = DateTime(endDay.year, endDay.month, endDay.day, 23, 59, 59, 999);
    final days = endDay.difference(start).inHours ~/ 24 + 1;
    final prevStart = DateTime(start.year, start.month, start.day - days);
    final now = DateTime.now();
    final trendStart = DateTime(now.year, now.month - 5, 1);
    var windowStart = start;
    if (prevStart.isBefore(windowStart)) windowStart = prevStart;
    if (trendStart.isBefore(windowStart)) windowStart = trendStart;

    final idList = ids?.join(',');

    PostgrestTransformBuilder<PostgrestList> leadsQ(int a, int b) {
      var q = _client
          .from('leads')
          .select('id, crm_status, lead_status, source, property_type, project, team, agent, assigned_to, created_by, budget_max, created_at')
          .gte('created_at', _utc(windowStart));
      if (idList != null) q = q.or('assigned_to.in.($idList),created_by.in.($idList)');
      return q.order('created_at', ascending: false).order('id').range(a, b);
    }

    PostgrestTransformBuilder<PostgrestList> callsQ(String cols, int a, int b) {
      var q = _client.from('call_logs').select(cols).gte('created_at', _utc(start)).lte('created_at', _utc(end));
      if (ids != null) q = q.inFilter('user_id', ids);
      return q.order('created_at', ascending: false).order('id').range(a, b);
    }

    PostgrestTransformBuilder<PostgrestList> followQ(int a, int b) {
      var q = _client.from('follow_ups').select('id, follow_up_status, created_by, created_at').gte('created_at', _utc(start)).lte('created_at', _utc(end));
      if (ids != null) q = q.inFilter('created_by', ids);
      return q.order('created_at', ascending: false).order('id').range(a, b);
    }

    PostgrestTransformBuilder<PostgrestList> statusQ(int a, int b) {
      var q = _client
          .from('user_actions')
          .select('id, user_id')
          .eq('action_type', 'STATUS_CHANGE')
          .gte('created_at', _utc(start))
          .lte('created_at', _utc(end));
      if (ids != null) q = q.inFilter('user_id', ids);
      return q.order('created_at', ascending: false).order('id').range(a, b);
    }

    final results = await Future.wait<dynamic>([
      _fetchAll(leadsQ),
      () async {
        try {
          return await _fetchAll((a, b) => callsQ('id, user_id, entity_id, entity_type, channel, direction, outcome, duration_seconds, is_valid, created_at', a, b));
        } on PostgrestException {
          // `is_valid` / `entity_type` may not exist on older schemas.
          return await _fetchAll((a, b) => callsQ('id, user_id, entity_id, channel, direction, outcome, duration_seconds, created_at', a, b));
        }
      }(),
      _safeList(() => _fetchAll(followQ)),
      _retry<PostgrestList>(() => _client.from('user_profiles').select('id, full_name, email, role, team_id, is_active, avatar_url')),
      _safeList(() => _retry<PostgrestList>(() => _client.from('teams').select('id, name, leader_id'))),
      _safeList(() => _retry<PostgrestList>(() => _client.from('team_memberships').select('team_id, user_id, is_leader'))),
      _safeList(() => _fetchAll(statusQ)),
      _targetDeals(),
    ]);

    final statusUpdates = <String, int>{};
    for (final r in results[6] as List<Map<String, dynamic>>) {
      final uid = r['user_id']?.toString();
      if (uid != null && uid.isNotEmpty) statusUpdates[uid] = (statusUpdates[uid] ?? 0) + 1;
    }

    return ReportsDataset(
      from: from,
      to: to,
      rangeStart: start,
      rangeEnd: end,
      leads: (results[0] as List<Map<String, dynamic>>).map(RpLead.fromJson).toList(),
      calls: (results[1] as List<Map<String, dynamic>>).map(RpCall.fromJson).toList(),
      followUps: (results[2] as List<Map<String, dynamic>>).map(RpFollowUp.fromJson).toList(),
      profiles: (results[3] as List<Map<String, dynamic>>).map(RpProfile.fromJson).where((p) => p.id.isNotEmpty).toList(),
      teams: (results[4] as List<Map<String, dynamic>>).map(RpTeam.fromJson).toList(),
      memberships: (results[5] as List<Map<String, dynamic>>).map(RpMembership.fromJson).toList(),
      statusUpdates: statusUpdates,
      targetDeals: results[7] as int,
      scope: scope,
      viewerId: viewerId,
      isAdmin: isAdmin,
      fetchedAt: DateTime.now(),
    );
  }

  /// Deal target from `kpi_targets` (fallback `company_settings.kpiTargets`, default 15).
  Future<int> _targetDeals() async {
    var target = 15;
    try {
      final rows = await _retry<PostgrestList>(
        () => _client.from('kpi_targets').select('metric, target_value, target_role').eq('is_active', true),
      );
      Map<String, dynamic>? pick;
      for (final k in rows) {
        if (RegExp('deals|won|done', caseSensitive: false).hasMatch(k['metric']?.toString() ?? '')) {
          pick = k;
          break;
        }
      }
      pick ??= rows.cast<Map<String, dynamic>?>().firstWhere((k) => k?['metric'] == 'deals', orElse: () => null);
      final v = num.tryParse(pick?['target_value']?.toString() ?? '');
      if (v != null && v > 0) return v.round();
      if (pick != null) return target;
    } catch (_) {}
    try {
      final cs = await _client.from('company_settings').select('value').eq('key', 'kpiTargets').maybeSingle();
      final v = cs?['value'];
      if (v is List) {
        for (final x in v) {
          if (x is Map && RegExp('deals', caseSensitive: false).hasMatch(x['metric']?.toString() ?? '')) {
            final n = num.tryParse(x['target_value']?.toString() ?? '');
            if (n != null && n > 0) return n.round();
          }
        }
      }
    } catch (_) {}
    return target;
  }

  // ───────────────────────── attendance (owner / admin) ─────────────────────────

  Future<OfficeHours> _officeHours() async {
    try {
      final r = await _client.from('company_settings').select('value').eq('key', 'workingHours').maybeSingle();
      final v = r?['value'];
      if (v is Map) {
        int toMin(String? t) {
          final m = RegExp(r'^(\d{1,2}):(\d{2})$').firstMatch((t ?? '').trim());
          if (m == null) return -1;
          final h = int.parse(m.group(1)!);
          final mm = int.parse(m.group(2)!);
          return h > 23 || mm > 59 ? -1 : h * 60 + mm;
        }

        final start = v['start']?.toString().isNotEmpty == true ? v['start'].toString() : OfficeHours.defaults.start;
        final end = v['end']?.toString().isNotEmpty == true ? v['end'].toString() : OfficeHours.defaults.end;
        final grace = int.tryParse(v['lateGraceMinutes']?.toString() ?? '') ?? 20;
        final sm = toMin(start);
        return OfficeHours(start, end, sm >= 0 ? sm + grace : OfficeHours.defaults.toleranceMinutes);
      }
    } catch (_) {}
    return OfficeHours.defaults;
  }

  Future<AttendanceReport> fetchAttendance(String from, String to) async {
    final start = parseDay(from);
    final end = parseDay(to);
    final totalDays = end.isBefore(start) ? 0 : end.difference(start).inHours ~/ 24 + 1;
    final office = await _officeHours();

    final res = await Future.wait<dynamic>([
      _retry<PostgrestList>(() => _client.from('user_profiles').select('id, full_name, email, role, is_active, team_id').order('full_name')),
      _fetchAll((a, b) => _client
          .from('attendance')
          .select('id, user_id, attendance_date, check_in_time')
          .gte('attendance_date', '${from}T00:00:00')
          .lte('attendance_date', '${to}T23:59:59.999')
          .order('attendance_date')
          .order('id')
          .range(a, b)),
    ]);
    final users = (res[0] as List<Map<String, dynamic>>).map(RpProfile.fromJson).toList();
    final att = res[1] as List<Map<String, dynamic>>;

    final present = <String, int>{};
    final onTime = <String, int>{};
    final late = <String, int>{};
    for (final a in att) {
      final uid = a['user_id']?.toString();
      if (uid == null) continue;
      present[uid] = (present[uid] ?? 0) + 1;
      final t = DateTime.tryParse(a['check_in_time']?.toString() ?? '')?.toLocal();
      if (t == null) continue;
      final m = t.hour * 60 + t.minute;
      if (m <= office.toleranceMinutes) {
        onTime[uid] = (onTime[uid] ?? 0) + 1;
      } else {
        late[uid] = (late[uid] ?? 0) + 1;
      }
    }
    final rows = <AttendanceRow>[];
    for (final u in users) {
      final p = present[u.id] ?? 0;
      if (!u.isActive && p == 0) continue; // inactive staff with no records are noise
      rows.add(AttendanceRow(
        id: u.id,
        name: u.name,
        role: u.role,
        present: p,
        onTime: onTime[u.id] ?? 0,
        late: late[u.id] ?? 0,
        absent: (totalDays - p).clamp(0, totalDays),
      ));
    }
    rows.sort((a, b) => b.late.compareTo(a.late));
    return AttendanceReport(office, rows);
  }

  // ───────────────────────── call log report ─────────────────────────

  Future<List<CallLogEntry>> fetchCallLogs(DateTime from, DateTime to) async {
    final ids = await _users.getAuthorizedUserIds();
    final rows = await _fetchAll((a, b) {
      var q = _client
          .from('call_logs')
          .select('id, user_id, contact_name, contact_phone, channel, direction, duration_seconds, outcome, created_at')
          .gte('created_at', _utc(from))
          .lte('created_at', _utc(to));
      if (ids != null) q = q.inFilter('user_id', ids);
      return q.order('created_at', ascending: false).order('id').range(a, b);
    });
    final userIds = rows.map((r) => r['user_id']?.toString()).whereType<String>().toSet().toList();
    final names = <String, String>{};
    if (userIds.isNotEmpty) {
      try {
        final ps = await _retry<PostgrestList>(() => _client.from('user_profiles').select('id, full_name').inFilter('id', userIds));
        for (final p in ps) {
          names[p['id'].toString()] = p['full_name']?.toString() ?? '';
        }
      } catch (_) {}
    }
    return rows.map((r) {
      final uid = r['user_id']?.toString();
      final name = uid != null ? names[uid] : null;
      return CallLogEntry(
        id: r['id']?.toString() ?? '',
        userId: uid,
        agentName: (name != null && name.isNotEmpty) ? name : 'Unknown',
        contactName: r['contact_name']?.toString(),
        contactPhone: r['contact_phone']?.toString(),
        channel: r['channel']?.toString(),
        direction: r['direction']?.toString(),
        durationSeconds: int.tryParse(r['duration_seconds']?.toString() ?? '') ?? 0,
        outcome: r['outcome']?.toString(),
        createdAt: DateTime.tryParse(r['created_at']?.toString() ?? ''),
      );
    }).toList();
  }

  // ───────────────────────── analytics RPCs ─────────────────────────

  Future<OverviewStats> analyticsOverview(AnalyticsFilters f, String frame) async {
    final res = await _retry<dynamic>(() => _client.rpc('report_call_analytics', params: {'p': f.toRpc(), 'p_frame': frame}));
    return OverviewStats.fromJson(res);
  }

  Future<AnalyticsCallsPage> analyticsCalls(
    AnalyticsFilters f, {
    required int page,
    int pageSize = 25,
    String sort = 'at',
    String dir = 'desc',
    String search = '',
  }) async {
    final res = await _retry<dynamic>(() => _client.rpc('report_calls_log', params: {
          'p': f.toRpc(),
          'p_search': search.length > 100 ? search.substring(0, 100) : search,
          'p_sort': sort,
          'p_dir': dir,
          'p_limit': pageSize,
          'p_offset': (page - 1) * pageSize,
        }));
    return AnalyticsCallsPage.fromJson(res);
  }

  Future<AssignedData> analyticsAssigned(AnalyticsFilters f) async {
    final res = await _retry<dynamic>(() => _client.rpc('report_assigned', params: {'p': f.toRpc()}));
    return AssignedData.fromJson(res);
  }

  Future<AnalyticsOptions> analyticsOptions() async {
    try {
      final res = await _retry<dynamic>(() => _client.rpc('report_filter_options'));
      return AnalyticsOptions.fromJson(res);
    } catch (_) {
      return const AnalyticsOptions();
    }
  }

  /// Realtime channel on call_logs (RLS-aware). Caller must `removeChannel` when done.
  RealtimeChannel subscribeCallLogs(void Function(String? direction, bool isInsert) onChange, void Function(bool live) onStatus) {
    final channel = _client.channel('analytics-call-logs-${DateTime.now().millisecondsSinceEpoch}');
    channel
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'call_logs',
          callback: (payload) => onChange(payload.newRecord['direction']?.toString(), payload.eventType == PostgresChangeEvent.insert),
        )
        .subscribe((status, [error]) => onStatus(status == RealtimeSubscribeStatus.subscribed));
    return channel;
  }

  Future<void> removeChannel(RealtimeChannel c) async {
    try {
      await _client.removeChannel(c);
    } catch (_) {}
  }

  // ───────────────────────── employee drawer ─────────────────────────

  String get currentUserId => _client.auth.currentUser?.id ?? '';

  Future<Map<String, String>> _userNames(Iterable<String?> ids) async {
    final clean = ids.whereType<String>().where((e) => e.isNotEmpty).toSet().toList();
    final map = <String, String>{};
    if (clean.isEmpty) return map;
    try {
      final rows = await _retry<PostgrestList>(() => _client.from('user_profiles').select('id, full_name, email').inFilter('id', clean));
      for (final r in rows) {
        final n = r['full_name']?.toString();
        map[r['id'].toString()] = (n != null && n.isNotEmpty) ? n : (r['email']?.toString() ?? 'User');
      }
    } catch (_) {}
    return map;
  }

  Future<Map<String, ({String name, String phone})>> _leadInfo(Iterable<String?> ids) async {
    final clean = ids.whereType<String>().where((e) => e.isNotEmpty).toSet().toList();
    final map = <String, ({String name, String phone})>{};
    if (clean.isEmpty) return map;
    try {
      final rows = await _retry<PostgrestList>(() => _client.from('leads').select('id, name, phone').inFilter('id', clean));
      for (final r in rows) {
        map[r['id'].toString()] = (name: r['name']?.toString() ?? '', phone: r['phone']?.toString() ?? '');
      }
    } catch (_) {}
    return map;
  }

  static final RegExp _uuid = RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', caseSensitive: false);

  /// Newest first, keyset paginated (`created_at|id` cursor). The result filter is applied after
  /// classification so it always matches the pill that is shown.
  Future<EmpCallsPage> employeeCalls(
    String employeeId,
    String from,
    String to, {
    CallResult? result,
    String? cursor,
    String? dayFilter,
    int limit = 30,
  }) async {
    const batch = 100;
    final rangeFrom = parseDay(dayFilter ?? from);
    final rangeTo = parseDay(dayFilter ?? to);
    final end = DateTime(rangeTo.year, rangeTo.month, rangeTo.day, 23, 59, 59, 999);

    String? curAt;
    String? curId;
    if (cursor != null && cursor.contains('|')) {
      final i = cursor.indexOf('|');
      curAt = cursor.substring(0, i);
      curId = cursor.substring(i + 1);
    }

    final collected = <Map<String, dynamic>>[];
    final results = <CallResult>[];
    var exhausted = false;

    for (var round = 0; round < 6 && collected.length < limit && !exhausted; round++) {
      var q = _client
          .from('call_logs')
          .select('id, user_id, entity_id, lead_id, contact_name, contact_phone, direction, channel, duration_seconds, outcome, created_at')
          .eq('user_id', employeeId)
          .gte('created_at', _utc(rangeFrom))
          .lte('created_at', _utc(end));
      if (curAt != null && curId != null) {
        q = q.or('created_at.lt.$curAt,and(created_at.eq.$curAt,id.lt.$curId)');
      }
      final rows = await _retry<PostgrestList>(() => q.order('created_at', ascending: false).order('id', ascending: false).limit(batch));
      if (rows.length < batch) exhausted = true;
      for (final r in rows) {
        curAt = r['created_at']?.toString();
        curId = r['id']?.toString();
        final res = ReportsCalculator.classifyCall(
          channel: r['channel']?.toString(),
          direction: r['direction']?.toString(),
          durationSeconds: int.tryParse(r['duration_seconds']?.toString() ?? '') ?? 0,
          outcome: r['outcome']?.toString(),
        );
        if (result != null && res != result) continue;
        collected.add(r);
        results.add(res);
        if (collected.length >= limit) {
          exhausted = false;
          break;
        }
      }
    }
    final nextCursor = (!exhausted && curAt != null && curId != null) ? '$curAt|$curId' : null;

    String? leadIdOf(Map<String, dynamic> r) {
      final e = r['entity_id']?.toString();
      if (e != null && _uuid.hasMatch(e)) return e;
      return r['lead_id']?.toString();
    }

    final leads = await _leadInfo(collected.map(leadIdOf));
    final calls = <EmpCall>[];
    for (var i = 0; i < collected.length; i++) {
      final r = collected[i];
      final lid = leadIdOf(r);
      final info = lid != null ? leads[lid] : null;
      final dur = int.tryParse(r['duration_seconds']?.toString() ?? '') ?? 0;
      calls.add(EmpCall(
        id: r['id'].toString(),
        leadId: lid,
        leadName: (info != null && info.name.isNotEmpty) ? info.name : r['contact_name']?.toString(),
        phone: (info != null && info.phone.isNotEmpty) ? info.phone : r['contact_phone']?.toString(),
        createdAt: DateTime.tryParse(r['created_at']?.toString() ?? ''),
        incoming: r['direction'] == 'incoming',
        result: results[i],
        durationSeconds: dur < 0 ? 0 : dur,
      ));
    }
    return EmpCallsPage(calls, nextCursor);
  }

  EmpNote _noteView(Map<String, dynamic> n, Map<String, String> names, Map<String, ({String name, String phone})> leads) {
    final lid = n['lead_id']?.toString() ?? '';
    final author = n['author_id']?.toString();
    return EmpNote(
      id: n['id'].toString(),
      leadId: lid,
      leadName: leads[lid]?.name,
      callId: n['call_id']?.toString(),
      authorId: author,
      authorName: (author != null ? names[author] : null) ?? 'Unknown',
      body: n['body']?.toString() ?? '',
      createdAt: DateTime.tryParse(n['created_at']?.toString() ?? ''),
      updatedAt: DateTime.tryParse(n['updated_at']?.toString() ?? ''),
    );
  }

  Future<List<EmpNote>> employeeNotes(String employeeId, String from, String to) async {
    final start = parseDay(from);
    final e = parseDay(to);
    final end = DateTime(e.year, e.month, e.day, 23, 59, 59, 999);
    final rows = await _retry<PostgrestList>(() => _client
        .from('lead_notes')
        .select('id, lead_id, call_id, author_id, body, created_at, updated_at')
        .eq('author_id', employeeId)
        .gte('created_at', _utc(start))
        .lte('created_at', _utc(end))
        .order('created_at', ascending: false)
        .limit(200));
    final names = await _userNames(rows.map((r) => r['author_id']?.toString()));
    final leads = await _leadInfo(rows.map((r) => r['lead_id']?.toString()));
    return rows.map((r) => _noteView(r, names, leads)).toList();
  }

  Future<void> createNote({required String leadId, String? callId, required String body}) async {
    await _client.from('lead_notes').insert({
      'lead_id': leadId,
      'call_id': callId,
      'author_id': currentUserId,
      'body': body.trim(),
    });
  }

  Future<void> updateNote(String id, String body) async {
    final res = await _client.from('lead_notes').update({'body': body.trim()}).eq('id', id).select('id');
    if ((res as List).isEmpty) throw Exception('You do not have permission to change this note.');
  }

  Future<void> deleteNote(String id) async {
    final res = await _client.from('lead_notes').delete().eq('id', id).select('id');
    if ((res as List).isEmpty) throw Exception('You do not have permission to delete this note.');
  }

  static const Map<String, String> actionTypes = {
    'status_update': 'Status update',
    'follow_up_call': 'Follow-up call',
    'meeting': 'Meeting',
    'send_whatsapp': 'Send WhatsApp',
    'send_offer': 'Send offer',
  };

  static const Map<String, String> statusToCrm = {
    'Interested': 'Interested',
    'Follow-up': 'Following Up',
    'Meeting scheduled': 'Meeting',
    'Not interested': 'Not Interested',
    'Wrong number': 'Wrong Number',
    'Retry': 'No Answer',
    'Closed/Deal': 'Done Deal',
  };

  EmpAction _actionView(Map<String, dynamic> a, Map<String, String> names, Map<String, ({String name, String phone})> leads) {
    final lid = a['lead_id']?.toString() ?? '';
    final assignee = a['assignee_id']?.toString();
    final creator = a['created_by']?.toString();
    return EmpAction(
      id: a['id'].toString(),
      leadId: lid,
      leadName: leads[lid]?.name,
      type: a['type']?.toString() ?? '',
      status: a['status']?.toString(),
      note: a['note']?.toString(),
      dueAt: DateTime.tryParse(a['due_at']?.toString() ?? ''),
      doneAt: DateTime.tryParse(a['done_at']?.toString() ?? ''),
      assigneeName: assignee != null ? names[assignee] : null,
      createdByName: (creator != null ? names[creator] : null) ?? 'Unknown',
    );
  }

  Future<EmpActions> employeeActions(String employeeId, String from, String to) async {
    const cols = 'id, lead_id, call_id, type, status, note, due_at, done_at, assignee_id, created_by, created_at';
    final start = parseDay(from);
    final e = parseDay(to);
    final end = DateTime(e.year, e.month, e.day, 23, 59, 59, 999);

    final results = await Future.wait<dynamic>([
      _retry<PostgrestList>(() => _client
          .from('lead_actions')
          .select(cols)
          .eq('assignee_id', employeeId)
          .isFilter('done_at', null)
          .order('due_at', ascending: true, nullsFirst: false)
          .limit(200)),
      _retry<PostgrestList>(() => _client
          .from('lead_actions')
          .select(cols)
          .or('assignee_id.eq.$employeeId,created_by.eq.$employeeId')
          .not('done_at', 'is', null)
          .gte('done_at', _utc(start))
          .lte('done_at', _utc(end))
          .order('done_at', ascending: false)
          .limit(100)),
      _safeList(() => _retry<PostgrestList>(() => _client
          .from('user_actions')
          .select('id, user_id, lead_id, created_at, payload')
          .eq('user_id', employeeId)
          .eq('action_type', 'STATUS_CHANGE')
          .gte('created_at', _utc(start))
          .lte('created_at', _utc(end))
          .order('created_at', ascending: false)
          .limit(100))),
    ]);
    final up = results[0] as List<Map<String, dynamic>>;
    final done = results[1] as List<Map<String, dynamic>>;
    final status = results[2] as List<Map<String, dynamic>>;

    final names = await _userNames([
      ...up.expand((a) => [a['assignee_id']?.toString(), a['created_by']?.toString()]),
      ...done.expand((a) => [a['assignee_id']?.toString(), a['created_by']?.toString()]),
      ...status.map((s) => s['user_id']?.toString()),
    ]);
    final leads = await _leadInfo([
      ...up.map((a) => a['lead_id']?.toString()),
      ...done.map((a) => a['lead_id']?.toString()),
      ...status.map((s) => s['lead_id']?.toString()),
    ]);

    final history = <EmpHistoryEntry>[
      ...done.map((r) {
        final a = _actionView(r, names, leads);
        final label = (actionTypes[a.type] ?? a.type) + (a.status != null ? ' · ${a.status}' : '');
        return EmpHistoryEntry(
          id: 'a-${a.id}',
          isStatusChange: false,
          at: a.doneAt ?? DateTime.tryParse(r['created_at']?.toString() ?? ''),
          byName: a.createdByName,
          label: label,
          note: a.note,
          leadName: a.leadName,
        );
      }),
      ...status.map((s) {
        final payload = s['payload'] is Map ? s['payload'] as Map : const {};
        final uid = s['user_id']?.toString();
        final lid = s['lead_id']?.toString();
        return EmpHistoryEntry(
          id: 's-${s['id']}',
          isStatusChange: true,
          at: DateTime.tryParse(s['created_at']?.toString() ?? ''),
          byName: (uid != null ? names[uid] : null) ?? 'Unknown',
          label: 'Status change',
          leadName: lid != null ? leads[lid]?.name : null,
          from: payload['old_status']?.toString(),
          to: payload['new_status']?.toString(),
        );
      }),
    ]..sort((a, b) => (b.at ?? DateTime(1970)).compareTo(a.at ?? DateTime(1970)));

    return EmpActions(up.map((r) => _actionView(r, names, leads)).toList(), history);
  }

  /// Status updates also move the lead's stage (atomic RPC), exactly like the web route.
  Future<void> createAction({
    required String leadId,
    String? callId,
    required String type,
    String? status,
    String? note,
    DateTime? dueAt,
    String? assigneeId,
  }) async {
    await _client.rpc('create_lead_action', params: {
      'p_lead_id': leadId,
      'p_call_id': callId,
      'p_type': type,
      'p_status': status,
      'p_note': (note == null || note.trim().isEmpty) ? null : note.trim(),
      'p_due_at': dueAt?.toUtc().toIso8601String(),
      'p_assignee_id': assigneeId ?? currentUserId,
      'p_new_crm_status': (type == 'status_update' && status != null) ? statusToCrm[status] : null,
    });
  }

  Future<void> setActionDone(String id, bool done) async {
    final res = await _client
        .from('lead_actions')
        .update({'done_at': done ? DateTime.now().toUtc().toIso8601String() : null})
        .eq('id', id)
        .select('id');
    if ((res as List).isEmpty) throw Exception('You do not have permission to change this action.');
  }

  Future<List<({String id, String name})>> assignableUsers() async {
    try {
      final rows = await _retry<PostgrestList>(
        () => _client.from('user_profiles').select('id, full_name, email').eq('is_active', true).order('full_name'),
      );
      return rows
          .map((r) => (
                id: r['id'].toString(),
                name: (r['full_name']?.toString().isNotEmpty ?? false) ? r['full_name'].toString() : (r['email']?.toString() ?? 'User'),
              ))
          .toList();
    } catch (_) {
      return [];
    }
  }
}
