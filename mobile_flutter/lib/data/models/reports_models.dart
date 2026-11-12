// Models for the Reports module (summary, funnel matrix, goals, attendance,
// analytics RPCs and the employee drawer). Every parser tolerates missing /
// null / wrongly typed columns.

String? _str(dynamic v) {
  if (v == null) return null;
  final s = v.toString().trim();
  return s.isEmpty ? null : s;
}

int _int(dynamic v) {
  if (v is int) return v;
  if (v is num) return v.round();
  return int.tryParse(v?.toString() ?? '') ?? 0;
}

double _dbl(dynamic v) {
  if (v is num) return v.toDouble();
  return double.tryParse(v?.toString() ?? '') ?? 0;
}

DateTime? _date(dynamic v) {
  final s = _str(v);
  if (s == null) return null;
  return DateTime.tryParse(s);
}

Map<String, dynamic> asMap(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};

List<Map<String, dynamic>> asRows(dynamic v) =>
    v is List ? v.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() : <Map<String, dynamic>>[];

// ─────────────────────────── Raw rows ───────────────────────────

class RpLead {
  final String id;
  final String? crmStatus;
  final String? leadStatus;
  final String? source;
  final String? propertyType;
  final String? project;
  final String? team;
  final String? agent;
  final String? assignedTo;
  final String? createdBy;
  final double budgetMax;
  final DateTime? createdAt;

  const RpLead({
    required this.id,
    this.crmStatus,
    this.leadStatus,
    this.source,
    this.propertyType,
    this.project,
    this.team,
    this.agent,
    this.assignedTo,
    this.createdBy,
    this.budgetMax = 0,
    this.createdAt,
  });

  factory RpLead.fromJson(Map<String, dynamic> j) => RpLead(
        id: _str(j['id']) ?? '',
        crmStatus: _str(j['crm_status']),
        leadStatus: _str(j['lead_status']),
        source: _str(j['source']),
        propertyType: _str(j['property_type']),
        project: _str(j['project']),
        team: _str(j['team']),
        agent: _str(j['agent']),
        assignedTo: _str(j['assigned_to']),
        createdBy: _str(j['created_by']),
        budgetMax: _dbl(j['budget_max']),
        createdAt: _date(j['created_at']),
      );

  String get stage => crmStatus ?? leadStatus ?? 'Fresh Leads';
  bool get isWon => leadStatus == 'Won';
  bool ownedBy(String uid) => assignedTo == uid || createdBy == uid;
}

class RpCall {
  final String id;
  final String? userId;
  final String? entityId;
  final String? entityType;
  final String? channel;
  final String? direction;
  final String? outcome;
  final int durationSeconds;
  final bool? isValid;
  final DateTime? createdAt;

  const RpCall({
    required this.id,
    this.userId,
    this.entityId,
    this.entityType,
    this.channel,
    this.direction,
    this.outcome,
    this.durationSeconds = 0,
    this.isValid,
    this.createdAt,
  });

  factory RpCall.fromJson(Map<String, dynamic> j) => RpCall(
        id: _str(j['id']) ?? '',
        userId: _str(j['user_id']),
        entityId: _str(j['entity_id']),
        entityType: _str(j['entity_type']),
        channel: _str(j['channel']),
        direction: _str(j['direction']),
        outcome: _str(j['outcome']),
        durationSeconds: _int(j['duration_seconds']),
        isValid: j['is_valid'] is bool ? j['is_valid'] as bool : null,
        createdAt: _date(j['created_at']),
      );
}

class RpProfile {
  final String id;
  final String name;
  final String email;
  final String role;
  final String? teamId;
  final bool isActive;
  final String? avatarUrl;

  const RpProfile({
    required this.id,
    required this.name,
    this.email = '',
    this.role = '',
    this.teamId,
    this.isActive = true,
    this.avatarUrl,
  });

  factory RpProfile.fromJson(Map<String, dynamic> j) {
    final email = _str(j['email']) ?? '';
    return RpProfile(
      id: _str(j['id']) ?? '',
      name: _str(j['full_name']) ?? (email.isNotEmpty ? email : 'Unknown'),
      email: email,
      role: _str(j['role']) ?? '',
      teamId: _str(j['team_id']),
      isActive: j['is_active'] != false,
      avatarUrl: _str(j['avatar_url']),
    );
  }

