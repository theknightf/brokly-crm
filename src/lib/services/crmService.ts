'use client';

import { createClient } from '@/lib/supabase/client';

function isSchemaError(error: any): boolean {
  if (!error) return false;
  if (error.code && typeof error.code === 'string') {
    const errorClass = error.code.substring(0, 2);
    if (errorClass === '42') return true;
    if (errorClass === '23') return false;
    if (errorClass === '08') return true;
  }
  if (error.message) {
    const schemaErrorPatterns = [
      /relation.*does not exist/i,
      /column.*does not exist/i,
      /function.*does not exist/i,
      /syntax error/i,
      /type.*does not exist/i,
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

  async create(lead: any, userId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('leads')
      .insert(leadToRow(lead, userId))
      .select('*, assigned_to_profile:user_profiles!leads_assigned_to_fkey(id, full_name)')
      .single();
    if (error) throw error;
    invalidateCache();
    // Notify an assignee when a lead is created already assigned to someone.
    if (data?.assigned_to) {
      await pushAssignmentNotifications(supabase, [data.id], data.assigned_to, lead.agent);
    }
    await followUpsService.syncFromLead(data);
    return rowToLead(data);
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
      let query: any = supabase
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
    const { data, error } = await supabase
      .from('leads')
      .insert(rows.map((r) => leadToRow(r, userId)))
      .select('*, assigned_to_profile:user_profiles!leads_assigned_to_fkey(id, full_name)');
    if (error) throw error;
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
    if (error) throw error;
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
      .select('*')
      .single();
    if (error) throw error;
    await pushAssignmentNotifications(supabase, [id], assignedTo);
    await followUpsService.syncFromLead(data);
    invalidateCache();
  },

  async delete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('leads').delete().eq('id', id);
    if (error) throw error;
    invalidateCache();
  },

  async bulkDelete(ids: string[]) {
    const supabase = createClient();
    const { error } = await supabase.from('leads').delete().in('id', ids);
    if (error) throw error;
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

  async getStatusCounts() {
    const supabase = createClient();
    try {
      // Prefer the server-side aggregate (single rowset, no full-table transfer).
      const { data, error } = await supabase.rpc('get_lead_status_counts');
      if (!error && Array.isArray(data)) {
        const counts: Record<string, number> = {};
        (data as { status: string; count: number }[]).forEach((r) => {
          counts[r.status] = Number(r.count);
        });
        return counts;
      }
      if (error && isSchemaError(error)) throw error;
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
    }
    // Fallback: client-side aggregation over two light columns.
    return cachedRead('statusCounts', async () => {
      const { data, error } = await supabase.from('leads').select('crm_status, lead_status');
      if (error) {
        if (isSchemaError(error)) throw error;
        return {};
      }
      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        const s = row.crm_status || row.lead_status || 'Fresh Leads';
        counts[s] = (counts[s] || 0) + 1;
      });
      return counts;
    });
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
    propertyType?: string;
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
      propertyType = '',
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

      const q = search.trim();
      if (q) {
        query = query.or(
          `name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,location.ilike.%${q}%`
        );
      }
      if (status) query = query.eq('crm_status', status);
      if (source) query = query.eq('source', source);
      if (agent) query = query.eq('agent', agent);
      if (propertyType) query = query.eq('property_type', propertyType);

      const from = Math.max(0, (page - 1) * pageSize);
      const to = from + pageSize - 1;

      const { data, error, count } = await query
        .order(column, { ascending: sortDir !== 'desc' })
        .range(from, to);

      if (error) {
        if (isSchemaError(error)) throw error;
        return { data: [], total: 0, page, pageSize };
      }
      return {
        data: (data || []).map(rowToLead),
        total: count ?? (data || []).length,
        page,
        pageSize,
      };
    } catch (err: any) {
      if (isSchemaError(err)) throw err;
      return { data: [], total: 0, page, pageSize };
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
    adminId: row.admin_id || null,
    adminName: row.admin?.full_name || null,
    lastContact: row.last_contact,
    followUpDue: row.follow_up_due,
    notes: row.notes,
    location: row.location,
    developer: row.developer,
    project: row.project,
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
    await supabase.from('user_profiles').update({ team_id: teamId }).eq('id', userId);
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
};

function rowToProject(row: any) {
  return {
    id: row.id,
    name: row.name,
    developerId: row.developer_id,
    developerName: row.developers?.name || '',
    status: row.project_status,
    createdAt: row.created_at?.split('T')[0] || row.created_at,
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

// ─── ADMIN SETTINGS ──────────────────────────────────────────────────────────

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
    const supabase = createClient();
    const payload: any = {};
    if (updates.fullName !== undefined) payload.full_name = updates.fullName;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.role !== undefined) payload.role = updates.role;
    if (updates.teamId !== undefined) payload.team_id = updates.teamId;
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;
    payload.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('user_profiles')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    invalidateCache();
    return rowToUserProfile(data);
  },

  async delete(id: string) {
    const supabase = createClient();
    // Deleting from auth.users cascades to user_profiles via FK
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) {
      // Fallback: just deactivate if admin delete not available
      const { error: updateErr } = await supabase
        .from('user_profiles')
        .update({ is_active: false })
        .eq('id', id);
      if (updateErr) throw updateErr;
    }
  },

  async sendPasswordReset(email: string) {
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/sign-up-login`,
    });
    if (error) throw error;
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
        .upsert({ id: data.user.id, email, full_name: fullName, role, is_active: true })
        .eq('id', data.user.id);
    }
    return data.user;
  },
};

function rowToUserProfile(row: any) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name || '',
    phone: row.phone || '',
    role: row.role || 'agent',
    brokerageName: row.brokerage_name || '',
    avatarUrl: row.avatar_url || '',
    isActive: row.is_active !== false,
    teamId: row.team_id || null,
    agentCode: row.agent_code || '',
    adminId: row.admin_id || null,
    adminName: row.admin?.full_name || null,
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
  getSummary() {
    return cachedRead('reportsSummary', fetchReportsSummary);
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
};

async function fetchReportsSummary() {
  const res = await fetch('/api/reports/summary', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load report data (${res.status})`);
  return res.json();
}
