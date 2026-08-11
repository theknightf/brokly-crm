import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';

/**
 * POST /api/messages/email  { to, name?, subject, html }
 *
 * Sends one personalized email through SMTP when configured
 * (SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM env vars) and
 * records the attempt in message_logs. When SMTP is not configured the log
 * row is still written with status "failed" and a clear error, so bulk flows
 * never crash and admins can see why nothing was delivered.
 */
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const to = String(body?.to || '').trim();
  const subject = String(body?.subject || '').trim();
  const html = String(body?.html || '');
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: 'A valid recipient email is required' }, { status: 400 });
  }
  if (!subject || !html) {
    return NextResponse.json({ error: 'subject and html are required' }, { status: 400 });
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || smtpUser || 'noreply@brokly.app';
  const isConfigured = !!host;

  let status = isConfigured ? 'sent' : 'failed';
  let error = '';
  let sentAt: string | null = null;

  if (isConfigured) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
      });
      await transporter.sendMail({
        from,
        to,
        subject,
        html,
      });
      sentAt = new Date().toISOString();
    } catch (err: any) {
      status = 'failed';
      error = String(err?.message || 'SMTP send failed');
    }
  } else {
    error = 'SMTP not configured (set SMTP_HOST / SMTP_USER / SMTP_PASS / SMTP_FROM)';
  }

  const { data, error: dbErr } = await supabase
    .from('message_logs')
    .insert({
      channel: 'email',
      entity_type: body.entity_type || 'lead',
      entity_id: body.entity_id || '',
      recipient_name: body.name || '',
      recipient_email: to,
      subject,
      message: html,
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
