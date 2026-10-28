import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const LEAD_FIELDS =
  'id, name, phone, email, source, project, developer, location, property_type, unit, budget_min, budget_max, notes, crm_status, created_at, created_by, assigned_to';

type Person = { id: string; name: string; role: string } | null;

/**
 * GET /api/duplicates?status=pending|merged|dismissed|all
 *
 * duplicate_leads is read with the CALLER's session, so RLS decides which rows
 * they may see (owner of the original lead, or owner/admin/manager). Only after
 * that are the original lead and the people involved enriched; the service role
 * is used for that join because a manager may not be able to read the lead
 * under the leads RLS policies. Nothing outside the authorised rows is exposed.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'pending';
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 100)));

  let q: any = (supabase as any)
    .from('duplicate_leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status !== 'all') q = q.eq('status', status);

  const [{ data: rows, error }, pendingRes] = await Promise.all([
    q,
    (supabase as any)
      .from('duplicate_leads')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const list = (rows || []) as any[];
  const sUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const db: any = sUrl && sKey ? createServiceClient(sUrl, sKey) : supabase;

  const leadIds = Array.from(new Set(list.map((r) => r.original_lead_id).filter(Boolean)));
  const { data: leads } = leadIds.length
    ? await db.from('leads').select(LEAD_FIELDS).in('id', leadIds)
    : { data: [] };
  const leadById = new Map<string, any>((leads || []).map((l: any) => [l.id, l]));

  // Entries that point at a real duplicate lead (historical scan / mobile inserts).
  const dupLeadIds = Array.from(new Set(list.map((r) => r.duplicate_lead_id).filter(Boolean)));
  const { data: dupLeads } = dupLeadIds.length
    ? await db.from('leads').select(LEAD_FIELDS).in('id', dupLeadIds)
    : { data: [] };
  const dupLeadById = new Map<string, any>((dupLeads || []).map((l: any) => [l.id, l]));

  // Action counters per lead, from the single validated action log.
  const countIds = Array.from(new Set([...leadIds, ...dupLeadIds]));
  const { data: actionRows } = countIds.length
    ? await db.from('user_actions').select('lead_id, action_type').in('lead_id', countIds).limit(50000)
    : { data: [] };
  const actionCounts = new Map<string, Record<string, number>>();
  for (const a of (actionRows || []) as any[]) {
    const c = actionCounts.get(a.lead_id) || {};
    c[a.action_type] = (c[a.action_type] || 0) + 1;
    actionCounts.set(a.lead_id, c);
  }
  const countsFor = (id?: string | null) => {
    const c = (id && actionCounts.get(id)) || {};
    return {
      calls: c.CALL || 0,
      meetings: c.MEETING || 0,
      notes: c.NOTE || 0,
      statusChanges: c.STATUS_CHANGE || 0,
    };
  };

  const personIds = new Set<string>();
  for (const r of list) {
    [r.attempted_by, r.original_owner_id, r.original_added_by, r.resolved_by].forEach(
      (x) => x && personIds.add(x)
    );
    const l = leadById.get(r.original_lead_id);
    if (l) [l.created_by, l.assigned_to].forEach((x: string | null) => x && personIds.add(x));
    const dl = dupLeadById.get(r.duplicate_lead_id);
    if (dl) [dl.created_by, dl.assigned_to].forEach((x: string | null) => x && personIds.add(x));
  }
  const { data: profiles } = personIds.size
    ? await db.from('user_profiles').select('id, full_name, role').in('id', Array.from(personIds))
    : { data: [] };
  const personById = new Map<string, Person>(
    (profiles || []).map((p: any) => [p.id, { id: p.id, name: p.full_name || 'User', role: p.role || '' }])
  );
  const person = (id?: string | null): Person => (id ? personById.get(id) || null : null);

  const items = list.map((r) => {
    const l = leadById.get(r.original_lead_id) || null;
    const dl = r.duplicate_lead_id ? dupLeadById.get(r.duplicate_lead_id) || null : null;
    return {
      id: r.id,
      source: r.source || 'attempt',
      duplicateLead: dl
        ? {
            id: dl.id,
            createdAt: dl.created_at,
            stage: dl.crm_status,
            source: dl.source,
            assignedTo: person(dl.assigned_to || dl.created_by),
            addedBy: person(dl.created_by),
          }
        : null,
      actions: {
        original: countsFor(r.original_lead_id),
        duplicate: dl ? countsFor(dl.id) : null,
      },
      status: r.status,
      createdAt: r.created_at,
      lastAttemptAt: r.last_attempt_at,
      attemptCount: r.attempt_count,
      matchType: r.match_type,
      resolvedAt: r.resolved_at,
      resolvedBy: person(r.resolved_by),
      resolution: r.resolution,
      attemptedBy: person(r.attempted_by),
      originalAddedBy: person(r.original_added_by || l?.created_by),
      firstOwner: person(r.original_owner_id),
      currentOwner: person(l ? l.assigned_to || l.created_by : null),
      existing: l
        ? {
            id: l.id,
            name: l.name,
            phone: l.phone,
            email: l.email,
            source: l.source,
            project: l.project,
            developer: l.developer,
            location: l.location,
            property_type: l.property_type,
            unit: l.unit,
            budget_min: l.budget_min,
            budget_max: l.budget_max,
            notes: l.notes,
            stage: l.crm_status,
            created_at: l.created_at,
          }
        : null,
      submitted: r.attempted_data || {},
    };
  });

  return NextResponse.json({ items, pendingCount: pendingRes?.count ?? 0 });
}

/**
 * POST /api/duplicates
 *   { action: 'merge', id, choices: { name: 'new' | 'existing', ... }, appendNotes?: boolean }
 *   { action: 'separate', id }   keep both as independent leads
 *   { action: 'dismiss', id }
 * All run in resolve_duplicate_lead() (SECURITY DEFINER), which re-checks ownership / role.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const id = String(body?.id || '');
  const action = String(body?.action || '');
  if (!id || !['merge', 'separate', 'dismiss'].includes(action)) {
    return NextResponse.json(
      { error: 'action (merge|separate|dismiss) and id required' },
      { status: 400 }
    );
  }

  const choices: Record<string, string> = {};
  if (body?.choices && typeof body.choices === 'object') {
    for (const [k, v] of Object.entries(body.choices)) {
      if (v === 'new' || v === 'existing') choices[k] = v;
    }
  }

  let { data, error } = await (supabase as any).rpc('resolve_duplicate_lead', {
    p_id: id,
    p_action: action,
    p_choices: choices,
    p_append_notes: body?.appendNotes !== false,
  });

  // Migration 20261028060000 not applied yet: merge / dismiss keep working through the
  // original functions; "separate" needs the new one.
  if (error && /resolve_duplicate_lead|PGRST202|42883/i.test(`${error.code} ${error.message}`)) {
    if (action === 'merge') {
      ({ data, error } = await (supabase as any).rpc('merge_duplicate_lead', {
        p_id: id,
        p_choices: choices,
        p_append_notes: body?.appendNotes !== false,
      }));
    } else if (action === 'dismiss') {
      ({ data, error } = await (supabase as any).rpc('dismiss_duplicate_lead', { p_id: id }));
    }
  }

  if (error) {
    const code = String(error.code || '');
    const status = code === '42501' ? 403 : code === 'P0001' ? 409 : code === 'P0002' ? 404 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ ok: true, result: data });
}
