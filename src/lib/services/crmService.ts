'use client';

import { createClient } from '@/lib/supabase/client';

function isSchemaError(error: any): boolean {
  if (!error) return false;
  if (error.code && typeof error.code === 'string') {
    const errorClass = error.code.substring(0, 2);
    if (errorClass === '42') return true;
    if (errorClass === '23') return false;
    if (errorClass === '08') return true;
    // PostgREST errors (PGRST1xx = filter/parse, PGRST2xx = resource/relation)
    if (/^PGRST/.test(error.code)) return true;
  }
  if (error.message) {
    const schemaErrorPatterns = [
      /relation.*does not exist/i,
      /column.*does not exist/i,
      /function.*does not exist/i,
      /syntax error/i,
      /type.*does not exist/i,
      /could not find a relationship/i,
      /could not find the/i,
    ];
    return schemaErrorPatterns.some((p) => p.test(error.message));
  }
  return false;
}

// ─── CLIENT-SIDE READ CACHE ──────────────────────────────────────────────────
// Dedupes redundant reads (e.g. three dashboard charts calling getSummary) and
// caches expensive GETs for a short TTL. Invalidated on every mutation so
// cached data can never go stale.
const crmCache = new Map<string, { expiresAt: number; value: unknown }>();
const CACHE_TTL_MS = 30_000;

function cachedRead<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const hit = crmCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.value as T);
  const p = factory().then((value) => {
    crmCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return value;
  });
  return p;
}

function invalidateCache(): void {
  crmCache.clear();
}

/** Best-effort activity_log insert (lead timeline). Never throws. */
async function logActivity(actionType: string, entityType: string, entityId: string, detail = '') {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from('activity_log').insert({
      user_id: user?.id ?? undefined,
      action_type: actionType,
      entity_type: entityType,
      entity_id: entityId,
      detail,
    });
  } catch {
    // non-fatal
  }
}

// ─── LEAD ROTATION ───────────────────────────────────────────────────────────
// Admin toggle lives in admin_settings (category "rotation",
// item "rotation_enabled", is_active = on/off). When on, new/imported leads
// without an explicit assignee go to the least-recently-assigned active
// salesperson (DB-backed, respects RLS; counter fallback on read errors).

let rotationStateCache: {
  at: number;
  enabled: boolean;
  agents: { id: string; name: string }[];
} | null = null;

async function getRotationState() {
  if (rotationStateCache && Date.now() - rotationStateCache.at < 30_000) {
    return { enabled: rotationStateCache.enabled, agents: rotationStateCache.agents };
  }
  try {
    const settings = await adminSettingsService.getAll();
    const items = settings['rotation'] || [];
    const enabled = !!items.find((i: any) => i.name === 'rotation_enabled')?.active;
    let agents: { id: string; name: string }[] = [];
    if (enabled) {
      const all = await teamsService.getAssignableUsers();
      agents = (all as any[])
        .filter((u) => u.role !== 'admin' && u.role !== 'owner')
        .map((u) => ({ id: u.id, name: u.name }));
    }
    rotationStateCache = { at: Date.now(), enabled, agents };
    return { enabled, agents };
  } catch {
    return { enabled: false, agents: [] };
  }
}

function agentInitials(name: string): string {
  return String(name || '')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Least-recently-assigned ordering of the rotation agents (stable per call). */
async function rotationOrder(): Promise<{ id: string; name: string }[]> {
  const { agents } = await getRotationState();
  if (!agents.length) return [];
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from('leads')
      .select('assigned_to, updated_at')
      .in(
        'assigned_to',
        agents.map((a) => a.id)
      )
      .order('updated_at', { ascending: false })
      .limit(agents.length * 3);
    const latest = new Map<string, number>();
    for (const r of data || []) {
      if (!latest.has(r.assigned_to)) {
        latest.set(r.assigned_to, new Date(r.updated_at || 0).getTime());
      }
    }
    return [...agents].sort((a, b) => (latest.get(a.id) ?? 0) - (latest.get(b.id) ?? 0));
  } catch {
    return [...agents];
  }
}

/**
 * Returns a Map<rowIndex, agent> for rows that should be auto-assigned by
 * rotation (only rows without an explicit assignee). At most one DB round-trip.
 */
async function computeRotationAssignments(
  rows: any[]
): Promise<Map<number, { id: string; name: string }>> {
  const out = new Map<number, { id: string; name: string }>();
  const order = await rotationOrder();
  if (!order.length) return out;
  rows.forEach((row, i) => {
    if (!row.assignedTo && !row.agent) {
      out.set(i, order[i % order.length]);
    }
  });
  return out;
}

// ─── LEADS ───────────────────────────────────────────────────────────────────

/**
 * Pushes "lead assigned" rows into activity_log targeting the assignee so the
 * notification bell can surface them. Non-fatal: a failure here must never
 * undo a successful assignment.
 */
