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

function localToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

export async function POST(request: Request) {
  const supabase = await createClient();
  const actor = await requireAdmin(supabase);
  if (!actor) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !body.userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const action = body.action === 'checkout' ? 'checkout' : 'checkin';
  const attendanceDate = typeof body.date === 'string' && body.date ? body.date : localToday();
  const now = body.time ? new Date(body.time).toISOString() : new Date().toISOString();

  if (action === 'checkout') {
    const { error } = await supabase
      .from('attendance')
      .update({ check_out_time: now, updated_at: now })
      .eq('user_id', body.userId)
      .eq('attendance_date', attendanceDate);
    if (error) {
      if (isSchemaError(error?.message)) {
        return NextResponse.json(
          { error: 'Attendance is not set up yet — apply the database migrations first' },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, action });
  }

  const { error } = await supabase.from('attendance').upsert(
    {
      user_id: body.userId,
      attendance_date: attendanceDate,
      check_in_time: now,
      marked_by: actor.id,
    },
    { onConflict: 'user_id,attendance_date' }
  );
  if (error) {
    if (isSchemaError(error?.message)) {
      return NextResponse.json(
        { error: 'Attendance is not set up yet — apply the database migrations first' },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, action });
}
