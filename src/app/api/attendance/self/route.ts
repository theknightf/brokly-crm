import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

// POST /api/attendance/self — employees check in/out themselves with GPS.
// Body: { action: "checkin"|"checkout", lat?, lng?, date? }
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
  const attendanceDate = typeof body.date === 'string' && body.date ? body.date : localToday();
  const now = new Date().toISOString();
  const lat = typeof body.lat === 'number' && !Number.isNaN(body.lat) ? body.lat : null;
  const lng = typeof body.lng === 'number' && !Number.isNaN(body.lng) ? body.lng : null;

  try {
    if (action === 'checkout') {
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