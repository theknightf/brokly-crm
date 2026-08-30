import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leads/rotate
 * Spec: Trigger data rotation — 1-click round-robin distribution of unassigned/untouched leads
 * Body: { leadIds?: string[], strategy?: 'round_robin'|'least_recent', dryRun?: boolean }
 * - If leadIds omitted: selects all leads where assigned_to IS NULL and stage not terminal
 * - Distributes round-robin to eligible sales agents (active, non-owner/admin)
 * - Records rotation_log rows + notifies assignees via activity_log
 */

async function requireAdmin(db: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: actor } = await db.from('user_profiles').select('id, role, is_active').eq('id', user.id).maybeSingle();
  if (!actor || actor.is_active === false || !isAdminRole(actor.role)) return null;
  return actor as { id: string; role: string };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const actor = await requireAdmin(supabase);
  if (!actor) return NextResponse.json({ error: 'Forbidden: Admin/Owner only' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const dryRun = !!body.dryRun;
  const strategy = (body.strategy || 'round_robin') as string;
  let leadIds: string[] = Array.isArray(body.leadIds) ? body.leadIds.filter((x: unknown) => typeof x === 'string') : [];
  let leadIdsProvided = leadIds.length > 0;

  try {
    // Eligible agents (active, non-admin/owner) — sales reps eligible for assignment
    const { data: users } = await supabase
      .from('user_profiles')
      .select('id, full_name, email, role')
      .eq('is_active', true)
      .not('role', 'in', '("admin","owner")');
    const agents = (users || []).map((u: any) => ({ id: u.id, name: u.full_name || u.email || u.id }));
    if (!agents.length) return NextResponse.json({ error: 'No eligible sales agents for rotation' }, { status: 400 });

    // Resolve lead set
    let leads: any[] = [];
    if (leadIdsProvided) {
      const { data, error } = await supabase.from('leads').select('id, name, assigned_to, crm_status').in('id', leadIds);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      leads = data || [];
    } else {
      // Auto-select unassigned / untouched leads (spec: unassigned/untouched)
      const { data, error } = await supabase
        .from('leads')
        .select('id, name, assigned_to, crm_status, created_at')
        .is('assigned_to', null)
        .not('crm_status', 'in', '("Done Deal","Not Interested","Cancellation","Archived","Duplicate Leads")')
        .order('created_at', { ascending: true })
        .limit(500);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      leads = data || [];
      leadIds = leads.map((l: any) => l.id);
    }

    if (!leads.length) return NextResponse.json({ rotated: 0, message: 'No leads to rotate', dryRun, totalAgents: agents.length });

    // Ordering: round-robin uses least-recently-assigned heuristic (like rotation/run)
    let ordered = [...agents];
    if (strategy === 'round_robin' || strategy === 'least_recent') {
      try {
        const { data: recent } = await supabase
          .from('leads')
          .select('assigned_to, updated_at')
          .in('assigned_to', agents.map(a => a.id))
          .order('updated_at', { ascending: false })
          .limit(agents.length * 5);
        const countMap = new Map<string, number>();
        for (const r of (recent || [])) {
          countMap.set(r.assigned_to, (countMap.get(r.assigned_to) || 0) + 1);
        }
        ordered = [...agents].sort((a, b) => (countMap.get(a.id) ?? 0) - (countMap.get(b.id) ?? 0));
      } catch {}
    } else {
      // shuffle fallback for pure round_robin without history
    }

    // Build assignments
    const assignments: { lead_id: string; lead_name: string; assigned_to: string; assigned_name: string }[] = [];
    let pointer = 0;
    for (const lead of leads) {
      // Avoid re-assigning to same user if already assigned (edge case when leadIds provided includes assigned leads)
      let target = ordered[pointer % ordered.length];
      if ((lead as any).assigned_to && ordered.length > 1) {
        // ensure not same as current
        let tries = 0;
        while (target.id === (lead as any).assigned_to && tries < ordered.length) {
          pointer++;
          target = ordered[pointer % ordered.length];
          tries++;
        }
      }
      assignments.push({ lead_id: lead.id, lead_name: (lead as any).name || '', assigned_to: target.id, assigned_name: target.name });
      pointer++;
    }

    if (dryRun) {
      return NextResponse.json({ rotated: assignments.length, dryRun: true, assignments, totalAgents: agents.length, leadIds });
    }

    // Execute rotation — try RPC for atomicity, fallback to逐一 update
    let rotated = 0;
    const errors: string[] = [];
    try {
      // Try bulk_assign_round_robin RPC if available
      const { data: rpcData, error: rpcErr } = await (supabase as any).rpc('bulk_assign_round_robin', {
        p_lead_ids: leadIds,
        p_user_ids: ordered.map(a => a.id),
      });
      if (!rpcErr && Array.isArray(rpcData)) {
        rotated = rpcData.length;
      } else if (rpcErr) {
        throw rpcErr;
      }
    } catch {
      // Fallback: individual updates
      for (const a of assignments) {
        const { error } = await supabase.from('leads').update({
          assigned_to: a.assigned_to,
          agent: a.assigned_name,
          agent_initials: a.assigned_name.split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase(),
          last_activity_at: new Date().toISOString(),
        }).eq('id', a.lead_id);
        if (!error) rotated++;
        else errors.push(`${a.lead_id}: ${error.message}`);
      }
    }

    // Log + notify (best-effort)
    try {
      const logRows = assignments.slice(0, rotated).map(a => ({
        lead_id: a.lead_id,
        from_user_id: (leads.find((l: any) => l.id === a.lead_id) as any)?.assigned_to || null,
        to_user_id: a.assigned_to,
        reason: 'manual_rotate',
        detail: '1-click rotation via /api/leads/rotate',
      }));
      if (logRows.length) await supabase.from('lead_rotation_log').insert(logRows);
      // activity_log notify per assignee
      const notifRows: any[] = [];
      for (const a of assignments.slice(0, rotated)) {
        notifRows.push({ user_id: a.assigned_to, action_type: 'Lead Rotated To You', entity_type: 'lead', entity_id: a.lead_id, detail: a.lead_name || 'A lead' });
      }
      if (notifRows.length) await supabase.from('activity_log').insert(notifRows);
    } catch {}

    return NextResponse.json({ rotated, totalRequested: leadIds.length, totalAgents: agents.length, message: `${rotated} lead(s) rotated`, assignments: assignments.slice(0, rotated) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to rotate' }, { status: 500 });
  }
}

// GET /api/leads/rotate — expose current rotation state (enabled + pending unassigned count)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { data: settings } = await supabase.from('admin_settings').select('*').eq('category', 'rotation');
    const enabled = !!(settings || []).find((s: any) => s.name === 'rotation_enabled')?.is_active;
    const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true }).is('assigned_to', null);
    return NextResponse.json({ enabled, pendingUnassigned: count ?? 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
