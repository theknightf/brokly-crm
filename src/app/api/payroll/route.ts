import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** GET /api/payroll?periodId=… → payroll periods + entries for one period */
export async function GET(request: Request) {
  const db = await createClient();
  const auth = await requireAdmin(db);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const periodId = url.searchParams.get('periodId');

  try {
    const periodsQuery = db
      .from('payroll_periods')
      .select('*')
      .order('period_start', { ascending: false });
    const { data: periods, error: periodsError } = await periodsQuery;
    if (periodsError) throw periodsError;

    let entries: any[] = [];
    if (periodId) {
      const { data: rows, error } = await db
        .from('payroll_entries')
        .select('*, user_name:user_profiles!payroll_entries_user_id_fkey(full_name)')
        .eq('period_id', periodId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      entries = (rows || []).map((r: any) => ({
        ...r,
        user_name: r.user_name?.[0]?.full_name || '',
      }));
    }

    return NextResponse.json({ periods: periods || [], entries });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load payroll' }, { status: 500 });
  }
}

/** POST /api/payroll { periodStart, periodEnd } → create a draft period */
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
  if (!body.periodStart || !body.periodEnd) {
    return NextResponse.json({ error: 'periodStart and periodEnd are required' }, { status: 400 });
  }

  try {
    const { data, error } = await db
      .from('payroll_periods')
      .insert({ period_start: body.periodStart, period_end: body.periodEnd, status: 'draft' })
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ period: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to create period' }, { status: 500 });
  }
}
