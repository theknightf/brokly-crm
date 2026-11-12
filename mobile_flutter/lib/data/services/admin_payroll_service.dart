import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/admin_models.dart';
import 'supabase_service.dart';

/// Payroll data access (tables: payroll_periods, payroll_entries,
/// user_profiles.base_salary). RLS: admin/owner full access.
///
/// NOT ported: "Generate from attendance" (POST /api/payroll/generate). It
/// recomputes every employee from attendance in the Africa/Cairo timezone with
/// Friday-holiday rules; that logic stays web-only so the numbers can never
/// diverge between platforms.
class AdminPayrollService {
  final SupabaseClient _client = SupabaseService().client;

  List<Map<String, dynamic>> _rows(dynamic res) =>
      (res as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();

  Future<List<AdminPayrollPeriod>> getPeriods() async {
    final res = await _client.from('payroll_periods').select('*').order('period_start', ascending: false);
    return _rows(res).map(AdminPayrollPeriod.fromJson).toList();
  }

  Future<void> createPeriod(String start, String end) async {
    await _client.from('payroll_periods').insert({
      'period_start': start,
      'period_end': end,
      'status': 'draft',
      'created_by': _client.auth.currentUser?.id,
    });
  }

  Future<void> finalizePeriod(String id) async {
    await _client.from('payroll_periods').update({'status': 'finalized'}).eq('id', id);
  }

  Future<List<AdminPayrollEntry>> getEntries(String periodId) async {
    final res = await _client
        .from('payroll_entries')
        .select('*, user_name:user_profiles!payroll_entries_user_id_fkey(full_name)')
        .eq('period_id', periodId)
        .order('created_at', ascending: true);
    return _rows(res).map(AdminPayrollEntry.fromJson).toList();
  }

  /// Saves the editable inputs and recomputes gross / deductions / net with the
  /// same formula as lib/payrollMath.ts so totals never go stale.
  Future<void> updateEntry(
    AdminPayrollEntry e,
    AdminPayrollRules rules, {
    required double bonus,
    required double commission,
    required double reimbursement,
    required double otherDeductions,
    required String notes,
    required String status,
  }) async {
    final basis = rules.dailySalaryBasis < 1 ? 1.0 : rules.dailySalaryBasis;
    final daily = e.baseSalary / basis;
    final billableLate = (e.lateMinutes - rules.lateGraceMinutes).clamp(0, double.infinity);
    final lateDeduction = billableLate * rules.deductPerLateMinute;
    final perDay = rules.absenceDeductionPerDay > 0 ? rules.absenceDeductionPerDay : daily;
    final absenceDeduction = e.absenceDays * perDay;
    final overtimePay =
        rules.overtimeEnabled ? (e.overtimeMinutes / 60) * (daily / 8) * (rules.overtimeRate == 0 ? 1 : rules.overtimeRate) : 0;
    final gross = e.baseSalary + bonus + commission + reimbursement + overtimePay;
    final deductions = absenceDeduction + lateDeduction + otherDeductions;
    double r2(num n) => (n * 100).round() / 100;

    await _client.from('payroll_entries').update({
      'bonus': bonus,
      'commission': commission,
      'expense_reimbursement': reimbursement,
      'other_deductions': otherDeductions,
      'notes': notes,
      'status': status,
      'attendance_deduction': r2(absenceDeduction),
      'late_deduction': r2(lateDeduction),
      'absence_deduction': r2(absenceDeduction),
      'overtime_pay': r2(overtimePay),
      'gross': r2(gross),
      'deductions_total': r2(deductions),
      'net': r2(gross - deductions),
    }).eq('id', e.id);
  }

  /// Sets base salary (web: PATCH /api/admin/users/:id/salary; allowed for
  /// admin/owner by the admins_manage_profiles RLS policy).
  Future<void> setBaseSalary(String userId, double salary) async {
    if (salary < 0) throw Exception('A valid base salary is required');
    final res = await _client
        .from('user_profiles')
        .update({'base_salary': salary, 'updated_at': DateTime.now().toUtc().toIso8601String()})
        .eq('id', userId)
        .select('id');
    if ((res as List).isEmpty) throw Exception('Salary update was not permitted');
    try {
      await _client.from('activity_log').insert({
        'user_id': _client.auth.currentUser?.id,
        'action_type': 'Salary Updated',
        'entity_type': 'user',
        'entity_id': userId,
        'detail': 'Admin set base salary',
        'meta': '{"base_salary":$salary,"target_user":"$userId"}',
      });
    } catch (_) {
      // best effort, same as the web route
    }
  }
}
