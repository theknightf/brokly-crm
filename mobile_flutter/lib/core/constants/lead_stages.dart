import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

/// Canonical Sales Pipeline & Outcome Stages synchronized with the Brokly CRM Web Platform
/// (`src/lib/ui.ts` & `src/app/leads-management/components/leadStages.ts`).
class LeadStages {
  LeadStages._();

  static const String allLeads = 'All Leads';

  /// Forward sales pipeline stages in canonical order
  static const List<String> pipelineStages = [
    'Fresh Leads',
    'Cold Calls',
    'Pending Leads',
    'Following Up',
    'Meeting',
    'Interested',
    'Reservation',
    'Done Deal',
  ];

  /// Negative / follow-up / terminal outcome stages in canonical order
  static const List<String> outcomeStages = [
    'No Answer',
    'No Answer At All',
    'Reschedule Meeting',
    'Not Interested',
    'Cancellation',
    'Low Budget',
    'Wrong Number',
    'Closed Number',
    'Data Rotation',
    'Duplicate Leads',
  ];

  /// Complete list of all 18 canonical statuses used across the web platform and backend
  static const List<String> allStatuses = [
    ...pipelineStages,
    ...outcomeStages,
  ];

  /// Complete filter list including 'All Leads'
  static const List<String> allFilterOptions = [
    allLeads,
    ...allStatuses,
  ];

  /// Normalize legacy or shorthand status values to their canonical stage name
  static String normalize(String? rawStatus) {
    final s = (rawStatus ?? '').trim();
    if (s.isEmpty) return 'Fresh Leads';
    if (allStatuses.contains(s)) return s;

    switch (s.toLowerCase()) {
      case 'new':
      case 'fresh':
      case 'fresh lead':
      case 'fresh leads':
        return 'Fresh Leads';
      case 'contacted':
      case 'cold call':
      case 'cold calls':
        return 'Cold Calls';
      case 'pending':
      case 'pending lead':
      case 'pending leads':
        return 'Pending Leads';
      case 'follow up':
      case 'following up':
      case 'follow-up':
        return 'Following Up';
      case 'meeting':
      case 'meeting scheduled':
      case 'site visit':
      case 'site visit scheduled':
        return 'Meeting';
      case 'qualified':
      case 'interested':
      case 'hot':
        return 'Interested';
      case 'reservation':
      case 'reserved':
      case 'proposal':
        return 'Reservation';
      case 'won':
      case 'closed':
      case 'closed/won':
      case 'done deal':
        return 'Done Deal';
      case 'lost':
      case 'not interested':
        return 'Not Interested';
      case 'cancelled':
      case 'canceled':
      case 'cancellation':
        return 'Cancellation';
      case 'no answer':
        return 'No Answer';
      case 'no answer at all':
        return 'No Answer At All';
      case 'reschedule':
      case 'reschedule meeting':
        return 'Reschedule Meeting';
      case 'wrong number':
        return 'Wrong Number';
      case 'closed number':
        return 'Closed Number';
      case 'low budget':
        return 'Low Budget';
      case 'data rotation':
        return 'Data Rotation';
      case 'duplicate':
      case 'duplicate leads':
        return 'Duplicate Leads';
      default:
        return s;
    }
  }

  /// Descriptive category label matching standard CRM stage terminology
  static String categoryLabel(String stage) {
    switch (normalize(stage)) {
      case 'Fresh Leads':
        return 'New • Uncontacted';
      case 'Cold Calls':
        return 'Contacted • Initial Outreach';
      case 'Pending Leads':
        return 'Contacted • Awaiting Review';
      case 'Following Up':
        return 'Active Follow-Up';
      case 'Meeting':
        return 'Meeting Scheduled';
      case 'Interested':
        return 'Qualified • High Intent';
      case 'Reservation':
        return 'Unit Reserved';
      case 'Done Deal':
        return 'Closed / Won';
      case 'No Answer':
      case 'No Answer At All':
        return 'Unreachable • Retry';
      case 'Reschedule Meeting':
        return 'Meeting Rescheduled';
      case 'Not Interested':
      case 'Cancellation':
      case 'Low Budget':
      case 'Wrong Number':
      case 'Closed Number':
        return 'Lost / Closed Outcome';
      case 'Data Rotation':
        return 'Reassigned Pool';
      case 'Duplicate Leads':
        return 'Merged / Duplicate';
      default:
        return 'Pipeline Stage';
    }
  }

  /// Stage icon matching web STATUS_ICONS
  static IconData iconFor(String stage) {
    switch (normalize(stage)) {
      case 'Fresh Leads':
        return LucideIcons.sparkles;
      case 'Cold Calls':
        return LucideIcons.phoneOutgoing;
      case 'Pending Leads':
        return LucideIcons.hourglass;
      case 'Following Up':
        return LucideIcons.refreshCw;
      case 'Meeting':
        return LucideIcons.calendarCheck;
      case 'Interested':
        return LucideIcons.star;
      case 'Reservation':
        return LucideIcons.bookmarkCheck;
      case 'Done Deal':
        return LucideIcons.trophy;
      case 'No Answer':
      case 'No Answer At All':
        return LucideIcons.phoneMissed;
      case 'Reschedule Meeting':
        return LucideIcons.calendarClock;
      case 'Not Interested':
        return LucideIcons.userX;
      case 'Cancellation':
        return LucideIcons.ban;
      case 'Low Budget':
        return LucideIcons.wallet;
      case 'Wrong Number':
      case 'Closed Number':
        return LucideIcons.phoneOff;
      case 'Data Rotation':
        return LucideIcons.repeat;
      case 'Duplicate Leads':
        return LucideIcons.copy;
      default:
        return LucideIcons.layers;
    }
  }

  /// Next forward pipeline stage (if in pipeline)
  static String? nextPipelineStage(String? status) {
    final norm = normalize(status);
    final idx = pipelineStages.indexOf(norm);
    if (idx >= 0 && idx < pipelineStages.length - 1) {
      return pipelineStages[idx + 1];
    }
    return null;
  }

  /// Previous forward pipeline stage (if in pipeline)
  static String? prevPipelineStage(String? status) {
    final norm = normalize(status);
    final idx = pipelineStages.indexOf(norm);
    if (idx > 0) {
      return pipelineStages[idx - 1];
    }
    return null;
  }
}
