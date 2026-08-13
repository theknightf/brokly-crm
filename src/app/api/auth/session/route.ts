import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function isSchemaError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache')
  );
}

// POST /api/auth/session — called on login
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ip_address, user_agent } = body as {
      user_id?: string;
      ip_address?: string;
      user_agent?: string;
    };

    // Use the authenticated session (from cookies) rather than any client-supplied
    // user_id. This ensures RLS policies (auth.uid() = user_id) accept the writes.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user_id = user.id;
    // Close any existing active sessions for this user first
    try {
      const { data: existing } = await supabase
        .from('user_sessions')
        .select('id')
        .eq('user_id', user_id)
        .eq('is_active', true);

      if (existing && existing.length > 0) {
        await supabase
          .from('user_sessions')
          .update({
            is_active: false,
            closed_reason: 'manual',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user_id)
          .eq('is_active', true)
          .select('id');
      }
    } catch {
      // table may not exist yet
    }

    // Create new session
    const { data: session, error: sessionErr } = await supabase
      .from('user_sessions')
      .insert({
        user_id,
        login_at: new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString(),
        ip_address: ip_address || null,
        user_agent: user_agent || null,
        is_active: true,
      })
      .select('id')
      .single();

    if (sessionErr) {
      if (isSchemaError(sessionErr)) {
        return NextResponse.json({ error: 'Activity tracking not set up yet' }, { status: 503 });
      }
      throw sessionErr;
    }

    // Log login event
    try {
      await supabase.from('user_activity_log').insert({
        user_id,
        session_id: session.id,
        event_type: 'login',
        event_data: { ip_address: ip_address || null, user_agent: user_agent || null },
      });
    } catch {
      /* best effort */
    }

    // Update daily aggregate
    try {
      const today = new Date().toISOString().slice(0, 10);
      await supabase.rpc('refresh_daily_activity', { p_user_id: user_id, p_date: today });
    } catch {
      /* best effort */
    }

    return NextResponse.json({ session_id: session.id, message: 'Session started' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/auth/session — called on logout
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const session_id = searchParams.get('session_id');

    if (!session_id) {
      return NextResponse.json({ error: 'session_id required' }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only the session owner may close it (admin access is NOT granted here —
    // admin cleanup goes through the admin surfaces instead).
    const query = supabase
      .from('user_sessions')
      .select('id, login_at')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .eq('is_active', true);

    const { data: activeSessions, error: findErr } = await query;
    if (findErr) {
      if (isSchemaError(findErr)) {
        return NextResponse.json({ error: 'Activity tracking not set up yet' }, { status: 503 });
      }
      throw findErr;
    }

    if (!activeSessions || activeSessions.length === 0) {
      return NextResponse.json({ message: 'No active session found' });
    }

    const now = new Date();
    const uid = user.id;

    for (const s of activeSessions) {
      const duration = Math.floor((now.getTime() - new Date(s.login_at).getTime()) / 1000);
      await supabase
        .from('user_sessions')
        .update({
          logout_at: now.toISOString(),
          duration_seconds: Math.max(0, duration),
          is_active: false,
          closed_reason: 'logout',
          updated_at: now.toISOString(),
        })
        .eq('id', s.id)
        .select('id');
    }

    // Log logout events
    for (const s of activeSessions) {
      try {
        await supabase.from('user_activity_log').insert({
          user_id: uid,
          session_id: s.id,
          event_type: 'logout',
          event_data: { closed_reason: 'logout' },
        });
        const today = now.toISOString().slice(0, 10);
        await supabase.rpc('refresh_daily_activity', { p_user_id: uid, p_date: today });
      } catch {
        // best effort
      }
    }

    return NextResponse.json({ message: 'Session closed', sessions_closed: activeSessions.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
