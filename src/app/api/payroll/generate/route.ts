import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';
import { computePayrollEntry, round2 } from '@/lib/payrollMath';
import { isFridayHoliday } from '@/lib/attendanceLogic';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payroll/generate { periodId } — builds payroll entries for a draft
// period from REAL system data: attendance, approved leave, configured working
// hours + flexible mode + payroll rules, base salary and (when configured)
// commission on Won deals. All money rules come from company_settings, never
// hard-coded. Existing manual bonuses/commissions/notes are preserved.
// ─────────────────────────────────────────────────────────────────────────────

const TZ = 'Africa/Cairo';

function minutesOf(hhmm: string): number {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export async function POST(request: Request) {
  const db = await createClient();
  const auth = await requireAdmin(db);
  if (!auth.ok) return auth.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const periodId = body?.periodId;
  if (!periodId) return NextResponse.json({ error: 'periodId is required' }, { status: 400 });

  try {
    const { data: period, error: periodError } = await db
      .from('payroll_periods')
      .select('*')
      .eq('id', periodId)
      .maybeSingle();
    if (periodError) throw periodError;
    if (!period) return NextResponse.json({ error: 'Period not found' }, { status: 404 });

    const start = period.period_start as string;
    const end = period.period_end as string;

    // ── Config ──
    const { data: whRow } = await db.from('company_settings').select('value').eq('key', 'workingHours').maybeSingle();
    const wh = whRow?.value || {};
    const workingStart = wh.start || '12:00';
    const workingEnd = wh.end || '20:00';
    const flexibleHours = !!wh.flexibleHours;
    const grace = Number(wh.lateGraceMinutes ?? 30);
    // Friday (5) is a company weekly holiday — excluded from working days even
    // if a legacy saved config still lists it.
    const workdaysSet = new Set<number>((wh.workdays ?? [0, 1, 2, 3, 4, 6]).map(Number));

    const { data: rulesRow } = await db.from('company_settings').select('value').eq('key', 'payrollRules').maybeSingle();
    const rules = rulesRow?.value || {};

    // ── Working-day list inside the period (Fridays always excluded) ──
    const workdayDates: string[] = [];
    const cursor = new Date(start + 'T00:00:00');
    const endDate = new Date(end + 'T00:00:00');
    while (cursor <= endDate) {
      const dow = cursor.getDay();
      const iso = cursor.toISOString().slice(0, 10);
      if (workdaysSet.has(dow) && !isFridayHoliday(iso)) {
        workdayDates.push(iso);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    const totalWorkingDays = workdayDates.length;

    // ── Employees (active, non-admin gets a payroll line) ──
    const { data: employees } = await db
      .from('user_profiles')
      .select('id, full_name, base_salary, employment_status')
      .eq('is_active', true);
    const activeEmployees = (employees || []).filter((u: any) => u.employment_status !== 'inactive');

    // ── Attendance rows in range ──
    const { data: attendance } = await db
      .from('attendance')
      .select('user_id, attendance_date, check_in_time, check_out_time')
      .gte('attendance_date', start)
      .lte('attendance_date', end);

    // ── Approved leave in range ──
    const { data: leaves } = await db
      .from('leave_requests')
      .select('user_id, start_date, end_date')
      .eq('status', 'approved')
      .lte('start_date', end)
      .gte('end_date', start);

    // ── Commission: Won deals per user in range (only when a rate is set) ──
    const commissionRate = Number(rules.commissionRate ?? 0);
    const wonRes = commissionRate > 0
      ? await db
          .from('leads')
          .select('assigned_to, budget_min')
          .in('lead_status', ['Done Deal', 'Won'])
          .gte('updated_at', start + 'T00:00:00')
          .lte('updated_at', end + 'T23:59:59')
      : null;
    const { data: wonLeads } = wonRes ?? { data: [] };

    // ── Existing entries (preserve manual amounts) ──
    const { data: existingRows } = await db.from('payroll_entries').select('*').eq('period_id', periodId);
    const existing = new Map<string, any>((existingRows || []).map((r: any) => [r.user_id, r]));

    const perUserAttendance = new Map<string, any[]>();
    for (const a of attendance || []) {
      const list = perUserAttendance.get(a.user_id) || [];
      list.push(a);
      perUserAttendance.set(a.user_id, list);
    }

    const entries = [];
    for (const emp of activeEmployees) {
      const prior = existing.get(emp.id);
      const baseSalary = Number(prior?.base_salary ?? emp.base_salary ?? 0);
      const bonus = Number(prior?.bonus ?? 0);
      const otherDeductions = Number(prior?.other_deductions ?? 0);
      const notes = prior?.notes || '';

      // Attendance aggregation (Friday holiday check-ins don't cover workdays)
      const rows = perUserAttendance.get(emp.id) || [];
      const daySet = new Set<string>(
        rows.map((r: any) => r.attendance_date).filter((d: string) => !isFridayHoliday(d))
      );
      const attendanceDays = daySet.size;
      let lateMinutes = 0;
      let lateDays = 0;
      let overtimeMinutes = 0;

      for (const r of rows) {
        // Holiday work never counts as late — but still earns overtime below.
        const isHolidayWork = isFridayHoliday(r.attendance_date);
        const inLocal = r.check_in_time
          ? new Date(r.check_in_time).toLocaleString('en-US', { timeZone: TZ })
          : null;
        if (!inLocal) continue;
        const d = new Date(inLocal);
        const inMin = d.getHours() * 60 + d.getMinutes();
        const startMin = minutesOf(workingStart);
        const endMin = minutesOf(workingEnd);

        if (!isHolidayWork && flexibleHours) {
          // Flexible: late only if the actual worked duration is below required.
          const outLocal = r.check_out_time
            ? new Date(r.check_out_time).toLocaleString('en-US', { timeZone: TZ })
            : null;
          const required = Math.max(0, endMin - startMin);
          const outMin = outLocal ? new Date(outLocal).getHours() * 60 + new Date(outLocal).getMinutes() : inMin;
          const worked = Math.max(0, outMin - inMin);
          const deficit = Math.max(0, required - worked);
          const l = Math.max(0, deficit - grace);
          if (l > 0) {
            lateDays += 1;
            lateMinutes += l;
          }
        } else if (!isHolidayWork) {
          const l = Math.max(0, inMin - (startMin + grace));
          if (l > 0) {
            lateDays += 1;
            lateMinutes += l;
          }
        }

        if (Number(rules.overtimeEnabled ?? 0)) {
          if (r.check_out_time) {
            const outLocal = new Date(
              new Date(r.check_out_time).toLocaleString('en-US', { timeZone: TZ })
            );
            const outMin = outLocal.getHours() * 60 + outLocal.getMinutes();
            const endMin = minutesOf(workingEnd);
            if (outMin > endMin) overtimeMinutes += outMin - endMin;
          }
        }
      }

      // Leave overlap (approved)
      let leaveDays = 0;
      for (const lv of leaves || []) {
        if (lv.user_id !== emp.id) continue;
        const a = Math.max(new Date(start).getTime(), new Date(lv.start_date).getTime());
        const b = Math.min(new Date(end).getTime(), new Date(lv.end_date).getTime());
        if (b >= a) {
          const dStart = new Date(a);
          while (dStart.getTime() <= b) {
            const iso = `${dStart.getFullYear()}-${String(dStart.getMonth() + 1).padStart(2, '0')}-${String(dStart.getDate()).padStart(2, '0')}`;
            if (workdaysSet.has(dStart.getDay()) && !isFridayHoliday(iso)) leaveDays += 1;
            dStart.setDate(dStart.getDate() + 1);
          }
        }
      }

      // Absence = working days not covered by attendance or approved leave
      const absenceDays = Math.max(0, round2(totalWorkingDays - attendanceDays - leaveDays));

      // Commission (config-driven, best effort)
      let commission = Number(prior?.commission ?? 0);
      if (commissionRate > 0 && commission === 0) {
        const won = (wonLeads || []).filter((l: any) => l.assigned_to === emp.id);
        commission = round2(won.reduce((s: number, l: any) => s + Number(l.budget_min || 0), 0) * commissionRate);
      }

      const expenseReimbursement = Number(prior?.expense_reimbursement ?? 0);
      const overtimeMinutesTotal = Number(prior?.overtime_minutes ?? overtimeMinutes);

      const computed = computePayrollEntry(
        {
          baseSalary,
          totalWorkingDays,
          attendanceDays,
          lateMinutes,
          lateDays,
          absenceDays,
          leaveDays,
          overtimeMinutes: overtimeMinutesTotal,
          bonus,
          commission,
          expenseReimbursement,
          otherDeductions,
        },
        {
          dailySalaryBasis: Number(rules.dailySalaryBasis ?? 26),
          lateGraceMinutes: grace,
          deductPerLateMinute: Number(rules.deductPerLateMinute ?? 0),
          absenceDeductionPerDay: Number(rules.absenceDeductionPerDay ?? 0),
          overtimeEnabled: !!rules.overtimeEnabled,
          overtimeRate: Number(rules.overtimeRate ?? 1.5),
          commissionRate,
          commissionBasis: rules.commissionBasis || 'deal_value',
        }
      );

      const row = {
        period_id: periodId,
        user_id: emp.id,
        total_working_days: computed.totalWorkingDays,
        attendance_days: computed.attendanceDays,
        late_days: computed.lateDays,
        late_minutes: computed.lateMinutes,
        absence_days: computed.absenceDays,
        leave_days: computed.leaveDays,
        overtime_minutes: computed.overtimeMinutes,
        base_salary: computed.baseSalary,
        bonus: computed.bonus,
        commission: computed.commission,
        expense_reimbursement: computed.expenseReimbursement,
        other_deductions: computed.otherDeductions,
        attendance_deduction: computed.attendanceDeduction,
        late_deduction: computed.lateDeduction,
        absence_deduction: computed.absenceDeduction,
        overtime_pay: computed.overtimePay,
        gross: computed.gross,
        deductions_total: computed.deductionsTotal,
        net: computed.net,
        status: prior?.status || 'draft',
        notes,
      };

      entries.push(row);
    }

    if (entries.length) {
      const { error } = await db.from('payroll_entries').upsert(entries, { onConflict: 'period_id,user_id' });
      if (error) throw error;
    }

    return NextResponse.json({ generated: entries.length, totalWorkingDays });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to generate payroll' }, { status: 500 });
  }
}
