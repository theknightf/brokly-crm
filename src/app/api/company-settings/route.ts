import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** GET /api/company-settings → all company settings (key → value) */
export async function GET() {
  const db = await createClient();
  const auth = await requireAdmin(db);
  if (!auth.ok) return auth.response;
  try {
    const { data, error } = await db.from('company_settings').select('key, value');
    if (error) throw error;
    const out: Record<string, any> = {};
    (data || []).forEach((r: any) => (out[r.key] = r.value));
    return NextResponse.json({ settings: out });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load settings' }, { status: 500 });
  }
}

/** POST /api/company-settings { key, value } → upsert one setting */
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
  if (!body?.key) return NextResponse.json({ error: 'key is required' }, { status: 400 });

  try {
    const { error } = await db
      .from('company_settings')
      .upsert({ key: body.key, value: body.value ?? {}, updated_by: auth.actor.id, updated_at: new Date().toISOString() });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to save setting' }, { status: 500 });
  }
}