  bool get isOwnerOrAdmin {
    final r = role.toLowerCase().trim();
    return r == 'owner' || r == 'admin';
  }
}

class RpTeam {
  final String id;
  final String name;
  final String? leaderId;
  const RpTeam({required this.id, required this.name, this.leaderId});

  factory RpTeam.fromJson(Map<String, dynamic> j) =>
      RpTeam(id: _str(j['id']) ?? '', name: _str(j['name']) ?? 'Team', leaderId: _str(j['leader_id']));
}

class RpMembership {
  final String teamId;
  final String userId;
  final bool isLeader;
  const RpMembership({required this.teamId, required this.userId, this.isLeader = false});

  factory RpMembership.fromJson(Map<String, dynamic> j) => RpMembership(
        teamId: _str(j['team_id']) ?? '',
        userId: _str(j['user_id']) ?? '',
        isLeader: j['is_leader'] == true,
      );
}

class RpFollowUp {
  final String status;
  final String? createdBy;
  final DateTime? createdAt;
  const RpFollowUp({required this.status, this.createdBy, this.createdAt});

  factory RpFollowUp.fromJson(Map<String, dynamic> j) => RpFollowUp(
        status: _str(j['follow_up_status']) ?? 'Pending',
        createdBy: _str(j['created_by']),
        createdAt: _date(j['created_at']),
      );
}

/// Everything the report calculators need, fetched once per date range.
class ReportsDataset {
  final String from;
  final String to;
  final DateTime rangeStart;
  final DateTime rangeEnd;

  /// Leads created from [windowStart] (covers the range, the previous period and the 6 month trend).
  final List<RpLead> leads;
  final List<RpCall> calls;
  final List<RpFollowUp> followUps;
  final List<RpProfile> profiles;
  final List<RpTeam> teams;
  final List<RpMembership> memberships;

  /// user_id -> number of STATUS_CHANGE actions in the range.
  final Map<String, int> statusUpdates;
  final int targetDeals;

  /// null = unrestricted (owner / admin). Otherwise the user ids the viewer may see.
  final Set<String>? scope;
  final String viewerId;
  final bool isAdmin;
  final DateTime fetchedAt;

  const ReportsDataset({
    required this.from,
    required this.to,
    required this.rangeStart,
    required this.rangeEnd,
    required this.leads,
    required this.calls,
    required this.followUps,
    required this.profiles,
    required this.teams,
    required this.memberships,
    required this.statusUpdates,
    required this.targetDeals,
    required this.scope,
    required this.viewerId,
    required this.isAdmin,
    required this.fetchedAt,
  });
}

// ─────────────────────────── Summary ───────────────────────────

class MonthlyPoint {
  final String month;
  final int leads;
  final int won;
  const MonthlyPoint(this.month, this.leads, this.won);
}

class AgentPerf {
  final String name;
  final int leads;
  final int won;
  final double rate;
  const AgentPerf(this.name, this.leads, this.won, this.rate);
}

class TeamPerf {
  final String id;
  final String name;
  final int assignedLeads;
  final int closedDeals;
  final double totalRevenue;
  final double conversionRate;
  final int calls;
  final int callDurationSeconds;
  const TeamPerf({
    required this.id,
    required this.name,
    required this.assignedLeads,
    required this.closedDeals,
    required this.totalRevenue,
    required this.conversionRate,
    required this.calls,
    required this.callDurationSeconds,
  });
}

class TeamAgentPerf {
  final String id;
  final String name;
  final String? teamId;
  final String teamName;
  final int totalLeads;
  final int pending;
  final int fresh;
  final int calls;
  const TeamAgentPerf({
    required this.id,
    required this.name,
    required this.teamId,
    required this.teamName,
    required this.totalLeads,
    required this.pending,
    required this.fresh,
    required this.calls,
  });
}

class StageByAgent {
  final String stage;
  final String agent;
  final int count;
  const StageByAgent(this.stage, this.agent, this.count);
}

