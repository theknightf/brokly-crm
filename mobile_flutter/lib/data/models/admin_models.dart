// Models for the Admin console (users, settings lists, leave, KPI targets,
// tasks, payroll, rotation log, claim conflicts, evaluations, 360 profile).

double admNum(dynamic v) {
  if (v is num) return v.toDouble();
  return double.tryParse(v?.toString() ?? '') ?? 0;
}

String admEmbeddedName(dynamic v) {
  if (v is Map) return v['full_name']?.toString() ?? '';
  if (v is List && v.isNotEmpty && v.first is Map) {
    return (v.first as Map)['full_name']?.toString() ?? '';
  }
  return '';
}

String? admStr(dynamic v) {
  final s = v?.toString();
  return (s == null || s.isEmpty || s == 'null') ? null : s;
}

class AdminUser {
  final String id;
  final String fullName;
  final String email;
  final String phone;
  final String role;
  final bool isActive;
  final String? teamId;
  final String agentCode;
  final String? adminId;
  final String adminName;
  final double baseSalary;
  final String? hireDate;
  final String employmentStatus;
  final String createdAt;

  const AdminUser({
    required this.id,
    required this.fullName,
    required this.email,
    this.phone = '',
    this.role = 'agent',
    this.isActive = true,
    this.teamId,
    this.agentCode = '',
    this.adminId,
    this.adminName = '',
    this.baseSalary = 0,
    this.hireDate,
    this.employmentStatus = 'active',
    this.createdAt = '',
  });

  String get displayName => fullName.isNotEmpty ? fullName : email;

  factory AdminUser.fromJson(Map<String, dynamic> j) {
    final created = j['created_at']?.toString() ?? '';
    return AdminUser(
      id: j['id']?.toString() ?? '',
      fullName: j['full_name'] is String ? j['full_name'] as String : '',
      email: j['email']?.toString() ?? '',
      phone: j['phone']?.toString() ?? '',
      role: j['role']?.toString() ?? 'agent',
      isActive: j['is_active'] != false,
      teamId: admStr(j['team_id']),
      agentCode: j['agent_code']?.toString() ?? '',
      adminId: admStr(j['admin_id']),
      adminName: admEmbeddedName(j['admin']),
      baseSalary: admNum(j['base_salary']),
      hireDate: admStr(j['hire_date']),
      employmentStatus: j['employment_status']?.toString() ?? 'active',
      createdAt: created.length >= 10 ? created.substring(0, 10) : created,
    );
  }
}

/// A row of admin_settings (lead sources, stages, areas, priorities, email
/// templates, rotation config) or developers.
class AdminSettingItem {
  final String id;
  final String name;
  final String? color;
  final int order;
  final bool active;

  const AdminSettingItem({
    required this.id,
    required this.name,
    this.color,
    this.order = 0,
    this.active = true,
  });

  factory AdminSettingItem.fromSettings(Map<String, dynamic> j) => AdminSettingItem(
        id: j['id']?.toString() ?? '',
        name: j['name']?.toString() ?? '',
        color: admStr(j['color']),
        order: admNum(j['sort_order']).round(),
        active: j['is_active'] != false,
      );

  factory AdminSettingItem.fromDeveloper(Map<String, dynamic> j) => AdminSettingItem(
        id: j['id']?.toString() ?? '',
        name: j['name']?.toString() ?? '',
        active: j['is_active'] != false,
      );
}

class AdminLeave {
  final String id;
  final String userId;
  final String userName;
  final String leaveType;
  final String startDate;
  final String endDate;
  final double days;
  final String status;
  final String reason;

  const AdminLeave({
    required this.id,
    required this.userId,
    required this.userName,
    required this.leaveType,
    required this.startDate,
    required this.endDate,
    required this.days,
    required this.status,
    required this.reason,
  });

