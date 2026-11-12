import 'package:intl/intl.dart';
import '../../core/constants/lead_stages.dart';
import '../models/reports_models.dart';

/// Pure, synchronous report maths. Mirrors the web `/api/reports/summary`,
/// `/api/reports/calls-matrix` and `/api/reports/goals-summary` routes, but runs
/// on an already fetched [ReportsDataset] so filters apply instantly.
class ReportsCalculator {
  ReportsCalculator._();

  static const List<String> successOutcomes = ['Reached', 'Interested', 'Site Visit', 'Won Deal', 'Customer Replied'];
  static const List<String> noAnswerOutcomes = ['No Answer', 'No Answer At All', 'Busy', 'Wrong Number', 'No Reply'];

  static const Set<String> _terminalStages = {
    'Done Deal',
    'Not Interested',
    'Cancellation',
    'Wrong Number',
    'No Answer',
    'No Answer At All',
    'Closed Number',
    'Low Budget',
    'Data Rotation',
  };

  /// Canonical stage order first, unknown stages afterwards (alphabetical).
  static int compareStages(String a, String b) {
    final ia = LeadStages.allStatuses.indexOf(a);
    final ib = LeadStages.allStatuses.indexOf(b);
    if (ia == -1 && ib == -1) return a.compareTo(b);
    if (ia == -1) return 1;
    if (ib == -1) return -1;
    return ia - ib;
  }

  static bool _inRange(ReportsDataset d, DateTime? t) => t != null && !t.isBefore(d.rangeStart) && !t.isAfter(d.rangeEnd);

  static Map<String, RpProfile> _profileMap(ReportsDataset d) => {for (final p in d.profiles) p.id: p};

  static bool _inScope(ReportsDataset d, String? uid) => d.scope == null || (uid != null && d.scope!.contains(uid));

  static double _pct(double cur, double prev) => prev == 0 ? (cur == 0 ? 0 : 100) : ((cur - prev) / prev) * 100;

  // ───────────────────────── Summary ─────────────────────────

