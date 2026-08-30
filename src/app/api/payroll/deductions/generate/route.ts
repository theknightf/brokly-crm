import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payroll/deductions/generate
 * Body: { monthYear: "2026-08", dryRun?: boolean }
 * Calculates deductions for:
 *  - Attendance tardiness (delay_minutes * rate)
 *  - Dress code non-compliance (avg <3 or passRate <60%)
 *  - Low KPI (<60 total)
 * Inserts into payroll_deductions → trigger dispatches notification instantly.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: actor } = await supabase.from('user_profiles').select('role, is_active').eq('id', user.id).maybeSingle();
    if (!actor || !isAdminRole(actor.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const monthYear = String(body.monthYear || new Date().toISOString().slice(0, 7)); // YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(monthYear)) return NextResponse.json({ error: 'monthYear must be YYYY-MM' }, { status: 400 });
    const dryRun = !!body.dryRun;

    const [y, m] = monthYear.split('-').map(Number);
    const from = `${monthYear}-01`;
    const toDate = new Date(y, m, 0);
    const to = `${monthYear}-${String(toDate.getDate()).padStart(2, '0')}`;
    const daysInMonth = toDate.getDate();

    const db: any = supabase;
    const { data: users } = await db.from('user_profiles').select('id, full_name, email, base_salary').eq('is_active', true);
    const { data: settings } = await db.from('company_settings').select('value').eq('key', 'payrollRules').maybeSingle();
    const rules = settings?.value || { deductPerLateMinute: 5, absenceDeductionPerDay: 100, dressThreshold: 3, dressPenalty: 200, kpiThreshold: 60, kpiPenalty: 300 };
    const deductPerLateMinute = Number(rules.deductPerLateMinute ?? 5);
    const dressPenalty = Number(rules.dressPenalty ?? 200);
    const kpiPenalty = Number(rules.kpiPenalty ?? 300);

    // Fetch leaderboard scores for KPI check
    const leaderboardRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ? '' : ''}`, { method: 'GET' }).catch(() => null);
    // Instead compute directly via evaluations/attendance/calls to avoid circular fetch
    const { data: attendance } = await db.from('attendance').select('user_id, delay_minutes, is_late').gte('attendance_date', from).lte('attendance_date', to);
    const { data: evals } = await db.from('evaluations').select('employee_id, dress_code_rating').gte('date', from).lte('date', to);
    const { data: calls } = await db.from('call_logs').select('user_id, duration_seconds, is_valid').gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59.999`);

    const attByUser = new Map<string, any[]>();
    (attendance || []).forEach((a: any) => { if (!attByUser.has(a.user_id)) attByUser.set(a.user_id, []); attByUser.get(a.user_id)!.push(a); });
    const evalByUser = new Map<string, any[]>();
    (evals || []).forEach((e: any) => { if (!evalByUser.has(e.employee_id)) evalByUser.set(e.employee_id, []); evalByUser.get(e.employee_id)!.push(e); });
    const callsByUser = new Map<string, any[]>();
    (calls || []).forEach((c: any) => { if (!callsByUser.has(c.user_id)) callsByUser.set(c.user_id, []); callsByUser.get(c.user_id)!.push(c); });

    const deductions: any[] = [];

    for (const u of (users || [])) {
      const uid = u.id;
      const att = attByUser.get(uid) || [];
      const lateMinutes = att.reduce((s: number, a: any) => s + (Number(a.delay_minutes) || 0), 0);
      const evalsUser = evalByUser.get(uid) || [];
      const avgDress = evalsUser.length ? evalsUser.reduce((s: number, e: any) => s + e.dress_code_rating, 0) / evalsUser.length : null;
      const userCalls = callsByUser.get(uid) || [];
      const validCalls = userCalls.filter((c: any) => c.is_valid !== false).length;
      // Simple KPI proxy: attendance rate + valid calls + dress
      const presentDays = att.length;
      const attendanceRate = presentDays / Math.max(1, daysInMonth) * 100;
      const callRate = Math.min(100, (validCalls / 20) * 100);
      const dressRate = avgDress != null ? (avgDress / 5) * 100 : 0;
      const kpiTotal = Math.round(callRate * 0.40 + attendanceRate * 0.30 + dressRate * 0.30);

      if (lateMinutes > 0 && deductPerLateMinute > 0) {
        const amount = Math.round(lateMinutes * deductPerLateMinute);
        deductions.push({
          user_id: uid,
          source_ref: 'attendance_tardiness',
          reason: `Late Check-in by ${lateMinutes} mins in ${monthYear}`,
          amount,
          month_year: monthYear,
          is_applied: true,
        });
      }
      if (avgDress !== null && avgDress < (rules.dressThreshold ?? 3)) {
        deductions.push({
          user_id: uid,
          source_ref: 'dress_code',
          reason: `Dress code score below threshold (avg ${avgDress.toFixed(1)}/5) in ${monthYear}`,
          amount: dressPenalty,
          month_year: monthYear,
          is_applied: true,
        });
      }
      if (kpiTotal < (rules.kpiThreshold ?? 60)) {
        deductions.push({
          user_id: uid,
          source_ref: 'low_kpi',
          reason: `Low Monthly KPI aggregate ${kpiTotal}% (<60%) in ${monthYear}`,
          amount: kpiPenalty,
          month_year: monthYear,
          is_applied: true,
        });
      }
    }

    if (dryRun) {
      return NextResponse.json({ monthYear, deductions, count: deductions.length, dryRun: true });
    }

    if (deductions.length === 0) return NextResponse.json({ monthYear, inserted: 0, deductions: [] });

    const { data, error } = await db.from('payroll_deductions').insert(deductions).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Trigger will have created notifications; fetch them for response
    const { data: notifs } = await db.from('notifications').select('id, user_id, title, amount, reason').in('deduction_id', (data || []).map((d: any) => d.id)).limit(100);

    return NextResponse.json({ monthYear, inserted: (data || []).length, deductions: data, notifications: notifs || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Unknown' }, { status: 500 });
  }
}