class CallsByEmployee {
  final String userId;
  final String name;
  final int calls;
  final int totalDurationSeconds;
  final int connected;
  final int noAnswer;
  final int incoming;
  final int statusUpdates;
  const CallsByEmployee({
    required this.userId,
    required this.name,
    required this.calls,
    required this.totalDurationSeconds,
    required this.connected,
    required this.noAnswer,
    required this.incoming,
    required this.statusUpdates,
  });
}

class PreviousPeriod {
  final String from;
  final String to;
  final double leadsChange;
  final double customersChange;
  final double revenueChange;
  final double conversionChange;
  const PreviousPeriod({
    required this.from,
    required this.to,
    required this.leadsChange,
    required this.customersChange,
    required this.revenueChange,
    required this.conversionChange,
  });
}

class ReportSummary {
  final int totalLeads;
  final int totalCustomers;
  final double totalRevenue;
  final double conversionRate;
  final Map<String, int> leadsByStatus;
  final Map<String, int> leadsBySource;
  final Map<String, int> leadsByPropertyType;
  final Map<String, int> followUpsByStatus;
  final List<MonthlyPoint> monthlyLeads;
  final List<AgentPerf> agentPerformance;
  final List<TeamPerf> teamPerformance;
  final List<TeamAgentPerf> teamAgentPerformance;
  final List<StageByAgent> leadStageByAgent;
  final List<CallsByEmployee> callsByEmployee;
  final PreviousPeriod? previousPeriod;

  const ReportSummary({
    required this.totalLeads,
    required this.totalCustomers,
    required this.totalRevenue,
    required this.conversionRate,
    required this.leadsByStatus,
    required this.leadsBySource,
    required this.leadsByPropertyType,
    required this.followUpsByStatus,
    required this.monthlyLeads,
    required this.agentPerformance,
    required this.teamPerformance,
    required this.teamAgentPerformance,
    required this.leadStageByAgent,
    required this.callsByEmployee,
    required this.previousPeriod,
  });
}

// ─────────────────────────── Goals ───────────────────────────

class GoalStages {
  int newFresh = 0;
  int newCold = 0;
  int pending = 0;
  int callsAnswer = 0;
  int noAnswer = 0;
  int cancel = 0;
  int doneDeal = 0;
}

class AgentGoal {
  final String agentId;
  final String agentName;
  final String role;
  final String? avatarUrl;
  final GoalStages stages;
  final int totalCalls;
  final int targetDeals;
  final double goalProgress;
  const AgentGoal({
    required this.agentId,
    required this.agentName,
    required this.role,
    required this.avatarUrl,
    required this.stages,
    required this.totalCalls,
    required this.targetDeals,
    required this.goalProgress,
  });
}

class GoalsSummary {
  final int targetDeals;
  final List<AgentGoal> agents;
  const GoalsSummary(this.targetDeals, this.agents);
}

// ─────────────────────────── Funnel matrix (Agent x Stage) ───────────────────────────

class MatrixFilters {
  final String agent;
  final String teamLeader;
  final String team;
  final String project;
  final String campaign;
  final String source;
  final String stage;

  const MatrixFilters({
    this.agent = '',
    this.teamLeader = '',
    this.team = '',
    this.project = '',
    this.campaign = '',
    this.source = '',
    this.stage = '',
  });

  MatrixFilters copyWith({
    String? agent,
    String? teamLeader,
    String? team,
    String? project,
    String? campaign,
    String? source,
    String? stage,
  }) =>
      MatrixFilters(
        agent: agent ?? this.agent,
        teamLeader: teamLeader ?? this.teamLeader,
        team: team ?? this.team,
        project: project ?? this.project,
        campaign: campaign ?? this.campaign,
        source: source ?? this.source,
        stage: stage ?? this.stage,
      );

  int get activeCount => [agent, teamLeader, team, project, campaign, source, stage].where((v) => v.isNotEmpty).length;
}

class MatrixRow {
  final String agent;
  final List<int> counts;
  final int total;
  const MatrixRow(this.agent, this.counts, this.total);
}

