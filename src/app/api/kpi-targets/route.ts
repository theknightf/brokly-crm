import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const METRICS = [
  'daily_calls',
  'daily_followups',
  'daily_meetings',
  'leads_worked',
  'deals',
  'revenue',
];

/** GET /api/kpi-targets → list KPI targets */
export async function GET() {
  const db = await createClient();
  const auth = await requireAdmin(db);
  if (!auth.ok) return auth.response;
  try {
    const { data, error } = await db
      .from('kpi_targets')
      .select('*')
      .order('period_type')
      .order('metric');
    if (error) throw error;
    return NextResponse.json({ targets: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to load KPI targets' },
      { status: 500 }
    );
  }
}

/** POST /api/kpi-targets → create or update a target (id present = update) */
export async function POST(request: Request) {
  const db = await createClient();
  const auth = await requireAdmin(db);
  if (!auth.ok) return auth.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!METRICS.includes(body?.metric)) {
    return NextResponse.json({ error: 'Unknown metric' }, { status: 400 });
  }

  const row: any = {
    metric: body.metric,
    label: body.label || body.metric,
    target_value: Number(body.targetValue ?? 0),
    period_type: body.periodType || 'day',
    target_role: body.targetRole || 'all',
    is_active: body.isActive !== false,
  };

  try {
    if (body.id) {
      const { error } = await db.from('kpi_targets').update(row).eq('id', body.id);
      if (error) throw error;
    } else {
      const { error } = await db.from('kpi_targets').insert(row);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to save KPI target' },
      { status: 500 }
    );
  }
}

/** DELETE /api/kpi-targets?id=… → remove a target */
export async function DELETE(request: Request) {
  const db = await createClient();
  const auth = await requireAdmin(db);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  try {
    const { error } = await db.from('kpi_targets').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to delete KPI target' },
      { status: 500 }
    );
  }
}
