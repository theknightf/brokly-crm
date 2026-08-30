import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // Proxy to canonical profile-360 for spec compatibility: GET /api/owner/employee-360/:id
  const url = new URL(request.url);
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  const target = new URL(`/api/employees/${id}/profile-360${from || to ? `?from=${from}&to=${to}` : ''}`, request.url);
  const res = await fetch(target.toString(), { headers: { cookie: request.headers.get('cookie') || '' }, cache: 'no-store' });
  const j = await res.json();
  if (!res.ok) return NextResponse.json(j, { status: res.status });
  // Enrich with deductions + notifications for Owner 360 spec
  try {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();
    const { data: deductions } = await (supabase as any).from('payroll_deductions').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(50);
    const { data: notifs } = await (supabase as any).from('notifications').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(50);
    const gross = j.employee ? null : null;
    // Fetch base_salary for payout calc
    const { data: profile } = await (supabase as any).from('user_profiles').select('base_salary').eq('id', id).maybeSingle();
    const baseSalary = Number(profile?.base_salary || 0);
    const totalDeductions = (deductions || []).reduce((s: number, d: any) => s + Number(d.amount || 0), 0);
    return NextResponse.json({ ...j, deductions: deductions || [], notifications: notifs || [], payroll: { baseSalary, totalDeductions, netPayout: Math.max(0, baseSalary - totalDeductions) } });
  } catch {
    return NextResponse.json(j);
  }
}
