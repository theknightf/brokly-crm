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

// POST /api/site-visits — start ("checkin") or end ("checkout") a site visit.
// The client sends its GPS position; if the project has coordinates we compute
// the distance and mark the visit verified when within the project radius.
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

  const action = body.action === 'checkout' ? 'checkout' : 'checkin';
  const { project_id, project_name, lat, lng, note } = body as {
    project_id?: string;
    project_name?: string;
    lat?: number | null;
    lng?: number | null;
    note?: string;
  };

  const now = new Date().toISOString();
  const latitude = typeof lat === 'number' && !Number.isNaN(lat) ? lat : null;
  const longitude = typeof lng === 'number' && !Number.isNaN(lng) ? lng : null;

  try {
    // CHECK-OUT — close the most recent open visit for this user+project.
    if (action === 'checkout') {
      const { data: open, error: openErr } = await supabase
        .from('site_visits')
        .select('id')
        .eq('user_id', user.id)
        .eq('project_id', project_id || null)
        .is('check_out_at', null)
        .order('check_in_at', { ascending: false })
        .limit(1);
      if (openErr) throw openErr;
      const target = open?.[0];
      if (!target) {
        return NextResponse.json({ error: 'No open site visit' }, { status: 404 });
      }
      const { data, error } = await supabase
        .from('site_visits')
        .update({
          check_out_at: now,
          check_out_lat: latitude,
          check_out_lng: longitude,
          note: note ?? '',
        })
        .eq('id', target.id)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ visit: data });
    }

    // CHECK-IN — verify against the project coordinates when available.
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

    if (
      latitude != null &&
      longitude != null &&
      projectLat != null &&
      projectLng != null
    ) {
      distance = haversineMeters(latitude, longitude, projectLat, projectLng);
      within = distance <= radius;
    }

    const { data, error } = await supabase
      .from('site_visits')
      .insert({
        user_id: user.id,
        project_id: project_id || null,
        project_name: project_name || '',
        check_in_at: now,
        check_in_lat: latitude,
        check_in_lng: longitude,
        distance_m: distance,
        verified: within,
        within_radius: within,
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
    return NextResponse.json({ visit: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/site-visits?user_id=&open_only=1 — list site visits. Non-admins see
// their own only; admins may pass ?user_id to see a specific agent.
export async function GET(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const openOnly = url.searchParams.get('open') === '1';
  const userId = url.searchParams.get('user_id');
  const projectId = url.searchParams.get('project_id');

  // Only admins/owners can read someone else's visits.
  let scopedUserId = user.id;
  if (userId && userId !== user.id) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (['admin', 'owner'].includes(profile?.role || '')) scopedUserId = userId;
  }

  let query = supabase
    .from('site_visits')
    .select('*, agent:user_profiles(id, full_name)')
    .eq('user_id', scopedUserId)
    .order('check_in_at', { ascending: false })
    .limit(200);

  if (openOnly) query = query.is('check_out_at', null);
  if (projectId) query = query.eq('project_id', projectId);

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
    agent_name: (v as any).user?.full_name || '',
  }));
  return NextResponse.json({ visits });
}