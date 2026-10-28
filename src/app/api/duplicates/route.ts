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

  const personIds = new Set<string>();
  for (const r of list) {
    [r.attempted_by, r.original_owner_id, r.original_added_by, r.resolved_by].forEach(
      (x) => x && personIds.add(x)
    );
    const l = leadById.get(r.original_lead_id);
    if (l) [l.created_by, l.assigned_to].forEach((x: string | null) => x && personIds.add(x));
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
    return {
      id: r.id,
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
 *   { action: 'dismiss', id }
 * Both run in SECURITY DEFINER functions that re-check ownership / role.
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
  if (!id || !['merge', 'dismiss'].includes(action)) {
    return NextResponse.json({ error: 'action (merge|dismiss) and id required' }, { status: 400 });
  }

  const choices: Record<string, string> = {};
  if (body?.choices && typeof body.choices === 'object') {
    for (const [k, v] of Object.entries(body.choices)) {
      if (v === 'new' || v === 'existing') choices[k] = v;
    }
  }

  const { data, error } =
    action === 'merge'
      ? await (supabase as any).rpc('merge_duplicate_lead', {
          p_id: id,
          p_choices: choices,
          p_append_notes: body?.appendNotes !== false,
        })
      : await (supabase as any).rpc('dismiss_duplicate_lead', { p_id: id });

  if (error) {
    const code = String(error.code || '');
    const status = code === '42501' ? 403 : code === 'P0001' ? 409 : code === 'P0002' ? 404 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ ok: true, result: data });
}
