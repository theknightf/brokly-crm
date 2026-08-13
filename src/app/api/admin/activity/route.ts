import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';

function getSupabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function isSchemaError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache')
  );
}

// GET /api/admin/activity — admin dashboard data (admin-only)
// Query params: from, to (dates), user_id (optional filter), period (day|week|month)
export async function GET(request: Request) {
  try {
    const serverClient = await createServerClient();
    const auth = await requireAdmin(serverClient);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const from =
      searchParams.get('from') ||
      new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().slice(0, 10);
    const to = searchParams.get('to') || new Date().toISOString().slice(0, 10);
    const userId = searchParams.get('user_id');
    const period = searchParams.get('period') || 'day'; // day | week | month

    const supabaseAdmin = getSupabaseService();
    const db = supabaseAdmin as any;

    // 1. Fetch all active users
    const usersQuery = db.from('user_profiles').select('id, full_name, email, role');

    const { data: users, error: usersErr } = await usersQuery;
    if (usersErr && isSchemaError(usersErr)) {
      return NextResponse.json({ users: [], sessions: [], daily: [], online: [], not_setup: true });
    }

    const userIds = (users || []).map((u: any) => u.id);
    if (userIds.length === 0) {
      return NextResponse.json({
        users: [],
        sessions: [],
        daily: [],
        online: [],
        not_setup: false,
      });
    }

    // 2. Fetch sessions in date range
    let sessionsQuery = db
      .from('user_sessions')
      .select('*')
      .gte('login_at', from + 'T00:00:00')
      .lte('login_at', to + 'T23:59:59');

    if (userId) sessionsQuery = sessionsQuery.eq('user_id', userId);

    const { data: sessions, error: sessionsErr } = await sessionsQuery;
    if (sessionsErr && isSchemaError(sessionsErr)) {
      return NextResponse.json({
        users: users || [],
        sessions: [],
        daily: [],
        online: [],
        not_setup: true,
      });
    }

    // 3. Fetch daily aggregates
    let dailyQuery = db
      .from('user_daily_activity')
      .select('*')
      .gte('activity_date', from)
      .lte('activity_date', to)
      .order('activity_date', { ascending: true });

    if (userId) dailyQuery = dailyQuery.eq('user_id', userId);

    const { data: daily, error: dailyErr } = await dailyQuery;

    // 4. Online status — active sessions with heartbeat in last 2 minutes
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: activeSessions } = await db
      .from('user_sessions')
      .select('user_id, last_heartbeat_at, duration_seconds, login_at')
      .eq('is_active', true)
      .gte('last_heartbeat_at', twoMinAgo);

    const onlineMap: Record<
      string,
      { last_heartbeat_at: string; duration_seconds: number; login_at: string }
    > = {};
    (activeSessions || []).forEach((s: any) => {
      onlineMap[s.user_id] = s;
    });

    // 5. Last active for each user (most recent session heartbeat or logout)
    let lastActiveQuery = db
      .from('user_sessions')
      .select('user_id, last_heartbeat_at, login_at')
      .order('last_heartbeat_at', { ascending: false })
      .limit(userIds.length * 10);

    if (userId) lastActiveQuery = lastActiveQuery.eq('user_id', userId);

    const { data: lastActiveData } = await lastActiveQuery;
    const lastActiveMap: Record<string, string> = {};
    (lastActiveData || []).forEach((s: any) => {
      if (!lastActiveMap[s.user_id]) {
        lastActiveMap[s.user_id] = s.last_heartbeat_at;
      }
    });

    // 6. Activity log entries for the period (non-heartbeat events)
    let activityQuery = db
      .from('user_activity_log')
      .select('user_id, event_type, event_data, occurred_at')
      .neq('event_type', 'heartbeat')
      .gte('occurred_at', from + 'T00:00:00')
      .lte('occurred_at', to + 'T23:59:59')
      .order('occurred_at', { ascending: false })
      .limit(200);

    if (userId) activityQuery = activityQuery.eq('user_id', userId);

    const { data: activityLog } = await activityQuery;

    return NextResponse.json({
      users: users || [],
      sessions: sessions || [],
      daily: daily || [],
      online: onlineMap,
      last_active: lastActiveMap,
      activity_log: activityLog || [],
      not_setup: false,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json(
      { error: msg, users: [], sessions: [], daily: [], online: [], activity_log: [] },
      { status: 500 }
    );
  }
}
