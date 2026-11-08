import { tool } from 'ai';
import { z } from 'zod';
import { fetchAllRows } from '@/lib/supabase/fetchAllRows';
import { isAdminRole } from '@/lib/roles';
import { normalizePhone } from '@/lib/phone';
import { ALL_REAL_STATUSES } from '@/app/leads-management/components/leadStages';
import { MAX_BULK, cairoToday, executeAssistantAction, getActor, type Actor, type AssistantAction } from './actions';
import { extractKeywords, normalizeArabic } from './arabicNormalizer';

/**
 * Owner-level CRM tools for the AI assistant.
 *
 * Authority = the signed-in user's own session (RLS). An owner/admin session sees and may change everything the
 * database lets an owner change; an agent session is limited exactly like in the app. No service-role key is used.
 * Reads run immediately. Single-record changes that were clearly requested run directly and are audited.
 * Call logging and anything bulk return a PREVIEW that a person must confirm (see /api/assistant/confirm).
 */

const STATUSES = ALL_REAL_STATUSES as [string, ...string[]];
const TERMINAL = ['Done Deal', 'Not Interested', 'Cancellation', 'Duplicate Leads', 'Wrong Number', 'Closed Number', 'Low Budget'];
const NEEDS_REVIEW_NOTE = 'Auto-synced from phone call log';

const safeTerm = (s: string) => s.replace(/[,()"'\\%*]/g, ' ').trim();
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fmtCairo = (iso?: string | null) =>
  iso
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
    : '';

/** UTC instant of Cairo midnight for a YYYY-MM-DD day (Egypt switches between UTC+2 and UTC+3). */
function cairoMidnightIso(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  for (const off of [2, 3]) {
    const t = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - off * 3600000);
    const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: false }).format(t);
    if (hm === '00:00' || hm === '24:00') return t.toISOString();
  }
  return new Date(Date.UTC(y, m - 1, d) - 2 * 3600000).toISOString();
}

function resolveRange(period?: string, from?: string, to?: string) {
  const today = cairoToday();
  let f = today;
  let t = today;
  if (from) {
    f = from;
    t = to || from;
  } else if (period === 'week') f = addDays(today, -6);
  else if (period === 'month') f = `${today.slice(0, 8)}01`;
  else if (period === 'yesterday') f = t = addDays(today, -1);
  return { from: f, to: t, label: f === t ? f : `${f} → ${t}` };
}

function toCsv(columns: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}

async function findUsers(supabase: any, name: string) {
  const term = safeTerm(name);
  if (!term) return [];
  const { data } = await supabase
    .from('user_profiles')
    .select('id, full_name, role')
    .eq('is_active', true)
    .ilike('full_name', `%${term}%`)
    .limit(8);
  return (data || []) as { id: string; full_name: string; role: string }[];
}

type Resolved = { ok: true; user: { id: string; full_name: string } } | { ok: false; result: any };
async function resolveAgent(supabase: any, name: string): Promise<Resolved> {
  const users = await findUsers(supabase, name);
  if (users.length === 0) return { ok: false, result: { success: false, error: `No active user matches "${name}".` } };
  const exact = users.filter((u) => u.full_name.trim().toLowerCase() === name.trim().toLowerCase());
  const pick = exact.length === 1 ? exact : users;
  if (pick.length > 1) {
    return {
      ok: false,
      result: {
        success: false,
        needsClarification: true,
        error: `More than one user matches "${name}". Ask which one.`,
        candidates: pick.map((u) => ({ id: u.id, name: u.full_name, role: u.role })),
      },
    };
  }
  return { ok: true, user: pick[0] };
}

async function idsForScope(supabase: any, agentName?: string, teamName?: string): Promise<{ ids: string[] | null; error?: any; label?: string }> {
  if (agentName) {
    const r = await resolveAgent(supabase, agentName);
    if (!r.ok) return { ids: null, error: r.result };
    return { ids: [r.user.id], label: r.user.full_name };
  }
  if (teamName) {
    const { data: teams } = await supabase.from('teams').select('id, name').ilike('name', `%${safeTerm(teamName)}%`).limit(3);
    if (!teams?.length) return { ids: null, error: { success: false, error: `No team matches "${teamName}".` } };
    if (teams.length > 1) {
      return {
        ids: null,
        error: { success: false, needsClarification: true, error: 'More than one team matches.', candidates: teams.map((t: any) => t.name) },
      };
    }
    const { data: members } = await supabase.from('team_memberships').select('user_id').eq('team_id', teams[0].id);
    return { ids: (members || []).map((m: any) => m.user_id), label: teams[0].name };
  }
  return { ids: null };
}

