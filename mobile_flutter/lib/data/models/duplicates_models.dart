import 'package:intl/intl.dart';

/// Mirrors web `normalizePhone` (src/lib/phone.ts) and SQL `normalize_phone`.
String normalizePhone(Object? raw) {
  var d = (raw?.toString() ?? '').replaceAll(RegExp(r'\D'), '');
  if (d.isEmpty) return '';
  if (d.startsWith('0020') && d.length > 4) {
    d = d.substring(4);
  } else if (d.startsWith('20') && d.length >= 12) {
    d = d.substring(2);
  }
  if (d.startsWith('0')) d = d.substring(1);
  return d;
}

/// Role string normalised like web `normalizeRole`.
String normalizeRoleKey(String? role) =>
    (role ?? '').trim().toLowerCase().replaceAll(RegExp(r'[\s-]+'), '_');

bool isAdminRoleKey(String? role) {
  final r = normalizeRoleKey(role);
  return r == 'owner' || r == 'admin' || r == 'owner_admin' || r == 'owneradmin';
}

/// Same set as the SQL helper is_duplicate_reviewer(): owner / admin / manager.
bool isDuplicateReviewerRole(String? role) {
  final r = normalizeRoleKey(role);
  return isAdminRoleKey(r) || r == 'manager';
}

String fmtDateTime(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final d = DateTime.tryParse(iso);
  if (d == null) return '—';
  return DateFormat('dd MMM yyyy, HH:mm').format(d.toLocal());
}

class DuplicateField {
  final String key;
  final String label;
  const DuplicateField(this.key, this.label);
}

const List<DuplicateField> kDuplicateFields = [
  DuplicateField('name', 'Name'),
  DuplicateField('phone', 'Phone'),
  DuplicateField('email', 'Email'),
  DuplicateField('source', 'Source'),
  DuplicateField('project', 'Project'),
  DuplicateField('developer', 'Developer'),
  DuplicateField('location', 'Location'),
  DuplicateField('property_type', 'Property type'),
  DuplicateField('unit', 'Unit'),
  DuplicateField('budget_min', 'Budget min'),
  DuplicateField('budget_max', 'Budget max'),
];

bool _isBlank(Object? v) {
  if (v == null) return true;
  final s = v.toString().trim();
  return s.isEmpty || s == '0';
}

String duplicateDisplayValue(String key, Object? v) {
  if (_isBlank(v)) return '';
  if (key == 'budget_min' || key == 'budget_max') {
    final n = num.tryParse(v.toString());
    return n == null ? v.toString() : '${NumberFormat.decimalPattern().format(n)} EGP';
  }
  return v.toString().trim();
}

/// True when the submission carries a value that differs from the existing lead.
bool duplicateFieldDiffers(String key, Map<String, dynamic>? existing, Map<String, dynamic> submitted) {
  final next = submitted[key];
  if (_isBlank(next)) return false;
  final cur = existing?[key];
  if (_isBlank(cur)) return true;
  if (key == 'phone') return normalizePhone(cur) != normalizePhone(next);
  if (key == 'budget_min' || key == 'budget_max') {
    return num.tryParse(cur.toString()) != num.tryParse(next.toString());
  }
  return cur.toString().trim().toLowerCase() != next.toString().trim().toLowerCase();
}

List<String> differingDuplicateFields(Map<String, dynamic>? existing, Map<String, dynamic> submitted) =>
    kDuplicateFields.where((f) => duplicateFieldDiffers(f.key, existing, submitted)).map((f) => f.key).toList();

class DuplicatePerson {
  final String id;
  final String name;
  final String role;
  const DuplicatePerson({required this.id, required this.name, required this.role});

  factory DuplicatePerson.fromProfile(Map<String, dynamic> p) {
    final n = p['full_name']?.toString().trim() ?? '';
    return DuplicatePerson(
      id: p['id']?.toString() ?? '',
      name: n.isEmpty ? 'User' : n,
      role: p['role']?.toString() ?? '',
    );
  }
}

