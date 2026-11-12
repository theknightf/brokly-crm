// Models for the Teams module (tables: teams, team_memberships,
// team_leader_ratings, user_profiles).

double _num(dynamic v) {
  if (v is num) return v.toDouble();
  return double.tryParse(v?.toString() ?? '') ?? 0;
}

String _embeddedName(dynamic v) {
  if (v is Map) return v['full_name']?.toString() ?? '';
  if (v is List && v.isNotEmpty && v.first is Map) {
    return (v.first as Map)['full_name']?.toString() ?? '';
  }
  return '';
}

class TeamsTeam {
  final String id;
  final String name;
  final String description;
  final String? leaderId;
  final String leaderName;
  final int memberCount;
  final String createdAt;

  const TeamsTeam({
    required this.id,
    required this.name,
    this.description = '',
    this.leaderId,
    this.leaderName = '',
    this.memberCount = 0,
    this.createdAt = '',
  });

  factory TeamsTeam.fromJson(Map<String, dynamic> j) {
    final members = j['team_memberships'];
    final created = j['created_at']?.toString() ?? '';
    return TeamsTeam(
      id: j['id']?.toString() ?? '',
      name: j['name']?.toString() ?? '',
      description: j['description']?.toString() ?? '',
      leaderId: j['leader_id']?.toString(),
      leaderName: _embeddedName(j['leader']),
      memberCount: members is List ? members.length : 0,
      createdAt: created.length >= 10 ? created.substring(0, 10) : created,
    );
  }
}

class TeamsMember {
  final String membershipId;
  final String userId;
  final String name;
  final String email;
  final String role;
  final bool isLeader;

  const TeamsMember({
    required this.membershipId,
    required this.userId,
    required this.name,
    required this.email,
    required this.role,
    required this.isLeader,
  });

  factory TeamsMember.fromJson(Map<String, dynamic> j) {
    final u = j['user'] is Map ? j['user'] as Map : const {};
    return TeamsMember(
      membershipId: j['id']?.toString() ?? '',
      userId: j['user_id']?.toString() ?? '',
      name: u['full_name']?.toString() ?? '',
      email: u['email']?.toString() ?? '',
      role: u['role']?.toString() ?? 'agent',
      isLeader: j['is_leader'] == true,
    );
  }
}

/// A user that can be added to a team.
class TeamsCandidate {
  final String id;
  final String name;
  final String email;
  final String role;
  final String? teamId;

  const TeamsCandidate({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    this.teamId,
  });

  factory TeamsCandidate.fromJson(Map<String, dynamic> j) => TeamsCandidate(
        id: j['id']?.toString() ?? '',
        name: j['full_name']?.toString() ?? '',
        email: j['email']?.toString() ?? '',
        role: j['role']?.toString() ?? 'agent',
        teamId: j['team_id']?.toString(),
      );

  String get label => name.isNotEmpty ? name : email;
}

class TeamsKpis {
  final int leads;
  final int won;
  final double revenue;
  final int calls;
  final int callSeconds;
  final double expenses;

  const TeamsKpis({
    this.leads = 0,
    this.won = 0,
    this.revenue = 0,
    this.calls = 0,
    this.callSeconds = 0,
    this.expenses = 0,
  });

  TeamsKpis operator +(TeamsKpis o) => TeamsKpis(
        leads: leads + o.leads,
        won: won + o.won,
        revenue: revenue + o.revenue,
        calls: calls + o.calls,
        callSeconds: callSeconds + o.callSeconds,
        expenses: expenses + o.expenses,
      );

  double get profit => revenue - expenses;
  double get profitMargin => revenue > 0 ? (profit / revenue) * 100 : 0;
  double get conversion => leads > 0 ? (won / leads) * 100 : 0;
}

class TeamsLeaderRating {
  final String id;
  final double rating;
  final String comment;
  final String ratedByName;
  final String updatedAt;

  const TeamsLeaderRating({
    required this.id,
    required this.rating,
    this.comment = '',
    this.ratedByName = '',
    this.updatedAt = '',
  });

  factory TeamsLeaderRating.fromJson(Map<String, dynamic> j, String ratedByName) =>
      TeamsLeaderRating(
        id: j['id']?.toString() ?? '',
        rating: _num(j['rating']),
        comment: j['comment']?.toString() ?? '',
        ratedByName: ratedByName,
        updatedAt: j['updated_at']?.toString() ?? j['created_at']?.toString() ?? '',
      );
}

class TeamsPerformance {
  final String teamId;
  final String teamName;
  final String? leaderId;
  final String leaderName;
  final String leaderEmail;
  final int memberCount;
  final TeamsKpis stats;
  final TeamsKpis? leaderStats;
  final TeamsLeaderRating? rating;

  const TeamsPerformance({
    required this.teamId,
    required this.teamName,
    this.leaderId,
    this.leaderName = '',
    this.leaderEmail = '',
    this.memberCount = 0,
    required this.stats,
    this.leaderStats,
    this.rating,
  });
}
