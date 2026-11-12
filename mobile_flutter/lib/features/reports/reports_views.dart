import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/currency_formatter.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/reports_models.dart';
import 'reports_controller.dart';
import 'widgets/reports_widgets.dart';

Color _stageColor(BuildContext context, String stage) => AppColors.getStatusColors(stage, isDark: Surf.dark(context)).text;

Widget _emptyNote(BuildContext context, String text) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 22),
      child: Center(child: Text(text, textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: Surf.subtext(context)))),
    );

List<DonutSlice> _slices(Map<String, int> data, {int top = 7}) {
  final entries = data.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
  final out = <DonutSlice>[];
  var other = 0;
  for (var i = 0; i < entries.length; i++) {
    if (i < top) {
      out.add(DonutSlice(entries[i].key, entries[i].value, kChartColors[i % kChartColors.length]));
    } else {
      other += entries[i].value;
    }
  }
  if (other > 0) out.add(DonutSlice('Other', other, const Color(0xFF94A3B8)));
  return out;
}

// ───────────────────────── My performance ─────────────────────────

class OverviewReportView extends StatelessWidget {
  final ReportSummary summary;
  final bool showDelta;
  const OverviewReportView({super.key, required this.summary, required this.showDelta});

  @override
  Widget build(BuildContext context) {
    final prev = showDelta ? summary.previousPeriod : null;
    final m = summary.monthlyLeads;
    return Column(children: [
      TwoUp(children: [
        KpiCard(label: 'Total Leads', value: fmtInt(summary.totalLeads), icon: LucideIcons.users, color: const Color(0xFF3B82F6), delta: prev?.leadsChange),
        KpiCard(label: 'Total Customers', value: fmtInt(summary.totalCustomers), icon: LucideIcons.userCheck, color: const Color(0xFF22C55E), delta: prev?.customersChange),
        KpiCard(label: 'Total Revenue', value: CurrencyFormatter.formatCompact(summary.totalRevenue), icon: LucideIcons.dollarSign, color: const Color(0xFF8B5CF6), delta: prev?.revenueChange),
        KpiCard(label: 'Conversion Rate', value: '${fmtDec(summary.conversionRate)}%', icon: LucideIcons.target, color: AppColors.amber, delta: prev?.conversionChange),
      ]),
      if (prev != null)
        Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 4),
          child: Text('Compared with ${prev.from} → ${prev.to}', style: TextStyle(fontSize: 11.5, color: Surf.subtext(context))),
        ),
      const SizedBox(height: 12),
      ReportCard(
        title: 'Monthly Leads vs Won',
        subtitle: 'Last 6 months',
        child: m.every((p) => p.leads == 0 && p.won == 0)
            ? _emptyNote(context, 'No data available yet')
            : MiniLineChart(
                labels: m.map((p) => p.month).toList(),
                series: [
                  LineSeries('Leads', m.map((p) => p.leads).toList(), const Color(0xFF3B82F6)),
                  LineSeries('Won', m.map((p) => p.won).toList(), Surf.dark(context) ? AppColors.neonLime : AppColors.primaryHover),
                ],
              ),
      ),
    ]);
  }
}

// ───────────────────────── Leads & follow-ups ─────────────────────────

class LeadsReportView extends StatelessWidget {
  final ReportSummary summary;
  final OpenLeadsCallback? onOpenLeads;
  const LeadsReportView({super.key, required this.summary, this.onOpenLeads});