async function pushAssignmentNotifications(
  supabase: any,
  ids: string[],
  assignedTo: string | null,
  assigneeName?: string
) {
  if (!assignedTo || !ids.length) return;
  try {
    const { data: leads } = await supabase.from('leads').select('id, name').in('id', ids);
    if (!leads?.length) return;
    const rows = leads.map((l: any) => ({
      user_id: assignedTo,
      action_type: 'Lead Assigned',
      entity_type: 'lead',
      entity_id: l.id,
      detail: l.name || 'A lead',
      meta: assigneeName ? JSON.stringify({ by: assigneeName }) : '',
    }));
    await supabase.from('activity_log').insert(rows);
    // Also fire a real phone push to the assignee (best-effort).
    try {
      await fetch(`/api/push/send?target=${encodeURIComponent(assignedTo)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: assigneeName
            ? `${assigneeName} assigned a lead to you`
            : 'New lead assigned to you',
          body:
            ids.length > 1
              ? `${ids.length} leads assigned to you`
              : leads[0]?.name || 'A lead was assigned to you',
          url: '/',
          tag: 'brokly-assignment',
        }),
      });
    } catch {
      // ignore — push is best-effort
    }
  } catch {
    // ignore — notifications are best-effort
  }
}

export const leadsService = {
  async getAll() {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*, assigned_to_profile:user_profiles!leads_assigned_to_fkey(id, full_name)')
        .order('created_at', { ascending: false });
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map(rowToLead);
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return [];
    }
  },

  /** Single lead by id (used to open a lead's preview from other pages). */
  async getById(id: string) {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*, assigned_to_profile:user_profiles!leads_assigned_to_fkey(id, full_name)')
        .eq('id', id)
        .single();
      if (error) {
        if (isSchemaError(error)) throw error;
        return null;
      }
      return rowToLead(data);
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return null;
    }
  },

  /** Lightweight lead search by name/phone/email/project/unit (follow-up + reservation lead linking). */
  async search(q: string, limit = 8) {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('id, name, phone, email, property_type, project, unit')
        .or(
          `name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%,project.ilike.%${q}%,unit.ilike.%${q}%`
        )
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map((r: any) => ({
        id: r.id,
        name: r.name || '',
        phone: r.phone || '',
        email: r.email || '',
        propertyType: r.property_type || '',
        project: r.project || '',
        unit: r.unit || '',
      }));
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return [];
    }
  },

  async create(lead: any, userId: string) {
    const supabase = createClient();
    // Global dedup pre-check (phone/email) — spec 2.C: provide clickable redirect link to existing lead
    try {
      const phoneNorm = String(lead.phone || '').replace(/\D/g, '');
      if (phoneNorm && phoneNorm.length >= 8) {
        const { data: dup } = await supabase.from('leads').select('id, name, phone').ilike('phone', `%${phoneNorm.slice(-10)}%`).limit(1).maybeSingle();
        if (dup && String(dup.phone||'').replace(/\D/g,'').slice(-10) === phoneNorm.slice(-10)) {
          const err: any = new Error(`Duplicate phone — existing lead: ${dup.name} (${dup.id}). Open /leads/${dup.id}`);
          err.code = '23505'; err.existingLeadId = dup.id; err.redirectLink = `/leads/${dup.id}`; err.apiLink = `/api/leads/${dup.id}/profile`;
          throw err;
        }
      }
      const emailNorm = String(lead.email||'').toLowerCase().trim();
      if (emailNorm) {
        const { data: dup } = await supabase.from('leads').select('id, name, email').ilike('email', emailNorm).limit(1).maybeSingle();
        if (dup && String(dup.email||'').toLowerCase().trim()===emailNorm) {
          const err: any = new Error(`Duplicate email — existing lead: ${dup.name} (${dup.id}). Open /leads/${dup.id}`);
          err.code = '23505'; err.existingLeadId = dup.id; err.redirectLink = `/leads/${dup.id}`;
          throw err;
        }
      }
    } catch (e:any) { if (e?.code==='23505') throw e; }
    // Auto-assignment when the admin rotation toggle is on.
    const rotation = await computeRotationAssignments([lead]);
    const rot = rotation.get(0);
    if (rot) {
      lead.assignedTo = rot.id;
      lead.assignedToName = rot.name;
      lead.agent = rot.name;
      lead.agentInitials = agentInitials(rot.name);
    }
    const { data, error } = await supabase
      .from('leads')
      .insert(leadToRow(lead, userId))
      .select('*, assigned_to_profile:user_profiles!leads_assigned_to_fkey(id, full_name)')
      .single();
    if (error) {
      // Handle race-condition unique violation with redirect link
      if ((error as any).code === '23505') {
        const phoneNorm = String(lead.phone||'').replace(/\D/g,'');
        let dupId: string | null = null;
        try {
          if (phoneNorm) {
            const { data: dup } = await supabase.from('leads').select('id').ilike('phone', `%${phoneNorm.slice(-10)}%`).limit(1).maybeSingle();
            if (dup) dupId = dup.id;
          }
          if (!dupId && lead.email) {
            const { data: dup } = await supabase.from('leads').select('id').ilike('email', String(lead.email).toLowerCase().trim()).limit(1).maybeSingle();
            if (dup) dupId = dup.id;
          }
        } catch {}
        (error as any).existingLeadId = dupId;
        (error as any).redirectLink = dupId ? `/leads/${dupId}` : null;
        (error as any).message = dupId ? `${error.message} — existing: /leads/${dupId}` : error.message;
      }
      throw error;
    }
    invalidateCache();
    // Notify an assignee when a lead is created already assigned to someone.
    if (data?.assigned_to) {
      await pushAssignmentNotifications(supabase, [data.id], data.assigned_to, lead.agent);
    }
    await followUpsService.syncFromLead(data);
    return {
      ...rowToLead(data),
      referredToName: lead.referredToName || null,
      referredByName: lead.referredByName || null,
    };
  },

  /**
   * Compares a list of Egyptian mobile numbers against leads this user can
   * already see, so duplicate detection during import respects RLS (a member
   * only "sees" their own assigned/unassigned leade).
   */
  async findDuplicatePhones(phones: string[]) {
    const clean = Array.from(new Set(phones.filter(Boolean).map((p) => p.replace(/\D/g, ''))));
    if (!clean.length) return new Set<string>();
    const supabase = createClient();
    try {
      const query: any = supabase
        .from('leads')
        .select('phone')
        .or(clean.map((p) => `phone.ilike.%${p}%`).join(','));
      // The `or` filter may exceed URL length for very large imports; chunk it.
      const found = new Set<string>();
      for (let i = 0; i < clean.length; i += 50) {
        const chunk = clean.slice(i, i + 50);
        const { data, error } = await supabase
          .from('leads')
          .select('phone')
          .or(chunk.map((p) => `phone.ilike.%${p}%`).join(','));
        if (error) continue;
        (data || []).forEach((r: any) => {
          if (r?.phone) found.add(String(r.phone).replace(/\D/g, ''));
        });
      }
      return found;
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return new Set<string>();
    }
  },

  /**
   * Inserts a batch of pre-validated leads (single round-trip). createdBy is
   * the current user id so RLS ownership + the DB trigger work for imported
   * rows. Returns the inserted leads and syncs any follow-up rows.
   */
  async bulkInsert(rows: any[], userId: string) {
    if (!rows.length) return [];
    const supabase = createClient();
    // Auto-assignment for unassigned imported rows when rotation is on.
    const rotation = await computeRotationAssignments(rows);
    const finalRows = rows.map((r, i) => {
      const rot = rotation.get(i);
      if (!rot) return r;
      return {
        ...r,
        assignedTo: rot.id,
        assignedToName: rot.name,
        agent: rot.name,
        agentInitials: agentInitials(rot.name),
      };
    });
    const { data, error } = await supabase
      .from('leads')
      .insert(finalRows.map((r) => leadToRow(r, userId)))
      .select('*, assigned_to_profile:user_profiles!leads_assigned_to_fkey(id, full_name)');
    if (error) {
      if ((error as any).code === '23505') {
        // Global dedup uniqueness violated — fetch one existing duplicate for redirect link
        const phone = String(finalRows[0]?.phone || '').replace(/\D/g,'');
        let dupId: string | null = null;
        try {
          if (phone) {
            const { data: dup } = await supabase.from('leads').select('id').ilike('phone', `%${phone.slice(-10)}%`).limit(1).maybeSingle();
            if (dup) dupId = (dup as any).id;
          }
        } catch {}
        (error as any).existingLeadId = dupId;
        (error as any).redirectLink = dupId ? `/leads/${dupId}` : null;
        (error as any).message = dupId ? `${error.message} — existing lead: /leads/${dupId} (click to view)` : error.message;
      }
      throw error;
    }
    invalidateCache();
    // Notify assignees when imported leads were assigned to them (best-effort).
    const assignees = new Map<string, string[]>();
    (data || []).forEach((l: any) => {
      if (l.assigned_to) {
        assignees.set(l.assigned_to, [...(assignees.get(l.assigned_to) || []), l.id]);
      }
    });
    for (const [to, ids] of assignees.entries()) {
      await pushAssignmentNotifications(supabase, ids, to, 'Lead import');
    }
    await followUpsService.syncFromLead(data || []);
    return (data || []).map(rowToLead);
  },

  async update(id: string, lead: any) {
    const supabase = createClient();
    const { data: prev } = await supabase.from('leads').select('assigned_to').eq('id', id).single();
    const { data, error } = await supabase
      .from('leads')
      .update(leadToRow(lead))
      .eq('id', id)
      .select('*, assigned_to_profile:user_profiles!leads_assigned_to_fkey(id, full_name)')
      .single();
    if (error) throw error;
    invalidateCache();
    // Notify the new assignee when a lead is (re)assigned through the edit modal.
    const nextAssignee = data?.assigned_to || null;
    if (nextAssignee && nextAssignee !== (prev?.assigned_to || null)) {
      await pushAssignmentNotifications(
        supabase,
        [id],
        nextAssignee,
        lead.assignedToName || lead.agent
      );
    }
    await followUpsService.syncFromLead(data);
    return rowToLead(data);
  },

  async updateStatus(id: string, status: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('leads')
      .update({ crm_status: status, lead_status: mapCrmStatusToLegacy(status) })
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      throw new Error(
        describeLeadWriteError(error, 'status update')
      );
    }
    invalidateCache();
    await followUpsService.syncFromLead(data);
    return rowToLead(data);
  },

  /**
   * Schedules (or reschedules) a follow-up on a lead. Reuses the existing
   * `follow_up_due` DATE column — the DB trigger + syncFromLead keep the linked
   * follow_ups row in sync, which is what the Workspace Late/Today/Tomorrow
   * tabs read from.
   */
  async scheduleFollowUp(id: string, dueDate: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('leads')
      .update({ follow_up_due: dueDate })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    invalidateCache();
    await followUpsService.syncFromLead(data);
    return rowToLead(data);
  },

  async assignLead(id: string, assignedTo: string | null) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('leads')
      .update({ assigned_to: assignedTo })
      .eq('id', id)
      .select('id, assigned_to, agent, agent_initials, crm_status, lead_status')
      .single();
    if (error) throw error;
    if (assignedTo) {
      await pushAssignmentNotifications(supabase, [id], assignedTo);
    }
    invalidateCache();
    return data;
  },

  async delete(id: string) {
    const res = await fetch(`/api/leads/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) {
      let message = 'Failed to delete lead';
      try {
        const data = await res.json();
        if (data?.error) message = data.error;
      } catch {
        /* ignore parse errors */
      }
      throw new Error(message);
    }
    invalidateCache();
  },

  async bulkDelete(ids: string[]) {
    const res = await fetch('/api/leads/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      let message = 'Failed to delete leads';
      try {
        const data = await res.json();
        if (data?.error) message = data.error;
      } catch {
        /* ignore parse errors */
      }
      throw new Error(message);
    }
    invalidateCache();
  },

  async bulkAssign(ids: string[], agent: string) {
    const supabase = createClient();
    const agentInitials = agent
      .split(' ')
      .map((p) => p[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
    const { error } = await supabase
      .from('leads')
      .update({ agent, agent_initials: agentInitials })
      .in('id', ids);
    if (error) throw error;
    invalidateCache();
  },

  async bulkAssignUsers(ids: string[], assignedTo: string | null, assigneeName?: string) {
    const supabase = createClient();
    const payload: any = { assigned_to: assignedTo };
    if (assigneeName) {
      payload.agent = assigneeName;
      payload.agent_initials = assigneeName
        .split(' ')
        .map((p: string) => p[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    const { error } = await supabase.from('leads').update(payload).in('id', ids);
    if (error) throw error;
    await pushAssignmentNotifications(supabase, ids, assignedTo, assigneeName);
    const { data: synced } = await supabase.from('leads').select('*').in('id', ids);
    await followUpsService.syncFromLead(synced || []);
    invalidateCache();
  },

  /**
   * Transaction-safe round-robin bulk assignment. Delegates to the
   * `bulk_assign_round_robin` RPC which updates every lead atomically and rolls
   * the whole batch back if any single lead fails (permission, missing user) —
   * a lead is never left partially assigned.
   */
  async bulkAssignRoundRobin(ids: string[], users: { id: string; name: string }[]) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('bulk_assign_round_robin', {
      p_lead_ids: ids,
      p_user_ids: users.map((u) => u.id),
    });
    if (error) throw error;

    // Follow-up sync + notifications remain best-effort after commit, so a
    // failure there can't leave assignment state inconsistent.
    try {
      const done = (data || []) as { lead_id: string; user_id: string; user_name: string }[];
      const byUser = new Map<string, string[]>();
      done.forEach((d) => {
        const list = byUser.get(d.user_id) || [];
        list.push(d.lead_id);
        byUser.set(d.user_id, list);
      });
      for (const u of users) {
        const userLeads = byUser.get(u.id);
        if (userLeads?.length) {
          await pushAssignmentNotifications(supabase, userLeads, u.id, u.name);
        }
      }
      const { data: synced } = await supabase.from('leads').select('*').in('id', ids);
      await followUpsService.syncFromLead(synced || []);
    } catch {
      // ignore — notifications/follow-up sync are best-effort
    }
    invalidateCache();
    return (data || []) as { lead_id: string; user_id: string; user_name: string }[];
  },

  /** Bulk-assign a team label (leads.team) to the selected leads. */
  async bulkSetTeam(ids: string[], teamName: string) {
    const supabase = createClient();
    const { error } = await supabase.rpc('bulk_set_team', {
      p_lead_ids: ids,
      p_team: teamName,
    });
    if (error) throw error;
    invalidateCache();
  },

  async getStatusCounts() {
    const supabase = createClient();
    // Prefer the server-side aggregate (single rowset, no full-table transfer).
    // Any failure (including a missing RPC on a DB that's behind on migrations)
    // must degrade to the client-side fallback — never throw.
    try {
      const { data, error } = await supabase.rpc('get_lead_status_counts');
      if (!error && Array.isArray(data)) {
        const counts: Record<string, number> = {};
        (data as { status: string; count: number }[]).forEach((r) => {
          counts[r.status] = Number(r.count);
        });
        if (Object.keys(counts).length) return counts;
      }
    } catch {
      // fall through to client aggregation
    }
    // Fallback: client-side aggregation over the status columns.
    return cachedRead('statusCounts', async () => {
      try {
        const { data, error } = await supabase.from('leads').select('crm_status, lead_status');
        if (error) return {};
        const counts: Record<string, number> = {};
        (data || []).forEach((row: any) => {
          const s = row.crm_status || row.lead_status || 'Fresh Leads';
          counts[s] = (counts[s] || 0) + 1;
        });
        return counts;
      } catch {
        return {};
      }
    });
  },

  /**
   * Lightweight dashboard KPIs. Every query is best-effort: a missing column
   * or table must never break the dashboard — we fall back to zeros.
   */
  async getDashboardStats() {
    const supabase = createClient();
    const empty = {
      total: 0,
      new30d: 0,
      unassigned: 0,
      hot: 0,
      reservations: 0,
      doneDeals: 0,
      conversionPct: 0,
      revenue: 0,
    };
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const countExact = async (query: any) => {
        try {
          const r = await query;
          return r?.error ? 0 : Number(r?.count || 0);
        } catch {
          return 0;
        }
      };
      const dealRows = await (async () => {
        try {
          const r = await supabase
            .from('leads')
            .select('final_price, total_price')
            .in('crm_status', ['Done Deal', 'Won']);
          return r?.error ? [] : r.data || [];
        } catch {
          return [];
        }
      })();
      const [statusCounts, newCount, unassignedCount, hotCount] = await Promise.all([
        this.getStatusCounts().catch(() => ({})),
        countExact(
          supabase
            .from('leads')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', thirtyDaysAgo)
        ),
        countExact(
          supabase
            .from('leads')
            .select('id', { count: 'exact', head: true })
            .is('assigned_to', null)
        ),
        countExact(
          supabase
            .from('leads')
            .select('id', { count: 'exact', head: true })
            .eq('lead_rating', 'Hot')
        ),
      ]);
      const doneDeals =
        Number((statusCounts as Record<string, number>)['Done Deal'] || 0) +
        Number((statusCounts as Record<string, number>)['Won'] || 0);
      const total = Object.values(statusCounts as Record<string, number>).reduce(
        (sum: number, v: any) => sum + Number(v || 0),
        0
      );
      const revenue = (dealRows || []).reduce(
        (sum: number, r: any) => sum + Number(r.final_price || r.total_price || 0),
        0
      );
      return {
        total,
        new30d: Number(newCount || 0),
        unassigned: Number(unassignedCount || 0),
        hot: Number(hotCount || 0),
        reservations: Number((statusCounts as Record<string, number>)['Reservation'] || 0),
        doneDeals,
        conversionPct: total > 0 ? Math.round((doneDeals / total) * 1000) / 10 : 0,
        revenue,
      };
    } catch {
      return empty;
    }
  },

  /**
   * Paginated, server-side filtered leads query — used by the leads list so we
   * never transfer the full table to the browser.
   */
  async getPage(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    source?: string;
    agent?: string;
    project?: string;
    propertyType?: string;
    action?: string;
    sortKey?: string;
    sortDir?: 'asc' | 'desc';
  }) {
    const supabase = createClient();
    const {
      page = 1,
      pageSize = 25,
      search = '',
      status = '',
      source = '',
      agent = '',
      project = '',
      propertyType = '',
      action = '',
      sortKey = 'createdAt',
      sortDir = 'desc',
    } = params || {};

    const columnMap: Record<string, string> = {
      name: 'name',
      budgetMin: 'budget_min',
      source: 'source',
      agent: 'agent',
      status: 'crm_status',
      followUpDue: 'follow_up_due',
      createdAt: 'created_at',
    };
    const column = columnMap[sortKey] || 'created_at';

    try {
      let query = supabase
        .from('leads')
        .select('*, assigned_to_profile:user_profiles!leads_assigned_to_fkey(id, full_name)', {
          count: 'exact',
        });

      // Action filter: restrict to leads touched by a specific activity-log
      // action (e.g. "Lead Assigned"). Respects activity_log RLS which keeps
      // agents on their own actions and admins on everything.
      if (action) {
        let leadIds: string[] = [];
        try {
          const { data: logRows, error: logErr } = await supabase
            .from('activity_log')
            .select('entity_id')
            .eq('entity_type', 'lead')
            .eq('action_type', action);
          if (logErr) {
            if (isSchemaError(logErr)) throw logErr;
            // non-schema read error — treat as empty so the filter degrades
            leadIds = [];
          } else {
            leadIds = (logRows || [])
              .map((r: any) => r.entity_id)
              .filter((v: string | null | undefined): v is string => !!v);
          }
        } catch (err: any) {
          if (isSchemaError(err)) throw err;
          leadIds = [];
        }
        if (!leadIds.length) {
          return { data: [], total: 0, page, pageSize };
        }
        query = query.in('id', leadIds);
      }

      const q = search.trim();
      if (q) {
        query = query.or(
          `name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,location.ilike.%${q}%`
        );
      }
      if (status) query = query.eq('crm_status', status);
      if (source) query = query.eq('source', source);
      if (agent) query = query.eq('agent', agent);
      if (project) query = query.eq('project', project);
      if (propertyType) query = query.eq('property_type', propertyType);

      const from = Math.max(0, (page - 1) * pageSize);
      const to = from + pageSize - 1;

      const { data, error, count } = await query
        .order(column, { ascending: sortDir !== 'desc' })
        .range(from, to);

      if (error) {
        // Schema errors throw with technical detail for the (un-migrated) case;
        // every other failure (network, timeout, auth, integrity) must also
        // propagate so the UI can show an actionable error state instead of a
        // misleading empty table.
        throw new Error(error.message || 'Failed to load leads');
      }
      return {
        data: (data || []).map(rowToLead),
        total: count ?? (data || []).length,
        page,
        pageSize,
      };
    } catch (err: any) {
      // Always rely on isSchemaError to decide a degraded path; for leads we
      // want real errors surfaced, so re-throw unless it already describes a
      // missing-schema situation that the older caller handles.
      if (isSchemaError(err)) throw err;
      throw err;
    }
  },

  /** Recent leads only (used by the dashboard activity feed). */
  async getRecent(limit = 7) {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map(rowToLead);
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return [];
    }
  },
};

function rowToLead(row: any) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    propertyType: row.property_type,
    budgetMin: Number(row.budget_min),
    budgetMax: Number(row.budget_max),
    source: row.source,
    agent: row.agent,
    agentInitials: row.agent_initials,
    status: row.crm_status || row.lead_status || 'Fresh Leads',
    assignedTo: row.assigned_to || null,
    assignedToName: row.assigned_to_profile?.full_name || null,
    referredTo: row.referred_to || null,
    referredToName: row.referred_to_profile?.full_name || null,
    referredBy: row.referred_by || null,
    referredByName: row.referred_by_profile?.full_name || null,
    adminId: row.admin_id || null,
    adminName: row.admin?.full_name || null,
    lastContact: row.last_contact,
    followUpDue: row.follow_up_due,
    notes: row.notes,
    location: row.location,
    developer: row.developer,
    project: row.project,
    unit: row.unit,
    interestLevel: row.interest_level,
    leadRating: row.lead_rating || '',
    priority: row.priority || 'Normal',
    team: row.team || '',
    csAgent: row.cs_agent || '',
    unitId: row.unit_id || null,
    unitArea: Number(row.unit_area || 0),
    unitPrice: Number(row.unit_price || 0),
    totalPrice: Number(row.total_price || 0),
    downPayment: Number(row.down_payment || 0),
    downPaymentPct: Number(row.down_payment_pct || 0),
    installmentAmount: Number(row.installment_amount || 0),
    installmentCount: Number(row.installment_count || 0),
    installmentFrequency: Number(row.installment_frequency || 12),
    paymentStartDate: row.payment_start_date || '',
    reservationAmount: Number(row.reservation_amount || 0),
    maintenanceFees: Number(row.maintenance_fees || 0),
    remainingAmount: Number(row.remaining_amount || 0),
    paymentStatus: row.payment_status || 'Not Started',
    reservationDate: row.reservation_date || '',
    closingDate: row.closing_date || '',
    finalPrice: Number(row.final_price || 0),
    commission: Number(row.commission || 0),
    createdAt: row.created_at?.split('T')[0] || row.created_at,
  };
}

