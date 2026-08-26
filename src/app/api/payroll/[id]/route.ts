import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/payroll/[id] → update a payroll entry (bonus, commission,
 *   reimbursement, other deductions, notes, status).
 * DELETE /api/payroll/[id] → delete a draft entry.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient();
  const auth = await requireAdmin(db);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const row: any = {};
  const map = {
    baseSalary: 'base_salary',
    bonus: 'bonus',
    commission: 'commission',
    expenseReimbursement: 'expense_reimbursement',
    otherDeductions: 'other_deductions',
    notes: 'notes',
    status: 'status',
  } as const;
  for (const [k, col] of Object.entries(map)) {
    if (body[k] !== undefined) row[col] = body[k];
  }
  if (!Object.keys(row).length) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  try {
    const { error } = await db.from('payroll_entries').update(row).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to update entry' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient();
  const auth = await requireAdmin(db);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const { error } = await db.from('payroll_entries').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to delete entry' }, { status: 500 });
  }
}
