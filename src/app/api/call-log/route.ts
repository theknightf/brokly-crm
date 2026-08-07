import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// POST /api/call-log — record a call/site-visit/whatsapp touchpoint for the
// signed-in user. Every entry is also mirrored into activity_log via the
// log_call_added() DB trigger so it counts towards productivity analytics.
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const {
    entity_type,
    entity_id,
    contact_name,
    contact_phone,
    channel,
    direction,
    duration_seconds,
    outcome,
    notes,
  } = body as {
    entity_type?: string;
    entity_id?: string;
    contact_name?: string;
    contact_phone?: string;
    channel?: string;
    direction?: string;
    duration_seconds?: number;
    outcome?: string;
    notes?: string;
  };

  const validChannels = ['Call', 'Video Call', 'WhatsApp', 'Email', 'Site Visit', 'Meeting'];
  const ch = validChannels.includes(channel || '') ? channel : 'Call';

  // Call outcomes that map to a CRM pipeline stage are synced back onto the
  // lead so the pipeline reflects what happened on the call. Never fatal.
  const OUTCOME_TO_STATUS: Record<string, string> = {
    Interested: 'Interested',
    'Site Visit': 'Meeting',
    'Won Deal': 'Done Deal',
    'Not Interested': 'Not Interested',
    'No Answer': 'No Answer',
    'Wrong Number': 'Wrong Number',
    Cancellation: 'Cancellation',
  };
  const STATUS_TO_LEGACY: Record<string, string> = {
    'Fresh Leads': 'New',
    'Cold Calls': 'Contacted',
    'Pending Leads': 'Contacted',
    'Following Up': 'Qualified',
    Meeting: 'Site Visit Scheduled',
    Interested: 'Qualified',
    'Not Interested': 'Lost',
    Cancellation: 'Lost',
    'Done Deal': 'Won',
    'Duplicate Leads': 'Lost',
    'Wrong Number': 'Lost',
    'Data Rotation': 'Contacted',
    'Closed Number': 'Lost',
    'No Answer': 'Contacted',
    'No Answer At All': 'Contacted',
    'Low Budget': 'Lost',
    'Reschedule Meeting': 'Site Visit Scheduled',
  };

  try {
    const { data, error } = await supabase
      .from('call_logs')
      .insert({
        user_id: user.id,
        entity_type: entity_type || 'lead',
        entity_id: entity_id || '',
        contact_name: contact_name || '',
        contact_phone: contact_phone || '',
        channel: ch,
        direction: direction || 'outgoing',
        duration_seconds: Math.max(0, Math.floor(Number(duration_seconds) || 0)),
        outcome: outcome || '',
        notes: notes || '',
      })
      .select()
      .single();

    let saved: any;
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (
        msg.includes('does not exist') ||
        msg.includes('could not find') ||
        msg.includes('schema cache')
      ) {
        // Real call_logs table not provisioned yet. Fall back to admin_settings
        // (writable by any authenticated user) so the log genuinely SAVES now.
        const rec = {
          user_id: user.id,
          entity_type: entity_type || 'lead',
          entity_id: entity_id || '',
          contact_name: contact_name || '',
          contact_phone: contact_phone || '',
          channel: ch,
          direction: direction || 'outgoing',
          duration_seconds: Math.max(0, Math.floor(Number(duration_seconds) || 0)),
          outcome: outcome || '',
          notes: notes || '',
          created_at: new Date().toISOString(),
        };
        const { error: qe } = await supabase.from('admin_settings').insert({
          category: 'call_log_fallback',
          name: user.id,
          color: JSON.stringify(rec),
          sort_order: Math.floor(Date.now() / 1000),
          is_active: true,
        });
        if (qe) {
          return NextResponse.json({ error: qe.message }, { status: 500 });
        }
        saved = { id: 'tmp-' + Date.now(), ...rec };
      } else {
        throw error;
      }
    } else {
      saved = data;
    }

    // Best-effort: reflect the call outcome on the lead's pipeline stage.
    if (entity_type === 'lead' && entity_id) {
      const nextStatus = OUTCOME_TO_STATUS[(outcome || '').trim()];
      if (nextStatus) {
        try {
          await supabase
            .from('leads')
            .update({
              crm_status: nextStatus,
              lead_status: STATUS_TO_LEGACY[nextStatus] || 'New',
            })
            .eq('id', entity_id);
        } catch {
          // ignore — the call is already logged; the pipeline sync is best-effort
        }
      }
    }

    return NextResponse.json({ call: saved });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/call-log?user_id=&from=&to= — list call logs (own + admin all)
export async function GET(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  const userId = url.searchParams.get('user_id');

  let query = supabase.from('call_logs').select('*').order('created_at', { ascending: false });
  if (from) query = query.gte('created_at', `${from}T00:00:00`);
  if (to) query = query.lte('created_at', `${to}T23:59:59.999`);
  if (userId) query = query.eq('user_id', userId);

  const { data, error } = await query.limit(500);

  if (error) {
    const msg = (error.message || '').toLowerCase();
    const missing =
      msg.includes('does not exist') ||
      msg.includes('could not find') ||
      msg.includes('schema cache');
    if (missing) {
      // Real table not provisioned — read from the fallback queue instead.
      let q = supabase
        .from('admin_settings')
        .select('name, color, created_at')
        .eq('category', 'call_log_fallback')
        .order('created_at', { ascending: false });
      if (userId) q = (q as any).eq('name', userId);
      const { data: rows } = await q.limit(500);
      const calls = (rows || [])
        .map((r) => {
          try {
            const parsed = JSON.parse(r.color || '');
            return {
              ...parsed,
              id: parsed.id || 'tmp-' + (r as any).id,
              created_at: parsed.created_at || r.created_at,
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      const userIds = [...new Set(calls.map((c: any) => c.user_id).filter(Boolean))];
      const names: Record<string, string> = {};
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, full_name')
          .in('id', userIds);
        (profiles || []).forEach((p) => (names[p.id] = p.full_name || ''));
      }
      const list = (calls as any[]).map((c) => ({ ...c, agent_name: names[c.user_id] || '' }));
      return NextResponse.json({ calls: list, fallback: true });
    }
    return NextResponse.json({ calls: [], error: error.message });
  }

  // Attach agent display names (admin view needs them).
  const userIds = [...new Set((data || []).map((c) => c.user_id).filter(Boolean))];
  let names: Record<string, string> = {};
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name')
      .in('id', userIds);
    names = Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name || '']));
  }

  const calls = (data || []).map((c) => ({
    ...c,
    agent_name: names[c.user_id] || '',
  }));
  return NextResponse.json({ calls });
}