  @override
  Widget build(BuildContext context) {
    // Group "stage x salesperson" rows by salesperson.
    final byAgent = <String, List<StageByAgent>>{};
    for (final r in summary.leadStageByAgent) {
      byAgent.putIfAbsent(r.agent, () => []).add(r);
    }
    final agents = byAgent.entries.toList()
      ..sort((a, b) => b.value.fold<int>(0, (s, e) => s + e.count).compareTo(a.value.fold<int>(0, (s, e) => s + e.count)));

    final status = summary.leadsByStatus.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final totalStatus = status.fold<int>(0, (s, e) => s + e.value);
    final property = summary.leadsByPropertyType.entries.toList()..sort((a, b) => b.value.compareTo(a.value));

    return Column(children: [
      ReportCard(
        title: 'Leads by Stage and Salesperson',
        subtitle: 'How many leads each salesperson has at every stage.',
        child: agents.isEmpty
            ? _emptyNote(context, 'No lead stage data available.')
            : Column(children: [
                for (var i = 0; i < agents.length; i++)
                  Container(
                    margin: EdgeInsets.only(bottom: i == agents.length - 1 ? 0 : 10),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(14)),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        InitialsAvatar(agents[i].key, size: 30),
                        const SizedBox(width: 10),
                        Expanded(child: Text(agents[i].key, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Surf.text(context)))),
                        Text(fmtInt(agents[i].value.fold<int>(0, (s, e) => s + e.count)),
                            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Surf.accent(context), fontFeatures: kTabular)),
                      ]),
                      const SizedBox(height: 8),
                      Wrap(spacing: 6, runSpacing: 2, children: [
                        for (final r in agents[i].value)
                          CountChip(
                            label: r.stage,
                            count: r.count,
                            color: _stageColor(context, r.stage),
                            onTap: onOpenLeads == null ? null : () => onOpenLeads!(agentName: r.agent == 'Unassigned' ? null : r.agent, stage: r.stage),
                          ),
                      ]),
                    ]),
                  ),
              ]),
      ),
      ReportCard(
        title: 'Lead Status & Stage',
        subtitle: 'Aggregated overview of all leads by current stage',
        trailing: StatusPill('$totalStatus total', color: Surf.accent(context)),
        child: status.isEmpty
            ? _emptyNote(context, 'No lead status data available')
            : HBarList(
                items: status,
                showShare: true,
                onTap: onOpenLeads == null ? null : (stage) => onOpenLeads!(stage: stage),
              ),
      ),
      ReportCard(
        title: 'Leads by Source',
        child: summary.leadsBySource.isEmpty ? _emptyNote(context, 'No data available yet') : DonutWithLegend(slices: _slices(summary.leadsBySource)),
      ),
      ReportCard(
        title: 'Leads by Property Type',
        child: property.isEmpty ? _emptyNote(context, 'No data available yet') : HBarList(items: property, showShare: true),
      ),
      ReportCard(
        title: 'Follow-ups by Status',
        child: summary.followUpsByStatus.isEmpty ? _emptyNote(context, 'No data available yet') : DonutWithLegend(slices: _slices(summary.followUpsByStatus)),
      ),
    ]);
  }
}

// ───────────────────────── Sales & revenue ─────────────────────────

class SalesReportView extends StatelessWidget {
  final ReportSummary summary;
  const SalesReportView({super.key, required this.summary});

  @override
  Widget build(BuildContext context) {
    final avg = summary.totalCustomers > 0 ? summary.totalRevenue / summary.totalCustomers : 0.0;
    final teams = summary.teamPerformance.toList()..sort((a, b) => b.totalRevenue.compareTo(a.totalRevenue));
    return Column(children: [
      TwoUp(children: [
        KpiCard(label: 'Total Revenue', value: CurrencyFormatter.formatCompact(summary.totalRevenue), icon: LucideIcons.dollarSign, color: const Color(0xFF8B5CF6)),
        KpiCard(label: 'Won Deals', value: fmtInt(summary.totalCustomers), icon: LucideIcons.userCheck, color: const Color(0xFF22C55E)),
        KpiCard(label: 'Avg Deal Value', value: summary.totalCustomers > 0 ? CurrencyFormatter.formatCompact(avg) : '—', icon: LucideIcons.target, color: const Color(0xFF3B82F6)),
      ]),
      const SizedBox(height: 12),
      ReportCard(
        title: 'Revenue by Team',
        subtitle: 'Total revenue and closed deals per team',
        child: teams.isEmpty
            ? _emptyNote(context, 'No data available yet')
            : HBarList(
                items: [for (final t in teams) MapEntry('${t.name} · ${t.closedDeals} deals', t.totalRevenue)],
                valueFormat: (v) => CurrencyFormatter.formatCompact(v),
              ),
      ),
    ]);
  }
}

