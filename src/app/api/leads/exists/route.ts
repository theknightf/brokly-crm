import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leads/exists  { phone?: string, email?: string }  ->  { exists: boolean }
 *
 * Read-only probe behind the Add Lead "already exists" hint. Records nothing and
 * never reveals the original lead or its owner. Fails open ({exists:false}) so a
 * missing DB function can never block adding a lead.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const phone = String(body?.phone || '').slice(0, 50);
  const email = String(body?.email || '').slice(0, 200);
  if (!phone && !email) return NextResponse.json({ exists: false });

  const { data, error } = await (supabase as any).rpc('lead_exists', {
    p_phone: phone,
    p_email: email,
  });
  if (error) return NextResponse.json({ exists: false });
  return NextResponse.json({ exists: data === true });
}