class MatrixResult {
  final List<String> stages;
  final List<MatrixRow> rows;
  final List<int> columnTotals;
  final int grandTotal;
  const MatrixResult(this.stages, this.rows, this.columnTotals, this.grandTotal);
}

class MatrixOptions {
  final List<String> projects;
  final List<String> sources;
  final List<RpTeam> teams;
  final List<({String id, String name, String teamName})> teamLeaders;
  final List<({String id, String name})> agents;
  final List<String> stages;
  const MatrixOptions({
    required this.projects,
    required this.sources,
    required this.teams,
    required this.teamLeaders,
    required this.agents,
    required this.stages,
  });
}

// ─────────────────────────── Attendance ───────────────────────────

class OfficeHours {
  final String start;
  final String end;
  final int toleranceMinutes;
  const OfficeHours(this.start, this.end, this.toleranceMinutes);

  static const OfficeHours defaults = OfficeHours('12:00', '20:00', 12 * 60 + 20);
}

class AttendanceRow {
  final String id;
  final String name;
  final String role;
  final int present;
  final int onTime;
  final int late;
  final int absent;
  const AttendanceRow({
    required this.id,
    required this.name,
    required this.role,
    required this.present,
    required this.onTime,
    required this.late,
    required this.absent,
  });
}

class AttendanceReport {
  final OfficeHours office;
  final List<AttendanceRow> rows;
  const AttendanceReport(this.office, this.rows);
}

// ─────────────────────────── Call logs report ───────────────────────────

class CallLogEntry {
  final String id;
  final String agentName;
  final String? userId;
  final String? contactName;
  final String? contactPhone;
  final String? channel;
  final String? direction;
  final int durationSeconds;
  final String? outcome;
  final DateTime? createdAt;
  const CallLogEntry({
    required this.id,
    required this.agentName,
    this.userId,
    this.contactName,
    this.contactPhone,
    this.channel,
    this.direction,
    this.durationSeconds = 0,
    this.outcome,
    this.createdAt,
  });
}

// ─────────────────────────── Analytics RPCs ───────────────────────────

class AnalyticsFilters {
  final String assignFrom;
  final String assignTo;
  final String actionFrom;
  final String actionTo;
  final String createdFrom;
  final String createdTo;
  final String source;
  final String channel;
  final String isCold; // '', 'yes', 'no'
  final String createdBy;

  const AnalyticsFilters({
    this.assignFrom = '',
    this.assignTo = '',
    this.actionFrom = '',
    this.actionTo = '',
    this.createdFrom = '',
    this.createdTo = '',
    this.source = '',
    this.channel = '',
    this.isCold = '',
    this.createdBy = '',
  });

  AnalyticsFilters copyWith({
    String? assignFrom,
    String? assignTo,
    String? actionFrom,
    String? actionTo,
    String? createdFrom,
    String? createdTo,
    String? source,
    String? channel,
    String? isCold,
    String? createdBy,
  }) =>
      AnalyticsFilters(
        assignFrom: assignFrom ?? this.assignFrom,
        assignTo: assignTo ?? this.assignTo,
        actionFrom: actionFrom ?? this.actionFrom,
        actionTo: actionTo ?? this.actionTo,
        createdFrom: createdFrom ?? this.createdFrom,
        createdTo: createdTo ?? this.createdTo,
        source: source ?? this.source,
        channel: channel ?? this.channel,
        isCold: isCold ?? this.isCold,
        createdBy: createdBy ?? this.createdBy,
      );

  /// RPC `p` argument: empty values are dropped.
  Map<String, dynamic> toRpc() {
    final m = <String, dynamic>{
      'assignFrom': assignFrom,
      'assignTo': assignTo,
      'actionFrom': actionFrom,
      'actionTo': actionTo,
      'createdFrom': createdFrom,
      'createdTo': createdTo,
      'source': source,
      'channel': channel,
      'isCold': isCold,
      'createdBy': createdBy,
    };
    m.removeWhere((_, v) => v == null || v.toString().trim().isEmpty);
    return m;
  }

  int get activeCount => [
        assignFrom.isNotEmpty || assignTo.isNotEmpty,
        actionFrom.isNotEmpty || actionTo.isNotEmpty,
        createdFrom.isNotEmpty || createdTo.isNotEmpty,
        source.isNotEmpty,
        channel.isNotEmpty,
        isCold.isNotEmpty,
        createdBy.isNotEmpty,
      ].where((e) => e).length;