  static ReportSummary buildSummary(ReportsDataset d, {String? userId}) {
    final profiles = _profileMap(d);

    // Leads the viewer may see (and, optionally, only the selected user's).
    final visible = d.leads.where((l) {
      if (userId != null && !l.ownedBy(userId)) return false;
      if (d.scope == null) return true;
      return _inScope(d, l.assignedTo) || _inScope(d, l.createdBy);
    }).toList();
    final leads = visible.where((l) => _inRange(d, l.createdAt)).toList();
    final customers = leads.where((l) => l.isWon).toList();

    final calls = d.calls.where((c) {
      if (!_inRange(d, c.createdAt)) return false;
      if (userId != null && c.userId != userId) return false;
      return _inScope(d, c.userId);
    }).toList();

    final followUps = d.followUps.where((f) {
      if (!_inRange(d, f.createdAt)) return false;
      if (userId != null && f.createdBy != userId) return false;
      return true;
    }).toList();

    final leadsByStatus = <String, int>{};
    final leadsBySource = <String, int>{};
    final leadsByProperty = <String, int>{};
    for (final l in leads) {
      leadsByStatus[l.stage] = (leadsByStatus[l.stage] ?? 0) + 1;
      if (l.source != null) leadsBySource[l.source!] = (leadsBySource[l.source!] ?? 0) + 1;
      if (l.propertyType != null) leadsByProperty[l.propertyType!] = (leadsByProperty[l.propertyType!] ?? 0) + 1;
    }
    final followUpsByStatus = <String, int>{};
    for (final f in followUps) {
      followUpsByStatus[f.status] = (followUpsByStatus[f.status] ?? 0) + 1;
    }

    // Monthly trend: fixed 6 month window, independent of the selected range.
    final now = DateTime.now();
    final monthly = <MonthlyPoint>[];
    for (var i = 5; i >= 0; i--) {
      final m = DateTime(now.year, now.month - i, 1);
      final inMonth = visible.where((l) {
        final t = l.createdAt?.toLocal();
        return t != null && t.year == m.year && t.month == m.month;
      }).toList();
      monthly.add(MonthlyPoint(DateFormat('MMM yy').format(m), inMonth.length, inMonth.where((l) => l.isWon).length));
    }

    // Agent performance (by the free-text `agent` column, like the web).
    final agentStats = <String, List<int>>{};
    for (final l in leads) {
      if (l.agent == null) continue;
      final s = agentStats.putIfAbsent(l.agent!, () => [0, 0]);
      s[0]++;
      if (l.isWon) s[1]++;
    }
    final agentPerformance = agentStats.entries
        .map((e) => AgentPerf(e.key, e.value[0], e.value[1], e.value[0] > 0 ? e.value[1] / e.value[0] * 100 : 0))
        .toList()
      ..sort((a, b) => b.leads.compareTo(a.leads));

    final totalRevenue = customers.fold<double>(0, (s, l) => s + l.budgetMax);
    final conversion = leads.isNotEmpty ? customers.length / leads.length * 100 : 0.0;

    // Teams the viewer may see.
    var visibleTeams = d.teams;
    if (!d.isAdmin) {
      final mine = d.memberships.where((m) => m.userId == d.viewerId).toList();
      final led = mine.where((m) => m.isLeader).map((m) => m.teamId).toSet();
      final allowed = led.isNotEmpty ? led : mine.map((m) => m.teamId).toSet();
      visibleTeams = d.teams.where((t) => allowed.contains(t.id)).toList();
    }
    final memberIdsByTeam = <String, List<String>>{};
    for (final m in d.memberships) {
      if (!visibleTeams.any((t) => t.id == m.teamId)) continue;
      if (!_inScope(d, m.userId)) continue;
      if (userId != null && m.userId != userId) continue;
      memberIdsByTeam.putIfAbsent(m.teamId, () => []).add(m.userId);
    }

    final teamPerformance = <TeamPerf>[];
    for (final t in visibleTeams) {
      final members = memberIdsByTeam[t.id] ?? const <String>[];
      if (userId != null && members.isEmpty) continue;
      var assigned = 0, closed = 0, callCount = 0, callSecs = 0;
      var revenue = 0.0;
      for (final mid in members) {
        final mine = leads.where((l) => l.ownedBy(mid)).toList();
        assigned += mine.length;
        final won = mine.where((l) => l.isWon);
        closed += won.length;
        revenue += won.fold<double>(0, (s, l) => s + l.budgetMax);
        for (final c in calls.where((c) => c.userId == mid)) {
          callCount++;
          callSecs += c.durationSeconds;
        }
      }
      teamPerformance.add(TeamPerf(
        id: t.id,
        name: t.name,
        assignedLeads: assigned,
        closedDeals: closed,
        totalRevenue: revenue,
        conversionRate: assigned > 0 ? (closed / assigned * 1000).round() / 10 : 0,
        calls: callCount,
        callDurationSeconds: callSecs,
      ));
    }

    // Per-agent rows for the Team view.
    final teamName = {for (final t in d.teams) t.id: t.name};
    final teamAgents = d.profiles.where((p) {
      if (!p.isActive) return false;
      if (userId != null && p.id != userId) return false;
      if (d.scope != null) return d.scope!.contains(p.id);
      return true;
    }).map((p) {
      final mine = leads.where((l) => l.ownedBy(p.id)).toList();
      final fresh = mine.where((l) => l.stage == 'Fresh Leads' || l.stage == 'New').length;
      final pending = mine.where((l) => !_terminalStages.contains(l.stage) && l.stage != 'Fresh Leads' && l.stage != 'New').length;
      return TeamAgentPerf(
        id: p.id,
        name: p.name,
        teamId: p.teamId,
        teamName: teamName[p.teamId] ?? 'No team',
        totalLeads: mine.length,
        pending: pending,
        fresh: fresh,
        calls: calls.where((c) => c.userId == p.id).length,
      );
    }).toList()
      ..sort((a, b) => b.totalLeads.compareTo(a.totalLeads));

    final stageGroups = <String, StageByAgent>{};
    for (final l in leads) {
      final agent = (l.assignedTo != null ? profiles[l.assignedTo]?.name : null) ?? l.agent ?? 'Unassigned';
      final key = '${l.stage}::$agent';
      final cur = stageGroups[key];
      stageGroups[key] = StageByAgent(l.stage, agent, (cur?.count ?? 0) + 1);
    }
    final leadStageByAgent = stageGroups.values.toList()..sort((a, b) => b.count.compareTo(a.count));

    // Calls + status updates per employee.
    final perUser = <String, List<int>>{}; // calls, seconds, connected, noAnswer, incoming
    for (final c in calls) {
      final uid = c.userId ?? '';
      final s = perUser.putIfAbsent(uid, () => [0, 0, 0, 0, 0]);
      s[0]++;
      s[1] += c.durationSeconds;
      if (successOutcomes.contains(c.outcome) || c.durationSeconds >= 60) s[2]++;
      if (noAnswerOutcomes.contains(c.outcome)) s[3]++;
      if (c.direction == 'incoming') s[4]++;
    }
    for (final e in d.statusUpdates.entries) {
      if (userId != null && e.key != userId) continue;
      if (!_inScope(d, e.key)) continue;
      if (!perUser.containsKey(e.key) && profiles.containsKey(e.key)) perUser[e.key] = [0, 0, 0, 0, 0];
    }
    final callsByEmployee = perUser.entries
        .map((e) => CallsByEmployee(
              userId: e.key,
              name: profiles[e.key]?.name ?? 'Unknown',
              calls: e.value[0],
              totalDurationSeconds: e.value[1],
              connected: e.value[2],
              noAnswer: e.value[3],
              incoming: e.value[4],
              statusUpdates: d.statusUpdates[e.key] ?? 0,
            ))
        .toList()
      ..sort((a, b) => b.calls.compareTo(a.calls));

    // Previous period (same number of days immediately before the range).
    final rs = d.rangeStart;
    final days = d.rangeEnd.difference(rs).inHours ~/ 24 + 1;
    final prevStart = DateTime(rs.year, rs.month, rs.day - days);
    final prevEnd = rs.subtract(const Duration(milliseconds: 1));
    final prevLeads = visible.where((l) => l.createdAt != null && !l.createdAt!.isBefore(prevStart) && !l.createdAt!.isAfter(prevEnd)).toList();
    final prevCustomers = prevLeads.where((l) => l.isWon).toList();
    final prevRevenue = prevCustomers.fold<double>(0, (s, l) => s + l.budgetMax);
    final prevConv = prevLeads.isNotEmpty ? prevCustomers.length / prevLeads.length * 100 : 0.0;
    final fmt = DateFormat('yyyy-MM-dd');
    final previous = PreviousPeriod(
      from: fmt.format(prevStart),
      to: fmt.format(prevEnd),
      leadsChange: _pct(leads.length.toDouble(), prevLeads.length.toDouble()),
      customersChange: _pct(customers.length.toDouble(), prevCustomers.length.toDouble()),
      revenueChange: _pct(totalRevenue, prevRevenue),
      conversionChange: _pct(conversion, prevConv),
    );

    return ReportSummary(
      totalLeads: leads.length,
      totalCustomers: customers.length,
      totalRevenue: totalRevenue,
      conversionRate: conversion,
      leadsByStatus: leadsByStatus,
      leadsBySource: leadsBySource,
      leadsByPropertyType: leadsByProperty,
      followUpsByStatus: followUpsByStatus,
      monthlyLeads: monthly,
      agentPerformance: agentPerformance,
      teamPerformance: teamPerformance,
      teamAgentPerformance: teamAgents,
      leadStageByAgent: leadStageByAgent,
      callsByEmployee: callsByEmployee,
      previousPeriod: previous,
    );
  }