function leadToRow(lead: any, userId?: string) {
  const row: any = {
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    property_type: lead.propertyType,
    budget_min: lead.budgetMin,
    budget_max: lead.budgetMax,
    source: lead.source,
    agent: lead.agent,
    agent_initials: lead.agentInitials,
    crm_status: lead.status,
    lead_status: mapCrmStatusToLegacy(lead.status),
    last_contact: lead.lastContact,
    follow_up_due: lead.followUpDue,
    notes: lead.notes,
    location: lead.location,
    developer: lead.developer || '',
    project: lead.project || '',
    assigned_to: lead.assignedTo || null,
    referred_to: lead.referredTo || null,
    referred_by: lead.referredBy || null,
    unit: lead.unit || '',
    interest_level: lead.interestLevel || '',
    lead_rating: lead.leadRating || '',
    priority: lead.priority || 'Normal',
    team: lead.team || '',
    cs_agent: lead.csAgent || '',
    unit_id: lead.unitId || null,
    unit_area: lead.unitArea ?? 0,
    unit_price: lead.unitPrice ?? 0,
    total_price: lead.totalPrice ?? 0,
    down_payment: lead.downPayment ?? 0,
    down_payment_pct: lead.downPaymentPct ?? 0,
    installment_amount: lead.installmentAmount ?? 0,
    installment_count: lead.installmentCount ?? 0,
    installment_frequency: lead.installmentFrequency ?? 12,
    payment_start_date: lead.paymentStartDate || null,
    reservation_amount: lead.reservationAmount ?? 0,
    maintenance_fees: lead.maintenanceFees ?? 0,
    remaining_amount: lead.remainingAmount ?? 0,
    payment_status: lead.paymentStatus || 'Not Started',
    reservation_date: lead.reservationDate || null,
    closing_date: lead.closingDate || null,
    final_price: lead.finalPrice ?? 0,
    commission: lead.commission ?? 0,
  };
  // If the caller supplies an explicit creation date (e.g. lead import), keep
  // it; otherwise the DB default applies.
  if (lead.createdAt) {
    const iso = String(lead.createdAt);
    row.created_at = /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : iso;
  }
  if (userId) row.created_by = userId;
  return row;
}