  factory AdminLeave.fromJson(Map<String, dynamic> j) => AdminLeave(
        id: j['id']?.toString() ?? '',
        userId: j['user_id']?.toString() ?? '',
        userName: admEmbeddedName(j['user_name']),
        leaveType: j['leave_type']?.toString() ?? 'annual',
        startDate: j['start_date']?.toString() ?? '',
        endDate: j['end_date']?.toString() ?? '',
        days: admNum(j['days']),
        status: j['status']?.toString() ?? 'pending',
        reason: j['reason']?.toString() ?? '',
      );
}

class AdminKpiTarget {
  final String id;
  final String metric;
  final String label;
  final double targetValue;
  final String periodType;
  final String targetRole;
  final bool isActive;

  const AdminKpiTarget({
    required this.id,
    required this.metric,
    required this.label,
    required this.targetValue,
    required this.periodType,
    required this.targetRole,
    required this.isActive,
  });

  factory AdminKpiTarget.fromJson(Map<String, dynamic> j) => AdminKpiTarget(
        id: j['id']?.toString() ?? '',
        metric: j['metric']?.toString() ?? '',
        label: j['label']?.toString() ?? '',
        targetValue: admNum(j['target_value']),
        periodType: j['period_type']?.toString() ?? 'day',
        targetRole: j['target_role']?.toString() ?? 'all',
        isActive: j['is_active'] != false,
      );
}

class AdminTask {
  final String id;
  final String title;
  final String description;
  final String targetRole;
  final String? dueDate;
  final String priority;
  final String? createdAt;

  const AdminTask({
    required this.id,
    required this.title,
    required this.description,
    required this.targetRole,
    this.dueDate,
    required this.priority,
    this.createdAt,
  });

  factory AdminTask.fromJson(Map<String, dynamic> j) => AdminTask(
        id: j['id']?.toString() ?? '',
        title: j['title']?.toString() ?? '',
        description: j['description']?.toString() ?? '',
        targetRole: j['target_role']?.toString() ?? 'all',
        dueDate: admStr(j['due_date']),
        priority: j['priority']?.toString() ?? 'Medium',
        createdAt: admStr(j['created_at']),
      );
}

class AdminPayrollPeriod {
  final String id;
  final String start;
  final String end;
  final String status;

  const AdminPayrollPeriod({required this.id, required this.start, required this.end, required this.status});

  bool get finalized => status == 'finalized';

  factory AdminPayrollPeriod.fromJson(Map<String, dynamic> j) => AdminPayrollPeriod(
        id: j['id']?.toString() ?? '',
        start: j['period_start']?.toString() ?? '',
        end: j['period_end']?.toString() ?? '',
        status: j['status']?.toString() ?? 'draft',
      );
}

class AdminPayrollEntry {
  final String id;
  final String userId;
  final String userName;
  final double workingDays;
  final double attendanceDays;
  final double lateDays;
  final double lateMinutes;
  final double absenceDays;
  final double leaveDays;
  final double overtimeMinutes;
  final double baseSalary;
  final double bonus;
  final double commission;
  final double reimbursement;
  final double otherDeductions;
  final double gross;
  final double deductionsTotal;
  final double net;
  final String status;
  final String notes;

  const AdminPayrollEntry({
    required this.id,
    required this.userId,
    required this.userName,
    this.workingDays = 0,
    this.attendanceDays = 0,
    this.lateDays = 0,
    this.lateMinutes = 0,
    this.absenceDays = 0,
    this.leaveDays = 0,
    this.overtimeMinutes = 0,
    this.baseSalary = 0,
    this.bonus = 0,
    this.commission = 0,
    this.reimbursement = 0,
    this.otherDeductions = 0,
    this.gross = 0,
    this.deductionsTotal = 0,
    this.net = 0,
    this.status = 'draft',
    this.notes = '',
  });

