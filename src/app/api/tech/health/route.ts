import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth';
import { isTechRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

const COUNTED_TABLES = [
  'user_profiles',
  'leads',
  'follow_ups',
  'teams',
  'team_members',
  'call_logs',
  'site_visits',
  'attendance',
  'leave_requests',
  'expenses',
  'tasks',
  'kpi_targets',
  'projects',
  'units',
  'developers',
  'activity_log',
  'message_logs',
];

const EXPECTED_TABLES = [
  'user_profiles',
  'user_sessions',
  'user_activity_log',
  'user_daily_activity',
  'leads',
  'follow_ups',
  'lead_comments',
  'teams',
  'team_members',
  'call_logs',
  'site_visits',
  'attendance',
  'leave_requests',
  'payroll_periods',
  'payroll_entries',
  'expenses',
  'tasks',
  'task_completions',
  'kpi_targets',
  'admin_settings',
  'push_subscriptions',
];

const EXPECTED_USER_PROFILE_COLUMNS = [
  'id',
  'email',
  'full_name',
  'role',
  'is_active',
  'team_id',
  'agent_code',
  'admin_id',
  'base_salary',
  'hire_date',
  'employment_status',
];

async function countTable(client: any, table: string): Promise<number | null> {
  try {
    const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export async function GET() {
  const supabase = await createServerClient();
  const guard = await requireAuth(supabase);
  if (!guard.ok) return guard.response;

  const role = String(guard.actor.role || '');
  if (!isTechRole(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const report: Record<string, any> = {
    ok: true,
    timestamp: new Date().toISOString(),
    actor: { id: guard.actor.id, email: guard.actor.email, role },
    env: {
      supabaseUrlConfigured: Boolean(serviceUrl),
      supabaseHost: serviceUrl ? safeHost(serviceUrl) : null,
      serviceRoleKeyConfigured:
        Boolean(serviceRoleKey) && !serviceRoleKey!.startsWith('replace-with-'),
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL || null,
    },
    db: { connected: false, latencyMs: null },
    counts: {} as Record<string, number | null>,
    sessions: { active: null, staleClosedToday: null },
    schema: { missingTables: [] as string[], missingColumns: [] as string[] },
  };

  if (!serviceUrl || !serviceRoleKey || serviceRoleKey.startsWith('replace-with-')) {
    (report as any).ok = false;
    report.db.error = 'Service-role credentials are not configured on the server.';
    return NextResponse.json(report);
  }

  const serviceClient = createServiceClient(serviceUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Connectivity + latency
  const started = Date.now();
  try {
    const { error } = await serviceClient.from('user_profiles').select('id').limit(1);
    report.db.latencyMs = Date.now() - started;
    report.db.connected = !error;
    if (error) report.db.error = error.message;
  } catch (err: any) {
    report.db.latencyMs = Date.now() - started;
    report.db.connected = false;
    report.db.error = err?.message || 'Unknown database error';
  }

  // Row counts (null = table missing/unreadable)
  await Promise.all(
    COUNTED_TABLES.map(async (t) => {
      report.counts[t] = await countTable(serviceClient, t);
    })
  );

  // Active sessions
  try {
    const { count, error } = await serviceClient
      .from('user_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);
    report.sessions.active = error ? null : (count ?? 0);
  } catch {
    report.sessions.active = null;
  }

  // Schema checks: verify expected columns exist on user_profiles
  try {
    const { data: cols, error: colsErr } = await serviceClient
      .from('user_profiles')
      .select('*')
      .limit(1);
    if (!colsErr && cols && cols.length > 0) {
      const actual = Object.keys(cols[0]);
      report.schema.missingColumns = EXPECTED_USER_PROFILE_COLUMNS.filter(
        (c) => !actual.includes(c)
      );
    } else {
      report.schema.missingColumns = [];
    }
  } catch {
    report.schema.missingColumns = [];
  }

  // Expected tables presence
  const missingTables: string[] = [];
  await Promise.all(
    EXPECTED_TABLES.map(async (t) => {
      try {
        const { error } = await serviceClient.from(t).select('*', { head: true }).limit(0);
        if (error && /does not exist|not found/i.test(error.message)) missingTables.push(t);
      } catch {
        /* network errors handled by db section */
      }
    })
  );
  report.schema.missingTables = missingTables;

  (report as any).ok = report.db.connected && missingTables.length === 0;
  return NextResponse.json(report);
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
