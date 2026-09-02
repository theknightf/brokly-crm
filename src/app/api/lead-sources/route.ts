import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

// GET /api/lead-sources?active=true — list active sources (authenticated)
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const activeOnly = url.searchParams.get('active') !== 'false';
  let q = supabase.from('lead_sources').select('id, name, is_active, created_at').order('name');
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ sources: data || [] });
}

// POST /api/lead-sources — create (Admin/Owner only)
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: actor } = await supabase.from('user_profiles').select('role, is_active').eq('id', user.id).maybeSingle();
  if (!actor || actor.is_active === false || !isAdminRole(actor.role)) return NextResponse.json({ error: 'Forbidden: Admin/Owner only' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const name = String(body?.name || '').trim();
  if (!name || name.length < 2) return NextResponse.json({ error: 'Name required (min 2 chars)' }, { status: 400 });
  if (name.length > 80) return NextResponse.json({ error: 'Name too long' }, { status: 400 });

  // unique case-insensitive
  const { data: exists } = await supabase.from('lead_sources').select('id').ilike('name', name).maybeSingle();
  if (exists) return NextResponse.json({ error: 'Source already exists' }, { status: 409 });

  const { data, error } = await supabase.from('lead_sources').insert({ name, is_active: true }).select('id, name, is_active').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ source: data }, { status: 201 });
}
