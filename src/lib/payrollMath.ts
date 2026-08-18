// Pure payroll math — server-safe (no 'use client', no Supabase client).
// Shared by the server-side /api/payroll/generate route and the client
// (re-exported through peopleOpsService). Kept here so server code never
// imports functions from a 'use client' module.

export interface PayrollRules {
  dailySalaryBasis: number; // denominator for daily rate (e.g. 26)
  lateGraceMinutes: number;
  deductPerLateMinute: number; // EGP per minute after grace
  absenceDeductionPerDay: number; // 0 => fall back to daily rate
  overtimeEnabled: boolean;
  overtimeRate: number;
  commissionRate: number; // 0..1
  commissionBasis: 'deal_value' | 'net';
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Pure payroll calculation (unit-testable). Rule configuration is never
 * hard-coded: every deduction is driven by `rules`.
 */
export function computePayrollEntry(
  input: {
    baseSalary: number;
    totalWorkingDays: number;
    attendanceDays: number;
    lateMinutes: number;
    lateDays: number;
    absenceDays: number;
    leaveDays: number;
    overtimeMinutes: number;
    bonus: number;
    commission: number;
    expenseReimbursement: number;
    otherDeductions: number;
  },
  rules: PayrollRules
) {
  const baseSalary = Number(input.baseSalary) || 0;
  const basis = Math.max(1, rules.dailySalaryBasis || 26);
  const dailyRate = baseSalary / basis;
  const grace = rules.lateGraceMinutes || 0;

  const billableLate = Math.max(0, (Number(input.lateMinutes) || 0) - grace);
  const lateDeduction = billableLate * (rules.deductPerLateMinute || 0);

  const absenceDeductionPerDay =
    Number(rules.absenceDeductionPerDay) > 0 ? Number(rules.absenceDeductionPerDay) : dailyRate;
  const absenceDeduction = (Number(input.absenceDays) || 0) * absenceDeductionPerDay;

  const attendanceDeduction = absenceDeduction;

  const workHours = 8;
  const hourlyRate = dailyRate / workHours;
  const overtimePay = rules.overtimeEnabled
    ? ((Number(input.overtimeMinutes) || 0) / 60) * hourlyRate * (rules.overtimeRate || 1)
    : 0;

  const gross =
    baseSalary +
    (Number(input.bonus) || 0) +
    (Number(input.commission) || 0) +
    (Number(input.expenseReimbursement) || 0) +
    overtimePay;

  const deductionsTotal = attendanceDeduction + lateDeduction + (Number(input.otherDeductions) || 0);
  const net = gross - deductionsTotal;

  return {
    totalWorkingDays: input.totalWorkingDays,
    attendanceDays: input.attendanceDays,
    lateMinutes: input.lateMinutes,
    lateDays: input.lateDays,
    absenceDays: input.absenceDays,
    leaveDays: input.leaveDays,
    overtimeMinutes: input.overtimeMinutes,
    baseSalary,
    bonus: input.bonus,
    commission: input.commission,
    expenseReimbursement: input.expenseReimbursement,
    otherDeductions: input.otherDeductions,
    attendanceDeduction: round2(attendanceDeduction),
    lateDeduction: round2(lateDeduction),
    absenceDeduction: round2(absenceDeduction),
    overtimePay: round2(overtimePay),
    gross: round2(gross),
    deductionsTotal: round2(deductionsTotal),
    net: round2(net),
  };
}