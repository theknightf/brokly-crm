/// Dashboard Summary Metrics mirroring PWA getSummary & kpi-cards
class DashboardSummaryModel {
  final int totalLeads;
  final int freshLeads;
  final int followingUp;
  final int meetings;
  final int interested;
  final int wonDeals;
  final int totalCalls;
  final int todayCalls;
  final double totalPipelineValue;
  final Map<String, int> statusCounts;

  DashboardSummaryModel({
    this.totalLeads = 0,
    this.freshLeads = 0,
    this.followingUp = 0,
    this.meetings = 0,
    this.interested = 0,
    this.wonDeals = 0,
    this.totalCalls = 0,
    this.todayCalls = 0,
    this.totalPipelineValue = 0.0,
    this.statusCounts = const {},
  });
}
