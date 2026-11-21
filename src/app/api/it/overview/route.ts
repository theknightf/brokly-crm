import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth';
import { canUseItConsole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

/**
 * GET /api/it/overview — everything IT needs to keep the system healthy, in one request:
 * accounts (with online / last seen / device), failed imports, recent changes, and a database ping.
 * Read through the service key AFTER checking the caller is IT or the owner; IT gets no lead data.
 */
export async function GET() {
  const guard = await requireAuth(await createClient());
  if (!guard.ok) return guard.response;
  if (!canUseItConsole(guard.actor.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Server is missing the service key.' }, { status: 500 });
  const db: any = createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const t0 = Date.now();
  const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
  const since24h = new Date(Date.now() - 86400000).toISOString();

  const [profilesRes, sessionsRes, importsRes, auditRes, dupRes] = await Promise.all([
    db.from('user_profiles').select('id, full_name, email, role, is_active, created_at').order('full_name').limit(1000),
    db.from('user_sessions').select('user_id, login_at, last_heartbeat_at, ip_address, user_agent, is_active').gte('login_at', since7d).order('login_at', { ascending: false }).limit(3000),
    db.from('import_logs').select('id, original_file_name, uploaded_by_name, status, total_rows, imported_count, error_count, summary, created_at').gte('created_at', since7d).order('created_at', { ascending: false }).limit(60),
    db.from('audit_log').select('id, user_name, entity_type, action, description, created_at').order('created_at', { ascending: false }).limit(40),
    db.from('duplicate_leads').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  const dbMs = Date.now() - t0;

  const profiles = (profilesRes.data || []) as any[];
  const lastSession = new Map<string, any>();
  for (const s of (sessionsRes.data || []) as any[]) {
    const prev = lastSession.get(s.user_id);
    const seen = s.last_heartbeat_at || s.login_at;
    if (!prev || (seen && seen > (prev.last_heartbeat_at || prev.login_at))) lastSession.set(s.user_id, s);
  }
  const onlineCutoff = Date.now() - 5 * 60 * 1000;
  const users = profiles.map((p) => {
    const s = lastSession.get(p.id);
    const seen = s ? s.last_heartbeat_at || s.login_at : null;
    return {
      id: p.id,
      name: p.full_name || p.email || 'User',
      email: p.email,
      role: p.role,
      active: p.is_active !== false,
      lastSeen: seen,
      online: !!seen && Date.parse(seen) >= onlineCutoff && p.is_active !== false,
      ip: s?.ip_address || null,
      device: s?.user_agent || null,
    };
  });

  const imports = (importsRes.data || []) as any[];
  const failedImports = imports.filter((i) => i.status === 'Failed' || i.status === 'Partially Imported' || Number(i.error_count || 0) > 0);

  return NextResponse.json({
    health: {
      dbOk: !profilesRes.error,
      dbMs,
      usersTotal: users.length,
      usersActive: users.filter((u) => u.active).length,
      usersDisabled: users.filter((u) => !u.active).length,
      usersOnline: users.filter((u) => u.online).length,
      importsFailed7d: failedImports.length,
      importsFailed24h: failedImports.filter((i) => i.created_at >= since24h).length,
      duplicatesPending: dupRes.count ?? 0,
    },
    users,
    failedImports: failedImports.slice(0, 15),
    audit: auditRes.data || [],
    me: guard.actor.id,
  });
}