  // ───────────────────────── Agent x Stage matrix ─────────────────────────

  static MatrixOptions matrixOptions(ReportsDataset d) {
    final inRangeLeads = d.leads.where((l) => _inRange(d, l.createdAt)).toList();
    final profiles = _profileMap(d);
    final projects = inRangeLeads.map((l) => l.project).whereType<String>().toSet().toList()..sort();
    final sources = inRangeLeads.map((l) => l.source).whereType<String>().toSet().toList()..sort();
    final leaders = d.teams
        .where((t) => t.leaderId != null)
        .map((t) => (id: t.leaderId!, name: profiles[t.leaderId]?.name ?? 'Unknown', teamName: t.name))
        .toList();
    final agents = d.profiles
        .where((p) => p.isActive && _inScope(d, p.id))
        .map((p) => (id: p.id, name: p.name))
        .toList()
      ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return MatrixOptions(
      projects: projects,
      sources: sources,
      teams: d.teams,
      teamLeaders: leaders,
      agents: agents,
      stages: LeadStages.allStatuses,
    );
  }

  static MatrixResult buildMatrix(ReportsDataset d, MatrixFilters f, {String? userId}) {
    final profiles = _profileMap(d);
    var leads = d.leads.where((l) {
      if (!_inRange(d, l.createdAt)) return false;
      if (d.scope == null) return true;
      return _inScope(d, l.assignedTo) || _inScope(d, l.createdBy);
    }).toList();

    String? teamIdForUser(String? uid) {
      if (uid == null) return null;
      for (final m in d.memberships) {
        if (m.userId == uid) return m.teamId;
      }
      return profiles[uid]?.teamId;
    }

    final agentId = f.agent.isNotEmpty ? f.agent : userId;
    if (agentId != null) leads = leads.where((l) => l.ownedBy(agentId)).toList();
    if (f.team.isNotEmpty) leads = leads.where((l) => teamIdForUser(l.assignedTo) == f.team).toList();
    if (f.teamLeader.isNotEmpty) {
      final teamIds = <String>{
        ...d.teams.where((t) => t.leaderId == f.teamLeader).map((t) => t.id),
        ...d.memberships.where((m) => m.userId == f.teamLeader && m.isLeader).map((m) => m.teamId),
      };
      if (teamIds.isEmpty) {
        leads = [];
      } else {
        final memberIds = <String>{
          ...d.memberships.where((m) => teamIds.contains(m.teamId)).map((m) => m.userId),
          ...d.profiles.where((p) => p.teamId != null && teamIds.contains(p.teamId)).map((p) => p.id),
        };
        leads = leads.where((l) => memberIds.contains(l.assignedTo) || memberIds.contains(l.createdBy)).toList();
      }
    }
    if (f.project.isNotEmpty) leads = leads.where((l) => (l.project ?? '') == f.project).toList();
    if (f.campaign.isNotEmpty) leads = leads.where((l) => (l.source ?? '') == f.campaign || (l.team ?? '') == f.campaign).toList();
    if (f.source.isNotEmpty) leads = leads.where((l) => (l.source ?? '') == f.source).toList();
    if (f.stage.isNotEmpty) leads = leads.where((l) => l.stage == f.stage).toList();

    final stages = f.stage.isNotEmpty ? [f.stage] : (leads.map((l) => l.stage).toSet().toList()..sort(compareStages));

    String nameOf(String? uid) => uid == null ? 'Unassigned' : (profiles[uid]?.name ?? uid);
    final byAgent = <String, Map<String, int>>{};
    final totals = <String, int>{};
    for (final l in leads) {
      final agent = nameOf(l.assignedTo ?? l.createdBy);
      final m = byAgent.putIfAbsent(agent, () => {});
      m[l.stage] = (m[l.stage] ?? 0) + 1;
      totals[agent] = (totals[agent] ?? 0) + 1;
    }
    final rows = byAgent.keys
        .map((a) => MatrixRow(a, stages.map((s) => byAgent[a]?[s] ?? 0).toList(), totals[a] ?? 0))
        .toList()
      ..sort((a, b) => b.total.compareTo(a.total));
    final columnTotals = List<int>.generate(stages.length, (i) => rows.fold<int>(0, (s, r) => s + r.counts[i]));
    return MatrixResult(stages, rows, columnTotals, columnTotals.fold<int>(0, (a, b) => a + b));
  }

