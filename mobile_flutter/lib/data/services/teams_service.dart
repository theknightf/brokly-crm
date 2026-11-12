import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/teams_models.dart';
import 'supabase_service.dart';

const String _nilUuid = '00000000-0000-0000-0000-000000000000';

/// Direct-to-Supabase port of the web Teams page (crmService.teamsService and
/// /api/teams/performance). Everything here relies on RLS:
///  - teams / team_memberships: readable by all, writable by admin/owner
///  - team_leader_ratings: admin/owner read+write, the rated leader reads own
class TeamsService {
  final SupabaseClient _client = SupabaseService().client;

  static const String _teamSelect =
      '*, leader:user_profiles!teams_leader_id_fkey(id, full_name), team_memberships(id)';

  /// Teams the user may see. Admins see all; a leader sees the teams they
  /// lead or belong to (mirrors /api/teams/performance visibility).
  Future<List<TeamsTeam>> getTeams({required bool isAdmin, required String userId}) async {
    final res = await _client.from('teams').select(_teamSelect).order('created_at', ascending: false);
    var teams = (res as List).map((e) => TeamsTeam.fromJson(Map<String, dynamic>.from(e as Map))).toList();
    if (!isAdmin) {
      final mine = await _client.from('team_memberships').select('team_id, is_leader').eq('user_id', userId);
      final rows = (mine as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
      final led = rows.where((r) => r['is_leader'] == true).map((r) => r['team_id'].toString()).toSet();
      final belong = rows.map((r) => r['team_id'].toString()).toSet();
      final visible = led.isNotEmpty ? led : belong;
      teams = teams.where((t) => visible.contains(t.id) || t.leaderId == userId).toList();
    }
    return teams;
  }

  Future<void> createTeam(String name, String description) async {
    await _client.from('teams').insert({
      'name': name,
      'description': description,
      'created_by': _client.auth.currentUser?.id,
    });
  }

  Future<void> updateTeam(String id, String name, String description) async {
    await _client.from('teams').update({'name': name, 'description': description}).eq('id', id);
  }

  Future<void> deleteTeam(String id) async {
    // Same order as the web: release members first, then delete the team.
    await _client.from('user_profiles').update({'team_id': null}).eq('team_id', id);
    await _client.from('teams').delete().eq('id', id);
  }

  Future<List<TeamsMember>> getMembers(String teamId) async {
    final res = await _client
        .from('team_memberships')
        .select('id, user_id, is_leader, user:user_profiles!team_memberships_user_id_fkey(id, full_name, email, role)')
        .eq('team_id', teamId)
        .order('is_leader', ascending: false);
    return (res as List).map((e) => TeamsMember.fromJson(Map<String, dynamic>.from(e as Map))).toList();
  }

  /// Active users that can be placed into a team.
  Future<List<TeamsCandidate>> getCandidates() async {
    final res = await _client
        .from('user_profiles')
        .select('id, full_name, email, role, team_id')
        .eq('is_active', true)
        .order('full_name', ascending: true);
    return (res as List).map((e) => TeamsCandidate.fromJson(Map<String, dynamic>.from(e as Map))).toList();
  }

  Future<void> addMember(String teamId, String userId, bool isLeader) async {
    // A user belongs to at most one team: drop memberships in other teams.
    final other = await _client
        .from('team_memberships')
        .select('team_id, is_leader')
        .eq('user_id', userId)
        .neq('team_id', teamId);
    for (final raw in other as List) {
      final row = Map<String, dynamic>.from(raw as Map);
      final otherTeam = row['team_id'].toString();
      await _client.from('team_memberships').delete().eq('user_id', userId).eq('team_id', otherTeam);
      if (row['is_leader'] == true) {
        final t = await _client.from('teams').select('leader_id').eq('id', otherTeam).maybeSingle();
        if (t != null && t['leader_id']?.toString() == userId) {
          await _client.from('teams').update({'leader_id': null}).eq('id', otherTeam);
        }
      }
    }
    if (isLeader) {
      await _client.from('team_memberships').update({'is_leader': false}).eq('team_id', teamId).eq('is_leader', true);
    }
    await _client
        .from('team_memberships')
        .upsert({'team_id': teamId, 'user_id': userId, 'is_leader': isLeader}, onConflict: 'team_id,user_id');
    await _client.from('user_profiles').update({'team_id': teamId}).eq('id', userId);
    if (isLeader) {
      await _client.from('teams').update({'leader_id': userId}).eq('id', teamId);
    }
  }

  Future<void> removeMember(String teamId, String userId) async {
    await _client.from('team_memberships').delete().eq('team_id', teamId).eq('user_id', userId);
    await _client.from('user_profiles').update({'team_id': null}).eq('id', userId).eq('team_id', teamId);
    final team = await _client.from('teams').select('leader_id').eq('id', teamId).maybeSingle();
    if (team != null && team['leader_id']?.toString() == userId) {
      await _client.from('teams').update({'leader_id': null}).eq('id', teamId);
    }
  }

  Future<void> setLeader(String teamId, String userId) async {
    await _client.from('team_memberships').update({'is_leader': false}).eq('team_id', teamId);
    await _client.from('team_memberships').update({'is_leader': true}).eq('team_id', teamId).eq('user_id', userId);
    await _client.from('teams').update({'leader_id': userId}).eq('id', teamId);
  }

  /// Per-team KPIs, leader KPIs and the latest leader rating for ONE team.
  /// Port of GET /api/teams/performance (RLS scopes what the viewer can read).
  Future<TeamsPerformance?> getTeamPerformance(String teamId, {DateTime? from}) async {
    final team = await _client
        .from('teams')
        .select('id, name, leader_id')
        .eq('id', teamId)
        .maybeSingle();
    if (team == null) return null;

    final memRes = await _client.from('team_memberships').select('user_id').eq('team_id', teamId);
    final memberIds = (memRes as List).map((e) => (e as Map)['user_id'].toString()).toSet();
    final leaderId = team['leader_id']?.toString();
    final scopeIds = <String>{...memberIds, if (leaderId != null) leaderId};
    final ids = scopeIds.isEmpty ? [_nilUuid] : scopeIds.toList();

    final startIso = from?.toUtc().toIso8601String();
    final startDay = from?.toIso8601String().substring(0, 10);

    final results = await Future.wait([
      _client.from('user_profiles').select('id, full_name, email, role').inFilter('id', ids),
      _client
          .from('leads')
          .select('id, assigned_to, created_by, lead_status, budget_max, created_at')
          .inFilter('assigned_to', ids),
      _client.from('call_logs').select('user_id, duration_seconds, created_at').inFilter('user_id', ids),
      _client.from('expenses').select('created_by, amount, expense_date').inFilter('created_by', ids),
      _client.from('team_leader_ratings').select('*').eq('team_id', teamId),
    ]);

    final profiles = {
      for (final p in results[0] as List) (p as Map)['id'].toString(): Map<String, dynamic>.from(p)
    };
    final leads = (results[1] as List).map((e) => Map<String, dynamic>.from(e as Map)).where((l) {
      if (startIso == null) return true;
      final c = l['created_at']?.toString();
      return c == null || c.compareTo(startIso) >= 0;
    }).toList();
    final calls = (results[2] as List).map((e) => Map<String, dynamic>.from(e as Map)).where((c) {
      if (startIso == null) return true;
      final d = c['created_at']?.toString();
      return d == null || d.compareTo(startIso) >= 0;
    }).toList();
    final expenses = (results[3] as List).map((e) => Map<String, dynamic>.from(e as Map)).where((e) {
      if (startDay == null) return true;
      final d = e['expense_date']?.toString();
      return d == null || d.compareTo(startDay) >= 0;
    }).toList();
    final ratings = (results[4] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList()
      ..sort((a, b) => (a['created_at']?.toString() ?? '').compareTo(b['created_at']?.toString() ?? ''));

    double n(dynamic v) => v is num ? v.toDouble() : double.tryParse(v?.toString() ?? '') ?? 0;

    TeamsKpis memberStats(String id) {
      final mine = leads.where((l) => l['assigned_to']?.toString() == id || l['created_by']?.toString() == id);
      final won = mine.where((l) => l['lead_status'] == 'Won').toList();
      final myCalls = calls.where((c) => c['user_id']?.toString() == id);
      final myExp = expenses.where((e) => e['created_by']?.toString() == id);
      return TeamsKpis(
        leads: mine.length,
        won: won.length,
        revenue: won.fold(0.0, (s, l) => s + n(l['budget_max'])),
        calls: myCalls.length,
        callSeconds: myCalls.fold(0, (s, c) => s + n(c['duration_seconds']).round()),
        expenses: myExp.fold(0.0, (s, e) => s + n(e['amount'])),
      );
    }

    var total = const TeamsKpis();
    for (final id in memberIds) {
      total = total + memberStats(id);
    }

    TeamsLeaderRating? rating;
    if (ratings.isNotEmpty) {
      final r = ratings.last;
      final by = profiles[r['rated_by']?.toString()];
      rating = TeamsLeaderRating.fromJson(r, by?['full_name']?.toString() ?? '');
    }

    final leaderProfile = profiles[leaderId];
    return TeamsPerformance(
      teamId: teamId,
      teamName: team['name']?.toString() ?? '',
      leaderId: leaderId,
      leaderName: leaderProfile?['full_name']?.toString() ?? '',
      leaderEmail: leaderProfile?['email']?.toString() ?? '',
      memberCount: memberIds.length,
      stats: total,
      leaderStats: leaderId == null ? null : memberStats(leaderId),
      rating: rating,
    );
  }

  /// Owner/Admin rate a team leader 1-5 (inserts a row into team_leader_ratings).
  Future<void> rateLeader({
    required String teamId,
    required String leaderId,
    required double rating,
    required String comment,
  }) async {
    if (rating < 1 || rating > 5) throw Exception('Rating must be between 1 and 5');
    final team = await _client.from('teams').select('leader_id').eq('id', teamId).maybeSingle();
    if (team == null) throw Exception('Team not found');
    final membership = await _client
        .from('team_memberships')
        .select('id')
        .eq('team_id', teamId)
        .eq('user_id', leaderId)
        .maybeSingle();
    if (membership == null) throw Exception('The selected user is not a member of this team');
    if (team['leader_id']?.toString() != leaderId) {
      await _client.from('teams').update({'leader_id': leaderId}).eq('id', teamId);
    }
    await _client.from('team_leader_ratings').insert({
      'team_id': teamId,
      'leader_id': leaderId,
      'rating': (rating * 10).round() / 10,
      'comment': comment.trim(),
      'rated_by': _client.auth.currentUser?.id,
    });
  }
}