  factory AdminPayrollEntry.fromJson(Map<String, dynamic> j) => AdminPayrollEntry(
        id: j['id']?.toString() ?? '',
        userId: j['user_id']?.toString() ?? '',
        userName: admEmbeddedName(j['user_name']),
        workingDays: admNum(j['total_working_days']),
        attendanceDays: admNum(j['attendance_days']),
        lateDays: admNum(j['late_days']),
        lateMinutes: admNum(j['late_minutes']),
        absenceDays: admNum(j['absence_days']),
        leaveDays: admNum(j['leave_days']),
        overtimeMinutes: admNum(j['overtime_minutes']),
        baseSalary: admNum(j['base_salary']),
        bonus: admNum(j['bonus']),
        commission: admNum(j['commission']),
        reimbursement: admNum(j['expense_reimbursement']),
        otherDeductions: admNum(j['other_deductions']),
        gross: admNum(j['gross']),
        deductionsTotal: admNum(j['deductions_total']),
        net: admNum(j['net']),
        status: j['status']?.toString() ?? 'draft',
        notes: j['notes']?.toString() ?? '',
      );
}

class AdminDeduction {
  final String id;
  final String userId;
  final String userName;
  final String sourceRef;
  final String reason;
  final double amount;
  final String monthYear;
  final bool isApplied;

  const AdminDeduction({
    required this.id,
    required this.userId,
    this.userName = '',
    required this.sourceRef,
    required this.reason,
    required this.amount,
    required this.monthYear,
    required this.isApplied,
  });

  factory AdminDeduction.fromJson(Map<String, dynamic> j) => AdminDeduction(
        id: j['id']?.toString() ?? '',
        userId: j['user_id']?.toString() ?? '',
        userName: admEmbeddedName(j['user_name']),
        sourceRef: j['source_ref']?.toString() ?? '',
        reason: j['reason']?.toString() ?? '',
        amount: admNum(j['amount']),
        monthYear: j['month_year']?.toString() ?? '',
        isApplied: j['is_applied'] == true,
      );
}

/// Working hours stored in company_settings.workingHours.
class AdminWorkingHours {
  String start;
  String end;
  bool flexibleHours;
  int lateGraceMinutes;
  List<int> workdays; // 0=Sun ... 6=Sat

  AdminWorkingHours({
    this.start = '12:00',
    this.end = '20:00',
    this.flexibleHours = false,
    this.lateGraceMinutes = 20,
    List<int>? workdays,
  }) : workdays = workdays ?? [0, 1, 2, 3, 4, 6];

  factory AdminWorkingHours.fromJson(Map<String, dynamic>? j) {
    final d = AdminWorkingHours();
    if (j == null) return d;
    return AdminWorkingHours(
      start: j['start']?.toString() ?? d.start,
      end: j['end']?.toString() ?? d.end,
      flexibleHours: j['flexibleHours'] == true,
      lateGraceMinutes: j['lateGraceMinutes'] == null ? d.lateGraceMinutes : admNum(j['lateGraceMinutes']).round(),
      workdays: j['workdays'] is List ? (j['workdays'] as List).map((e) => admNum(e).round()).toList() : d.workdays,
    );
  }

  Map<String, dynamic> toJson() => {
        'start': start,
        'end': end,
        'flexibleHours': flexibleHours,
        'lateGraceMinutes': lateGraceMinutes,
        'workdays': workdays,
      };
}

/// Payroll rules stored in company_settings.payrollRules.
class AdminPayrollRules {
  double dailySalaryBasis;
  double lateGraceMinutes;
  double deductPerLateMinute;
  double absenceDeductionPerDay;
  bool overtimeEnabled;
  double overtimeRate;
  double commissionRate;
  String commissionBasis;

  AdminPayrollRules({
    this.dailySalaryBasis = 26,
    this.lateGraceMinutes = 20,
    this.deductPerLateMinute = 0,
    this.absenceDeductionPerDay = 0,
    this.overtimeEnabled = false,
    this.overtimeRate = 1.5,
    this.commissionRate = 0,
    this.commissionBasis = 'deal_value',
  });

