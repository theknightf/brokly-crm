import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/leads/:id/events?before=<ISO>&limit=20
 * The lead's event history (lead_events), newest first, one page at a time. Read with the caller's session,
 * so RLS limits it to leads the caller can see. Person ids (actor, assignment from/to) come back with names.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params;
  if (!leadId) return NextResponse.json({ error: 'Missing lead id' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 100);
  const before = url.searchParams.get('before');

  const db: any = supabase;
  let q = db
    .from('lead_events')
    .select('id, lead_id, actor_id, type, old_value, new_value, ref_id, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);
  if (before && !Number.isNaN(Date.parse(before))) q = q.lt('created_at', before);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows: any[] = data || [];
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  // Names for the actor and for assignment from/to.
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = new Set<string>();
  for (const r of page) {
    if (r.actor_id) ids.add(r.actor_id);
    if (r.type === 'assigned') {
      if (r.old_value && uuid.test(r.old_value)) ids.add(r.old_value);
      if (r.new_value && uuid.test(r.new_value)) ids.add(r.new_value);
    }
  }
  const names: Record<string, string> = {};
  if (ids.size) {
    const { data: people } = await db.from('user_profiles').select('id, full_name, email').in('id', Array.from(ids));
    for (const p of people || []) names[p.id] = p.full_name || p.email || 'User';
  }
  const nameOf = (v: string | null) => (v ? names[v] || (uuid.test(v) ? 'Former user' : v) : null);

  return NextResponse.json({
    events: page.map((r) => ({
      id: r.id,
      type: r.type,
      at: r.created_at,
      actor: r.actor_id ? names[r.actor_id] || 'Former user' : 'System',
      from: r.type === 'assigned' ? nameOf(r.old_value) : r.old_value,
      to: r.type === 'assigned' ? nameOf(r.new_value) : r.new_value,
      refId: r.ref_id,
    })),
    nextBefore: hasMore ? page[page.length - 1]?.created_at : null,
  });
}