/**
 * Turn raw Postgres/PostgREST errors into a clear, actionable message for the
 * lead stage/status flow. The DB triggers that write the activity log must
 * never be able to silently break a status change — if a write fails we tell
 * the user exactly why instead of a bare "Failed to update status".
 */
function describeLeadWriteError(error: any, action: string): string {
  const msg = typeof error?.message === 'string' ? error.message : String(error || '');
  if (/permission denied|row-level security|violates row-level security/i.test(msg)) {
    return `You don't have permission to ${action} this lead. Ask an admin to check your role.`;
  }
  if (/relation ["']?[a-z_]+["']? does not exist/i.test(msg)) {
    return `A required database table is missing (${msg}). Ask an admin to run the latest migrations.`;
  }
  if (/column .* does not exist/i.test(msg)) {
    return `A required database column is missing (${msg}). Ask an admin to run the latest migrations.`;
  }
  if (/new row violates/i.test(msg)) {
    return `This ${action} was rejected by the database: ${msg}`;
  }
  return `${action[0].toUpperCase()}${action.slice(1)} failed: ${msg}`;
}

function mapCrmStatusToLegacy(crmStatus: string): string {
  const map: Record<string, string> = {
    'Fresh Leads': 'New',
    'Cold Calls': 'Contacted',
    'Pending Leads': 'Contacted',
    'Following Up': 'Qualified',
    Meeting: 'Site Visit Scheduled',
    Interested: 'Qualified',
    'Not Interested': 'Lost',
    Cancellation: 'Lost',
    'Done Deal': 'Won',
    Reservation: 'Negotiation',
    'Duplicate Leads': 'Lost',
    'Wrong Number': 'Lost',
    'Data Rotation': 'Contacted',
    'Closed Number': 'Lost',
    'No Answer': 'Contacted',
    'No Answer At All': 'Contacted',
    'Low Budget': 'Lost',
    'Reschedule Meeting': 'Site Visit Scheduled',
  };
  return map[crmStatus] || 'New';
}

// ─── FOLLOW-UPS ──────────────────────────────────────────────────────────────

export const followUpsService = {
  async getAll() {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('follow_ups')
        .select('*')
        .order('due_date', { ascending: true });
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map(rowToFollowUp);
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return [];
    }
  },

  /** Only follow-ups that are still actionable (used by the dashboard). */
  async getOverdue(limit = 8) {
    const supabase = createClient();
    const today = new Date().toISOString().split('T')[0];
    try {
      const { data, error } = await supabase
        .from('follow_ups')
        .select('*')
        .lt('due_date', today)
        .not('follow_up_status', 'in', '("Completed","Cancelled")')
        .order('due_date', { ascending: true })
        .limit(limit);
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map(rowToFollowUp);
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return [];
    }
  },

  /** Due today or later, still actionable (mobile dashboard). */
  async getTodayAndPending(limit = 8) {
    const supabase = createClient();
    const today = new Date().toISOString().split('T')[0];
    try {
      const { data, error } = await supabase
        .from('follow_ups')
        .select('*')
        .gte('due_date', today)
        .not('follow_up_status', 'in', '("Completed","Cancelled")')
        .order('due_date', { ascending: true })
        .limit(limit);
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map(rowToFollowUp);
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return [];
    }
  },

  /** Overdue + due-today counts for the dashboard KPI row (best-effort). */
  async getDashboardCounts() {
    const supabase = createClient();
    const today = new Date().toISOString().split('T')[0];
    const count = async (lt: boolean) => {
      try {
        let q: any = supabase
          .from('follow_ups')
          .select('id', { count: 'exact', head: true })
          .not('follow_up_status', 'in', '("Completed","Cancelled")');
        q = lt ? q.lt('due_date', today) : q.eq('due_date', today);
        const r = await q;
        if (r.error) {
          if (isSchemaError(r.error)) throw r.error;
          return 0;
        }
        return r.count || 0;
      } catch {
        return 0;
      }
    };
    const [overdue, dueToday] = await Promise.all([count(true), count(false)]);
    return { overdue, dueToday };
  },

  async create(fu: any, userId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('follow_ups')
      .insert(followUpToRow(fu, userId))
      .select()
      .single();
    if (error) throw error;
    invalidateCache();
    return rowToFollowUp(data);
  },

  /**
   * Derives a scheduled follow-up directly from a lead so that leads moved to
   * a follow-up stage (Following Up / Interested / etc.) immediately show up
   * on the Follow-ups + Workspace pages. Mirrors the DB trigger; also used as
   * a client-side fallback so the feature works even without a trigger.
   * Accepts a single lead row or an array.
   */
  async syncFromLead(leadOrArray: any) {
    if (!leadOrArray) return;
    const supabase = createClient();
    try {
      const rows = Array.isArray(leadOrArray) ? leadOrArray : [leadOrArray];
      if (!rows.length) return;
      const terminal = new Set([
        'Done Deal',
        'Not Interested',
        'Cancellation',
        'Duplicate Leads',
        'Wrong Number',
        'Closed Number',
        'No Answer',
        'No Answer At All',
        'Low Budget',
        'Data Rotation',
        'Won',
        'Lost',
      ]);
      for (const lead of rows) {
        const status = lead.crm_status || lead.lead_status || '';
        const due = lead.follow_up_due;
        if (!due || terminal.has(status)) continue;
        const assignee = lead.assigned_to || lead.created_by || null;
        await supabase.from('follow_ups').upsert(
          {
            lead_id: lead.id,
            title: `Follow up: ${lead.name || ''}`,
            contact_name: lead.name || '',
            contact_type: 'Lead',
            contact_phone: lead.phone || '',
            contact_email: lead.email || '',
            follow_up_type: 'Call',
            follow_up_status: 'Pending',
            priority: 'Medium',
            due_date: due,
            due_time: '09:00',
            agent: lead.agent || '',
            agent_initials: lead.agent_initials || '',
            notes: lead.notes || '',
            property_interest: lead.property_type || '',
            relationship_status: 'New',
            created_by: assignee,
          },
          { onConflict: 'lead_id' }
        );
      }
    } catch (err: any) {
      // The lead_id column (added by the 20260807000000 migration) may not
      // exist yet — then the DB trigger owns sync and this is best-effort.
      if (!isSchemaError(err)) {
        // ignore — the DB trigger covers scheduling when available
      }
    }
  },

  async update(id: string, fu: any) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('follow_ups')
      .update(followUpToRow(fu))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    invalidateCache();
    return rowToFollowUp(data);
  },

  async updateStatus(id: string, status: string, completedAt?: string) {
    const supabase = createClient();
    const update: any = { follow_up_status: status };
    if (completedAt) update.completed_at = completedAt;
    const { error } = await supabase.from('follow_ups').update(update).eq('id', id);
    if (error) throw error;
    invalidateCache();
  },

  async delete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('follow_ups').delete().eq('id', id);
    if (error) throw error;
    invalidateCache();
  },
};

function rowToFollowUp(row: any) {
  return {
    id: row.id,
    title: row.title,
    contactName: row.contact_name,
    contactType: row.contact_type,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    type: row.follow_up_type,
    status: row.follow_up_status,
    priority: row.priority,
    dueDate: row.due_date,
    dueTime: row.due_time,
    agent: row.agent,
    agentInitials: row.agent_initials,
    notes: row.notes,
    propertyInterest: row.property_interest,
    relationshipStatus: row.relationship_status,
    completedAt: row.completed_at,
    createdAt: row.created_at?.split('T')[0] || row.created_at,
    leadId: row.lead_id || '',
  };
}

function followUpToRow(fu: any, userId?: string) {
  const row: any = {
    title: fu.title,
    contact_name: fu.contactName,
    contact_type: fu.contactType,
    contact_phone: fu.contactPhone,
    contact_email: fu.contactEmail,
    follow_up_type: fu.type,
    follow_up_status: fu.status,
    priority: fu.priority,
    due_date: fu.dueDate,
    due_time: fu.dueTime,
    agent: fu.agent,
    agent_initials: fu.agentInitials,
    notes: fu.notes,
    property_interest: fu.propertyInterest,
    relationship_status: fu.relationshipStatus,
    completed_at: fu.completedAt || null,
  };
  if (userId) row.created_by = userId;
  if (fu.leadId) row.lead_id = fu.leadId;
  return row;
}

