import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

function isSchemaError(msg?: string): boolean {
  if (!msg) return false;
  return /relation .* does not exist|column .* does not exist|does not exist/i.test(msg);
}

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: actor } = await supabase.from('user_profiles').select('id, role, is_active').eq('id', user.id).maybeSingle();
  if (!actor || actor.is_active === false || !isAdminRole(actor.role)) return null;
  return actor;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const actor = await requireAdmin(supabase);
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { data, error } = await supabase.from('team_shift_adjustments').select('*').order('date', { ascending: true });
    if (error) {
      if (isSchemaError(error.message)) {
        // fallback to company_settings
        const { data: settings } = await supabase.from('company_settings').select('value').eq('key', 'teamShiftAdjustments').maybeSingle();
        const adjustments = settings?.value ? (Array.isArray(settings.value) ? settings.value : (settings.value as any).adjustments || []) : [];
        return NextResponse.json({ adjustments });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ adjustments: data || [] });
  } catch (e: any) {
    return NextResponse.json({ adjustments: [] });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const actor = await requireAdmin(supabase);
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || !body.teamName || !body.startTime || !body.endTime) {
    return NextResponse.json({ error: 'teamName, startTime, endTime required' }, { status: 400 });
  }

  const payload: any = {
    team_id: body.teamId || null,
    team_name: body.teamName,
    date: body.date || null, // null = permanent
    start_time: body.startTime,
    end_time: body.endTime,
    grace_minutes: Number(body.graceMinutes ?? 20),
    reason: body.reason || '',
    is_temporary: !!body.isTemporary,
    created_by: actor.id,
  };

  if (!/^\d{1,2}:\d{2}$/.test(payload.start_time) || !/^\d{1,2}:\d{2}$/.test(payload.end_time)) {
    return NextResponse.json({ error: 'Invalid time format HH:MM' }, { status: 400 });
  }

  try {
    const { data, error } = await supabase.from('team_shift_adjustments').insert(payload).select('*').single();
    if (error) {
      if (isSchemaError(error.message)) {
        // fallback to company_settings
        const { data: settings } = await supabase.from('company_settings').select('value').eq('key', 'teamShiftAdjustments').maybeSingle();
        const current = settings?.value ? (Array.isArray(settings.value) ? settings.value : []) : [];
        const newAdj = { id: `local_${Date.now()}`, teamId: payload.team_id, teamName: payload.team_name, date: payload.date, startTime: payload.start_time, endTime: payload.end_time, graceMinutes: payload.grace_minutes, reason: payload.reason, isTemporary: payload.is_temporary };
        const next = [...current, newAdj];
        await supabase.from('company_settings').upsert({ key: 'teamShiftAdjustments', value: next, updated_at: new Date().toISOString() });
        return NextResponse.json({ ok: true, adjustment: newAdj, warning: 'Table not migrated — stored in settings' });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, adjustment: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const actor = await requireAdmin(supabase);
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  if (String(id).startsWith('local_')) {
    const { data: settings } = await supabase.from('company_settings').select('value').eq('key', 'teamShiftAdjustments').maybeSingle();
    const current = settings?.value ? (Array.isArray(settings.value) ? settings.value : []) : [];
    const next = current.filter((a: any) => a.id !== id);
    await supabase.from('company_settings').upsert({ key: 'teamShiftAdjustments', value: next, updated_at: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.from('team_shift_adjustments').delete().eq('id', id);
  if (error && !isSchemaError(error.message)) return NextResponse.json({ error: error.message }, { status: 500 });
  if (error && isSchemaError(error.message)) {
    const { data: settings } = await supabase.from('company_settings').select('value').eq('key', 'teamShiftAdjustments').maybeSingle();
    const current = settings?.value ? (Array.isArray(settings.value) ? settings.value : []) : [];
    const next = current.filter((a: any) => a.id !== id);
    await supabase.from('company_settings').upsert({ key: 'teamShiftAdjustments', value: next, updated_at: new Date().toISOString() });
  }
  return NextResponse.json({ ok: true });
}
