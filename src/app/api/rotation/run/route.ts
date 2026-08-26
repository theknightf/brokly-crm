import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/rotation/run — inactivity-based lead rotation sweep.
 *
 * Owner/Admin configures: rotation_enabled + inactivity_days (admin_settings,
 * category "rotation"). Leads assigned to an active user who have NOT been
 * worked (no comment / follow-up / call / status change) for inactivity_days
 * are reassigned round-robin to the least-recently-assigned eligible active
 * user. Previous + new assignee, reason, and timestamp are recorded in
 * lead_rotation_log and both parties are notified (activity_log).
 */
export async function POST() {
  const db = await createClient();
  const auth = await requireAdmin(db);
  if (!auth.ok) return auth.response;

  try {
    // ── Config ──
    const { data: rotationSettings } = await db
      .from('admin_settings')
      .select('*')
      .eq('category', 'rotation');
    const settings = rotationSettings || [];
    const enabled = !!settings.find((s: any) => s.name === 'rotation_enabled')?.is_active;
    const inactivityDays = Number(
      settings.find((s: any) => s.name === 'inactivity_days')?.sort_order ?? 7
    );

    if (!enabled) {
      return NextResponse.json({
        rotated: 0,
        skipped: 0,
        enabled: false,
        message: 'Rotation is disabled',
      });
    }

    // ── Eligible agents (active, non-admin) ──
    const { data: users } = await db
      .from('user_profiles')
      .select('id, full_name, role')
      .eq('is_active', true)
      .not('role', 'in', '("admin","owner")');
    const agents = (users || []).map((u: any) => ({ id: u.id, name: u.full_name || u.id }));
    if (!agents.length) {
      return NextResponse.json({ rotated: 0, enabled: true, message: 'No eligible agents' });
    }

    // ── Stale leads: assigned, active assignee, not terminal, not worked ──
    const cutoff = new Date(Date.now() - inactivityDays * 24 * 60 * 60 * 1000).toISOString();
    const { data: staleLeads } = await db
      .from('leads')
      .select('id, name, assigned_to, agent, agent_initials, created_at, last_activity_at')
      .not('assigned_to', 'is', null)
      .not('crm_status', 'in', '("Done Deal","Not Interested","Archived")')
      .or(`last_activity_at.lt.${cutoff},and(last_activity_at.is.null,created_at.lt.${cutoff})`)
      .limit(200);

    if (!staleLeads?.length) {
      return NextResponse.json({
        rotated: 0,
        skipped: 0,
        enabled: true,
        message: 'No stale leads',
      });
    }

    // ── Least-recently-assigned ordering ──
    const { data: recentAssignments } = await db
      .from('leads')
      .select('assigned_to')
      .in(
        'assigned_to',
        agents.map((a: any) => a.id)
      )
      .order('updated_at', { ascending: false })
      .limit(agents.length * 5);
    const latest = new Map<string, number>();
    for (const r of recentAssignments || []) {
      if (!latest.has(r.assigned_to)) latest.set(r.assigned_to, 0);
      else latest.set(r.assigned_to, latest.get(r.assigned_to)! + 1);
    }
    const ordered = [...agents].sort((a, b) => (latest.get(a.id) ?? 0) - (latest.get(b.id) ?? 0));

    let rotated = 0;
    let pointer = 0;
    const rotationLogRows: any[] = [];
    const notificationRows: any[] = [];

    for (const lead of staleLeads) {
      const currentAssigneeId = lead.assigned_to;
      // Pick the next agent that isn't the current assignee.
      let target: any = null;
      for (let i = 0; i < ordered.length; i++) {
        const candidate = ordered[(pointer + i) % ordered.length];
        if (candidate.id !== currentAssigneeId) {
          target = candidate;
          pointer = (pointer + i + 1) % ordered.length;
          break;
        }
      }
      if (!target) continue;

      const { error } = await db
        .from('leads')
        .update({
          assigned_to: target.id,
          agent: target.name,
          agent_initials: String(target.name || '')
            .split(' ')
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase(),
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', lead.id);
      if (error) continue;

      rotationLogRows.push({
        lead_id: lead.id,
        from_user_id: currentAssigneeId,
        to_user_id: target.id,
        reason: 'inactivity',
        detail: `Not worked for ${inactivityDays} days`,
      });
      notificationRows.push({
        user_id: target.id,
        action_type: 'Lead Rotated To You',
        entity_type: 'lead',
        entity_id: lead.id,
        detail: lead.name || 'A lead',
      });
      if (currentAssigneeId) {
        notificationRows.push({
          user_id: currentAssigneeId,
          action_type: 'Lead Rotated Away',
          entity_type: 'lead',
          entity_id: lead.id,
          detail: `${lead.name || 'A lead'} rotated to ${target.name} (inactive ${inactivityDays}d)`,
        });
      }
      rotated += 1;
    }

    if (rotationLogRows.length) {
      await db.from('lead_rotation_log').insert(rotationLogRows);
    }
    if (notificationRows.length) {
      await db.from('activity_log').insert(notificationRows);
    }

    return NextResponse.json({ rotated, enabled: true, message: `${rotated} lead(s) rotated` });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to run rotation' }, { status: 500 });
  }
}
