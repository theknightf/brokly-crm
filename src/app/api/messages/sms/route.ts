import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/messages/sms  { to, name?, message, entity_type?, entity_id? }
 *
 * Sends one SMS through a pluggable generic HTTP gateway when configured
 * (SMS_GATEWAY_URL + optional SMS_GATEWAY_API_KEY / SMS_GATEWAY_FROM). The
 * gateway must accept a JSON POST with { to, message, from?, api_key? }.
 * Every attempt is recorded in message_logs (status sent/failed).
 */
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: actor } = await supabase
    .from('user_profiles')
    .select('is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!actor || actor.is_active === false) {
    return NextResponse.json({ error: 'Account disabled' }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const to = String(body?.to || '').trim();
  const message = String(body?.message || '').trim();
  if (!to || to.length < 7) {
    return NextResponse.json({ error: 'A valid recipient phone is required' }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  // Anti-abuse: the recipient must be a lead the caller is allowed to see.
  // RLS scopes the lead lookup, so an arbitrary phone cannot be targeted.
  const targetPhone = to.replace(/[^0-9]/g, '');
  const { data: accessibleLead } = await supabase
    .from('leads')
    .select('id, name, phone')
    .ilike('phone', `%${targetPhone.slice(-9)}`)
    .limit(1)
    .maybeSingle();
  if (!accessibleLead) {
    return NextResponse.json(
      { error: 'Recipient phone is not associated with a lead you can access' },
      { status: 403 }
    );
  }

  const gatewayUrl = process.env.SMS_GATEWAY_URL;
  const apiKey = process.env.SMS_GATEWAY_API_KEY || '';
  const from = process.env.SMS_GATEWAY_FROM || 'BROKLY';
  const isConfigured = !!gatewayUrl;

  let status = isConfigured ? 'sent' : 'failed';
  let error = '';
  let sentAt: string | null = null;

  if (isConfigured) {
    try {
      const res = await fetch(gatewayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, message, from, api_key: apiKey || undefined }),
      });
      if (!res.ok) {
        throw new Error(`SMS gateway responded ${res.status}`);
      }
      sentAt = new Date().toISOString();
    } catch (err: any) {
      status = 'failed';
      error = String(err?.message || 'SMS gateway send failed');
    }
  } else {
    error = 'SMS gateway not configured (set SMS_GATEWAY_URL / SMS_GATEWAY_API_KEY)';
  }

  const { data, error: dbErr } = await supabase
    .from('message_logs')
    .insert({
      channel: 'sms',
      entity_type: body.entity_type || 'lead',
      entity_id: body.entity_id || '',
      recipient_name: body.name || '',
      recipient_phone: to,
      message,
      status,
      error,
      sent_at: sentAt,
      created_by: user.id,
    })
    .select('*')
    .single();
  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json({
    log: {
      id: data.id,
      channel: data.channel,
      status: data.status,
      error: data.error,
      sentAt: data.sent_at,
    },
  });
}