  factory AdminPayrollRules.fromJson(Map<String, dynamic>? j) {
    final d = AdminPayrollRules();
    if (j == null) return d;
    double pick(String k, double def) => j[k] == null ? def : admNum(j[k]);
    return AdminPayrollRules(
      dailySalaryBasis: pick('dailySalaryBasis', d.dailySalaryBasis),
      lateGraceMinutes: pick('lateGraceMinutes', d.lateGraceMinutes),
      deductPerLateMinute: pick('deductPerLateMinute', d.deductPerLateMinute),
      absenceDeductionPerDay: pick('absenceDeductionPerDay', d.absenceDeductionPerDay),
      overtimeEnabled: j['overtimeEnabled'] == true || j['overtimeEnabled'] == 1,
      overtimeRate: pick('overtimeRate', d.overtimeRate),
      commissionRate: pick('commissionRate', d.commissionRate),
      commissionBasis: j['commissionBasis']?.toString() ?? d.commissionBasis,
    );
  }

  Map<String, dynamic> toJson() => {
        'dailySalaryBasis': dailySalaryBasis,
        'lateGraceMinutes': lateGraceMinutes,
        'deductPerLateMinute': deductPerLateMinute,
        'absenceDeductionPerDay': absenceDeductionPerDay,
        'overtimeEnabled': overtimeEnabled,
        'overtimeRate': overtimeRate,
        'commissionRate': commissionRate,
        'commissionBasis': commissionBasis,
      };
}

class AdminRotationLog {
  final String id;
  final String leadName;
  final String fromName;
  final String toName;
  final String reason;
  final String detail;
  final String rotatedAt;

  const AdminRotationLog({
    required this.id,
    required this.leadName,
    required this.fromName,
    required this.toName,
    required this.reason,
    required this.detail,
    required this.rotatedAt,
  });

  factory AdminRotationLog.fromJson(Map<String, dynamic> j) => AdminRotationLog(
        id: j['id']?.toString() ?? '',
        leadName: j['lead'] is Map ? (j['lead']['name']?.toString() ?? '') : '',
        fromName: admEmbeddedName(j['from_user']),
        toName: admEmbeddedName(j['to_user']),
        reason: j['reason']?.toString() ?? '',
        detail: j['detail']?.toString() ?? '',
        rotatedAt: j['rotated_at']?.toString() ?? '',
      );
}

class AdminClaimConflict {
  final String id;
  final String createdAt;
  final String? leadId;
  final String leadName;
  final String leadPhone;
  final String holderName;
  final String requesterName;
  final String action;
  final String status;

  const AdminClaimConflict({
    required this.id,
    required this.createdAt,
    this.leadId,
    this.leadName = '',
    this.leadPhone = '',
    this.holderName = '',
    this.requesterName = '',
    this.action = 'claim',
    this.status = 'REJECTED',
  });

  factory AdminClaimConflict.fromJson(Map<String, dynamic> j) => AdminClaimConflict(
        id: j['id']?.toString() ?? '',
        createdAt: j['created_at']?.toString() ?? '',
        leadId: admStr(j['lead_id']),
        leadName: j['lead_name']?.toString() ?? '',
        leadPhone: j['lead_phone']?.toString() ?? '',
        holderName: j['holder_name']?.toString() ?? '',
        requesterName: j['requester_name']?.toString() ?? '',
        action: j['attempted_action']?.toString() ?? 'claim',
        status: j['status']?.toString() ?? 'REJECTED',
      );
}

class AdminEvaluation {
  final String id;
  final String employeeId;
  final String date;
  final int rating;
  final String notes;
  final List<String> flags;
  final String evaluatorName;

  const AdminEvaluation({
    required this.id,
    required this.employeeId,
    required this.date,
    required this.rating,
    this.notes = '',
    this.flags = const [],
    this.evaluatorName = '',
  });