  // ───────────────────────── Goals ─────────────────────────

  static String? _bucket(String status) {
    final t = status.toLowerCase().trim();
    if (t.isEmpty) return null;
    if (t.contains('fresh')) return 'newFresh';
    if (t == 'cold calls' || t == 'new cold' || t.contains('cold')) return 'newCold';
    if (t.contains('pending') || t.contains('following')) return 'pending';
    if (t == 'done deal' || t == 'd.deal' || t == 'won' || t.contains('done deal') || t.contains('d.deal')) return 'doneDeal';
    if (t.contains('cancel')) return 'cancel';
    if (t.contains('no answer')) return 'noAnswer';
    if (t == 'calls answer' || t == 'calls answered' || t == 'meeting' || t == 'interested') return 'callsAnswer';
    if (const ['not interested', 'low budget', 'duplicate leads', 'closed number', 'wrong number', 'data rotation'].contains(t)) return 'cancel';
    if (t == 'reservation') return 'doneDeal';
    return 'pending';
  }

  static GoalsSummary buildGoals(ReportsDataset d, {String? userId}) {
    final target = d.targetDeals;
    final byAgent = <String, GoalStages>{};
    final totalCalls = <String, int>{};
    final agents = d.profiles.where((p) {
      if (!p.isActive || p.isOwnerOrAdmin) return false;
      if (userId != null && p.id != userId) return false;
      return _inScope(d, p.id);
    }).toList();
    for (final p in agents) {
      byAgent[p.id] = GoalStages();
      totalCalls[p.id] = 0;
    }

    for (final l in d.leads) {
      if (!_inRange(d, l.createdAt)) continue;
      final assignee = l.assignedTo ?? l.createdBy;
      final st = byAgent[assignee];
      if (st == null) continue;
      switch (_bucket(l.crmStatus ?? l.leadStatus ?? '')) {
        case 'newFresh':
          st.newFresh++;
        case 'newCold':
          st.newCold++;
        case 'pending':
          st.pending++;
        case 'cancel':
          st.cancel++;
        case 'doneDeal':
          st.doneDeal++;
        case 'callsAnswer':
          st.callsAnswer++;
        case 'noAnswer':
          st.noAnswer++;
      }
    }

    for (final c in d.calls) {
      if (!_inRange(d, c.createdAt)) continue;
      final st = byAgent[c.userId];
      if (st == null) continue;
      final valid = c.isValid != false;
      final dur = c.durationSeconds;
      final noAnswerOutcome = (c.outcome ?? '').toLowerCase().contains('no answer');
      if (valid) totalCalls[c.userId!] = (totalCalls[c.userId] ?? 0) + 1;
      if (!valid || noAnswerOutcome || (dur > 0 && dur < 30)) {
        st.noAnswer++;
      } else {
        st.callsAnswer++;
      }
    }

    final out = <AgentGoal>[];
    for (final p in agents) {
      final st = byAgent[p.id]!;
      final calls = totalCalls[p.id] ?? 0;
      final sum = st.newFresh + st.newCold + st.pending + st.callsAnswer + st.noAnswer + st.cancel + st.doneDeal + calls;
      if (sum == 0) continue;
      out.add(AgentGoal(
        agentId: p.id,
        agentName: p.name,
        role: p.role.isEmpty ? 'agent' : p.role.replaceAll('_', ' '),
        avatarUrl: p.avatarUrl,
        stages: st,
        totalCalls: calls,
        targetDeals: target,
        goalProgress: target > 0 ? (st.doneDeal / target * 1000).round() / 10 : 0,
      ));
    }
    out.sort((a, b) {
      final c = b.goalProgress.compareTo(a.goalProgress);
      if (c != 0) return c;
      final c2 = b.stages.doneDeal.compareTo(a.stages.doneDeal);
      return c2 != 0 ? c2 : b.totalCalls.compareTo(a.totalCalls);
    });
    return GoalsSummary(target, out);
  }

