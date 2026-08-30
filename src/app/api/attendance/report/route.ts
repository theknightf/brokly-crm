import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';
import { loadOfficeHours, formatMinutes } from '@/lib/officeHours';

export const dynamic = 'force-dynamic';

function localDay(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function localFromDay(day: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T00:00:00` : '';
}

async function requireAdminRole(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: actor } = await supabase
    .from('user_profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  return !!actor && actor.is_active !== false && isAdminRole(actor.role);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const isAdmin = await requireAdminRole(supabase);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get('from') || localDay(0);
  const to = url.searchParams.get('to') || localDay(0);

  const office = await loadOfficeHours(supabase);
  const OFFICE_START = office.start;
  const OFFICE_END = office.end;
  const OFFICE_TOLERANCE = formatMinutes(office.toleranceMinutes);

  const [usersRes, attendanceRes] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('id, full_name, email, role, is_active, team_id')
      .order('full_name'),
    supabase
      .from('attendance')
      .select('user_id, attendance_date, check_in_time, check_out_time')
      .gte('attendance_date', localFromDay(from))
      .lte('attendance_date', `${to}T23:59:59.999`)
      .order('attendance_date'),
  ]);

  if (usersRes.error || attendanceRes.error) {
    return NextResponse.json({
      from,
      to,
      officeStart: OFFICE_START,
      officeEnd: OFFICE_END,
      tolerance: OFFICE_TOLERANCE,
      users: [],
      attendance: [],
    });
  }

  return NextResponse.json({
    from,
    to,
    officeStart: OFFICE_START,
    officeEnd: OFFICE_END,
    tolerance: OFFICE_TOLERANCE,
    users: usersRes.data || [],
    attendance: attendanceRes.data || [],
  });
}