  String get signature => toRpc().entries.map((e) => '${e.key}=${e.value}').join('&');
}

class AnalyticsOptions {
  final List<String> sources;
  final List<String> channels;
  final List<({String id, String name})> agents;
  final List<String> stages;
  const AnalyticsOptions({
    this.sources = const [],
    this.channels = const [],
    this.agents = const [],
    this.stages = const [],
  });

  factory AnalyticsOptions.fromJson(dynamic raw) {
    final j = asMap(raw);
    List<String> strs(dynamic v) => v is List ? v.map((e) => e?.toString() ?? '').where((e) => e.isNotEmpty).toList() : <String>[];
    return AnalyticsOptions(
      sources: strs(j['sources']),
      channels: strs(j['channels']),
      stages: strs(j['stages']),
      agents: asRows(j['agents'])
          .map((a) => (id: _str(a['id']) ?? '', name: _str(a['name']) ?? 'Unknown'))
          .where((a) => a.id.isNotEmpty)
          .toList(),
    );
  }
}

class TimelinePoint {
  final String label;
  final int calls;
  const TimelinePoint(this.label, this.calls);
}

class OverviewStats {
  final int totalCalls;
  final double callsByHour;
  final int answered;
  final int noAnswer;
  final int closed;
  final int incoming;
  final int outgoing;
  final List<TimelinePoint> timeline;
  const OverviewStats({
    required this.totalCalls,
    required this.callsByHour,
    required this.answered,
    required this.noAnswer,
    required this.closed,
    required this.incoming,
    required this.outgoing,
    required this.timeline,
  });

  factory OverviewStats.fromJson(dynamic raw) {
    final j = asMap(raw);
    return OverviewStats(
      totalCalls: _int(j['totalCalls']),
      callsByHour: _dbl(j['callsByHour']),
      answered: _int(j['answered']),
      noAnswer: _int(j['noAnswer']),
      closed: _int(j['closed']),
      incoming: _int(j['incoming']),
      outgoing: _int(j['outgoing']),
      timeline: asRows(j['timeline']).map((p) => TimelinePoint(_str(p['label']) ?? '', _int(p['calls']))).toList(),
    );
  }
}

class AnalyticsCall {
  final String id;
  final String? leadId;
  final String? leadName;
  final String? phone;
  final String? direction;
  final String? channel;
  final String? outcome;
  final String bucket; // answered | no_answer | closed
  final int durationSeconds;
  final DateTime? createdAt;
  final String? source;
  final String? leadStage;
  final String? agentName;
  final String? ownerName;
  const AnalyticsCall({
    required this.id,
    this.leadId,
    this.leadName,
    this.phone,
    this.direction,
    this.channel,
    this.outcome,
    required this.bucket,
    this.durationSeconds = 0,
    this.createdAt,
    this.source,
    this.leadStage,
    this.agentName,
    this.ownerName,
  });

  factory AnalyticsCall.fromJson(Map<String, dynamic> j) => AnalyticsCall(
        id: _str(j['id']) ?? '',
        leadId: _str(j['lead_id']),
        leadName: _str(j['lead_name']),
        phone: _str(j['phone']),
        direction: _str(j['direction']),
        channel: _str(j['channel']),
        outcome: _str(j['outcome']),
        bucket: _str(j['bucket']) ?? 'answered',
        durationSeconds: _int(j['duration_seconds']),
        createdAt: _date(j['created_at']),
        source: _str(j['source']),
        leadStage: _str(j['lead_stage']),
        agentName: _str(j['agent_name']),
        ownerName: _str(j['owner_name']),
      );
}

class AnalyticsCallsPage {
  final int total;
  final List<AnalyticsCall> rows;
  const AnalyticsCallsPage(this.total, this.rows);

  factory AnalyticsCallsPage.fromJson(dynamic raw) {
    final j = asMap(raw);
    return AnalyticsCallsPage(_int(j['total']), asRows(j['rows']).map(AnalyticsCall.fromJson).toList());
  }
}