// ───────────────────────── Team performance ─────────────────────────

class TeamReportView extends StatefulWidget {
  final ReportSummary summary;
  final OpenLeadsCallback? onOpenLeads;
  const TeamReportView({super.key, required this.summary, this.onOpenLeads});

  @override
  State<TeamReportView> createState() => _TeamReportViewState();
}

class _TeamReportViewState extends State<TeamReportView> {
  String _teamId = 'all';

  @override
  Widget build(BuildContext context) {
    final s = widget.summary;
    final rows = _teamId == 'all' ? s.teamAgentPerformance : s.teamAgentPerformance.where((r) => r.teamId == _teamId).toList();
    var tl = 0, tp = 0, tn = 0, tc = 0;
    for (final r in rows) {
      tl += r.totalLeads;
      tp += r.pending;
      tn += r.fresh;
      tc += r.calls;
    }

    final byAgent = <String, Map<String, int>>{};
    for (final r in s.leadStageByAgent) {
      final m = byAgent.putIfAbsent(r.agent, () => {});
      m[r.stage] = (m[r.stage] ?? 0) + r.count;
    }
    final stageTotals = <String, int>{};
    for (final r in rows) {
      byAgent[r.name]?.forEach((stage, c) => stageTotals[stage] = (stageTotals[stage] ?? 0) + c);
    }
    final totalStages = stageTotals.entries.toList()..sort((a, b) => b.value.compareTo(a.value));

    final teamChips = <String>['all', ...s.teamPerformance.map((t) => t.id)];
    String teamLabel(String id) => id == 'all' ? 'All Teams' : (s.teamPerformance.firstWhere((t) => t.id == id).name);
    final accent = Surf.accent(context);

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      ReportCard(
        title: 'Leads trend',
        subtitle: 'Last 6 months',
        trailing: Icon(LucideIcons.chartColumn, size: 18, color: accent),
        child: s.monthlyLeads.every((p) => p.leads == 0)
            ? _emptyNote(context, 'No data available yet')
            : MiniBarChart(points: [for (final p in s.monthlyLeads) BarPoint(p.month, p.leads)]),
      ),
      ReportCard(
        title: 'Total leads',
        child: Center(child: DonutChart(slices: [DonutSlice('Leads', tl, accent)], centerValue: fmtInt(tl), centerLabel: 'leads')),
      ),
      TwoUp(children: [
        KpiCard(label: 'Total Leads', value: fmtInt(tl), icon: LucideIcons.users, color: const Color(0xFF3B82F6)),
        KpiCard(label: 'Pending', value: fmtInt(tp), icon: LucideIcons.userCheck, color: AppColors.amber),
        KpiCard(label: 'New', value: fmtInt(tn), icon: LucideIcons.gitBranch, color: accent),
        KpiCard(label: 'Calls', value: fmtInt(tc), icon: LucideIcons.phone, color: AppColors.tealCyan),
      ]),
      const SizedBox(height: 12),
      if (teamChips.length > 2)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: InlineChips<String>(options: teamChips, selected: _teamId, labelOf: teamLabel, onSelected: (v) => setState(() => _teamId = v)),
        ),
      const SectionHeader(title: 'Team performance', subtitle: 'Every agent, one clean view'),
      const SizedBox(height: 8),
      if (rows.isEmpty)
        ReportCard(child: _emptyNote(context, 'No team members found.'))
      else ...[
        for (final r in rows)
          PremiumCard(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                InitialsAvatar(r.name, size: 34),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(r.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Surf.text(context))),
                    Text(r.teamName, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: Surf.subtext(context))),
                  ]),
                ),
              ]),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: MiniStat(label: 'Total', value: fmtInt(r.totalLeads))),
                Expanded(child: MiniStat(label: 'Pending', value: fmtInt(r.pending), color: AppColors.amber)),
                Expanded(child: MiniStat(label: 'New', value: fmtInt(r.fresh), color: accent)),
                Expanded(child: MiniStat(label: 'Calls', value: fmtInt(r.calls), color: Surf.subtext(context))),
              ]),
              if ((byAgent[r.name] ?? const {}).isNotEmpty) ...[
                const SizedBox(height: 10),
                Wrap(spacing: 6, runSpacing: 2, children: [
                  for (final e in (byAgent[r.name]!.entries.toList()..sort((a, b) => b.value.compareTo(a.value))))
                    CountChip(
                      label: e.key,
                      count: e.value,
                      color: _stageColor(context, e.key),
                      onTap: widget.onOpenLeads == null ? null : () => widget.onOpenLeads!(agentName: r.name, stage: e.key),
                    ),
                ]),
              ],
            ]),
          ),
        PremiumCard(
          tint: accent.withAlpha(Surf.dark(context) ? 28 : 22),
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Totals', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Surf.text(context))),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: MiniStat(label: 'Total', value: fmtInt(tl))),
              Expanded(child: MiniStat(label: 'Pending', value: fmtInt(tp), color: AppColors.amber)),
              Expanded(child: MiniStat(label: 'New', value: fmtInt(tn), color: accent)),
              Expanded(child: MiniStat(label: 'Calls', value: fmtInt(tc), color: Surf.subtext(context))),
            ]),
            if (totalStages.isNotEmpty) ...[
              const SizedBox(height: 10),
              Wrap(spacing: 6, runSpacing: 2, children: [
                for (final e in totalStages)
                  CountChip(
                    label: e.key,
                    count: e.value,
                    color: _stageColor(context, e.key),
                    onTap: widget.onOpenLeads == null ? null : () => widget.onOpenLeads!(stage: e.key),
                  ),
              ]),
            ],
          ]),
        ),
      ],
    ]);
  }
}

