import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function isSchemaError(msg?: string): boolean {
  if (!msg) return false;
  return /relation .* does not exist|column .* does not exist|syntax error|could not find the table|in the schema cache|does not exist/i.test(
    msg
  );
}

// ─── haversine distance (meters) between two lat/lng points ────────────────
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function rowsToDurationMillis(checkInAt?: string | null, checkOutAt?: string | null): number | null {
  if (!checkInAt || !checkOutAt) return null;
  const a = new Date(checkInAt).getTime();
  const b = new Date(checkOutAt).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return b - a;
}

// Append an event to the visit timeline + mirror the visit status change.
async function appendEvent(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  visitId: string,
  userId: string,
  action: string,
  detail: string,
  lat?: number | null,
  lng?: number | null
): Promise<boolean> {
  const { error } = await supabase.from('site_visit_events').insert({
    site_visit_id: visitId,
    user_id: userId,
    action,
    detail,
    lat: lat ?? null,
    lng: lng ?? null,
  });
  return !error;
}

// Best-effort audit trail insert (non-fatal).
async function audit(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  entityType: string,
  entityId: string,
  action: string,
  description: string
) {
  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle();
    await supabase.from('audit_log').insert({
      user_id: userId,
      user_name: profile?.full_name || '',
      entity_type: entityType,
      entity_id: entityId,
      action,
      description,
    });
  } catch {
    /* ignore */
  }
}