const leadCard = (l: any, snippet?: string) => ({
  leadId: l.id,
  name: l.name,
  phone: l.phone,
  status: l.crm_status,
  project: l.project || l.location || '',
  owner: l.agent || '',
  matchingSnippet: snippet ?? (l.notes ? String(l.notes).slice(0, 150) : null),
  openUrl: `/leads-management?lead=${l.id}`,
  whatsappUrl: l.phone ? `https://wa.me/${String(l.phone).replace(/\D/g, '')}` : null,
});

export function createOwnerTools(supabase: any, userId: string) {
  let actorPromise: Promise<Actor> | null = null;
  const actor = () => (actorPromise ||= getActor(supabase, userId));
  const isAdmin = async () => isAdminRole((await actor()).role);

  const direct = async (a: AssistantAction) => {
    try {
      const res = await executeAssistantAction(supabase, await actor(), a, { confirmed: false });
      return { success: true, message: res.message, entityId: res.entityId, before: res.before, after: res.after };
    } catch (e: any) {
      return { success: false, error: String(e?.message || e) };
    }
  };

  const adminOnly = { success: false, error: 'This report is for the owner or an admin only.' };

  async function leaderboardRows(from: string, to: string, ids: string[] | null) {
    const { data, error } = await supabase.rpc('period_leaderboard', { p_from: from, p_to: to });
    if (error) throw new Error(error.message);
    return ((data || []) as any[]).filter((r) => !ids || ids.includes(r.user_id));
  }

  return {
    // ─── READ ────────────────────────────────────────────────────────────
    search_customers: tool({
      description:
        'Find customers (leads) by name, phone number, project/area, notes, stage or assigned sales agent. Use this first to identify a customer and get its leadId before any change.',
      parameters: z.object({
        query: z.string().optional().describe('Name, phone, project, or keyword'),
        status: z.enum(STATUSES).optional().describe('Filter by stage'),
        agentName: z.string().optional().describe('Only customers assigned to this sales agent'),
        limit: z.number().int().min(1).max(15).optional().default(8),
      }),
      execute: async ({ query, status, agentName, limit }) => {
        let q = supabase
          .from('leads')
          .select('id, name, phone, crm_status, project, location, notes, agent, assigned_to, created_at')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (status) q = q.eq('crm_status', status);
        if (agentName) {
          const r = await resolveAgent(supabase, agentName);
          if (!r.ok) return r.result;
          q = q.eq('assigned_to', r.user.id);
        }
        if (query?.trim()) {
          const digits = normalizePhone(query);
          if (digits.length >= 6 && /^[\d\s+()-]+$/.test(query.trim())) {
            q = q.eq('phone_normalized', digits.slice(-10));
          } else {
            const term = safeTerm(extractKeywords(query)[0] || normalizeArabic(query) || query);
            q = q.or(`name.ilike.%${term}%,notes.ilike.%${term}%,project.ilike.%${term}%,location.ilike.%${term}%,phone.ilike.%${term}%`);
          }
        }
        const { data, error } = await q;
        if (error) return { success: false, error: error.message };
        return { matchCount: data?.length || 0, leads: (data || []).map((l: any) => leadCard(l)) };
      },
    }),

    get_customer_details: tool({
      description:
        'Full profile of one customer: stage, who is responsible, last interaction, recent calls, notes and next follow-up. Use to answer "what is this customer\'s status / who handles him / what was the last interaction".',
      parameters: z.object({ leadId: z.string().uuid() }),
      execute: async ({ leadId }) => {
        const { data: lead, error } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle();
        if (error || !lead) return { success: false, error: 'Customer not found or no permission.' };
        const [{ data: owner }, { data: comments }, { data: calls }, { data: lastChange }] = await Promise.all([
          lead.assigned_to
            ? supabase.from('user_profiles').select('full_name').eq('id', lead.assigned_to).maybeSingle()
            : Promise.resolve({ data: null }),
          supabase.from('lead_comments').select('body, created_at, user_profiles(full_name)').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(5),
          supabase
            .from('call_logs')
            .select('id, created_at, direction, duration_seconds, outcome, notes, channel')
            .or(`lead_id.eq.${leadId},entity_id.eq.${leadId}`)
            .order('created_at', { ascending: false })
            .limit(5),
          supabase.from('user_actions').select('created_at, payload').eq('lead_id', leadId).eq('action_type', 'STATUS_CHANGE').order('created_at', { ascending: false }).limit(1),
        ]);
        const lastCall = calls?.[0];
        return {
          customer: {
            leadId: lead.id,
            name: lead.name,
            phone: lead.phone,
            email: lead.email || null,
            status: lead.crm_status,
            responsibleAgent: owner?.full_name || lead.agent || 'Unassigned',
            source: lead.source || null,
            project: lead.project || null,
            budgetMax: lead.budget_max || null,
            nextFollowUp: lead.follow_up_due || null,
            lastActionAt: fmtCairo(lead.last_action_at) || null,
            lastStatusChange: lastChange?.[0] ? { at: fmtCairo(lastChange[0].created_at), to: lastChange[0].payload?.new_status } : null,
            lastCall: lastCall
              ? { at: fmtCairo(lastCall.created_at), direction: lastCall.direction, seconds: lastCall.duration_seconds, outcome: lastCall.outcome }
              : null,
            recentCalls: (calls || []).map((c: any) => ({ at: fmtCairo(c.created_at), outcome: c.outcome, direction: c.direction, seconds: c.duration_seconds, notes: c.notes })),
            recentNotes: (comments || []).map((c: any) => ({ at: fmtCairo(c.created_at), by: c.user_profiles?.full_name || '', text: String(c.body).slice(0, 300) })),
          },
          leads: [leadCard(lead)],
        };
      },
    }),

    get_customer_activity: tool({
      description: 'Chronological activity of one customer: stage changes, calls and notes (newest first).',
      parameters: z.object({ leadId: z.string().uuid(), limit: z.number().int().min(1).max(40).optional().default(20) }),
      execute: async ({ leadId, limit }) => {
        const [{ data: acts }, { data: calls }, { data: notes }] = await Promise.all([
          supabase.from('user_actions').select('created_at, action_type, payload, user_id').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(limit),
          supabase.from('call_logs').select('created_at, outcome, direction, duration_seconds, notes, user_id').or(`lead_id.eq.${leadId},entity_id.eq.${leadId}`).order('created_at', { ascending: false }).limit(limit),
          supabase.from('lead_comments').select('created_at, body, user_id').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(limit),
        ]);
        const userIds = Array.from(new Set([...(acts || []), ...(calls || []), ...(notes || [])].map((r: any) => r.user_id).filter(Boolean)));
        const names = new Map<string, string>();
        if (userIds.length) {
          const { data: us } = await supabase.from('user_profiles').select('id, full_name').in('id', userIds as string[]);
          for (const u of us || []) names.set(u.id, u.full_name);
        }
        const events = [
          ...(acts || [])
            .filter((a: any) => a.action_type === 'STATUS_CHANGE' && a.payload?.new_status)
            .map((a: any) => ({ at: a.created_at, type: 'status', text: `${a.payload.old_status || '?'} → ${a.payload.new_status}`, by: names.get(a.user_id) || '' })),
          ...(calls || []).map((c: any) => ({ at: c.created_at, type: 'call', text: `${c.direction || ''} ${c.duration_seconds || 0}s — ${c.outcome || ''}${c.notes ? ` — ${String(c.notes).slice(0, 120)}` : ''}`, by: names.get(c.user_id) || '' })),
          ...(notes || []).map((n: any) => ({ at: n.created_at, type: 'note', text: String(n.body).slice(0, 200), by: names.get(n.user_id) || '' })),
        ]
          .sort((a, b) => (a.at < b.at ? 1 : -1))
          .slice(0, limit)
          .map((e) => ({ ...e, at: fmtCairo(e.at) }));
        return { leadId, events };
      },
    }),

    get_call_history: tool({
      description:
        'Latest calls recorded in the CRM (including calls the mobile app synced from the phone call log, which only exist if the agent enabled call sync). Filter by customer, phone, agent or days. needsReview=true means an auto-synced call nobody described yet. Never claim access to the phone itself.',
      parameters: z.object({
        leadId: z.string().uuid().optional(),
        phone: z.string().optional(),
        agentName: z.string().optional(),
        days: z.number().int().min(1).max(90).optional().default(7),
        onlyNeedingReview: z.boolean().optional().default(false),
        limit: z.number().int().min(1).max(30).optional().default(10),
      }),
      execute: async ({ leadId, phone, agentName, days, onlyNeedingReview, limit }) => {
        const since = new Date(Date.now() - days * 86400000).toISOString();
        let q = supabase
          .from('call_logs')
          .select('id, created_at, direction, duration_seconds, outcome, notes, channel, contact_name, contact_phone, lead_id, entity_id, user_id, source')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (leadId) q = q.or(`lead_id.eq.${leadId},entity_id.eq.${leadId}`);
        if (phone) q = q.ilike('contact_phone', `%${normalizePhone(phone).slice(-9)}%`);
        if (agentName) {
          const r = await resolveAgent(supabase, agentName);
          if (!r.ok) return r.result;
          q = q.eq('user_id', r.user.id);
        }
        if (onlyNeedingReview) q = q.eq('source', 'device_sync').eq('notes', NEEDS_REVIEW_NOTE);
        const { data, error } = await q;
        if (error) return { success: false, error: error.message };
        const uids = Array.from(new Set((data || []).map((c: any) => c.user_id).filter(Boolean)));
        const names = new Map<string, string>();
        if (uids.length) {
          const { data: us } = await supabase.from('user_profiles').select('id, full_name').in('id', uids as string[]);
          for (const u of us || []) names.set(u.id, u.full_name);
        }
        return {
          count: data?.length || 0,
          calls: (data || []).map((c: any) => ({
            callId: c.id,
            at: fmtCairo(c.created_at),
            direction: c.direction,
            durationSeconds: c.duration_seconds,
            outcome: c.outcome,
            notes: c.notes,
            channel: c.channel,
            customer: { leadId: c.lead_id || (/^[0-9a-f-]{36}$/i.test(c.entity_id || '') ? c.entity_id : null), name: c.contact_name, phone: c.contact_phone },
            agent: names.get(c.user_id) || '',
            needsReview: c.source === 'device_sync' && c.notes === NEEDS_REVIEW_NOTE,
          })),
          note:
            'Only calls stored in the CRM are visible: the mobile app syncs calls of numbers that match CRM customers, and only when the agent turned call sync on.',
        };
      },
    }),

    get_overdue_followups: tool({
      description: 'Customers whose follow-up date has passed (not closed stages), with counts per sales agent. Optional agent filter.',
      parameters: z.object({ agentName: z.string().optional(), limit: z.number().int().min(1).max(20).optional().default(10) }),
      execute: async ({ agentName, limit }) => {
        const today = cairoToday();
        const sc = await idsForScope(supabase, agentName);
        if (sc.error) return sc.error;
        const { data, error } = await fetchAllRows<any>(
          (from, to) => {
            let q = supabase
              .from('leads')
              .select('id, name, phone, crm_status, follow_up_due, agent, assigned_to, project')
              .lt('follow_up_due', today)
              .not('crm_status', 'in', `(${TERMINAL.map((s) => `"${s}"`).join(',')})`)
              .order('follow_up_due', { ascending: true })
              .order('id', { ascending: true })
              .range(from, to);
            if (sc.ids) q = q.in('assigned_to', sc.ids);
            return q;
          },
          1000,
          10000
        );
        if (error) return { success: false, error: error.message };
        const byAgent = new Map<string, number>();
        for (const l of data) byAgent.set(l.agent || 'Unassigned', (byAgent.get(l.agent || 'Unassigned') || 0) + 1);
        const daysLate = (d: string) => Math.max(1, Math.round((Date.parse(today) - Date.parse(d)) / 86400000));
        return {
          total: data.length,
          byAgent: Array.from(byAgent.entries()).map(([agent, count]) => ({ agent, count })).sort((a, b) => b.count - a.count),
          leads: data.slice(0, limit).map((l: any) => leadCard(l, `متأخر ${daysLate(String(l.follow_up_due))} يوم (${l.follow_up_due})`)),
        };
      },
    }),

    get_unupdated_customer_statuses: tool({
      description:
        'Customers who had a call recently but whose stage was NOT changed after that call (call newer than the last stage change). Use to find missing status updates.',
      parameters: z.object({
        days: z.number().int().min(1).max(60).optional().default(7),
        agentName: z.string().optional(),
        limit: z.number().int().min(1).max(20).optional().default(10),
      }),
      execute: async ({ days, agentName, limit }) => {
        const since = new Date(Date.now() - days * 86400000).toISOString();
        const sc = await idsForScope(supabase, agentName);
        if (sc.error) return sc.error;
        let cq = supabase
          .from('call_logs')
          .select('id, created_at, lead_id, entity_id, outcome, user_id')
          .gte('created_at', since)
          .ilike('channel', 'call')
          .order('created_at', { ascending: false })
          .limit(600);
        if (sc.ids) cq = cq.in('user_id', sc.ids);
        const { data: calls, error } = await cq;
        if (error) return { success: false, error: error.message };
        const lastCall = new Map<string, any>();
        for (const c of calls || []) {
          const lid = c.lead_id || (/^[0-9a-f-]{36}$/i.test(c.entity_id || '') ? c.entity_id : null);
          if (lid && !lastCall.has(lid)) lastCall.set(lid, c);
        }
        const leadIds = Array.from(lastCall.keys());
        const lastChange = new Map<string, string>();
        for (let i = 0; i < leadIds.length; i += 80) {
          const { data: acts } = await supabase
            .from('user_actions')
            .select('lead_id, created_at')
            .eq('action_type', 'STATUS_CHANGE')
            .in('lead_id', leadIds.slice(i, i + 80))
            .order('created_at', { ascending: false });
          for (const a of acts || []) if (!lastChange.has(a.lead_id)) lastChange.set(a.lead_id, a.created_at);
        }
        const stale = leadIds.filter((id) => {
          const ch = lastChange.get(id);
          return !ch || ch < lastCall.get(id).created_at;
        });
        const leads: any[] = [];
        for (let i = 0; i < stale.length && leads.length < limit; i += 80) {
          const { data: ls } = await supabase
            .from('leads')
            .select('id, name, phone, crm_status, agent, project, notes')
            .in('id', stale.slice(i, i + 80));
          for (const l of ls || []) {
            if (leads.length >= limit) break;
            const c = lastCall.get(l.id);
            leads.push(leadCard(l, `آخر مكالمة ${fmtCairo(c.created_at)} (${c.outcome || '—'}) والمرحلة لم تتغير بعدها`));
          }
        }
        return { windowDays: days, customersWithCalls: leadIds.length, notUpdated: stale.length, leads };
      },
    }),

    get_sales_report: tool({
      description:
        'Real-time sales/activity report from CRM data for a date range, optionally for one agent or one team: calls, answered, status updates, meetings, deals, new leads, stage distribution, per-agent table. Returns a table and CSV.',
      parameters: z.object({
        period: z.enum(['today', 'yesterday', 'week', 'month']).optional().default('today'),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        agentName: z.string().optional(),
        teamName: z.string().optional(),
      }),
      execute: async ({ period, from, to, agentName, teamName }) => {
        if (!(await isAdmin()) && (agentName || teamName)) return adminOnly;
        const range = resolveRange(period, from, to);
        const sc = await idsForScope(supabase, agentName, teamName);
        if (sc.error) return sc.error;
        const me = await actor();
        const scopeIds = sc.ids ?? ((await isAdmin()) ? null : [me.id]);
        const rows = await leaderboardRows(range.from, range.to, scopeIds);
        const active = rows.filter((r) => r.calls || r.status_updates || r.meetings || r.deals || r.notes || r.leads_added);
        const sum = (k: string) => active.reduce((s, r) => s + Number(r[k] || 0), 0);

        const startIso = cairoMidnightIso(range.from);
        const endIso = cairoMidnightIso(addDays(range.to, 1));
        let nq = supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', startIso).lt('created_at', endIso);
        if (scopeIds) nq = nq.in('assigned_to', scopeIds);
        const { count: newLeads } = await nq;

        const { data: stageRows } = await fetchAllRows<any>(
          (f, t) => {
            let q = supabase.from('leads').select('crm_status').order('id', { ascending: true }).range(f, t);
            if (scopeIds) q = q.in('assigned_to', scopeIds);
            return q;
          },
          1000,
          20000
        );
        const dist = new Map<string, number>();
        for (const r of stageRows) dist.set(r.crm_status || 'Fresh Leads', (dist.get(r.crm_status || 'Fresh Leads') || 0) + 1);
        const totalLeads = stageRows.length;
        const deals = dist.get('Done Deal') || 0;

        const columns = ['Agent', 'Calls', 'Answered', 'Status updates', 'Meetings', 'Deals', 'Notes', 'New leads'];
        const table = active
          .slice()
          .sort((a, b) => b.status_updates - a.status_updates || b.calls - a.calls)
          .map((r) => [r.full_name, r.calls, r.answered_calls, r.status_updates, r.meetings, r.deals, r.notes, r.leads_added]);
        const stages = Array.from(dist.entries()).sort((a, b) => b[1] - a[1]);
        const csv = toCsv(columns, table) + '\n\nStage,Customers\n' + stages.map(([s, c]) => `${s},${c}`).join('\n');
        return {
          report: {
            title: `Sales report — ${sc.label || (scopeIds ? me.name : 'all agents')}`,
            period: range.label,
            summary: [
              { label: 'Calls', value: sum('calls') },
              { label: 'Answered', value: sum('answered_calls') },
              { label: 'Status updates', value: sum('status_updates') },
              { label: 'Meetings', value: sum('meetings') },
              { label: 'New leads', value: newLeads || 0 },
              { label: 'Done deals (all time)', value: deals },
              { label: 'Total customers', value: totalLeads },
              { label: 'Done Deal share', value: totalLeads ? `${((deals / totalLeads) * 100).toFixed(1)}%` : '0%' },
            ],
            columns,
            rows: table,
            stageDistribution: stages.map(([stage, count]) => ({ stage, count })),
            csv,
            filename: `sales-report-${range.from}_${range.to}.csv`,
          },
        };
      },
    }),

    get_agent_performance: tool({
      description: 'Performance of one sales agent for a period (owner/admin only): calls, answered, status updates, meetings, deals, overdue follow-ups, customers. Also use for "best agent" by passing no agentName.',
      parameters: z.object({
        agentName: z.string().optional(),
        period: z.enum(['today', 'yesterday', 'week', 'month']).optional().default('month'),
      }),
      execute: async ({ agentName, period }) => {
        if (!(await isAdmin())) return adminOnly;
        const range = resolveRange(period);
        const sc = await idsForScope(supabase, agentName);
        if (sc.error) return sc.error;
        const rows = (await leaderboardRows(range.from, range.to, sc.ids)).filter((r) => ['agent', 'team_leader', 'senior_agent'].includes(String(r.role)) || sc.ids);
        const ranked = rows.slice().sort((a, b) => b.status_updates - a.status_updates || b.calls - a.calls);
        const out: any[] = [];
        for (const r of (agentName ? ranked : ranked.slice(0, 5)).filter((x) => x.calls || x.status_updates || agentName)) {
          const today = cairoToday();
          const [{ count: overdue }, { count: customers }] = await Promise.all([
            supabase.from('leads').select('id', { count: 'exact', head: true }).eq('assigned_to', r.user_id).lt('follow_up_due', today).not('crm_status', 'in', `(${TERMINAL.map((s) => `"${s}"`).join(',')})`),
            supabase.from('leads').select('id', { count: 'exact', head: true }).eq('assigned_to', r.user_id),
          ]);
          out.push({ agent: r.full_name, calls: r.calls, answered: r.answered_calls, statusUpdates: r.status_updates, meetings: r.meetings, deals: r.deals, notes: r.notes, overdueFollowUps: overdue || 0, customers: customers || 0 });
        }
        return { period: range.label, best: !agentName && out[0] ? out[0].agent : undefined, agents: out };
      },
    }),

    get_owner_insights: tool({
      description:
        'Owner dashboard insights: overdue follow-ups per agent, calls nobody described yet, customers with a call but no stage update, unassigned customers. Use for "what needs my attention".',
      parameters: z.object({}),
      execute: async () => {
        if (!(await isAdmin())) return adminOnly;
        const today = cairoToday();
        const since = new Date(Date.now() - 14 * 86400000).toISOString();
        const terminal = `(${TERMINAL.map((s) => `"${s}"`).join(',')})`;
        const [{ data: overdue }, { count: unreviewed }, { count: unassigned }] = await Promise.all([
          fetchAllRows<any>((f, t) =>
            supabase.from('leads').select('agent').lt('follow_up_due', today).not('crm_status', 'in', terminal).order('id').range(f, t), 1000, 10000),
          supabase.from('call_logs').select('id', { count: 'exact', head: true }).eq('source', 'device_sync').eq('notes', NEEDS_REVIEW_NOTE).gte('created_at', since),
          supabase.from('leads').select('id', { count: 'exact', head: true }).is('assigned_to', null).not('crm_status', 'in', terminal),
        ]);
        const byAgent = new Map<string, number>();
        for (const l of overdue || []) byAgent.set(l.agent || 'Unassigned', (byAgent.get(l.agent || 'Unassigned') || 0) + 1);
        const topOverdue = Array.from(byAgent.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const items = [
          { key: 'overdue', count: overdue?.length || 0, text: `${overdue?.length || 0} متابعة متأخرة${topOverdue[0] ? ` (الأكثر: ${topOverdue[0][0]} ${topOverdue[0][1]})` : ''}`, prompt: 'اعرضلي المتابعات المتأخرة' },
          { key: 'calls', count: unreviewed || 0, text: `${unreviewed || 0} مكالمة متزامنة من الموبايل لسه محدش وصف نتيجتها (آخر 14 يوم)`, prompt: 'اعرضلي المكالمات اللي محتاجة تسجيل نتيجة' },
          { key: 'status', count: -1, text: 'عملاء ليهم مكالمة ومرحلتهم متغيرتش بعدها', prompt: 'مين العملاء اللي مرحلتهم متحدثتش بعد آخر مكالمة؟' },
          { key: 'unassigned', count: unassigned || 0, text: `${unassigned || 0} عميل نشط من غير مسؤول`, prompt: 'اعرضلي العملاء اللي مالهمش مسؤول' },
        ].filter((i) => i.count !== 0);
        return { insights: { date: today, items, overdueByAgent: topOverdue.map(([agent, count]) => ({ agent, count })) } };
      },
    }),

    // ─── WRITE (direct: single record, clearly requested) ────────────────
    update_customer_status: tool({
      description:
        'Change one customer\'s stage. Call ONLY when the user clearly asked for it and you already identified the customer by leadId (via search_customers). Executes immediately and is audited.',
      parameters: z.object({ leadId: z.string().uuid(), newStatus: z.enum(STATUSES) }),
      execute: async ({ leadId, newStatus }) => direct({ action: 'update_customer_status', leadId, newStatus }),
    }),

    assign_customer: tool({
      description:
        'Assign / reassign ONE customer to a sales agent (owner/admin only). Identify the customer by leadId first. If the agent name is ambiguous the result lists candidates: ask the user which one.',
      parameters: z.object({ leadId: z.string().uuid(), agentName: z.string().min(2) }),
      execute: async ({ leadId, agentName }) => {
        const r = await resolveAgent(supabase, agentName);
        if (!r.ok) return r.result;
        return direct({ action: 'assign_customer', leadId, userId: r.user.id });
      },
    }),

    create_customer: tool({
      description: 'Create a new customer (lead). Fails if the phone number already exists. Needs a name and a phone number.',
      parameters: z.object({
        name: z.string().min(2),
        phone: z.string().min(7),
        source: z.string().optional(),
        project: z.string().optional(),
        notes: z.string().optional(),
        assignToAgentName: z.string().optional(),
      }),
      execute: async ({ name, phone, source, project, notes, assignToAgentName }) => {
        let assignToUserId: string | undefined;
        if (assignToAgentName) {
          const r = await resolveAgent(supabase, assignToAgentName);
          if (!r.ok) return r.result;
          assignToUserId = r.user.id;
        }
        return direct({ action: 'create_customer', name, phone, source, project, notes, assignToUserId });
      },
    }),

    create_follow_up: tool({
      description: 'Schedule / change the follow-up date of ONE customer (YYYY-MM-DD). Executes immediately when clearly requested, and is audited.',
      parameters: z.object({
        leadId: z.string().uuid(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        note: z.string().optional(),
      }),
      execute: async ({ leadId, dueDate, note }) => direct({ action: 'create_followup', leadId, dueDate, note }),
    }),

    // ─── WRITE (preview → human confirmation) ────────────────────────────
    log_call: tool({
      description:
        'Prepare to record a call result for a customer: outcome, direction, duration, notes, optional new stage and follow-up date. Use after the agent told you what happened (never invent it). Optionally pass callLogId to attach an existing synced call. This only shows a PREVIEW; the user must press Confirm.',
      parameters: z.object({
        leadId: z.string().uuid(),
        outcome: z.string().min(2).describe('e.g. Interested, No Answer, Not Interested, Call back later, Meeting, Follow-up'),
        direction: z.enum(['outgoing', 'incoming', 'missed']).optional().default('outgoing'),
        durationSeconds: z.number().int().min(0).max(14400).optional().default(0),
        notes: z.string().max(1000).optional(),
        callLogId: z.string().uuid().optional(),
        newStatus: z.enum(STATUSES).optional(),
        followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
      execute: async (p) => {
        const { data: lead } = await supabase.from('leads').select('id, name, crm_status').eq('id', p.leadId).maybeSingle();
        if (!lead) return { success: false, error: 'Customer not found or no permission.' };
        return {
          type: 'pending_action',
          action: 'log_call',
          ...p,
          leadName: lead.name,
          confirmationRequired: true,
          message: `تسجيل مكالمة مع ${lead.name}: النتيجة "${p.outcome}"`,
          details: [
            `الاتجاه: ${p.direction} — المدة: ${p.durationSeconds}s`,
            p.newStatus ? `المرحلة: ${lead.crm_status} ← ${p.newStatus}` : `المرحلة تفضل: ${lead.crm_status}`,
            p.followUpDate ? `متابعة: ${p.followUpDate}` : 'لا توجد متابعة جديدة (هتتشال من قايمة المتابعات)',
            ...(p.notes ? [`ملاحظات: ${p.notes}`] : []),
          ],
        };
      },
    }),

    bulk_update_status: tool({
      description:
        'Prepare a BULK stage change (owner/admin only, max 100). Select customers by current stage and/or agent (or explicit leadIds). Shows a preview with the count; the owner must confirm.',
      parameters: z.object({
        newStatus: z.enum(STATUSES),
        fromStatus: z.enum(STATUSES).optional(),
        agentName: z.string().optional(),
        leadIds: z.array(z.string().uuid()).max(MAX_BULK).optional(),
      }),
      execute: async ({ newStatus, fromStatus, agentName, leadIds }) => {
        if (!(await isAdmin())) return adminOnly;
        const sel = await selectBulk(supabase, { fromStatus, agentName, leadIds });
        if (!sel.ok) return sel.result;
        return {
          type: 'pending_action',
          action: 'bulk_update_status',
          leadIds: sel.ids,
          newStatus,
          confirmationRequired: true,
          message: `تغيير مرحلة ${sel.ids.length} عميل إلى "${newStatus}"${sel.more ? ' (فيه عملاء أكتر من الحد، هيتم أول ' + MAX_BULK + ' فقط)' : ''}`,
          details: sel.sample,
        };
      },
    }),

    bulk_assign_customers: tool({
      description:
        'Prepare a BULK assignment of customers to one sales agent (owner/admin only, max 100). Select by current stage and/or current agent (or explicit leadIds). Shows a preview; the owner must confirm.',
      parameters: z.object({
        toAgentName: z.string().min(2),
        fromStatus: z.enum(STATUSES).optional(),
        fromAgentName: z.string().optional(),
        leadIds: z.array(z.string().uuid()).max(MAX_BULK).optional(),
      }),
      execute: async ({ toAgentName, fromStatus, fromAgentName, leadIds }) => {
        if (!(await isAdmin())) return adminOnly;
        const target = await resolveAgent(supabase, toAgentName);
        if (!target.ok) return target.result;
        const sel = await selectBulk(supabase, { fromStatus, agentName: fromAgentName, leadIds });
        if (!sel.ok) return sel.result;
        return {
          type: 'pending_action',
          action: 'bulk_assign',
          leadIds: sel.ids,
          userId: target.user.id,
          confirmationRequired: true,
          message: `تعيين ${sel.ids.length} عميل إلى ${target.user.full_name}${sel.more ? ' (أول ' + MAX_BULK + ' فقط)' : ''}`,
          details: sel.sample,
        };
      },
    }),
  };
}

async function selectBulk(
  supabase: any,
  p: { fromStatus?: string; agentName?: string; leadIds?: string[] }
): Promise<{ ok: true; ids: string[]; sample: string[]; more: boolean } | { ok: false; result: any }> {
  let q = supabase.from('leads').select('id, name, crm_status, agent', { count: 'exact' }).order('created_at', { ascending: false }).limit(MAX_BULK);
  if (p.leadIds?.length) q = q.in('id', p.leadIds);
  else if (!p.fromStatus && !p.agentName) {
    return { ok: false, result: { success: false, error: 'Give a stage, an agent, or explicit customers to select.' } };
  }
  if (p.fromStatus) q = q.eq('crm_status', p.fromStatus);
  if (p.agentName) {
    const r = await resolveAgent(supabase, p.agentName);
    if (!r.ok) return { ok: false, result: r.result };
    q = q.eq('assigned_to', r.user.id);
  }
  const { data, error, count } = await q;
  if (error) return { ok: false, result: { success: false, error: error.message } };
  if (!data?.length) return { ok: false, result: { success: false, error: 'No customer matches that selection.' } };
  return {
    ok: true,
    ids: data.map((l: any) => l.id),
    sample: data.slice(0, 8).map((l: any) => `${l.name} — ${l.crm_status}${l.agent ? ` — ${l.agent}` : ''}`).concat(data.length > 8 ? [`… و${data.length - 8} آخرين`] : []),
    more: (count || 0) > data.length,
  };
}
