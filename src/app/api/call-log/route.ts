import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Best-effort audit trail insert — never fatal (table may not exist yet).
async function audit(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  row: {
    user_id: string;
    entity_type: string;
    entity_id: string;
    action: string;
    description: string;
  }
) {
  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('full_name')
      .eq('id', row.user_id)
      .maybeSingle();
    await supabase.from('audit_log').insert({
      user_id: row.user_id,
      user_name: profile?.full_name || '',
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      action: row.action,
      description: row.description,
    });
  } catch {
    /* ignore */
  }
}

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
    client_ref,
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
    client_ref?: string;
  };

  const validChannels = ['Call', 'Video Call', 'WhatsApp', 'Email', 'Site Visit', 'Meeting'];
  const ch = validChannels.includes(channel || '') ? channel : 'Call';

  // Idempotency key: the same client_ref (regenerated per user interaction)
  // can never create a second row, even if the client retries or double-taps.
  const ref =
    client_ref ||
    `${user.id}-${entity_id || 'none'}-${ch}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Resolve the project linked to the entity so every call log carries
  // project/lead context for the reports.
  let projectName = '';
  if (entity_id) {
    try {
      if (entity_type === 'follow_up') {
        const { data: fu } = await supabase
          .from('follow_ups')
          .select('lead_id')
          .eq('id', entity_id)
          .maybeSingle();
        if (fu?.lead_id) {
          const { data: lead } = await supabase
            .from('leads')
            .select('project')
            .eq('id', fu.lead_id)
            .maybeSingle();
          projectName = lead?.project || '';
        }
      } else {
        const { data: lead } = await supabase
          .from('leads')
          .select('project')
          .eq('id', entity_id)
          .maybeSingle();
        projectName = lead?.project || '';
      }
    } catch {
      // project name is best-effort — the call is still logged
    }
  }

  const row = {
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
    client_ref: ref,
    project_name: projectName,
  };

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
    let saved: any;

    // Idempotent save: upsert on client_ref so retries/double-taps return the
    // existing record instead of creating a duplicate call log.
    const { data, error } = await supabase
      .from('call_logs')
      .upsert(row, { onConflict: 'client_ref' })
      .select()
      .single();

    if (error) {
      const msg = (error.message || '').toLowerCase();
      const code = error.code || '';
      const missingTable =
        msg.includes('does not exist') ||
        msg.includes('could not find') ||
        msg.includes('schema cache');
      const missingColumns = msg.includes('client_ref') || msg.includes('project_name');
      // Postgres cannot infer a conflict target from a PARTIAL unique index
      // (the pre-20260813000000 layout), so ON CONFLICT fails with 42P10.
      const conflictTargetMissing =
        code === '42P10' ||
        msg.includes('on conflict') ||
        msg.includes('unique or exclusion constraint');

      if (conflictTargetMissing) {
        // Old DB layout: a plain insert keeps the call saved. Reuse an
        // existing row with the same client_ref to preserve idempotency.
        const { data: existing } = await supabase
          .from('call_logs')
          .select('*')
          .eq('user_id', user.id)
          .eq('client_ref', ref)
          .maybeSingle();
        if (existing) {
          saved = existing;
        } else {
          const { data: ins, error: insErr } = await supabase
            .from('call_logs')
            .insert(row)
            .select()
            .single();
          if (insErr) {
            if (insErr.code === '23505') {
              saved = { id: 'dup-' + ref, ...row };
            } else if (missingTable) {
              const rec = { ...row, created_at: new Date().toISOString() };
              const { error: qe } = await supabase.from('admin_settings').insert({
                category: 'call_log_fallback',
                name: user.id,
                color: JSON.stringify(rec),
                sort_order: Math.floor(Date.now() / 1000),
                is_active: true,
              });
              if (qe) return NextResponse.json({ error: qe.message }, { status: 500 });
              saved = { id: 'tmp-' + Date.now(), ...rec };
            } else if (missingColumns) {
              const { client_ref: _cr, project_name: _pn, ...plainRow } = row;
              const { data: plainData, error: plainErr } = await supabase
                .from('call_logs')
                .insert(plainRow)
                .select()
                .single();
              if (plainErr) {
                if (plainErr.code === '23505') {
                  saved = { id: 'dup-' + ref, ...plainRow };
                } else {
                  throw plainErr;
                }
              } else {
                saved = plainData;
              }
            } else {
              throw insErr;
            }
          } else {
            saved = ins;
          }
        }
      } else if (missingColumns) {
        // New columns not provisioned yet — retry without them (no dedup).
        const { client_ref: _cr, project_name: _pn, ...plainRow } = row;
        const { data: plainData, error: plainErr } = await supabase
          .from('call_logs')
          .insert(plainRow)
          .select()
          .single();
        if (plainErr) {
          if (plainErr.code === '23505') {
            saved = { id: 'dup-' + ref, ...plainRow };
          } else if (missingTable) {
            const rec = { ...plainRow, created_at: new Date().toISOString() };
            const { error: qe } = await supabase.from('admin_settings').insert({
              category: 'call_log_fallback',
              name: user.id,
              color: JSON.stringify(rec),
              sort_order: Math.floor(Date.now() / 1000),
              is_active: true,
            });
            if (qe) return NextResponse.json({ error: qe.message }, { status: 500 });
            saved = { id: 'tmp-' + Date.now(), ...rec };
          } else {
            throw plainErr;
          }
        } else {
          saved = plainData;
        }
      } else if (missingTable) {
        // Real call_logs table not provisioned yet — fall back to
        // admin_settings (writable by any authenticated user) so the log
        // genuinely SAVES now.
        const rec = {
          ...row,
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

    // Audit trail for the touchpoint (best-effort).
    await audit(supabase, {
      user_id: user.id,
      entity_type: entity_type || 'lead',
      entity_id: entity_id || '',
      action: 'touchpoint_logged',
      description:
        `${ch}${outcome ? ` · ${outcome}` : ''} — ${contact_name || contact_phone || ''}`.trim(),
    });

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
  const entityType = url.searchParams.get('entity_type');
  const entityId = url.searchParams.get('entity_id');

  let query = supabase.from('call_logs').select('*').order('created_at', { ascending: false });
  if (from) query = query.gte('created_at', `${from}T00:00:00`);
  if (to) query = query.lte('created_at', `${to}T23:59:59.999`);
  if (userId) query = query.eq('user_id', userId);
  if (entityType) query = query.eq('entity_type', entityType);
  if (entityId) query = query.eq('entity_id', entityId);

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
    return NextResponse.json({ calls: [], error: error.message }, { status: 500 });
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
