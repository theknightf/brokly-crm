import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function isSchemaError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache')
  );
}

// POST /api/auth/heartbeat — client pings every 30s to keep session alive.
// Also accepts { close: true } (from beforeunload/visibility hidden) to end the
// session and finalize its duration. sendBeacon can only send POST, so closing
// is done here rather than a DELETE.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { session_id, close } = body as { session_id: string; close?: boolean };

    if (!session_id) {
      return NextResponse.json({ error: 'session_id required' }, { status: 400 });
    }

    // Use the authenticated session (from cookies) so RLS policies accept reads/writes.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user_id = user.id;
    const now = new Date();

    // Read the CURRENT last_heartbeat BEFORE updating so the duration delta is correct.
    const { data: session, error: readErr } = await supabase
      .from('user_sessions')
      .select('id,created_at,last_heartbeat_at,duration_seconds,is_active')
      .eq('id', session_id)
      .eq('user_id', user_id)
      .maybeSingle();

    if (readErr) {
      if (isSchemaError(readErr)) {
        return NextResponse.json({ error: 'Activity tracking not set up yet' }, { status: 503 });
      }
      return NextResponse.json(
        { error: 'Session not found', action: 're_register' },
        { status: 404 }
      );
    }

    if (!session || !session.is_active) {
      return NextResponse.json(
        { error: 'Session not found', action: 're_register' },
        { status: 404 }
      );
    }

    // Accumulate active seconds since the previous heartbeat.
    const lastHeartbeat = new Date(session.last_heartbeat_at);
    let diffSec = Math.floor((now.getTime() - lastHeartbeat.getTime()) / 1000);
    // Cap at 2 minutes to avoid counting long periods of inactivity/sleep.
    if (diffSec > 120) diffSec = 120;
    if (diffSec < 0) diffSec = 0;
    const newDuration = (session.duration_seconds || 0) + diffSec;

    if (close) {
      // End the session now (tab closed / hidden long enough).
      await supabase
        .from('user_sessions')
        .update({
          logout_at: now.toISOString(),
          duration_seconds: newDuration,
          is_active: false,
          closed_reason: 'timeout',
          last_heartbeat_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', session_id);
      // Try to refresh today's aggregate.
      try {
        const today = now.toISOString().slice(0, 10);
        await supabase.rpc('refresh_daily_activity', { p_user_id: user_id, p_date: today });
      } catch {
        // best effort
      }
      return NextResponse.json({ ok: true, closed: true });
    }

    // Normal heartbeat — update timestamp and accumulate duration atomically.
    await supabase
      .from('user_sessions')
      .update({
        last_heartbeat_at: now.toISOString(),
        duration_seconds: newDuration,
        updated_at: now.toISOString(),
      })
      .eq('id', session_id);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