// ───────────────────────── Attendance ─────────────────────────

class AttendanceReportView extends StatelessWidget {
  final ReportsController controller;
  const AttendanceReportView({super.key, required this.controller});

  static String _hm(int total) {
    final c = total < 0 ? 0 : total;
    return '${((c ~/ 60) % 24).toString().padLeft(2, '0')}:${(c % 60).toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final c = controller;
    if (!c.isAdmin) {
      return const EmptyState(icon: LucideIcons.lock, title: 'Owners and admins only', message: 'Attendance reports are available to owners and admins.');
    }
    final rep = c.attendance;
    final rows = (rep?.rows ?? const <AttendanceRow>[]).where((r) => c.userId == null || r.id == c.userId).toList();
    final office = rep?.office;
    return Column(children: [
      ReportCard(
        title: 'Attendance Report',
        subtitle: office == null ? 'Per-user office attendance for the selected period' : 'Office hours ${office.start} – ${office.end} · Arriving after ${_hm(office.toleranceMinutes)} = Late',
        child: AsyncBody(
          loading: c.attendanceLoading && rep == null,
          error: rep == null ? c.attendanceError : null,
          empty: rows.isEmpty,
          emptyTitle: 'No attendance data',
          emptyMessage: 'Nothing recorded for this period.',
          onRetry: c.loadAttendance,
          skeletonCount: 3,
          builder: (_) => Column(children: [
            for (final r in rows)
              Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(14)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    InitialsAvatar(r.name, size: 34),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(r.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Surf.text(context))),
                        Text(r.role.replaceAll('_', ' '), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: Surf.subtext(context))),
                      ]),
                    ),
                    r.late > 0
                        ? StatusPill('${r.late} late${r.late > 1 ? 's' : ''}', color: AppColors.amber, icon: LucideIcons.triangleAlert)
                        : const StatusPill('On track', color: AppColors.accent, icon: LucideIcons.check),
                  ]),
                  const SizedBox(height: 12),
                  Row(children: [
                    Expanded(child: MiniStat(label: 'Present', value: fmtInt(r.present))),
                    Expanded(child: MiniStat(label: 'On time', value: fmtInt(r.onTime), color: AppColors.accent)),
                    Expanded(child: MiniStat(label: 'Late', value: fmtInt(r.late), color: AppColors.amber)),
                    Expanded(child: MiniStat(label: 'Absent', value: fmtInt(r.absent), color: Surf.subtext(context))),
                  ]),
                ]),
              ),
          ]),
        ),
      ),
    ]);
  }
}
