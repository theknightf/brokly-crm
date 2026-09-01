import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

async function requireAdmin(db: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: actor } = await db.from('user_profiles').select('id, role, is_active').eq('id', user.id).maybeSingle();
  if (!actor || actor.is_active === false || !isAdminRole(actor.role)) return null;
  return actor as { id: string; role: string };
}

// POST /api/evaluations/dress-code - Admin submits daily dress code rating
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const actor = await requireAdmin(supabase);
    if (!actor) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

    const employeeId = String(body.employeeId || body.employee_id || body.userId || '').trim();
    const date = String(body.date || new Date().toISOString().slice(0, 10)).trim();
    const rating = Number(body.dressCodeRating ?? body.dress_code_rating ?? body.rating);
    const notes = String(body.notes || '').trim().slice(0, 1000);
    const flags = Array.isArray(body.behavioralFlags) ? body.behavioralFlags : Array.isArray(body.behavioral_flags) ? body.behavioral_flags : [];

    if (!employeeId) return NextResponse.json({ error: 'employeeId required' }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    if (!Number.isInteger(rating) || rating < 1 || rating > 3) return NextResponse.json({ error: 'dressCodeRating must be 1-3 (1=Casual, 2=Semi-Formal, 3=Classic/Formal)' }, { status: 400 });

    // Verify employee exists
    const { data: emp } = await (supabase as any).from('user_profiles').select('id').eq('id', employeeId).maybeSingle();
    if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const cleanFlags = flags.map((f: unknown) => String(f).trim()).filter(Boolean).slice(0, 10);

    const { data, error } = await (supabase as any).from('evaluations').upsert({
      employee_id: employeeId,
      evaluator_id: actor.id,
      date,
      dress_code_rating: rating,
      notes,
      behavioral_flags: cleanFlags,
    }, { onConflict: 'employee_id,date,evaluator_id' }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ evaluation: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/evaluations/dress-code?employeeId=&from=&to=
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const employeeId = url.searchParams.get('employeeId') || url.searchParams.get('employee_id');
    const from = url.searchParams.get('from') || '2024-01-01';
    const to = url.searchParams.get('to') || new Date().toISOString().slice(0, 10);

    let q = (supabase as any).from('evaluations').select('*, employee:user_profiles!evaluations_employee_id_fkey(full_name,email), evaluator:user_profiles!evaluations_evaluator_id_fkey(full_name)').gte('date', from).lte('date', to).order('date', { ascending: false }).limit(500);
    if (employeeId) q = q.eq('employee_id', employeeId);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ evaluations: data || [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