class DuplicateActionCounts {
  final int calls;
  final int meetings;
  final int notes;
  final int statusChanges;
  const DuplicateActionCounts({this.calls = 0, this.meetings = 0, this.notes = 0, this.statusChanges = 0});

  String get label => '$calls calls · $meetings meetings · $notes notes · $statusChanges status changes';
}

class DuplicateLeadRef {
  final String id;
  final String? createdAt;
  final String? stage;
  final String? source;
  final DuplicatePerson? assignedTo;
  const DuplicateLeadRef({required this.id, this.createdAt, this.stage, this.source, this.assignedTo});
}

/// One row of public.duplicate_leads enriched like web GET /api/duplicates.
class DuplicateItem {
  final String id;
  final String status; // pending | merged | dismissed | separated
  final String source; // attempt | existing
  final DuplicateLeadRef? duplicateLead;
  final DuplicateActionCounts originalActions;
  final DuplicateActionCounts? duplicateActions;
  final String? createdAt;
  final String? lastAttemptAt;
  final int attemptCount;
  final String matchType; // phone | email
  final String? resolvedAt;
  final DuplicatePerson? resolvedBy;
  final DuplicatePerson? attemptedBy;
  final DuplicatePerson? originalAddedBy;
  final DuplicatePerson? firstOwner;
  final DuplicatePerson? currentOwner;
  final Map<String, dynamic>? existing;
  final Map<String, dynamic> submitted;

  const DuplicateItem({
    required this.id,
    required this.status,
    required this.source,
    required this.duplicateLead,
    required this.originalActions,
    required this.duplicateActions,
    required this.createdAt,
    required this.lastAttemptAt,
    required this.attemptCount,
    required this.matchType,
    required this.resolvedAt,
    required this.resolvedBy,
    required this.attemptedBy,
    required this.originalAddedBy,
    required this.firstOwner,
    required this.currentOwner,
    required this.existing,
    required this.submitted,
  });

  bool get isPending => status == 'pending';

  String get title {
    final n = (existing?['name'] ?? submitted['name'])?.toString().trim() ?? '';
    return n.isEmpty ? 'Lead' : n;
  }
}

// ── Duplicate Center (admin hub, web /duplicate-leads) ──────────────────────

class HubLead {
  final String id;
  final String name;
  final String ingested;
  final String repName;
  final String repRole;
  final String? assignedToId;
  final String createdByName;
  final String source;
  final String stage;
  final String budget;
  final String project;
  final String notes;
  const HubLead({
    required this.id,
    required this.name,
    required this.ingested,
    required this.repName,
    required this.repRole,
    required this.assignedToId,
    required this.createdByName,
    required this.source,
    required this.stage,
    required this.budget,
    required this.project,
    required this.notes,
  });
}

class HubCase {
  final String id;
  final String groupId;
  final String matchType;
  final String name;
  final String phone;
  final String email;
  final String territory;
  final bool conflict;
  final String disputeAgents;
  final String submittedBy;
  final String submittedByRole;
  final String routedAt;
  final DateTime? routedAtDate;
  final HubLead lead1;
  final HubLead lead2;
  const HubCase({
    required this.id,
    required this.groupId,
    required this.matchType,
    required this.name,
    required this.phone,
    required this.email,
    required this.territory,
    required this.conflict,
    required this.disputeAgents,
    required this.submittedBy,
    required this.submittedByRole,
    required this.routedAt,
    required this.routedAtDate,
    required this.lead1,
    required this.lead2,
  });
}

class HubAuditLog {
  final String id;
  final String actionType;
  final String detail;
  final String actorName;
  final String createdAt;
  const HubAuditLog({
    required this.id,
    required this.actionType,
    required this.detail,
    required this.actorName,
    required this.createdAt,
  });
}

class HubData {
  final List<HubCase> cases;
  final List<DuplicatePerson> agents;
  final List<HubAuditLog> logs;
  final int clean;
  final int conflicts;
  const HubData({
    required this.cases,
    required this.agents,
    required this.logs,
    required this.clean,
    required this.conflicts,
  });
}
