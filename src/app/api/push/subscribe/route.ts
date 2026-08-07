import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface SubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// POST /api/push/subscribe — store the caller's push subscription.
// Subscriptions live in admin_settings (category='push_subscriptions',
// name=<user_id>, color=<JSON string>), which any authenticated user may
// insert, so no extra table/migration is required.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { subscription?: SubscriptionJson };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const sub = body?.subscription;
  if (!sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: 'Missing subscription' }, { status: 400 });
  }

  const category = 'push_subscriptions';
  const { data: existing } = await supabase
    .from('admin_settings')
    .select('id')
    .eq('category', category)
    .eq('name', user.id);

  const color = JSON.stringify(sub);
  let err: { message: string } | null = null;

  if (existing && existing.length > 0) {
    const { error } = await supabase
      .from('admin_settings')
      .update({ color, is_active: true })
      .eq('category', category)
      .eq('name', user.id);
    err = error ?? null;
  } else {
    const { error } = await supabase
      .from('admin_settings')
      .insert({ category, name: user.id, color, sort_order: 0, is_active: true });
    err = error ?? null;
  }

  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
