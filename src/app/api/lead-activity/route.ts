import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/lead-activity?entity_id=...&entity_type=lead
 *
 * Returns the activity_log rows for one entity (defaults to the lead
 * timeline). RLS scopes the read: agents see their own actions, admins see
 * everything — the same rules that power the lead timeline UI.
 */
export async function GET(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const entityId = url.searchParams.get('entity_id') || '';
  const entityType = url.searchParams.get('entity_type') || 'lead';
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 50)));

  if (!entityId) {
    return NextResponse.json({ error: 'entity_id is required' }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return NextResponse.json({
      events: (data || []).map((row: any) => ({
        id: row.id,
        actionType: row.action_type,
        detail: row.detail,
        meta: row.meta,
        createdAt: row.created_at,
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to load activity' },
      { status: 500 }
    );
  }
}
