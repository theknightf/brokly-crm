import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: actor } = await supabase
    .from('user_profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  return actor && actor.is_active !== false && isAdminRole(actor.role)
    ? { role: actor.role, id: user.id }
    : null;
}

function normalizeAmount(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function toDate(value: unknown): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date().toISOString().slice(0, 10);
}

// GET /api/expenses?from=YYYY-MM-DD&to=YYYY-MM-DD&category=Electricity
export async function GET(request: Request) {
  const supabase = await createClient();
  const actor = await requireAdmin(supabase);
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  const category = url.searchParams.get('category') || '';

  let query = supabase
    .from('expenses')
    .select('*')
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gte('expense_date', from);
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) query = query.lte('expense_date', to);
  if (category && category !== 'All') query = query.eq('category', category);

  const { data, error } = await query;
  if (error) {
    const msg = (error.message || '').toLowerCase();
    const missing =
      msg.includes('does not exist') ||
      msg.includes('could not find') ||
      msg.includes('schema cache');
    if (missing) {
      return NextResponse.json({ expenses: [], from, to, notInitialized: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const expenses = (data || []).map((r: any) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    amount: Number(r.amount),
    expense_date: r.expense_date,
    notes: r.notes,
    created_at: r.created_at,
    created_by: r.created_by,
  }));

  return NextResponse.json({ expenses, from, to });
}

// POST /api/expenses — create a new expense
export async function POST(request: Request) {
  const supabase = await createClient();
  const actor = await requireAdmin(supabase);
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : '';
  const category =
    typeof body.category === 'string' && body.category.trim() ? body.category.trim() : 'Other';
  const amount = normalizeAmount(body.amount);

  if (!title && !amount) {
    return NextResponse.json({ error: 'Title or amount is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('expenses')
    .insert({
      title,
      category,
      amount,
      expense_date: toDate(body.expense_date),
      notes: typeof body.notes === 'string' ? body.notes : '',
      created_by: actor.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message.includes('does not exist') ? 'Expenses are not initialized yet' : error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      expense: {
        id: data.id,
        title: data.title,
        category: data.category,
        amount: Number(data.amount),
        expense_date: data.expense_date,
        notes: data.notes,
        created_at: data.created_at,
      },
    },
    { status: 201 }
  );
}