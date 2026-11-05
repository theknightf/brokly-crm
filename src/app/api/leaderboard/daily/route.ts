import { NextResponse } from 'next/server';
import { getRequestSupabase } from '@/lib/supabase/requestAuth';

export const dynamic = 'force-dynamic';

// GET /api/leaderboard/daily?date=YYYY-MM-DD   (date = Cairo calendar day; default: today in Cairo)
// Ranks agents by TOTAL daily actions (desc): calls made + status updates + notes + meetings logged + deals
// closed. The numbers come from the daily_leaderboard() SQL function, which aggregates server-side
// (SECURITY DEFINER) so every rep sees the team board, uses the Cairo day boundaries (not UTC) and is not
// cut off by PostgREST's 1000-row cap. "answered" counts calls where the lead actually picked up.
export async function GET(request: Request) {
  const { supabase, user } = await getRequestSupabase(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('daily_leaderboard', { p_date: date || null });
  if (error) {
    console.error('daily_leaderboard failed:', error);
    return NextResponse.json({ error: 'Could not load the leaderboard.', users: [] }, { status: 500 });
  }

  const n = (v: unknown) => Number(v) || 0;
  const users = ((data as any[]) || []).map((r, i) => ({
    user_id: r.user_id,
    full_name: r.full_name || 'User',
    role: r.role || '',
    calls: n(r.calls),
    answered: n(r.answered_calls),
    answeredLeads: n(r.answered_leads),
    statusUpdates: n(r.status_updates),
    meetings: n(r.meetings),
    deals: n(r.deals),
    notes: n(r.notes),
    totalActions: n(r.total_actions),
    rank: i + 1,
  }));

  return NextResponse.json({ date: date || null, users, generated_at: new Date().toISOString() });
}
