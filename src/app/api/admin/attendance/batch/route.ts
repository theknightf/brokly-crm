import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';
import { loadOfficeHours } from '@/lib/officeHours';
import { cairoISOFromWall, dayOfWeek } from '@/lib/attendanceLogic';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/attendance/batch — ADMIN/OWNER ONLY.
 * Weekly / multi-day batch logger: fills MISSING attendance days in a range.
 *
 * Body: {
 *   userId: string,
 *   startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' (max 62 days),
 *   checkInTime: 'HH:MM' (Cairo wall clock),
 *   checkOutTime?: 'HH:MM',
 *   excludeWeekends?: boolean (default true → skips Fri + Sat),
 *   reason?: string
 * }
 *
 * - Fridays are ALWAYS skipped (company weekly holiday), Saturdays skipped
 *   when excludeWeekends is on. No GPS/geofencing ever applies here.
 * - Days that already have a check-in are left untouched (missing-only).
 * - Delay is auto-computed against the shift window on the Cairo clock.
 */
const MAX_RANGE_DAYS = 62;

function isDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isTime(v: unknown): v is string {
  return typeof v === 'string' && /^(\d{1,2}):(\d{2})$/.test(v.trim());
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: actor } = await supabase
    .from('user_profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!actor || actor.is_active === false || !isAdminRole(actor.role)) {
    return NextResponse.json({ error: 'Forbidden — admin or owner only' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const { userId, startDate, endDate, checkInTime, checkOutTime, reason } = body;
  const excludeWeekends = body.excludeWeekends !== false;

  if (typeof userId !== 'string' || !userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }
  if (!isDate(startDate) || !isDate(endDate)) {
    return NextResponse.json({ error: 'startDate and endDate (YYYY-MM-DD) are required' }, { status: 400 });
  }
  if (endDate < startDate) {
    return NextResponse.json({ error: 'endDate cannot be before startDate' }, { status: 400 });
  }
  if (!isTime(checkInTime)) {
    return NextResponse.json({ error: 'checkInTime (HH:MM) is required' }, { status: 400 });
  }
  if (checkOutTime != null && checkOutTime !== '' && !isTime(checkOutTime)) {
    return NextResponse.json({ error: 'checkOutTime must be HH:MM' }, { status: 400 });
  }

  // Cap the range (abuse guard + keeps the insert loop bounded).
  let rangeDays = 0;
  {
    const a = new Date(`${startDate}T00:00:00`).getTime();
    const b = new Date(`${endDate}T00:00:00`).getTime();
    rangeDays = Math.round((b - a) / 86400000) + 1;
  }
  if (rangeDays > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `Range too large — max ${MAX_RANGE_DAYS} days` }, { status: 400 });
  }

  const { data: target } = await supabase
    .from('user_profiles')
    .select('id, full_name')
    .eq('id', userId)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  const { data: existingRows } = await supabase
    .from('attendance')
    .select('attendance_date, check_in_time')
    .eq('user_id', userId)
    .gte('attendance_date', startDate)
    .lte('attendance_date', endDate);
  const hasCheckIn = new Set(
    (existingRows || []).filter((r: any) => r.check_in_time).map((r: any) => r.attendance_date)
  );

  let office = null as null | Awaited<ReturnType<typeof loadOfficeHours>>;
  try {
    office = await loadOfficeHours(supabase as any);
  } catch {
    office = null;
  }
  const startMin = office && office.startMinutes >= 0 ? office.startMinutes : 9 * 60;
  const tol =
    office?.toleranceMinutes ?? startMin + (office?.graceMinutes ?? 15);

  const [inH, inM] = String(checkInTime).trim().split(':').map(Number);
  const inMins = inH * 60 + inM;
  const delayMinutes = Math.max(0, inMins - tol);
  const isLate = inMins > tol;

  const now = new Date().toISOString();
  const note = typeof reason === 'string' && reason.trim() ? reason.trim() : 'Batch approved';

  const created: string[] = [];
  let skippedExisting = 0;
  let skippedWeekend = 0;

  for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
    const dow = dayOfWeek(d);
    if (dow === 5 || (excludeWeekends && dow === 6)) {
      skippedWeekend += 1;
      continue;
    }
    if (hasCheckIn.has(d)) {
      skippedExisting += 1;
      continue;
    }
    const inISO = cairoISOFromWall(d, String(checkInTime).trim());
    if (!inISO) continue;
    const outISO =
      checkOutTime && String(checkOutTime).trim()
        ? cairoISOFromWall(d, String(checkOutTime).trim())
        : null;
    const { error } = await supabase.from('attendance').upsert(
      {
        user_id: userId,
        attendance_date: d,
        check_in_time: inISO,
        check_out_time: outISO,
        delay_minutes: delayMinutes,
        is_late: isLate,
        source: 'admin',
        marked_by: actor.id,
        updated_at: now,
      },
      { onConflict: 'user_id,attendance_date' }
    );
    if (!error) {
      created.push(d);
      hasCheckIn.add(d);
    }
  }

  // Best-effort audit trail (never fails the batch).
  try {
    await supabase.from('audit_log').insert({
      user_id: userId,
      user_name: (target as any)?.full_name || '',
      entity_type: 'attendance',
      entity_id: `${startDate}..${endDate}`,
      action: 'batch_approved',
      prev_value: {},
      new_value: { created, checkInTime, checkOutTime: checkOutTime || null },
      description: `Batch attendance approved for ${(target as any)?.full_name || userId} (${startDate} → ${endDate}) — ${note}`,
    });
  } catch {}

  return NextResponse.json({
    ok: true,
    created: created.length,
    dates: created,
    skippedExisting,
    skippedWeekend,
    delayMinutes,
    isLate,
  });
}
