import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/admin_models.dart';
import 'supabase_service.dart';

/// Performance 360: weighted leaderboard (Call 40% / Attendance 30% /
/// Dress code 30%), the Employee 360 profile and dress-code evaluations.
/// Ports /api/leaderboard, /api/employees/:id/profile-360,
/// /api/owner/employee-360/:id, /api/employees/:id/report and
/// /api/evaluations/dress-code. RLS-only (no service-role key).
///
/// Approximation: "late" uses the same fixed 12:30 (UTC clock) tolerance as the
/// web profile-360 route, not a per-company office-hours lookup.
class AdminPerformanceService {
  final SupabaseClient _client = SupabaseService().client;

  List<Map<String, dynamic>> _rows(dynamic res) =>
      (res as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();

  // ─── scoring helpers (identical formulas to the web) ──────────────────────

  static int callScore(int totalCalls, int converted) {
    final vol = ((totalCalls / 20) * 100).clamp(0, 100).toDouble();
    final conv = totalCalls > 0 ? ((converted / (totalCalls < 1 ? 1 : totalCalls)) * 100).clamp(0, 100).toDouble() : 0.0;
    if (converted == 0 && totalCalls > 0) return vol.round();
    return (vol * 0.6 + conv * 0.4).round();
  }

  static int attendanceScore(int present, int total, int late) {
    if (total == 0) return 0;
    final rate = (present / total) * 100;
    final punctual = present > 0 ? ((present - late) / present) * 100 : 0.0;
    final v = rate * 0.5 + punctual * 0.5;
    return (v < 0 ? 0 : v).round();
  }

  static int dressScore(double? avg) => avg == null ? 0 : ((avg / 5) * 100).round();

  static AdminScores combine(int c, int a, int d) =>
      AdminScores(call: c, attendance: a, dress: d, total: (c * 0.40 + a * 0.30 + d * 0.30).round());

  static bool _isLate(dynamic checkIn) {
    if (checkIn == null) return false;
    final t = DateTime.tryParse(checkIn.toString());
    if (t == null) return false;
    final u = t.toUtc();
    return u.hour * 60 + u.minute > 12 * 60 + 30;
  }

  static String _iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  static ({String start, String end}) periodRange(String period, [DateTime? ref]) {
    final now = ref ?? DateTime.now();
    if (period == 'day') return (start: _iso(now), end: _iso(now));
    if (period == 'week') {
      final dow = (now.weekday + 6) % 7; // Monday = 0
      final s = DateTime(now.year, now.month, now.day - dow);
      return (start: _iso(s), end: _iso(DateTime(s.year, s.month, s.day + 6)));
    }
    return (start: _iso(DateTime(now.year, now.month, 1)), end: _iso(DateTime(now.year, now.month + 1, 0)));
  }

  static int _daysInRange(String a, String b) =>
      DateTime.parse(b).difference(DateTime.parse(a)).inDays + 1;

  static int _durationSeconds(dynamic a, dynamic b) {
    final x = a == null ? null : DateTime.tryParse(a.toString());
    final y = b == null ? null : DateTime.tryParse(b.toString());
    if (x == null || y == null || y.isBefore(x)) return 0;
    return y.difference(x).inSeconds;
  }

  // ─── Leaderboard ──────────────────────────────────────────────────────────

  Future<AdminLeaderboard> getLeaderboard(String period) async {
    final range = periodRange(period);
    final totalDays = _daysInRange(range.start, range.end);

    final usersRaw = await _client
        .from('user_profiles')
        .select('id, full_name, email, role, is_active')
        .eq('is_active', true)
        .order('full_name');
    final users = _rows(usersRaw).where((u) => u['role'] != 'owner' && u['role'] != 'admin').toList();
    if (users.isEmpty) return AdminLeaderboard(start: range.start, end: range.end, rows: const []);

    final res = await Future.wait([
      _client
          .from('attendance')
          .select('user_id, attendance_date, check_in_time')
          .gte('attendance_date', range.start)
          .lte('attendance_date', range.end),
      _client
          .from('call_logs')
          .select('user_id, outcome, created_at')
          .gte('created_at', '${range.start}T00:00:00')
          .lte('created_at', '${range.end}T23:59:59.999'),
      _client
          .from('evaluations')
          .select('employee_id, dress_code_rating, date')
          .gte('date', range.start)
          .lte('date', range.end),
    ]);
    final attendance = _rows(res[0]);
    final calls = _rows(res[1]);
    final evals = _rows(res[2]);

    final rows = <AdminLeaderboardRow>[];
    for (final u in users) {
      final id = u['id'].toString();
      final att = attendance.where((a) => a['user_id']?.toString() == id).toList();
      final late = att.where((a) => _isLate(a['check_in_time'])).length;
      final myCalls = calls.where((c) => c['user_id']?.toString() == id).toList();
      final converted =
          myCalls.where((c) => const ['Successful', 'Converted', 'Won'].contains(c['outcome']?.toString() ?? '')).length;
      final myEvals = evals.where((e) => e['employee_id']?.toString() == id).toList();
      final avg = myEvals.isEmpty
          ? null
          : myEvals.fold<double>(0, (s, e) => s + admNum(e['dress_code_rating'])) / myEvals.length;
      final scores = combine(
        callScore(myCalls.length, converted),
        attendanceScore(att.length, totalDays, late),
        dressScore(avg),
      );
      rows.add(AdminLeaderboardRow(
        userId: id,
        name: (u['full_name']?.toString().isNotEmpty ?? false) ? u['full_name'].toString() : (u['email']?.toString() ?? ''),
        role: u['role']?.toString() ?? '',
        rank: 0,
        scores: scores,
        totalCalls: myCalls.length,
        presentDays: att.length,
        totalDays: totalDays,
        avgDress: avg == null ? null : (avg * 10).round() / 10,
      ));
    }
    rows.sort((a, b) => b.scores.total.compareTo(a.scores.total));
    final ranked = [
      for (var i = 0; i < rows.length; i++)
        AdminLeaderboardRow(
          userId: rows[i].userId,
          name: rows[i].name,
          role: rows[i].role,
          rank: i + 1,
          scores: rows[i].scores,
          totalCalls: rows[i].totalCalls,
          presentDays: rows[i].presentDays,
          totalDays: rows[i].totalDays,
          avgDress: rows[i].avgDress,
        )
    ];
    return AdminLeaderboard(start: range.start, end: range.end, rows: ranked);
  }

  // ─── Dress-code evaluations ───────────────────────────────────────────────

  Future<void> submitDressCode({
    required String employeeId,
    required String date,
    required int rating,
    required String notes,
    required List<String> flags,
  }) async {
    if (rating < 1 || rating > 3) {
      throw Exception('Rating must be 1-3 (1=Casual, 2=Semi-Formal, 3=Classic/Formal)');
    }
    final evaluator = _client.auth.currentUser?.id;
    if (evaluator == null) throw Exception('Not signed in');
    final emp = await _client.from('user_profiles').select('id').eq('id', employeeId).maybeSingle();
    if (emp == null) throw Exception('Employee not found');
    final cleanNotes = notes.trim().length > 1000 ? notes.trim().substring(0, 1000) : notes.trim();
    final cleanFlags = flags.map((f) => f.trim()).where((f) => f.isNotEmpty).take(10).toList();
    await _client.from('evaluations').upsert({
      'employee_id': employeeId,
      'evaluator_id': evaluator,
      'date': date,
      'dress_code_rating': rating,
      'notes': cleanNotes,
      'behavioral_flags': cleanFlags,
    }, onConflict: 'employee_id,date,evaluator_id');
  }

  // ─── Employee 360 ─────────────────────────────────────────────────────────

  Future<AdminEmployee360> getEmployee360(String employeeId, String from, String to) async {
    final startIso = '${from}T00:00:00';
    final endIso = '${to}T23:59:59.999';
    final totalDays = _daysInRange(from, to);
    final today = _iso(DateTime.now());

    final res = await Future.wait<dynamic>([
      _client
          .from('user_profiles')
          .select('id, full_name, email, role, phone, is_active, created_at, team_id, base_salary')
          .eq('id', employeeId)
          .maybeSingle(),
      _client
          .from('attendance')
          .select('*')
          .eq('user_id', employeeId)
          .gte('attendance_date', from)
          .lte('attendance_date', to)
          .order('attendance_date', ascending: false),
      _client
          .from('call_logs')
          .select('*')
          .eq('user_id', employeeId)
          .gte('created_at', startIso)
          .lte('created_at', endIso)
          .order('created_at', ascending: false)
          .limit(500),
      _client
          .from('evaluations')
          .select('*, evaluator:user_profiles!evaluations_evaluator_id_fkey(full_name)')
          .eq('employee_id', employeeId)
          .gte('date', from)
          .lte('date', to)
          .order('date', ascending: false),
      _client
          .from('leads')
          .select('id, name, phone, lead_status, crm_status, follow_up_due, created_at, created_by')
          .or('created_by.eq.$employeeId,assigned_to.eq.$employeeId')
          .order('created_at', ascending: false)
          .limit(200),
      _client.from('follow_ups').select('*').eq('created_by', employeeId).order('created_at', ascending: false).limit(200),
      _client
          .from('user_daily_activity')
          .select('activity_date, total_active_seconds')
          .eq('user_id', employeeId)
          .gte('activity_date', from)
          .lte('activity_date', to),
      _client
          .from('user_actions')
          .select('user_id, action_type, created_at')
          .eq('user_id', employeeId)
          .gte('created_at', startIso)
          .lte('created_at', endIso),
      _optional(() => _client
          .from('site_visits')
          .select('*')
          .eq('user_id', employeeId)
          .gte('check_in_at', startIso)
          .lte('check_in_at', endIso)
          .order('check_in_at', ascending: false)
          .limit(300)),
      _optional(() =>
          _client.from('expenses').select('*').eq('created_by', employeeId).order('created_at', ascending: false).limit(500)),
      _optional(() => _client
          .from('payroll_deductions')
          .select('*')
          .eq('user_id', employeeId)
          .order('created_at', ascending: false)
          .limit(50)),
      _optional(() => _client
          .from('notifications')
          .select('*')
          .eq('user_id', employeeId)
          .order('created_at', ascending: false)
          .limit(50)),
    ]);

    final empRow = res[0];
    if (empRow == null) throw Exception('Employee not found or not visible to you');
    final emp = Map<String, dynamic>.from(empRow as Map);
    final attendance = _rows(res[1]);
    final calls = _rows(res[2]);
    final evaluations = _rows(res[3]).map(AdminEvaluation.fromJson).toList();
    final leads = _rows(res[4]);
    final followUps = _rows(res[5]);
    final daily = _rows(res[6]);
    final actions = _rows(res[7]);
    final visits = _rows(res[8]);
    final expenses = _rows(res[9]);
    final deductions = _rows(res[10]).map(AdminDeduction.fromJson).toList();
    final notifications = _rows(res[11]);

    final present = attendance.length;
    final late = attendance.where((a) => _isLate(a['check_in_time'])).length;
    final workSec = attendance.fold<int>(0, (s, r) => s + _durationSeconds(r['check_in_time'], r['check_out_time']));
    final activeSec = daily.fold<int>(0, (s, r) => s + admNum(r['total_active_seconds']).round());
    final totalCalls = calls.length;
    final converted =
        calls.where((c) => const ['Successful', 'Converted', 'Won'].contains(c['outcome']?.toString() ?? '')).length;
    final convertedLeads = leads.where((l) => l['lead_status'] == 'Won').length;
    final avgDress =
        evaluations.isEmpty ? null : evaluations.fold<double>(0, (s, e) => s + e.rating) / evaluations.length;
    final pass = evaluations.where((e) => e.rating >= 3).length;
    final passRate = evaluations.isEmpty ? 0 : ((pass / evaluations.length) * 100).round();

    final scores = combine(
      callScore(totalCalls, converted > 0 ? converted : convertedLeads),
      attendanceScore(present, totalDays, late),
      dressScore(avgDress),
    );

    final overdue = followUps.where((f) {
      final st = f['follow_up_status']?.toString();
      final due = f['due_date']?.toString();
      if (due == null || due.isEmpty) return false;
      return (st == 'Pending' || st == 'In Progress' || st == 'Overdue') && due.compareTo(today) < 0;
    }).length;

    final timeline = <AdminTimelineItem>[
      for (final c in calls)
        AdminTimelineItem(
          at: c['created_at']?.toString() ?? '',
          type: 'call',
          label: '${c['channel'] ?? 'Call'}${(c['outcome']?.toString().isNotEmpty ?? false) ? ' · ${c['outcome']}' : ''}',
          detail: c['contact_name']?.toString() ?? '',
        ),
      for (final a in attendance)
        AdminTimelineItem(
          at: (a['check_in_time'] ?? a['attendance_date'])?.toString() ?? '',
          type: 'attendance',
          label: a['check_out_time'] != null ? 'Attendance' : 'Checked in',
          detail: _fmtDur(_durationSeconds(a['check_in_time'], a['check_out_time'])),
        ),
      for (final e in evaluations)
        AdminTimelineItem(
          at: '${e.date}T12:00:00',
          type: 'evaluation',
          label: 'Dress Code ${e.rating}/5',
          detail: e.notes.isNotEmpty ? e.notes : e.flags.join(', '),
        ),
      for (final v in visits)
        AdminTimelineItem(
          at: (v['check_in_at'] ?? v['created_at'])?.toString() ?? '',
          type: 'visit',
          label: 'Site visit ${v['status'] ?? ''}'.trim(),
          detail: (v['project_name'] ?? v['lead_name'])?.toString() ?? '',
        ),
      for (final f in followUps.take(100))
        AdminTimelineItem(
          at: f['created_at']?.toString() ?? '',
          type: 'followup',
          label: 'Follow-up · ${f['follow_up_status'] ?? ''}',
          detail: f['title']?.toString() ?? '',
        ),
    ]..sort((a, b) => b.at.compareTo(a.at));

    final base = admNum(emp['base_salary']);
    final totalDed = deductions.fold<double>(0, (s, d) => s + d.amount);

    return AdminEmployee360(
      employee: AdminUser.fromJson(emp),
      from: from,
      to: to,
      scores: scores,
      daysWorked: present,
      totalDays: totalDays,
      lateDays: late,
      workSeconds: workSec,
      activeSeconds: activeSec,
      totalCalls: totalCalls,
      converted: converted > 0 ? converted : convertedLeads,
      evaluationsCount: evaluations.length,
      avgDress: avgDress == null ? null : (avgDress * 10).round() / 10,
      dressPassRate: passRate,
      actions: actions.length,
      overdueFollowUps: overdue,
      attendance: attendance,
      calls: calls,
      evaluations: evaluations,
      leads: leads,
      followUps: followUps,
      visits: visits,
      expenses: expenses,
      timeline: timeline.take(400).toList(),
      deductions: deductions,
      notifications: notifications,
      baseSalary: base,
      totalDeductions: totalDed,
      canSeePayroll: true,
    );
  }

  /// Optional tables degrade to an empty list (web uses the same best-effort pattern).
  Future<List<dynamic>> _optional(Future<dynamic> Function() q) async {
    try {
      final r = await q();
      return r as List;
    } catch (_) {
      return <dynamic>[];
    }
  }

  static String _fmtDur(int sec) {
    final h = sec ~/ 3600;
    final m = ((sec % 3600) / 60).round();
    return h > 0 ? '${h}h ${m}m' : '${m}m';
  }
}
