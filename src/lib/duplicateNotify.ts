import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sendToSubscription } from '@/lib/webpush';

interface OwnerRow {
  owner_id: string;
  adder_name: string;
  dup_count: number;
  sample: string;
}

/** Owner entry returned (server-side only) by check_and_record_duplicates(). */
export interface DuplicateOwnerNotice {
  owner_id: string;
  adder_name: string;
  count: number;
  sample: string;
}

type PushPayload = { title: string; body?: string; url?: string; tag?: string };

/**
 * Best-effort web push to every active subscription of ONE user. Uses the
 * service role because the caller cannot read other users' subscriptions under
 * RLS. Returns how many pushes were delivered.
 */
async function pushToUser(
  admin: ReturnType<typeof createServiceClient>,
  userId: string,
  payload: PushPayload
): Promise<number> {
  const { data: subs } = await admin
    .from('admin_settings')
    .select('id, color')
    .eq('category', 'push_subscriptions')
    .eq('name', userId)
    .eq('is_active', true);
  const dropIds: string[] = [];
  let pushed = 0;
  for (const row of (subs || []) as { id: string; color: string }[]) {
    let sub;
    try {
      sub = JSON.parse(row.color || '');
    } catch {
      continue;
    }
    if (!sub?.endpoint || !sub?.keys) continue;
    const r = await sendToSubscription(sub, payload);
    if (r.ok) pushed += 1;
    else if (r.dropped) dropIds.push(row.id);
  }
  if (dropIds.length) await admin.from('admin_settings').delete().in('id', dropIds);
  return pushed;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key);
}

/**
 * Server-only. Web push for the "duplicate needs review" in-app notifications
 * that check_and_record_duplicates() already wrote. Never throws.
 */
export async function pushDuplicateReviewOwners(owners: DuplicateOwnerNotice[]): Promise<number> {
  if (!owners?.length) return 0;
  try {
    const admin = serviceClient();
    if (!admin) return 0;
    let pushed = 0;
    for (const o of owners) {
      pushed += await pushToUser(admin, o.owner_id, {
        title: 'Duplicate lead needs review',
        body:
          o.count === 1
            ? `${o.adder_name} tried to add a lead that already exists: ${o.sample}`
            : `${o.count} duplicate attempts on your leads from ${o.adder_name}`,
        url: '/duplicates',
        tag: 'brokly-duplicate-review',
      });
    }
    return pushed;
  } catch {
    return 0;
  }
}

/**
 * Server-only. LEGACY path for duplicates that were inserted as flagged leads
 * (e.g. by clients that do not run the pre-insert check): calls
 * notify_duplicate_owners() as the signed-in user and pushes to each owner.
 * Never throws: duplicate notifications are best-effort.
 */
export async function notifyDuplicateOwnersServer(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> },
  leadIds: string[]
): Promise<{ notified: number; push: number }> {
  if (!leadIds.length) return { notified: 0, push: 0 };
  try {
    const { data, error } = await supabase.rpc('notify_duplicate_owners', { p_lead_ids: leadIds });
    if (error) return { notified: 0, push: 0 };
    const owners = (data || []) as OwnerRow[];
    if (!owners.length) return { notified: 0, push: 0 };

    const admin = serviceClient();
    if (!admin) return { notified: owners.length, push: 0 };

    let pushed = 0;
    for (const o of owners) {
      pushed += await pushToUser(admin, o.owner_id, {
        title: 'Duplicate lead re-added',
        body:
          o.dup_count === 1
            ? `${o.adder_name} tried to add a lead that already exists: ${o.sample}`
            : `${o.dup_count} of your leads were re-added by ${o.adder_name}`,
        url: '/leads-management',
        tag: 'brokly-duplicate',
      });
    }
    return { notified: owners.length, push: pushed };
  } catch {
    return { notified: 0, push: 0 };
  }
}