// ─── TEAM MEMBERS ────────────────────────────────────────────────────────────

export const teamService = {
  async getAll() {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .order('joined_at', { ascending: true });
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map(rowToTeamMember);
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return [];
    }
  },

  async create(member: any) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('team_members')
      .insert(teamMemberToRow(member))
      .select()
      .single();
    if (error) throw error;
    invalidateCache();
    return rowToTeamMember(data);
  },

  async update(id: string, member: any) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('team_members')
      .update(teamMemberToRow(member))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    invalidateCache();
    return rowToTeamMember(data);
  },

  async delete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('team_members').delete().eq('id', id);
    if (error) throw error;
    invalidateCache();
  },
};

function rowToTeamMember(row: any) {
  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    role: row.role,
    email: row.email,
    phone: row.phone,
    status: row.member_status,
    assignedLeads: row.assigned_leads,
    closedDeals: row.closed_deals,
    conversionRate: Number(row.conversion_rate),
    totalRevenue: Number(row.total_revenue),
    joinedAt: row.joined_at,
  };
}

function teamMemberToRow(member: any) {
  const initials = member.name
    ? member.name
        .split(' ')
        .map((p: string) => p[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : member.initials || '';
  return {
    name: member.name,
    initials,
    role: member.role,
    email: member.email,
    phone: member.phone,
    member_status: member.status,
    joined_at: member.joinedAt,
  };
}

// ─── TEAMS (named groups with members) ───────────────────────────────────────

export const teamsService = {
  async getAll() {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('teams')
        .select(
          `
          *,
          leader:user_profiles!teams_leader_id_fkey(id, full_name),
          team_memberships(id)
        `
        )
        .order('created_at', { ascending: false });
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description || '',
        leaderId: row.leader_id,
        leaderName: row.leader?.full_name || null,
        memberCount: row.team_memberships?.length || 0,
        createdAt: row.created_at?.split('T')[0] || row.created_at,
      }));
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return [];
    }
  },

  async create(name: string, description: string) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('teams')
      .insert({ name, description, created_by: user?.id || null })
      .select(`*, leader:user_profiles!teams_leader_id_fkey(id, full_name), team_memberships(id)`)
      .single();
    if (error) throw error;
    invalidateCache();
    return {
      id: data.id,
      name: data.name,
      description: data.description || '',
      leaderId: data.leader_id,
      leaderName: data.leader?.full_name || null,
      memberCount: data.team_memberships?.length || 0,
      createdAt: data.created_at?.split('T')[0] || data.created_at,
    };
  },

  async update(id: string, name: string, description: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('teams')
      .update({ name, description })
      .eq('id', id)
      .select(`*, leader:user_profiles!teams_leader_id_fkey(id, full_name), team_memberships(id)`)
      .single();
    if (error) throw error;
    invalidateCache();
    return {
      id: data.id,
      name: data.name,
      description: data.description || '',
      leaderId: data.leader_id,
      leaderName: data.leader?.full_name || null,
      memberCount: data.team_memberships?.length || 0,
      createdAt: data.created_at?.split('T')[0] || data.created_at,
    };
  },

  async delete(id: string) {
    const supabase = createClient();
    // Unassign all users from this team first
    await supabase.from('user_profiles').update({ team_id: null }).eq('team_id', id);
    const { error } = await supabase.from('teams').delete().eq('id', id);
    if (error) throw error;
    invalidateCache();
  },

  async getMembers(teamId: string) {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('team_memberships')
        .select(
          `
          id,
          user_id,
          is_leader,
          user_profiles(id, full_name, email, role)
        `
        )
        .eq('team_id', teamId)
        .order('is_leader', { ascending: false });
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        userName: row.user_profiles?.full_name || '',
        userEmail: row.user_profiles?.email || '',
        userRole: row.user_profiles?.role || 'agent',
        isLeader: row.is_leader || false,
      }));
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return [];
    }
  },

  async addMember(teamId: string, userId: string, isLeader: boolean) {
    const supabase = createClient();
    // A user belongs to at most one team: drop any memberships they hold in
    // other teams and remove their leader flag there (keeps teams.leader_id
    // and user_profiles.team_id consistent).
    const { data: other } = await supabase
      .from('team_memberships')
      .select('team_id, is_leader')
      .eq('user_id', userId)
      .neq('team_id', teamId);
    for (const row of other || []) {
      await supabase
        .from('team_memberships')
        .delete()
        .eq('user_id', userId)
        .eq('team_id', row.team_id);
      if (row.is_leader) {
        const { data: t } = await supabase
          .from('teams')
          .select('leader_id')
          .eq('id', row.team_id)
          .maybeSingle();
        if (t?.leader_id === userId) {
          await supabase.from('teams').update({ leader_id: null }).eq('id', row.team_id);
        }
      }
    }
    // If setting as leader, clear existing leader flag in this team
    if (isLeader) {
      await supabase
        .from('team_memberships')
        .update({ is_leader: false })
        .eq('team_id', teamId)
        .eq('is_leader', true);
    }
    // Add membership
    const { error: memberError } = await supabase
      .from('team_memberships')
      .upsert(
        { team_id: teamId, user_id: userId, is_leader: isLeader },
        { onConflict: 'team_id,user_id' }
      );
    if (memberError) throw memberError;
    // Update user_profiles.team_id
    const { error: profileErr } = await supabase
      .from('user_profiles')
      .update({ team_id: teamId })
      .eq('id', userId);
    if (profileErr) throw profileErr;
    // If leader, update teams.leader_id
    if (isLeader) {
      await supabase.from('teams').update({ leader_id: userId }).eq('id', teamId);
    }
    invalidateCache();
  },

  async removeMember(teamId: string, userId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('team_memberships')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', userId);
    if (error) throw error;
    // Clear team_id from user_profiles
    await supabase
      .from('user_profiles')
      .update({ team_id: null })
      .eq('id', userId)
      .eq('team_id', teamId);
    // If this was the leader, clear leader_id from team
    const { data: team } = await supabase
      .from('teams')
      .select('leader_id')
      .eq('id', teamId)
      .single();
    if (team?.leader_id === userId) {
      await supabase.from('teams').update({ leader_id: null }).eq('id', teamId);
    }
    invalidateCache();
  },

  async setLeader(teamId: string, userId: string) {
    const supabase = createClient();
    // Clear existing leader flag
    await supabase.from('team_memberships').update({ is_leader: false }).eq('team_id', teamId);
    // Set new leader
    await supabase
      .from('team_memberships')
      .update({ is_leader: true })
      .eq('team_id', teamId)
      .eq('user_id', userId);
    // Update teams.leader_id
    const { error } = await supabase.from('teams').update({ leader_id: userId }).eq('id', teamId);
    if (error) throw error;
    invalidateCache();
  },

  /**
   * Users the current user may assign leads to:
   * - Admin/owner: all active users
   * - Team leader: members of teams they lead
   * - Everyone else: themselves only
   */
  async getAssignableUsers() {
    return cachedRead('assignableUsers', async () => {
      const supabase = createClient();
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return [];

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id, full_name, email, role, is_active')
          .eq('id', user.id)
          .single();

        if (!profile) return [];

        const isAdmin = profile.role === 'admin' || profile.role === 'owner';

        if (isAdmin) {
          const { data, error } = await supabase
            .from('user_profiles')
            .select('id, full_name, email, role, is_active')
            .eq('is_active', true)
            .order('full_name', { ascending: true });
          if (error) {
            if (isSchemaError(error)) throw error;
            return [];
          }
          return (data || []).map((row: any) => ({
            id: row.id,
            name: row.full_name || row.email,
            role: row.role || 'agent',
          }));
        }

        const { data: leadership, error: leadErr } = await supabase
          .from('team_memberships')
          .select('team_id')
          .eq('user_id', user.id)
          .eq('is_leader', true);
        if (leadErr) {
          if (isSchemaError(leadErr)) throw leadErr;
          return [
            {
              id: profile.id,
              name: profile.full_name || profile.email,
              role: profile.role || 'agent',
            },
          ];
        }

        if (!leadership?.length) {
          return [
            {
              id: profile.id,
              name: profile.full_name || profile.email,
              role: profile.role || 'agent',
            },
          ];
        }

        const teamIds = leadership.map((l: any) => l.team_id);
        const { data: members, error: memErr } = await supabase
          .from('team_memberships')
          .select('user_id, user_profiles(id, full_name, email, role, is_active)')
          .in('team_id', teamIds);
        if (memErr) {
          if (isSchemaError(memErr)) throw memErr;
          return [];
        }

        const seen = new Set<string>();
        const result: { id: string; name: string; role: string }[] = [];
        for (const row of members || []) {
          const up = (row as any).user_profiles;
          if (!up || up.is_active === false || seen.has(up.id)) continue;
          seen.add(up.id);
          result.push({
            id: up.id,
            name: up.full_name || up.email,
            role: up.role || 'agent',
          });
        }
        return result.sort((a, b) => a.name.localeCompare(b.name));
      } catch (err: any) {
        if (isSchemaError(err)) throw err;
        return [];
      }
    });
  },

  /**
   * Per-team performance & profitability + team leader rating.
   * GET /api/teams/performance is RLS-scoped, so non-admins only ever
   * receive the teams they are allowed to see.
   */
  async getPerformance(from?: string, to?: string) {
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const qs = params.toString();
      const res = await fetch(`/api/teams/performance${qs ? `?${qs}` : ''}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Failed to load team performance');
      }
      const body = await res.json();
      return {
        teams: body.teams || [],
        canRate: !!body.canRate,
      };
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return { teams: [], canRate: false };
    }
  },

  /** Owner/Admin rates a team leader (1–5) — stored in team_leader_ratings. */
  async rateLeader(teamId: string, leaderId: string, rating: number, comment?: string) {
    const res = await fetch('/api/teams/performance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_id: teamId, leader_id: leaderId, rating, comment }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || 'Failed to save rating');
    invalidateCache();
    return body.rating;
  },
};

// ─── PROJECTS ────────────────────────────────────────────────────────────────

export const projectsService = {
  async getAll() {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*, developers(id, name)')
        .order('created_at', { ascending: false });
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map(rowToProject);
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return [];
    }
  },

  async create(project: any, userId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('projects')
      .insert({
        name: project.name,
        developer_id: project.developerId || null,
        project_status: project.status,
        created_by: userId,
        latitude: project.latitude ?? null,
        longitude: project.longitude ?? null,
        radius_m: project.radiusM ?? null,
        pitch_summary: project.pitchSummary ?? '',
        why_buy: project.whyBuy ?? '',
        selling_points: Array.isArray(project.sellingPoints)
          ? project.sellingPoints.filter(Boolean).join('\n')
          : (project.sellingPoints ?? ''),
        image_path: project.imagePath || '',
        location: project.location || '',
        full_description: project.fullDescription || '',
        developer_description: project.developerDescription || '',
        payment_plan_summary: project.paymentPlanSummary || '',
      })
      .select('*, developers(id, name)')
      .single();
    if (error) throw error;
    return rowToProject(data);
  },

  async update(id: string, project: any) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('projects')
      .update({
        name: project.name,
        developer_id: project.developerId || null,
        project_status: project.status,
        latitude: project.latitude ?? null,
        longitude: project.longitude ?? null,
        radius_m: project.radiusM ?? null,
        pitch_summary: project.pitchSummary ?? '',
        why_buy: project.whyBuy ?? '',
        selling_points: Array.isArray(project.sellingPoints)
          ? project.sellingPoints.filter(Boolean).join('\n')
          : (project.sellingPoints ?? ''),
        image_path: project.imagePath || '',
        location: project.location || '',
        full_description: project.fullDescription || '',
        developer_description: project.developerDescription || '',
        payment_plan_summary: project.paymentPlanSummary || '',
      })
      .eq('id', id)
      .select('*, developers(id, name)')
      .single();
    if (error) throw error;
    return rowToProject(data);
  },

  async delete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
  },

  /** Upload a cover image into the project-images bucket (client-side). */
  async uploadImage(projectId: string, file: File) {
    const supabase = createClient();
    if (!PROJECT_IMAGE_BUCKET) throw new Error('Storage is not available');
    const safeName = String(file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${projectId}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from(PROJECT_IMAGE_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (upErr) throw upErr;
    return path;
  },

  /** Signed URL so the private cover image is viewable. */
  async getImageUrl(path?: string | null): Promise<string> {
    if (!path) return '';
    const supabase = createClient();
    try {
      const { data, error } = await supabase.storage
        .from(PROJECT_IMAGE_BUCKET)
        .createSignedUrl(path, 60 * 60);
      if (error) throw error;
      return data?.signedUrl || '';
    } catch {
      return '';
    }
  },
};

function splitSellingPoints(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((s) => String(s)).filter(Boolean);
  return String(value || '')
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function rowToProject(row: any) {
  return {
    id: row.id,
    name: row.name,
    developerId: row.developer_id,
    developerName: row.developers?.name || '',
    status: row.project_status,
    createdAt: row.created_at?.split('T')[0] || row.created_at,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    radiusM: row.radius_m ?? 300,
    pitchSummary: row.pitch_summary || '',
    whyBuy: row.why_buy || '',
    sellingPoints: splitSellingPoints(row.selling_points),
    imagePath: row.image_path || '',
    location: row.location || '',
    fullDescription: row.full_description || '',
    developerDescription: row.developer_description || '',
    paymentPlanSummary: row.payment_plan_summary || '',
  };
}

// ─── DEVELOPERS ──────────────────────────────────────────────────────────────

export const developersService = {
  async getAll() {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('developers')
        .select('*')
        .order('name', { ascending: true });
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        isActive: row.is_active,
      }));
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return [];
    }
  },

  async create(name: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('developers')
      .insert({ name, is_active: true })
      .select()
      .single();
    if (error) throw error;
    return { id: data.id, name: data.name, isActive: data.is_active };
  },

  async update(id: string, name: string, isActive: boolean) {
    const supabase = createClient();
    const { error } = await supabase
      .from('developers')
      .update({ name, is_active: isActive })
      .eq('id', id);
    if (error) throw error;
  },

  async delete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('developers').delete().eq('id', id);
    if (error) throw error;
  },
};

// ─── UNITS & UNIT FILES ────────────────────────────────────────────────────────

export interface UnitFile {
  id: string;
  unitId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  kind: string;
  url?: string; // signed URL, populated lazily
}

const UNIT_BUCKET = 'unit-files';
const PROJECT_IMAGE_BUCKET = 'project-images';

function unitRowToUnit(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.projects?.name || '',
    name: row.name,
    unitType: row.unit_type,
    area: Number(row.area || 0),
    floor: Number(row.floor || 0),
    price: Number(row.price || 0),
    paymentPlan: row.payment_plan,
    downPaymentPct: Number(row.down_payment_pct || 0),
    installmentYears: Number(row.installment_years || 0),
    installmentFrequency: Number(row.installment_frequency || 12),
    status: row.status || 'Available',
    imagePath: row.image_path || '',
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Unit + project details used by the lead's recommended-units cards. */
function enrichRecommendedUnit(row: any) {
  return {
    ...unitRowToUnit(row),
    projectImagePath: row.projects?.image_path || '',
    projectSellingPoints: splitSellingPoints(row.projects?.selling_points),
    projectPaymentPlanSummary: row.projects?.payment_plan_summary || '',
  };
}

function unitToRow(unit: any) {
  return {
    project_id: unit.projectId,
    name: unit.name || '',
    unit_type: unit.unitType || '',
    area: unit.area ?? 0,
    floor: unit.floor ?? 0,
    price: unit.price ?? 0,
    payment_plan: unit.paymentPlan || '',
    down_payment_pct: unit.downPaymentPct ?? 0,
    installment_years: unit.installmentYears ?? 0,
    installment_frequency: unit.installmentFrequency ?? 12,
    status: unit.status || 'Available',
    image_path: unit.imagePath || '',
    notes: unit.notes || '',
    created_by: unit.createdBy,
  };
}

export const unitsService = {
  async getAll(projectId?: string) {
    const supabase = createClient();
    try {
      let query = supabase
        .from('units')
        .select('*, unit_files(id), projects(name)')
        .order('name', { ascending: true });
      if (projectId) query = query.eq('project_id', projectId);
      const { data, error } = await query;
      if (error) {
        // projects(name) was added later — retry without the join on
        // databases that have not run the migration yet.
        if (/projects.*(not found|does not exist)|violates/i.test(String(error.message))) {
          let retry: any = supabase
            .from('units')
            .select('*, unit_files(id)')
            .order('name', { ascending: true });
          if (projectId) retry = retry.eq('project_id', projectId);
          const { data: retryData, error: retryError } = await retry;
          if (retryError) {
            if (isSchemaError(retryError)) throw retryError;
            return [];
          }
          return (retryData || []).map((row: any) => ({
            ...unitRowToUnit(row),
            filesCount: Array.isArray(row.unit_files) ? row.unit_files.length : 0,
          }));
        }
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map((row: any) => ({
        ...unitRowToUnit(row),
        filesCount: Array.isArray(row.unit_files) ? row.unit_files.length : 0,
      }));
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return [];
    }
  },

  async getById(id: string) {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('units')
        .select('*, unit_files(id), projects(name)')
        .eq('id', id)
        .single();
      if (error) {
        if (isSchemaError(error)) throw error;
        return null;
      }
      return {
        ...unitRowToUnit(data),
        filesCount: Array.isArray(data.unit_files) ? data.unit_files.length : 0,
      };
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return null;
    }
  },

  async create(unit: any, userId?: string) {
    const supabase = createClient();
    if (!unit.projectId) throw new Error('Project is required');
    const { data, error } = await supabase
      .from('units')
      .insert({ ...unitToRow(unit), created_by: userId || null })
      .select()
      .single();
    if (error) throw error;
    invalidateCache();
    return unitRowToUnit(data);
  },

  async update(id: string, unit: any) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('units')
      .update(unitToRow(unit))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    invalidateCache();
    return unitRowToUnit(data);
  },

  async delete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('units').delete().eq('id', id);
    if (error) throw error;
    invalidateCache();
  },

  async getFiles(unitId: string): Promise<UnitFile[]> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('unit_files')
        .select('*')
        .eq('unit_id', unitId)
        .order('created_at', { ascending: false });
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map((row: any) => ({
        id: row.id,
        unitId: row.unit_id,
        fileName: row.file_name,
        filePath: row.file_path,
        mimeType: row.mime_type,
        sizeBytes: Number(row.size_bytes || 0),
        kind: row.kind || 'image',
      }));
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return [];
    }
  },

  /** Upload a photo/video/PDF for a unit into the private bucket + metadata row. */
  async uploadFile(unitId: string, file: File) {
    const supabase = createClient();
    if (!UNIT_BUCKET) throw new Error('Storage is not available');
    const safeName = String(file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${unitId}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from(UNIT_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (upErr) throw upErr;
    const lower = (file.name || '').toLowerCase();
    const isPdf = file.type === 'application/pdf' || lower.endsWith('.pdf');
    const isVideo =
      !isPdf && (/^video\//.test(file.type || '') || /\.(mp4|mov|m4v|webm|avi|mkv)$/.test(lower));
    const kind = isPdf ? 'pdf' : isVideo ? 'video' : 'image';
    const { data, error } = await supabase
      .from('unit_files')
      .insert({
        unit_id: unitId,
        file_name: file.name,
        file_path: path,
        mime_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
        kind,
      })
      .select()
      .single();
    if (error) throw error;
    invalidateCache();
    return data;
  },

  /** Remove the storage object + metadata row (best-effort storage delete). */
  async deleteFile(fileId: string) {
    const supabase = createClient();
    const { data: meta } = await supabase
      .from('unit_files')
      .select('file_path')
      .eq('id', fileId)
      .single();
    const { error } = await supabase.from('unit_files').delete().eq('id', fileId);
    if (error) throw error;
    if (meta?.file_path) {
      await supabase.storage.from(UNIT_BUCKET).remove([meta.file_path]);
    }
    invalidateCache();
  },

  /** Get a short-lived signed URL so private unit files are viewable. */
  async getFileUrl(file: UnitFile): Promise<string> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase.storage
        .from(UNIT_BUCKET)
        .createSignedUrl(file.filePath, 60 * 60);
      if (error) throw error;
      return data?.signedUrl || '';
    } catch {
      return '';
    }
  },
};
// ─── RECOMMENDED UNITS (CALCULATOR → LEAD) ──────────────────────────────────

export const recommendedUnitsService = {
  async listByLead(leadId: string) {
    const supabase = createClient();
    const fetchWith = async (select: string) => {
      const { data, error } = await supabase
        .from('lead_recommended_units')
        .select(select)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map((row: any) => ({
        id: row.id,
        leadId: row.lead_id,
        unitId: row.unit_id,
        createdAt: row.created_at,
        unit: row.unit ? enrichRecommendedUnit(row.unit) : null,
      }));
    };
    try {
      // Selling points / payment plan summary were added later — fall back to
      // the plain join on databases that have not run the migration yet.
      return await fetchWith(
        '*, unit:units(*, projects(name, image_path, selling_points, payment_plan_summary))'
      );
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      try {
        return await fetchWith('*, unit:units(*, projects(name))');
      } catch (err2: any) {
        if (isSchemaError(err2)) throw err2;
        return [];
      }
    }
  },

  async add(leadId: string, unitId: string, userId?: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('lead_recommended_units')
      .insert({ lead_id: leadId, unit_id: unitId, created_by: userId || null })
      .select('*')
      .single();
    if (error) throw error;
    // Keep the lead timeline readable.
    await logActivity('Recommended Unit Added', 'lead', leadId, unitId).catch(() => {});
    return data;
  },

  async remove(leadId: string, unitId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('lead_recommended_units')
      .delete()
      .eq('lead_id', leadId)
      .eq('unit_id', unitId);
    if (error) throw error;
    await logActivity('Recommended Unit Removed', 'lead', leadId, unitId).catch(() => {});
  },
};

// ─── SITE VISITS (DASHBOARD COUNTS) ────────────────────────────────────────

export const siteVisitsService = {
  /** Scheduled (incl. in-progress) and completed visit counts — best-effort. */
  async getCounts() {
    const supabase = createClient();
    try {
      const [scheduled, completed] = await Promise.all([
        supabase
          .from('site_visits')
          .select('id', { count: 'exact', head: true })
          .in('status', ['scheduled', 'in_progress'])
          .then((r) => (r.error ? 0 : r.count || 0)),
        supabase
          .from('site_visits')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'completed')
          .then((r) => (r.error ? 0 : r.count || 0)),
      ]);
      return { scheduled: Number(scheduled || 0), completed: Number(completed || 0) };
    } catch {
      return { scheduled: 0, completed: 0 };
    }
  },
};

// ─── MESSAGE LOGS (BULK EMAIL / SMS) ────────────────────────────────────────

export const messageLogsService = {
  /** Send one personalized email. payload: {to, name, subject, html} */
  async sendEmail(payload: {
    to: string;
    name?: string;
    subject: string;
    html: string;
    entityType?: string;
    entityId?: string;
  }) {
    const res = await fetch('/api/messages/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        entity_type: payload.entityType,
        entity_id: payload.entityId,
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || 'Failed to send email');
    invalidateCache();
    return body.log;
  },

  /** Send one personalized SMS. payload: {to, name, message} */
  async sendSms(payload: {
    to: string;
    name?: string;
    message: string;
    entityType?: string;
    entityId?: string;
  }) {
    const res = await fetch('/api/messages/sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        entity_type: payload.entityType,
        entity_id: payload.entityId,
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || 'Failed to send SMS');
    invalidateCache();
    return body.log;
  },

  async listByEntity(entityType: string, entityId: string) {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('message_logs')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false });
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map((row: any) => ({
        id: row.id,
        channel: row.channel,
        recipientName: row.recipient_name,
        recipientPhone: row.recipient_phone,
        recipientEmail: row.recipient_email,
        subject: row.subject,
        message: row.message,
        status: row.status,
        error: row.error,
        createdAt: row.created_at,
      }));
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return [];
    }
  },
};

export const adminSettingsService = {
  async getAll() {
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) {
        if (isSchemaError(error)) throw error;
        return {};
      }
      const grouped: Record<string, any[]> = {};
      for (const row of data || []) {
        if (!grouped[row.category]) grouped[row.category] = [];
        grouped[row.category].push({
          id: row.id,
          name: row.name,
          color: row.color,
          order: row.sort_order,
          active: row.is_active,
        });
      }
      return grouped;
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return {};
    }
  },

  async create(category: string, item: any) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('admin_settings')
      .insert({
        category,
        name: item.name,
        color: item.color || null,
        sort_order: item.order || 0,
        is_active: item.active !== false,
      })
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      color: data.color,
      order: data.sort_order,
      active: data.is_active,
    };
  },

  async update(id: string, item: any) {
    const supabase = createClient();
    const { error } = await supabase
      .from('admin_settings')
      .update({
        name: item.name,
        color: item.color || null,
        sort_order: item.order || 0,
        is_active: item.active,
      })
      .eq('id', id);
    if (error) throw error;
  },

  async delete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('admin_settings').delete().eq('id', id);
    if (error) throw error;
  },
};

// ─── EXPENSES (admin operational costs) ───────────────────────────────────────

export interface Expense {
  id: string;
  title: string;
  category: string;
  amount: number;
  expense_date: string;
  notes: string;
  created_at: string;
}

export const expensesService = {
  async getAll(filters?: { from?: string; to?: string; category?: string }) {
    const params = new URLSearchParams();
    if (filters?.from) params.set('from', filters.from);
    if (filters?.to) params.set('to', filters.to);
    if (filters?.category && filters.category !== 'All') params.set('category', filters.category);
    const qs = params.toString();
    const res = await fetch(`/api/expenses${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      const err: any = new Error(j?.error || `Failed to load expenses (${res.status})`);
      if (j?.notInitialized) err.notInitialized = true;
      throw err;
    }
    const j = await res.json();
    if (j?.notInitialized) {
      const err: any = new Error('Expenses table not initialized yet');
      err.notInitialized = true;
      throw err;
    }
    return j.expenses || [];
  },

  async create(input: Partial<Expense>) {
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(j?.error || 'Failed to save expense');
    return j.expense;
  },

  async update(id: string, input: Partial<Expense>) {
    const res = await fetch(`/api/expenses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(j?.error || 'Failed to update expense');
    return j.expense;
  },

  async delete(id: string) {
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      throw new Error(j?.error || 'Failed to delete expense');
    }
  },
};

// ─── USERS (user_profiles) ────────────────────────────────────────────────────

export const usersService = {
  async getAll() {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*, admin:user_profiles!user_profiles_admin_id_fkey(id, full_name)')
        .order('created_at', { ascending: false });
      if (error) {
        if (isSchemaError(error)) {
          // admin_id migration not applied yet — fall back to a plain read.
          return this.getAllPlain();
        }
        return [];
      }
      return (data || []).map(rowToUserProfile);
    } catch (err: any) {
      if (isSchemaError(err)) return this.getAllPlain();
      return [];
    }
  },

  async getAllPlain() {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map(rowToUserProfile);
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return [];
    }
  },

  /** Only admins/owners (used by the "assigned admin" selector + lead routing). */
  async getAdmins() {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*, admin:user_profiles!user_profiles_admin_id_fkey(id, full_name)')
        .in('role', ['admin', 'owner'])
        .order('full_name', { ascending: true });
      if (error) {
        if (isSchemaError(error)) {
          const { data: plain } = await supabase
            .from('user_profiles')
            .select('*')
            .in('role', ['admin', 'owner'])
            .order('full_name', { ascending: true });
          return (plain || []).map(rowToUserProfile);
        }
        return [];
      }
      return (data || []).map(rowToUserProfile);
    } catch (err: any) {
      if (isSchemaError(err)) {
        const { data: plain } = await supabase
          .from('user_profiles')
          .select('*')
          .in('role', ['admin', 'owner'])
          .order('full_name', { ascending: true });
        return (plain || []).map(rowToUserProfile);
      }
      return [];
    }
  },

  /**
   * Create a user via the admin API route. The backend validates the payload,
   * enforces uniqueness, and provisions the auth account + profile in one call.
   */
  async createUser(payload: {
    fullName: string;
    email: string;
    password: string;
    role?: string;
    code?: string;
    adminId?: string | null;
  }) {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let message = `Failed to create user (${res.status})`;
      let fields: Record<string, string> | undefined;
      try {
        const body = await res.json();
        if (body?.error) message = body.error;
        if (body?.fields) fields = body.fields;
      } catch {
        /* ignore parse errors */
      }
      const err: any = new Error(message);
      err.status = res.status;
      if (fields) err.fields = fields;
      throw err;
    }
    const data = await res.json();
    if (!data?.user || typeof data.user !== 'object') {
      // The user was created server-side but we could not read its profile
      // back (e.g. optional admin_id/agent_code columns not migrated yet).
      // This is not a failure — surface a minimal profile so the admin list
      // still refreshes instead of showing a confusing error.
      return {
        id: data?.user?.id ?? '',
        email: payload.email,
        fullName: payload.fullName,
        phone: '',
        role: payload.role || 'agent',
        brokerageName: '',
        isActive: true,
        createdAt: new Date().toISOString(),
        agentCode: payload.code || '',
        adminId: payload.adminId || null,
      } as any;
    }
    return rowToUserProfile(data.user);
  },

  async update(
    id: string,
    updates: {
      fullName?: string;
      phone?: string;
      role?: string;
      teamId?: string | null;
      isActive?: boolean;
    }
  ) {
    const res = await fetch(`/api/admin/users`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        fullName: updates.fullName,
        phone: updates.phone,
        role: updates.role,
        teamId: updates.teamId,
        isActive: updates.isActive,
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const err: any = new Error(errBody?.error || `Failed to update user (${res.status})`);
      err.status = res.status;
      throw err;
    }
    const { user } = await res.json();
    invalidateCache();
    return rowToUserProfile(user);
  },

  /** Admin sets a user's base salary for payroll (user_profiles.base_salary). */
  async updateSalary(id: string, baseSalary: number) {
    // user_profiles RLS only allows users to update their own row, so the
    // write must go through the service-role API route.
    const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}/salary`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseSalary: Number(baseSalary) || 0 }),
    });
    if (!res.ok) {
      let message = `Failed to update salary (${res.status})`;
      try {
        const body = await res.json();
        if (body?.error) message = body.error;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }
    invalidateCache();
  },

  async delete(id: string) {
    const supabase = createClient();
    // The anon client cannot delete from auth.users (service-role only), so
    // deactivation is the supported "remove" action. Hard deletion is handled
    // server-side via /api/admin/users if ever needed.
    const { error: updateErr } = await supabase
      .from('user_profiles')
      .update({ is_active: false })
      .eq('id', id);
    if (updateErr) throw updateErr;
    invalidateCache();
  },

  async sendPasswordReset(email: string) {
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/sign-up-login`,
    });
    if (error) throw error;
  },

  /** Admin sets a new password for a user (secure, server-side, never logged). */
  async changePassword(id: string, password: string, confirmPassword: string) {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, confirmPassword }),
    });
    if (!res.ok) {
      let message = `Failed to change password (${res.status})`;
      try {
        const body = await res.json();
        if (body?.error) message = body.error;
      } catch {
        /* ignore parse errors */
      }
      throw new Error(message);
    }
  },

  async inviteUser(email: string, fullName: string, role: string) {
    const supabase = createClient();
    // Use signUp with a random password — user will reset via email
    const tempPassword = Math.random().toString(36).slice(-12) + 'A1!';
    const { data, error } = await supabase.auth.signUp({
      email,
      password: tempPassword,
      options: {
        data: { full_name: fullName, role },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/sign-up-login`,
      },
    });
    if (error) throw error;
    // Update profile with role
    if (data.user) {
      await supabase
        .from('user_profiles')
        .upsert(
          { id: data.user.id, email, full_name: fullName, role, is_active: true },
          { onConflict: 'id' }
        );
    }
    return data.user;
  },
};

