import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendToSubscription } from '@/lib/webpush';

export const dynamic = 'force-dynamic';

interface Payload {
  title: string;
  body?: string;
  url?: string;
  icon?: string;
  tag?: string;
}

interface SubRow {
  id: string;
  color: string;
}

// POST /api/push/send?target=<user_id> — deliver a web push to that user's
// registered device(s). Used to ping an agent the moment a lead is assigned
// to them or a follow-up becomes due. Best-effort.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const target = url.searchParams.get('target');

  let payload: Payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!target || !payload.title) {
    return NextResponse.json({ error: 'target and title required' }, { status: 400 });
  }

  // Sending to your own devices is always allowed; pushing to someone else
  // requires an admin/owner (spam prevention).
  if (target !== caller.id) {
    const { data: callerProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', caller.id)
      .single();
    const role = callerProfile?.role || '';
    if (!['admin', 'owner'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const { data: rows } = await supabase
    .from('admin_settings')
    .select('id, color')
    .eq('category', 'push_subscriptions')
    .eq('name', target)
    .eq('is_active', true);

  let sent = 0;
  let failed = 0;
  const dropIds: string[] = [];

  for (const row of (rows || []) as SubRow[]) {
    let sub;
    try {
      sub = JSON.parse(row.color || '');
    } catch {
      continue;
    }
    if (!sub || !sub.endpoint || !sub.keys) continue;

    const r = await sendToSubscription(sub, payload);
    if (r.ok) {
      sent += 1;
    } else if (r.dropped) {
      dropIds.push(row.id);
    } else {
      failed += 1;
    }
  }

  if (dropIds.length) {
    await supabase.from('admin_settings').delete().in('id', dropIds);
  }

  if (rows && rows.length > 0 && sent === 0 && failed === 0) {
    return NextResponse.json({ ok: false, reason: 'no_subscription', sent });
  }
  return NextResponse.json({ ok: failed === 0, sent });
}