// POST /api/site-visits
//  - "schedule": schedule a visit for a lead (optional project).
//  - "cancel"   : mark a scheduled visit cancelled.
//  - "noshow"   : mark a scheduled visit no-show.
//  - "checkin"  : start the visit, capture GPS + timestamp, verify location.
//  - "checkout" : end the visit, capture GPS again, compute duration, set
//                 outcome + next action.
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const action = (body.action || 'checkin') as string;
  const {
    project_id,
    project_name,
    lead_id,
    lead_name,
    lead_phone,
    lat,
    lng,
    note,
    outcome,
    next_action,
    scheduled_at,
    visit_type,
    meeting_link,
    platform,
  } = body as {
    project_id?: string | null;
    project_name?: string;
    lead_id?: string | null;
    lead_name?: string;
    lead_phone?: string;
    lat?: number | null;
    lng?: number | null;
    note?: string;
    outcome?: string;
    next_action?: string;
    scheduled_at?: string | null;
    visit_type?: string | null;
    meeting_link?: string | null;
    platform?: string | null;
  };

  const visitType = visit_type || 'In-person';

  const now = new Date().toISOString();
  const latitude = typeof lat === 'number' && !Number.isNaN(lat) ? lat : null;
  const longitude = typeof lng === 'number' && !Number.isNaN(lng) ? lng : null;

  try {
    // ─── SCHEDULE ────────────────────────────────────────────────────────────
    if (action === 'schedule') {
      const { data, error } = await supabase
        .from('site_visits')
        .insert({
          user_id: user.id,
          project_id: project_id || null,
          project_name: project_name || '',
          lead_id: lead_id || null,
          lead_name: lead_name || '',
          lead_phone: lead_phone || '',
          status: 'scheduled',
          scheduled_at: scheduled_at || null,
          visit_type: visitType,
          meeting_link: meeting_link || '',
          platform: platform || '',
          note: note || '',
        })
        .select()
        .single();
      if (error) {
        if (isSchemaError(error?.message)) {
          return NextResponse.json(
            { error: 'Site visits are not set up yet — apply the migrations first' },
            { status: 500 }
          );
        }
        throw error;
      }
      await appendEvent(supabase, data.id, user.id, 'Scheduled', `Visit scheduled for ${lead_name || 'lead'}`);
      await audit(supabase, user.id, 'site_visit', data.id, 'created', `Site visit scheduled for ${lead_name || 'lead'}${project_name ? ` at ${project_name}` : ''}`);
      return NextResponse.json({ visit: data });
    }

    // ─── CANCEL / NO-SHOW ───────────────────────────────────────────────────
    if (action === 'cancel' || action === 'noshow') {
      const visitId = body.id as string | undefined;
      if (!visitId) return NextResponse.json({ error: 'Visit id required' }, { status: 400 });
      const status = action === 'cancel' ? 'cancelled' : 'no_show';
      const { data, error } = await supabase
        .from('site_visits')
        .update({ status })
        .eq('id', visitId)
        .select()
        .single();
      if (error) throw error;
      await appendEvent(supabase, visitId, user.id, action === 'cancel' ? 'Cancelled' : 'No Show', note || '');
      return NextResponse.json({ visit: data });
    }

    // ─── CHECKOUT ───────────────────────────────────────────────────────────
    if (action === 'checkout') {
      const visitId = body.id as string | undefined;
      if (!visitId) return NextResponse.json({ error: 'Visit id required' }, { status: 400 });
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('site_visits')
        .update({
          check_out_at: nowIso,
          check_out_lat: latitude,
          check_out_lng: longitude,
          status: 'completed',
          outcome: outcome || '',
          next_action: next_action || '',
          note: note ?? '',
        })
        .eq('id', visitId)
        .select()
        .single();
      if (error) throw error;

      const { data: withCheckIn } = await supabase
        .from('site_visits')
        .select('check_in_at')
        .eq('id', visitId)
        .single();

      await appendEvent(
        supabase,
        visitId,
        user.id,
        'Check-out',
        `Check-out captured${outcome ? ` — outcome: ${outcome}` : ''}`,
        latitude,
        longitude
      );

      const ms = rowsToDurationMillis((withCheckIn as any)?.check_in_at, data.check_out_at);
      const secs = ms != null ? Math.round(ms / 1000) : null;

      // Best-effort: reflect a completed site visit on the lead + report it.
      if (data.lead_id) {
        await supabase
          .from('leads')
          .update({
            crm_status: outcome === 'Not Interested' ? 'Not Interested' : 'Following Up',
            lead_status: outcome === 'Sold' ? 'Won' : outcome === 'Lost' ? 'Lost' : 'Contacted',
          })
          .eq('id', data.lead_id);
      }
      if (data.lead_id) {
        await supabase.from('call_logs').insert({
          user_id: user.id,
          entity_type: 'lead',
          entity_id: data.lead_id,
          contact_name: data.lead_name || '',
          contact_phone: data.lead_phone || '',
          channel: 'Site Visit',
          direction: 'outgoing',
          duration_seconds: secs || 0,
          outcome: outcome || 'Completed',
          notes: (note || '') + (outcome ? ` Outcome: ${outcome}.` : ''),
        });
      }

      return NextResponse.json({ visit: data, duration_seconds: secs });
    }

    // ─── CHECK-IN ───────────────────────────────────────────────────────────
    let distance: number | null = null;
    let within = false;
    let radius = 300;
    let projectLat: number | null = null;
    let projectLng: number | null = null;

    if (project_id) {
      const { data: project } = await supabase
        .from('projects')
        .select('name, latitude, longitude, radius_m')
        .eq('id', project_id)
        .maybeSingle();
      if (project) {
        radius = project.radius_m ?? 300;
        projectLat = project.latitude;
        projectLng = project.longitude;
      }
    }

    if (latitude != null && longitude != null && projectLat != null && projectLng != null) {
      distance = haversineMeters(latitude, longitude, projectLat, projectLng);
      within = distance <= radius;
    }

    const { data, error } = await supabase
      .from('site_visits')
      .insert({
        user_id: user.id,
        project_id: project_id || null,
        project_name: project_name || '',
        lead_id: lead_id || null,
        lead_name: lead_name || '',
        lead_phone: lead_phone || '',
        status: 'in_progress',
        check_in_at: now,
        check_in_lat: latitude,
        check_in_lng: longitude,
        distance_m: distance,
        verified: within,
        within_radius: within,
        visit_type: visitType,
        meeting_link: meeting_link || '',
        platform: platform || '',
        note: note ?? '',
      })
      .select()
      .single();
    if (error) {
      if (isSchemaError(error?.message)) {
        return NextResponse.json(
          { error: 'Site visits are not set up yet — apply the migrations first' },
          { status: 500 }
        );
      }
      throw error;
    }
    await appendEvent(
      supabase,
      data.id,
      user.id,
      'Check-in',
      `Check-in${within ? ' — verified on-site' : ' — outside allowed radius'}`,
      latitude,
      longitude
    );
    if (data.lead_id) {
      await supabase
        .from('leads')
        .update({ crm_status: 'Meeting', lead_status: 'Site Visit Scheduled' })
        .eq('id', data.lead_id);
    }
    return NextResponse.json({ visit: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/site-visits — list visits with lead + agent + timeline.
// Params: open=1, all=1 (admin), user_id (admin), project_id, lead_id.
export async function GET(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const openOnly = url.searchParams.get('open') === '1';
  const all = url.searchParams.get('all') === '1';
  const userId = url.searchParams.get('user_id');
  const projectId = url.searchParams.get('project_id');
  const leadId = url.searchParams.get('lead_id');
  const status = url.searchParams.get('status');
  const leadSearch = url.searchParams.get('lead_search') === '1';
  const leadQuery = url.searchParams.get('lead_query') || '';

  // Lead lookup for the visit sheet's lead selector (name OR phone partial match).
  if (leadSearch) {
    const q = leadQuery.trim();
    const words = q.replace(/\D/g, '');
    let leadsQuery = supabase.from('leads').select('id, name, phone').order('created_at', { ascending: false }).limit(20);
    if (q.length >= 2) {
      leadsQuery = q.includes('@')
        ? (leadsQuery as any).ilike('email', `%${q}%`)
        : words.length >= 2
          ? (leadsQuery as any).or(`name.ilike.%${q}%,phone.ilike.%${words}%`)
          : (leadsQuery as any).ilike('name', `%${q}%`);
      const { data: found } = await leadsQuery;
      if (found) return NextResponse.json({ leads: found });
      return NextResponse.json({ leads: [] });
    }
    return NextResponse.json({ leads: [] });
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const isAdmin = ['admin', 'owner'].includes(profile?.role || '');

  let scopedUserId = user.id;
  if (isAdmin && userId) scopedUserId = userId;

  let query = supabase
    .from('site_visits')
    .select('*, agent:user_profiles(id, full_name)')
    .order('check_in_at', { ascending: false })
    .limit(200);

  if (all) {
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  } else {
    query = query.eq('user_id', scopedUserId);
  }

  if (openOnly) query = query.is('check_out_at', null);
  if (projectId) query = query.eq('project_id', projectId);
  if (leadId) query = query.eq('lead_id', leadId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    const msg = (error.message || '').toLowerCase();
    if (isSchemaError(msg)) {
      return NextResponse.json({ visits: [], fallback: true });
    }
    return NextResponse.json({ visits: [], error: error.message });
  }

  const visits = (data || []).map((v) => ({
    ...v,
    duration_seconds: rowsToDurationMillis((v as any).check_in_at, (v as any).check_out_at),
    agent_name: (v as any).agent?.full_name || (v as any)?.user?.full_name || '',
  }));
  return NextResponse.json({ visits });
}