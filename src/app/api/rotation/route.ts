import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/rotation            → { enabled } from admin_settings
 * POST /api/rotation {enabled}  → owner/admin toggles lead auto-rotation
 *
 * The client-side rotation logic (leadsService.create/bulkInsert) reads this
 * state; the toggle itself lives in admin_settings (category "rotation").
 */
export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('*')
      .eq('category', 'rotation');
    if (error) throw error;
    const item = (data || []).find((r: any) => r.name === 'rotation_enabled');
    return NextResponse.json({ enabled: !!item?.is_active });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to read rotation state' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: actor } = await supabase
    .from('user_profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!actor || actor.is_active === false || !isAdminRole(actor.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const enabled = !!body?.enabled;

  try {
    const { data: existing } = await supabase
      .from('admin_settings')
      .select('*')
      .eq('category', 'rotation')
      .eq('name', 'rotation_enabled');
    let error: any = null;
    if (existing && existing.length > 0) {
      ({ error } = await supabase
        .from('admin_settings')
        .update({ is_active: enabled })
        .eq('id', existing[0].id));
    } else {
      ({ error } = await supabase.from('admin_settings').insert({
        category: 'rotation',
        name: 'rotation_enabled',
        sort_order: 0,
        is_active: enabled,
      }));
    }
    if (error) throw error;
    return NextResponse.json({ enabled });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to save rotation state' }, { status: 500 });
  }
}
