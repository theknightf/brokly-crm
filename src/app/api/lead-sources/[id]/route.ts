import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

// PATCH /api/lead-sources/:id — update name or toggle is_active (Admin/Owner)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: actor } = await supabase.from('user_profiles').select('role, is_active').eq('id', user.id).maybeSingle();
  if (!actor || actor.is_active === false || !isAdminRole(actor.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(()=>null);
  const updates: Record<string, any> = {};
  if (body?.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length < 2) return NextResponse.json({ error: 'Name required' }, { status: 400 });
    updates.name = name;
  }
  if (body?.is_active !== undefined) updates.is_active = !!body.is_active;

  if (Object.keys(updates).length===0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

  // Renaming goes through rename_lead_source(): it checks the name is free, renames the source AND the leads that carry it
  // (so filters keep matching), without touching their updated_at or the activity log.
  if (updates.name) {
    const { error: renameError } = await supabase.rpc('rename_lead_source', { p_id: id, p_name: updates.name });
    if (renameError) {
      const exists = /already exists/i.test(renameError.message);
      return NextResponse.json({ error: exists ? 'Source name already exists' : renameError.message }, { status: exists ? 409 : 400 });
    }
    delete updates.name;
  }
  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await supabase.from('lead_sources').update(updates).eq('id', id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  const { data, error } = await supabase.from('lead_sources').select('id, name, is_active').eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ source: data });
}

// DELETE /api/lead-sources/:id — soft delete via is_active=false or hard delete if no leads reference
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: actor } = await supabase.from('user_profiles').select('role, is_active').eq('id', user.id).maybeSingle();
  if (!actor || actor.is_active === false || !isAdminRole(actor.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  // If leads reference it, soft-disable instead of delete
  const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true }).eq('lead_source_id', id);
  if ((count||0) > 0) {
    const { error } = await supabase.from('lead_sources').update({ is_active: false }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ softDeleted: true });
  }
  const { error } = await supabase.from('lead_sources').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ deleted: true });
}