function rowToUserProfile(row: any) {
  const admin = Array.isArray(row.admin) ? row.admin[0] : row.admin;
  const fullName = typeof row.full_name === 'string' ? row.full_name : row.full_name?.full_name || '';
  return {
    id: row.id,
    email: row.email,
    fullName,
    phone: row.phone || '',
    role: row.role || 'agent',
    brokerageName: row.brokerage_name || '',
    avatarUrl: row.avatar_url || '',
    isActive: row.is_active !== false,
    teamId: row.team_id || null,
    agentCode: row.agent_code || '',
    adminId: row.admin_id || null,
    adminName: typeof admin?.full_name === 'string' ? admin.full_name : null,
    baseSalary: Number(row.base_salary ?? 0),
    hireDate: row.hire_date || null,
    employmentStatus: row.employment_status || 'active',
    createdAt: row.created_at?.split('T')[0] || row.created_at,
  };
}

// ─── LEAD COMMENTS ────────────────────────────────────────────────────────────

export const leadCommentsService = {
  async getByLead(leadId: string) {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('lead_comments')
        .select(
          `
          id,
          body,
          created_at,
          user_id,
          user_profiles(id, full_name, email)
        `
        )
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true });
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map((row: any) => ({
        id: row.id,
        body: row.body,
        userId: row.user_id,
        authorName: row.user_profiles?.full_name || row.user_profiles?.email || 'Unknown',
        createdAt: row.created_at,
      }));
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return [];
    }
  },

  async create(leadId: string, body: string, userId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('lead_comments')
      .insert({ lead_id: leadId, body: body.trim(), user_id: userId })
      .select(
        `
        id,
        body,
        created_at,
        user_id,
        user_profiles(id, full_name, email)
      `
      )
      .single();
    if (error) throw error;
    return {
      id: data.id,
      body: data.body,
      userId: data.user_id,
      authorName:
        (data as any).user_profiles?.full_name || (data as any).user_profiles?.email || 'Unknown',
      createdAt: data.created_at,
    };
  },

  async delete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('lead_comments').delete().eq('id', id);
    if (error) throw error;
  },
};

