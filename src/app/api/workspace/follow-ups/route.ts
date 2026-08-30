import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/workspace/follow-ups?status=&priority=&date=&from=&to=&limit=
// Server-side filtered follow-up workspace list.
//   status:  any | notCompleted | completed
//   priority: any | High | Medium | Low
//   date:    any | late | today | tomorrow | custom
//   from/to: ISO dates used when date=custom
export async function GET(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'any';
  const priority = url.searchParams.get('priority') || 'any';
  const date = url.searchParams.get('date') || 'any';
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  const limit = Math.min(Number(url.searchParams.get('limit')) || 500, 1000);

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const NOT_DONE = ['Completed', 'Cancelled'];

  let query = supabase.from('follow_ups').select('*');

  if (status === 'notCompleted') {
    query = query.not('follow_up_status', 'in', `(${NOT_DONE.join(',')})`);
  } else if (status === 'completed') {
    query = query.eq('follow_up_status', 'Completed');
  }

  if (priority !== 'any') {
    query = query.eq('priority', priority);
  }

  if (date === 'late') {
    query = query.lt('due_date', today);
  } else if (date === 'today') {
    query = query.eq('due_date', today);
  } else if (date === 'tomorrow') {
    query = query.eq('due_date', tomorrow);
  } else if (date === 'custom') {
    if (from) query = query.gte('due_date', from);
    if (to) query = query.lte('due_date', to);
  }

  const { data, error } = await query.order('due_date', { ascending: true }).limit(limit);

  if (error) {
    return NextResponse.json({ followUps: [], count: 0, error: error.message }, { status: 200 });
  }

  const rows = (data || []).map((r: any) => ({
    id: r.id,
    title: r.title,
    contactName: r.contact_name,
    contactType: r.contact_type,
    contactPhone: r.contact_phone,
    contactEmail: r.contact_email,
    type: r.follow_up_type,
    status: r.follow_up_status,
    priority: r.priority,
    dueDate: r.due_date,
    dueTime: r.due_time,
    agent: r.agent,
    agentInitials: r.agent_initials,
    notes: r.notes,
    propertyInterest: r.property_interest,
    relationshipStatus: r.relationship_status,
    completedAt: r.completed_at,
  }));

  return NextResponse.json({ followUps: rows, count: rows.length });
}