  // ───────────────────────── Call classification ─────────────────────────

  /// Same buckets as the web `verifyCall` helper, reduced to the drawer's result pill.
  static CallResult classifyCall({String? channel, String? direction, int durationSeconds = 0, String? outcome}) {
    final dur = durationSeconds < 0 ? 0 : durationSeconds;
    final o = (outcome ?? '').trim();
    if (channel == 'Site Visit' || channel == 'Meeting') return CallResult.other;
    if (direction == 'incoming') return CallResult.incoming;
    if (successOutcomes.contains(o) || dur >= 60) return CallResult.connected;
    if (noAnswerOutcomes.contains(o)) return CallResult.noAnswer;
    if (dur > 0 && dur < 60) return CallResult.other;
    return CallResult.noAnswer;
  }

  static bool isShortCall({String? channel, String? direction, int durationSeconds = 0, String? outcome}) {
    final o = (outcome ?? '').trim();
    if (channel == 'Site Visit' || channel == 'Meeting' || direction == 'incoming') return false;
    if (successOutcomes.contains(o) || durationSeconds >= 60) return false;
    if (noAnswerOutcomes.contains(o)) return false;
    return durationSeconds > 0 && durationSeconds < 60;
  }

  static bool isConnected({String? channel, String? direction, int durationSeconds = 0, String? outcome}) =>
      classifyCall(channel: channel, direction: direction, durationSeconds: durationSeconds, outcome: outcome) == CallResult.connected;
}