// ─── CUSTOMERS (Won leads) ────────────────────────────────────────────────────

export const customersService = {
  async getAll() {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('lead_status', 'Won')
        .order('updated_at', { ascending: false });
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map(rowToCustomer);
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return [];
    }
  },

  async getStats() {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('lead_status, budget_max, source, property_type')
        .eq('lead_status', 'Won');
      if (error) {
        if (isSchemaError(error)) throw error;
        return { total: 0, totalRevenue: 0, bySource: {}, byPropertyType: {} };
      }
      const rows = data || [];
      const totalRevenue = rows.reduce((sum: number, r: any) => sum + Number(r.budget_max || 0), 0);
      const bySource: Record<string, number> = {};
      const byPropertyType: Record<string, number> = {};
      rows.forEach((r: any) => {
        if (r.source) bySource[r.source] = (bySource[r.source] || 0) + 1;
        if (r.property_type)
          byPropertyType[r.property_type] = (byPropertyType[r.property_type] || 0) + 1;
      });
      return { total: rows.length, totalRevenue, bySource, byPropertyType };
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return { total: 0, totalRevenue: 0, bySource: {}, byPropertyType: {} };
    }
  },
};

function rowToCustomer(row: any) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    propertyType: row.property_type,
    budgetMin: Number(row.budget_min),
    budgetMax: Number(row.budget_max),
    source: row.source,
    agent: row.agent,
    agentInitials: row.agent_initials,
    location: row.location,
    developer: row.developer,
    project: row.project,
    notes: row.notes,
    lastContact: row.last_contact,
    createdAt: row.created_at?.split('T')[0] || row.created_at,
    updatedAt: row.updated_at?.split('T')[0] || row.updated_at,
  };
}