  factory AdminEvaluation.fromJson(Map<String, dynamic> j) => AdminEvaluation(
        id: j['id']?.toString() ?? '',
        employeeId: j['employee_id']?.toString() ?? '',
        date: j['date']?.toString() ?? '',
        rating: admNum(j['dress_code_rating']).round(),
        notes: j['notes']?.toString() ?? '',
        flags: j['behavioral_flags'] is List ? (j['behavioral_flags'] as List).map((e) => e.toString()).toList() : const [],
        evaluatorName: admEmbeddedName(j['evaluator']),
      );
}

class AdminScores {
  final int call;
  final int attendance;
  final int dress;
  final int total;
  const AdminScores({this.call = 0, this.attendance = 0, this.dress = 0, this.total = 0});

  String get grade {
    if (total >= 90) return 'Excellent';
    if (total >= 75) return 'Good';
    if (total >= 60) return 'Average';
    if (total >= 40) return 'Needs Improvement';
    return 'Critical';
  }
}

class AdminLeaderboardRow {
  final String userId;
  final String name;
  final String role;
  final int rank;
  final AdminScores scores;
  final int totalCalls;
  final int presentDays;
  final int totalDays;
  final double? avgDress;

  const AdminLeaderboardRow({
    required this.userId,
    required this.name,
    required this.role,
    required this.rank,
    required this.scores,
    required this.totalCalls,
    required this.presentDays,
    required this.totalDays,
    this.avgDress,
  });
}

class AdminLeaderboard {
  final String start;
  final String end;
  final List<AdminLeaderboardRow> rows;
  const AdminLeaderboard({required this.start, required this.end, required this.rows});
}

class AdminTimelineItem {
  final String at;
  final String type;
  final String label;
  final String detail;
  const AdminTimelineItem({required this.at, required this.type, required this.label, this.detail = ''});
}

/// Everything the Employee 360 screen shows (port of /api/employees/:id/profile-360
/// + /api/owner/employee-360 enrichment + the admin employee report lists).
class AdminEmployee360 {
  final AdminUser employee;
  final String from;
  final String to;
  final AdminScores scores;
  final int daysWorked;
  final int totalDays;
  final int lateDays;
  final int workSeconds;
  final int activeSeconds;
  final int totalCalls;
  final int converted;
  final int evaluationsCount;
  final double? avgDress;
  final int dressPassRate;
  final int actions;
  final int overdueFollowUps;
  final List<Map<String, dynamic>> attendance;
  final List<Map<String, dynamic>> calls;
  final List<AdminEvaluation> evaluations;
  final List<Map<String, dynamic>> leads;
  final List<Map<String, dynamic>> followUps;
  final List<Map<String, dynamic>> visits;
  final List<Map<String, dynamic>> expenses;
  final List<AdminTimelineItem> timeline;
  final List<AdminDeduction> deductions;
  final List<Map<String, dynamic>> notifications;
  final double baseSalary;
  final double totalDeductions;
  final bool canSeePayroll;

  const AdminEmployee360({
    required this.employee,
    required this.from,
    required this.to,
    required this.scores,
    required this.daysWorked,
    required this.totalDays,
    required this.lateDays,
    required this.workSeconds,
    required this.activeSeconds,
    required this.totalCalls,
    required this.converted,
    required this.evaluationsCount,
    required this.avgDress,
    required this.dressPassRate,
    required this.actions,
    required this.overdueFollowUps,
    required this.attendance,
    required this.calls,
    required this.evaluations,
    required this.leads,
    required this.followUps,
    required this.visits,
    required this.expenses,
    required this.timeline,
    required this.deductions,
    required this.notifications,
    required this.baseSalary,
    required this.totalDeductions,
    required this.canSeePayroll,
  });

  double get netPayout => (baseSalary - totalDeductions).clamp(0, double.infinity).toDouble();
}
