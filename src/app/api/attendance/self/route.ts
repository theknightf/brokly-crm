import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { loadOfficeHours } from '@/lib/officeHours';

export const dynamic = 'force-dynamic';

function isSchemaError(msg?: string): boolean {
  if (!msg) return false;
  return /relation .* does not exist|column .* does not exist|syntax error|could not find the table|in the schema cache|does not exist/i.test(
    msg
  );
}

function localToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface WorkLocation {
  lat: number;
  lng: number;
  radiusM: number;
  label?: string;
}

const DEFAULT_WORK_LOCATION: WorkLocation = {
  lat: 30.0444,
  lng: 31.2357,
  radiusM: 800,
  label: 'Company office (default)',
};

/**
 * Reads the configured work location (center + allowed radius) used to
 * enforce the attendance GPS radius check. Priority:
 *   1. admin_settings (category 'workLocation')
 *   2. built-in default (Cairo office, 800 m)
 * Gracefully falls back to the default if the settings table doesn't exist yet
 * or no entry is found, so a missing migration never breaks attendance.
 */
async function getWorkLocation(supabase: any): Promise<WorkLocation> {
  try {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('color')
      .eq('category', 'workLocation')
      .eq('name', 'default')
      .single();
    if (error || !data?.color) {
      if (error && isSchemaError(error?.message)) return DEFAULT_WORK_LOCATION;
      return DEFAULT_WORK_LOCATION;
    }
    try {
      const parsed = JSON.parse(data.color);
      const lat = parseFloat(parsed.lat);
      const lng = parseFloat(parsed.lng);
      const radiusM = parseFloat(parsed.radius_m ?? parsed.radiusM) || DEFAULT_WORK_LOCATION.radiusM;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng, radiusM, label: parsed.label || 'Work location' };
      }
    } catch {
      // malformed JSON color — fall through to default
    }
    return DEFAULT_WORK_LOCATION;
  } catch {
    return DEFAULT_WORK_LOCATION;
  }
}

/** Haversine distance in meters between two lat/lng points. */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Rejects a GPS check-in/out that falls outside the configured work radius. */
async function enforceRadius(
  supabase: any,
  lat: number | null,
  lng: number | null
): Promise<{ ok: true } | { ok: false; status: number; error: string; distanceM?: number; radiusM?: number }> {
  // Manual (no GPS) check-ins cannot be radius-validated.
  if (lat == null || lng == null) return { ok: true };
  const loc = await getWorkLocation(supabase);
  const distance = haversineMeters(lat, lng, loc.lat, loc.lng);
  if (distance > loc.radiusM) {
    return {
      ok: false,
      status: 403,
      error: `Location is outside the allowed work area (${Math.round(distance)} m from the office, max ${loc.radiusM} m).`,
      distanceM: Math.round(distance),
      radiusM: loc.radiusM,
    };
  }
  return { ok: true };
}

// POST /api/attendance/self — employees check in/out themselves with GPS.
// Body: { action: "checkin"|"checkout", lat?, lng? }
// The server ALWAYS decides the timestamp and the attendance date. Employees
// cannot pick a time or backdate — `new Date()` is the single source of truth.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const action = body.action === 'checkout' ? 'checkout' : 'checkin';
  const attendanceDate = localToday();
  const now = new Date().toISOString();
  const lat = typeof body.lat === 'number' && !Number.isNaN(body.lat) ? body.lat : null;
  const lng = typeof body.lng === 'number' && !Number.isNaN(body.lng) ? body.lng : null;

  try {
    const radiusResult = await enforceRadius(supabase, lat, lng);
    if (!radiusResult.ok) {
      return NextResponse.json(
        { error: radiusResult.error, distanceM: radiusResult.distanceM, radiusM: radiusResult.radiusM },
        { status: radiusResult.status }
      );
    }

    if (action === 'checkout') {
      // First read the existing record to guard against double check-outs and
      // missing check-ins.
      const { data: existing } = await supabase
        .from('attendance')
        .select('id, check_in_time, check_out_time')
        .eq('user_id', user.id)
        .eq('attendance_date', attendanceDate)
        .maybeSingle();

      if (!existing?.check_in_time) {
        return NextResponse.json(
          { error: 'You have not checked in for today yet.' },
          { status: 400 }
        );
      }
      if (existing.check_out_time) {
        return NextResponse.json(
          { error: 'You have already checked out for today.' },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from('attendance')
        .update({
          check_out_time: now,
          check_out_lat: lat,
          check_out_lng: lng,
          source: lat != null ? 'gps' : 'manual',
          updated_at: now,
        })
        .eq('user_id', user.id)
        .eq('attendance_date', attendanceDate)
        .select()
        .single();
      if (error) {
        if (isSchemaError(error?.message)) {
          return NextResponse.json(
            { error: 'Attendance is not set up yet — apply the database migrations first' },
            { status: 500 }
          );
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, action, attendance: data });
    }

    // Compute delayMinutes / isLate via officeHours (for payroll deductions)
    let delayMinutes = 0; let isLate = false;
    try {
      const office = await loadOfficeHours(supabase as any);
      const t = new Date(now);
      const mins = t.getUTCHours()*60 + t.getUTCMinutes();
      const tol = office.toleranceMinutes ?? (office.startMinutes + (office.graceMinutes||30));
      delayMinutes = Math.max(0, mins - tol);
      isLate = mins > tol;
    } catch {}
    const { data, error } = await supabase
      .from('attendance')
      .upsert(
        {
          user_id: user.id,
          attendance_date: attendanceDate,
          check_in_time: now,
          check_in_lat: lat,
          check_in_lng: lng,
          source: lat != null ? 'gps' : 'manual',
          delay_minutes: delayMinutes,
          is_late: isLate,
        },
        { onConflict: 'user_id,attendance_date' }
      )
      .select()
      .single();
    if (error) {
      if (isSchemaError(error?.message)) {
        return NextResponse.json(
          { error: 'Attendance is not set up yet — apply the database migrations first' },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, action, attendance: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/attendance/self — the signed-in user's own attendance history.
// Params: from, to (YYYY-MM-DD), default = current month.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const from = url.searchParams.get('from') || `${year}-${month}-01`;
  const to =
    url.searchParams.get('to') ||
    `${year}-${month}-${String(now.getDate()).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('attendance')
    .select(
      'id, attendance_date, check_in_time, check_out_time, check_in_lat, check_in_lng, check_out_lat, check_out_lng, source'
    )
    .eq('user_id', user.id)
    .gte('attendance_date', from)
    .lte('attendance_date', to)
    .order('attendance_date', { ascending: false });

  if (error) {
    if (isSchemaError(error?.message)) {
      return NextResponse.json({ attendance: [], fallback: true });
    }
    return NextResponse.json({ attendance: [], error: error.message });
  }

  const attendance = (data || []).map((r: any) => {
    const secs =
      r.check_in_time && r.check_out_time
        ? Math.max(
            0,
            Math.round(
              (new Date(r.check_out_time).getTime() - new Date(r.check_in_time).getTime()) / 1000
            )
          )
        : 0;
    return { ...r, duration_seconds: secs };
  });

  return NextResponse.json({ attendance });
}