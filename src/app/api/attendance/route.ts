import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

function isSchemaError(msg?: string): boolean {
  if (!msg) return false;
  return /relation .* does not exist|column .* does not exist|syntax error|could not find the table|in the schema cache|does not exist/i.test(
    msg
  );
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A valid ISO timestamp that the database can store, or null when invalid. */
function toISODate(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Validate a YYYY-MM-DD date. */
function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: actor } = await supabase
    .from('user_profiles')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!actor || !isAdminRole(actor.role)) return null;
  return actor;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const actor = await requireAdmin(supabase);
  if (!actor) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get('date') || localToday();

  const [usersRes, attendanceRes, siteVisitsRes] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('id, full_name, email, role, is_active')
      .order('full_name'),
    supabase
      .from('attendance')
      .select('user_id, check_in_time, check_out_time')
      .eq('attendance_date', date),
    supabase
      .from('site_visits')
      .select('user_id, project_name, check_in_at, check_out_at, verified, within_radius')
      .gte('check_in_at', `${date}T00:00:00`)
      .lte('check_in_at', `${date}T23:59:59.999`),
  ]);

  if (usersRes.error) {
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 });
  }

  // The attendance table may not be provisioned yet (migrations not applied) —
  // still show the user list instead of failing the whole panel.
  if (attendanceRes.error) {
    return NextResponse.json({ date, users: usersRes.data || [], attendance: [] });
  }

  return NextResponse.json({
    date,
    users: usersRes.data,
    attendance: attendanceRes.data,
    siteVisits: siteVisitsRes.error ? [] : siteVisitsRes.data,
  });
}

/**
 * POST /api/attendance — ADMIN ONLY.
 *
 * Endpoint shape:
 *   { action: 'checkin'|'checkout'|'edit', userId, date, checkInTime?, checkOutTime?, reason? }
 *
 * - `checkInTime` / `checkOutTime` are the EXACT timestamps the admin selected.
 *   They are validated and stored verbatim — the server NEVER substitutes the
 *   current time for an explicitly provided time.
 * - The current server time is used ONLY when the field is omitted (normal
 *   admin-assisted check-in/out for "now").
 * - `action: 'edit'` replaces both times together.
 * - Every manual mutation writes a row to `audit_log` and `activity_log` for
 *   accountability.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const actor = await requireAdmin(supabase);
  if (!actor) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof body.userId !== 'string' || !body.userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const action = body.action === 'checkout' || body.action === 'edit' ? body.action : 'checkin';
  const attendanceDate = isDate(body.date) ? body.date : localToday();

  // Validate that the target user exists (prevents creating rows for arbitrary ids).
  const { data: targetUser } = await supabase
    .from('user_profiles')
    .select('id, full_name')
    .eq('id', body.userId)
    .maybeSingle();
  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Parse explicit admin-selected timestamps. Reject malformed values instead of
  // silently substituting `new Date()` — the admin-selected time must win.
  const checkInTime = toISODate(body.checkInTime);
  if (body.checkInTime != null && body.checkInTime !== '' && !checkInTime) {
    return NextResponse.json({ error: 'Invalid check-in time format' }, { status: 400 });
  }
  const checkOutTime = toISODate(body.checkOutTime);
  if (body.checkOutTime != null && body.checkOutTime !== '' && !checkOutTime) {
    return NextResponse.json({ error: 'Invalid check-out time format' }, { status: 400 });
  }

  // Reject nonsensical edits (e.g. a check-out time before check-in).
  if (
    checkInTime &&
    checkOutTime &&
    new Date(checkOutTime).getTime() < new Date(checkInTime).getTime()
  ) {
    return NextResponse.json({ error: 'Check-out cannot be before check-in' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : '';

  // Fetch the existing record first (for audit old values + merging edits).
  const { data: existing } = await supabase
    .from('attendance')
    .select('id, check_in_time, check_out_time')
    .eq('user_id', body.userId)
    .eq('attendance_date', attendanceDate)
    .maybeSingle();

  const effectiveCheckIn = checkInTime ?? existing?.check_in_time ?? (action === 'checkout' ? existing?.check_in_time : now);
  const effectiveCheckOut = action === 'checkout' ? (checkOutTime ?? now) : action === 'edit' ? (checkOutTime ?? existing?.check_out_time ?? null) : checkOutTime ?? existing?.check_out_time ?? null;

  if (action === 'checkout' && !existing?.check_in_time) {
    return NextResponse.json(
      { error: 'Cannot check out — no check-in record exists for this employee on this date' },
      { status: 400 }
    );
  }

  let result: { error: any } | null = null;

  if (existing?.id) {
    const { error } = await supabase
      .from('attendance')
      .update({
        check_in_time: effectiveCheckIn,
        check_out_time: effectiveCheckOut,
        marked_by: actor.id,
        updated_at: now,
      })
      .eq('id', existing.id);
    result = { error };
  } else {
    const { error } = await supabase.from('attendance').insert({
      user_id: body.userId,
      attendance_date: attendanceDate,
      check_in_time: effectiveCheckIn,
      check_out_time: effectiveCheckOut,
      marked_by: actor.id,
    });
    result = { error };
  }

  if (result?.error) {
    if (isSchemaError(result.error?.message)) {
      return NextResponse.json(
        { error: 'Attendance is not set up yet — apply the database migrations first' },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  // ── Accountability: record the manual action ─────────────────────────
  const oldCheckIn = existing?.check_in_time || null;
  const oldCheckOut = existing?.check_out_time || null;
  const auditAction = action === 'edit' ? 'edited' : action === 'checkout' ? 'checked_out' : 'checked_in';
  const description = reason
    ? `Manual attendance ${auditAction} for ${targetUser.full_name} on ${attendanceDate} — ${reason}`
    : `Manual attendance ${auditAction} for ${targetUser.full_name} on ${attendanceDate}`;

  const auditPayload = {
    user_id: targetUser.id,
    user_name: targetUser.full_name || '',
    entity_type: 'attendance',
    entity_id: attendanceDate,
    action: auditAction,
    prev_value: { check_in_time: oldCheckIn, check_out_time: oldCheckOut },
    new_value: { check_in_time: effectiveCheckIn, check_out_time: effectiveCheckOut },
    description,
  };

  const [auditRes, activityRes] = await Promise.all([
    supabase.from('audit_log').insert(auditPayload),
    supabase.from('activity_log').insert({
      user_id: targetUser.id,
      action_type: `Attendance ${auditAction === 'edited' ? 'Edited' : auditAction === 'checked_out' ? 'Check-out' : 'Check-in'}`,
      entity_type: 'attendance',
      entity_id: attendanceDate,
      detail: `${targetUser.full_name || ''} — ${description}`,
      meta: 'manual-by-admin',
    }),
  ]);

  // Log failures but never fail the mutation for them (best-effort auditing).
  if (auditRes.error) {
    console.error('[attendance] audit_log write failed', auditRes.error.message);
  }
  if (activityRes.error) {
    console.error('[attendance] activity_log write failed', activityRes.error.message);
  }

  return NextResponse.json({ ok: true, action, attendance_date: attendanceDate });
}