class AssignedAgent {
  final String agentId;
  final String agentName;
  final String? teamId;
  final String teamName;
  final int leadsAssigned;
  final int assignFrom;
  final int total;
  final int calls;
  final Map<String, int> allStages;
  const AssignedAgent({
    required this.agentId,
    required this.agentName,
    required this.teamId,
    required this.teamName,
    required this.leadsAssigned,
    required this.assignFrom,
    required this.total,
    required this.calls,
    required this.allStages,
  });

  factory AssignedAgent.fromJson(Map<String, dynamic> j) => AssignedAgent(
        agentId: _str(j['agentId']) ?? '',
        agentName: _str(j['agentName']) ?? 'Unknown',
        teamId: _str(j['teamId']),
        teamName: _str(j['teamName']) ?? 'No team',
        leadsAssigned: _int(j['leadsAssigned']),
        assignFrom: _int(j['assignFrom']),
        total: _int(j['total']),
        calls: _int(j['calls']),
        allStages: asMap(j['allStages']).map((k, v) => MapEntry(k, _int(v))),
      );
}

class AssignedData {
  final List<({String id, String name})> teams;
  final List<AssignedAgent> agents;
  const AssignedData(this.teams, this.agents);

  factory AssignedData.fromJson(dynamic raw) {
    final j = asMap(raw);
    return AssignedData(
      asRows(j['teams']).map((t) => (id: _str(t['id']) ?? '', name: _str(t['name']) ?? 'Team')).toList(),
      asRows(j['agents']).map(AssignedAgent.fromJson).toList(),
    );
  }
}

// ─────────────────────────── Employee drawer ───────────────────────────

enum CallResult { connected, noAnswer, incoming, other }

extension CallResultX on CallResult {
  String get label => switch (this) {
        CallResult.connected => 'Connected',
        CallResult.noAnswer => 'No answer',
        CallResult.incoming => 'Incoming',
        CallResult.other => 'Other',
      };
}

class EmpCall {
  final String id;
  final String? leadId;
  final String? leadName;
  final String? phone;
  final DateTime? createdAt;
  final bool incoming;
  final CallResult result;
  final int durationSeconds;
  const EmpCall({
    required this.id,
    this.leadId,
    this.leadName,
    this.phone,
    this.createdAt,
    required this.incoming,
    required this.result,
    required this.durationSeconds,
  });
}

class EmpCallsPage {
  final List<EmpCall> calls;
  final String? nextCursor;
  const EmpCallsPage(this.calls, this.nextCursor);
}

class EmpNote {
  final String id;
  final String leadId;
  final String? leadName;
  final String? callId;
  final String? authorId;
  final String authorName;
  final String body;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  const EmpNote({
    required this.id,
    required this.leadId,
    this.leadName,
    this.callId,
    this.authorId,
    required this.authorName,
    required this.body,
    this.createdAt,
    this.updatedAt,
  });

  bool get edited =>
      createdAt != null && updatedAt != null && updatedAt!.difference(createdAt!).inMilliseconds > 2000;
}

class EmpAction {
  final String id;
  final String leadId;
  final String? leadName;
  final String type;
  final String? status;
  final String? note;
  final DateTime? dueAt;
  final DateTime? doneAt;
  final String? assigneeName;
  final String createdByName;
  const EmpAction({
    required this.id,
    required this.leadId,
    this.leadName,
    required this.type,
    this.status,
    this.note,
    this.dueAt,
    this.doneAt,
    this.assigneeName,
    required this.createdByName,
  });
}

class EmpHistoryEntry {
  final String id;
  final bool isStatusChange;
  final DateTime? at;
  final String byName;
  final String label;
  final String? note;
  final String? leadName;
  final String? from;
  final String? to;
  const EmpHistoryEntry({
    required this.id,
    required this.isStatusChange,
    this.at,
    required this.byName,
    required this.label,
    this.note,
    this.leadName,
    this.from,
    this.to,
  });
}

class EmpActions {
  final List<EmpAction> upcoming;
  final List<EmpHistoryEntry> history;
  const EmpActions(this.upcoming, this.history);
}
