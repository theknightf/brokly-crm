import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sendToSubscription } from '@/lib/webpush';

interface OwnerRow {
  owner_id: string;
  adder_name: string;
  dup_count: number;
  sample: string;
}

/**
 * Server-only. Calls notify_duplicate_owners() as the signed-in user (writes ONE
 * in-app notification per original owner, never for the owner's own re-add) and
 * then delivers the matching web push using the service role, because the
 * adder cannot read other users' push subscriptions under RLS.
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

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return { notified: owners.length, push: 0 };
    const admin = createServiceClient(url, key);

    let pushed = 0;
    for (const o of owners) {
      const { data: subs } = await admin
        .from('admin_settings')
        .select('id, color')
        .eq('category', 'push_subscriptions')
        .eq('name', o.owner_id)
        .eq('is_active', true);
      const dropIds: string[] = [];
      for (const row of (subs || []) as { id: string; color: string }[]) {
        let sub;
        try {
          sub = JSON.parse(row.color || '');
        } catch {
          continue;
        }
        if (!sub?.endpoint || !sub?.keys) continue;
        const r = await sendToSubscription(sub, {
          title: 'Duplicate lead re-added',
          body:
            o.dup_count === 1
              ? `${o.adder_name} tried to add a lead that already exists: ${o.sample}`
              : `${o.dup_count} of your leads were re-added by ${o.adder_name}`,
          url: '/leads-management',
          tag: 'brokly-duplicate',
        });
        if (r.ok) pushed += 1;
        else if (r.dropped) dropIds.push(row.id);
      }
      if (dropIds.length) await admin.from('admin_settings').delete().in('id', dropIds);
    }
    return { notified: owners.length, push: pushed };
  } catch {
    return { notified: 0, push: 0 };
  }
}