// ─── REPORTS ─────────────────────────────────────────────────────────────────

export const reportsService = {
  getSummary(from?: string, to?: string) {
    // When a date range is requested, cache under a range-scoped key so the
    // all-time callers (dashboard charts) never share stale scoped data.
    const key = from && to ? `reportsSummary:${from}:${to}` : 'reportsSummary';
    return cachedRead(key, () => fetchReportsSummary(from, to));
  },

  async getCallsMatrix(filters: {
    from?: string;
    to?: string;
    agent?: string;
    teamLeader?: string;
    team?: string;
    project?: string;
    campaign?: string;
    source?: string;
    stage?: string;
  }) {
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.agent) params.set('agent', filters.agent);
    if (filters.teamLeader) params.set('teamLeader', filters.teamLeader);
    if (filters.team) params.set('team', filters.team);
    if (filters.project) params.set('project', filters.project);
    if (filters.campaign) params.set('campaign', filters.campaign);
    if (filters.source) params.set('source', filters.source);
    if (filters.stage) params.set('stage', filters.stage);
    const qs = params.toString();
    const res = await fetch(`/api/reports/calls-matrix${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
    if (!res.ok) {
      const err: any = new Error(`Failed to load calls matrix (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  },

  async getActivity(from: string, to: string) {
    const res = await fetch(
      `/api/reports/activity?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) throw new Error(`Failed to load activity report (${res.status})`);
    return res.json();
  },

  async getAttendanceReport(from: string, to: string) {
    const res = await fetch(
      `/api/attendance/report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) throw new Error(`Failed to load attendance report (${res.status})`);
    return res.json();
  },

  async getGoalsSummary(from: string, to: string) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const res = await fetch(`/api/reports/goals-summary?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) {
      const err: any = new Error(`Failed to load goals summary (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  },
};

async function fetchReportsSummary(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  const res = await fetch(`/api/reports/summary${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
  if (!res.ok) {
    const err: any = new Error(`Failed to load report data (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
