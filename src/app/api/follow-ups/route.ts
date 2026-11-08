import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';
import { fetchAllRows } from '@/lib/supabase/fetchAllRows';

export const dynamic = 'force-dynamic';

function getSupabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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

/**
 * GET /api/follow-ups — list all follow-ups (any signed-in member).
 *
 * Why this route exists: the Follow-ups page previously read the
 * `follow_ups` table straight from the browser, so any RLS hiccup, missing
 * migration, or network failure collapsed silently to `[]` and the page
 * looked blank with no error. This endpoint runs service-side
 * (service-role, RLS-proof) and returns the canonical contract
 * `{ followUps, count }` — the same shape as
 * GET /api/workspace/follow-ups — with deliberately NO default filters
 * (no user_id / status / date constraint), so valid rows are never excluded.
 * Related data needs no join: every field the UI renders (contact, agent,
 * property, notes) is denormalized on the row; `leadId` is only used to
 * deep-link to the lead.
 */
export async function GET() {
  const serverClient = await createServerClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db: any = getSupabaseService();
    let profileRole: string | null = null;
    try {
      const { data: p } = await serverClient.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
      profileRole = (p as any)?.role || null;
    } catch {}

    const isAdmin = isAdminRole(profileRole as any);
    const isTeamLeader = !isAdmin && (profileRole === 'team_leader' || profileRole === 'Team Lead' || profileRole === 'manager');

    // A plain `.limit(500)` returned only the 500 OLDEST rows (everything due up to mid-October), so the owner's list
    // showed stale items and none of today's or upcoming follow-ups. Read every row, page by page, instead.
    const base = () =>
      db.from('follow_ups').select('*').order('due_date', { ascending: true }).order('id', { ascending: true });
    let scope: (q: any) => any = (q) => q;

    if (!isAdmin) {
      if (isTeamLeader) {
        // Team Leader: view follow-ups belonging to self and all team members
        let memberIds: string[] = [user.id];
        try {
          const { data: teams } = await db.from('teams').select('id').eq('leader_id', user.id);
          const teamIds = (teams || []).map((t: any) => t.id);
          if (teamIds.length > 0) {
            const { data: members } = await db.from('team_memberships').select('user_id').in('team_id', teamIds);
            if (members && members.length > 0) {
              memberIds = Array.from(new Set([user.id, ...members.map((m: any) => m.user_id)]));
            }
          }
        } catch {}

        // Fetch leads assigned to or created by any team member
        const { data: teamLeads } = await db.from('leads').select('id').or(
          `assigned_to.in.(${memberIds.join(',')}),created_by.in.(${memberIds.join(',')})`
        );
        const leadIds = (teamLeads || []).map((l: any) => l.id);

        if (leadIds.length > 0) {
          scope = (q) => q.or(`created_by.in.(${memberIds.join(',')}),lead_id.in.(${leadIds.join(',')})`);
        } else {
          scope = (q) => q.in('created_by', memberIds);
        }
      } else {
        // Regular Agent: only follow-ups created by user or linked to leads assigned to / created by user
        const { data: userLeads } = await db.from('leads').select('id').or(
          `assigned_to.eq.${user.id},created_by.eq.${user.id}`
        );
        const leadIds = (userLeads || []).map((l: any) => l.id);

        if (leadIds.length > 0) {
          scope = (q) => q.or(`created_by.eq.${user.id},lead_id.in.(${leadIds.join(',')})`);
        } else {
          scope = (q) => q.eq('created_by', user.id);
        }
      }
    }
    const { data, error } = await fetchAllRows<any>((from, to) => scope(base()).range(from, to), 1000, 10000);
    if (error) {
      // Same convention as /api/workspace/follow-ups: HTTP 200 with an empty
      // list + error text, so the UI can show the message instead of a blank page.
      return NextResponse.json(
        { followUps: [], count: 0, error: error.message },
        { status: 200 }
      );
    }
    // A follow-up linked to a lead is only "live" while the lead still carries that follow-up date: once the agent
    // calls/updates the lead, follow_up_due is cleared (unless a new date is set), so the row must leave the queue.
    // Closed rows (Completed / Cancelled) stay for history. Rows without a lead are kept as they are.
    const all: any[] = data || [];
    const leadIds = Array.from(new Set(all.map((r) => r.lead_id).filter(Boolean))) as string[];
    const leadMap = new Map<string, any>();
    for (let i = 0; i < leadIds.length; i += 150) {
      const chunk = leadIds.slice(i, i + 150);
      const { data: ls } = await db
        .from('leads')
        .select('id, name, phone, crm_status, assigned_to, follow_up_due, budget_max, last_action_at')
        .in('id', chunk);
      for (const l of ls || []) leadMap.set(l.id, l);
    }
    // Latest call per lead (context for the cockpit cards). Best-effort: the view may not exist on older databases.
    const lastCalls = new Map<string, any>();
    try {
      for (let i = 0; i < leadIds.length; i += 150) {
        const { data: cs } = await db
          .from('lead_last_call')
          .select('lead_id, created_at, outcome')
          .in('lead_id', leadIds.slice(i, i + 150));
        for (const c of cs || []) lastCalls.set(c.lead_id, c);
      }
    } catch {}
    const ownerIds = Array.from(new Set(Array.from(leadMap.values()).map((l) => l.assigned_to).filter(Boolean))) as string[];
    const ownerNames = new Map<string, string>();
    for (let i = 0; i < ownerIds.length; i += 150) {
      const { data: us } = await db.from('user_profiles').select('id, name').in('id', ownerIds.slice(i, i + 150));
      for (const u of us || []) ownerNames.set(u.id, u.name);
    }
    const TERMINAL = new Set([
      'done deal', 'not interested', 'cancellation', 'duplicate leads', 'wrong number', 'closed number', 'low budget',
    ]);
    const seenLeads = new Set<string>();
    const live = all.filter((r) => {
      if (!r.lead_id) return true;
      if (['Completed', 'Cancelled'].includes(r.follow_up_status)) return true;
      const lead = leadMap.get(r.lead_id);
      if (!lead || !lead.follow_up_due) return false;
      if (String(lead.follow_up_due).slice(0, 10) !== String(r.due_date).slice(0, 10)) return false;
      if (TERMINAL.has(String(lead.crm_status || '').toLowerCase())) return false;
      if (seenLeads.has(r.lead_id)) return false; // one live row per lead
      seenLeads.add(r.lead_id);
      return true;
    });
    const rows = live.map((r: any) => {
      const base = rowToFollowUp(r);
      const lead = r.lead_id ? leadMap.get(r.lead_id) : null;
      const owner = lead?.assigned_to ? ownerNames.get(lead.assigned_to) : '';
      return {
        ...base,
        leadStatus: lead?.crm_status || '',
        leadPhone: lead?.phone || base.contactPhone || '',
        budgetMax: lead?.budget_max ? Number(lead.budget_max) : null,
        lastActionAt: lead?.last_action_at || null,
        lastCallAt: (r.lead_id && lastCalls.get(r.lead_id)?.created_at) || null,
        lastCallOutcome: (r.lead_id && lastCalls.get(r.lead_id)?.outcome) || '',
        agent: base.agent || owner || '',
        agentInitials:
          base.agentInitials ||
          (owner || '')
            .split(' ')
            .map((p: string) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase(),
      };
    });
    return NextResponse.json({ followUps: rows, count: rows.length, hiddenStale: all.length - live.length });
  } catch (e: any) {
    return NextResponse.json(
      { followUps: [], count: 0, error: e?.message || 'Failed to load follow-ups' },
      { status: 200 }
    );
  }
}

/**
 * POST /api/follow-ups — create a follow-up (any signed-in member).
 *
 * Why this route exists: browser inserts hit follow_ups RLS + the
 * uq_follow_ups_lead_id unique constraint directly, and any failure was
 * swallowed by the UI's optimistic fallback — the item appeared locally then
 * vanished on reload ("does not show up"). This endpoint runs service-side:
 *   - validates required fields (title, contactName, dueDate, dueTime)
 *   - upserts on lead_id when the follow-up is linked to a lead, so a second
 *     reminder for the same lead updates the row instead of 409-ing
 *   - returns the saved row, so the UI only renders confirmed records
 */
export async function POST(request: Request) {
  const serverClient = await createServerClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const title = String(body.title || '').trim();
  const contactName = String(body.contactName || '').trim();
  const dueDate = String(body.dueDate || '').trim();
  const dueTime = String(body.dueTime || '').trim();
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  if (!contactName) return NextResponse.json({ error: 'Contact name is required' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return NextResponse.json({ error: 'Valid dueDate (YYYY-MM-DD) is required' }, { status: 400 });
  }
  if (!/^\d{1,2}:\d{2}$/.test(dueTime)) {
    return NextResponse.json({ error: 'Valid dueTime (HH:MM) is required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const status = String(body.status || 'Pending');
  const row: any = {
    title,
    contact_name: contactName,
    contact_type: body.contactType || 'Lead',
    contact_phone: body.contactPhone || '',
    contact_email: body.contactEmail || '',
    follow_up_type: body.type || 'Call',
    follow_up_status: status,
    priority: body.priority || 'Medium',
    due_date: dueDate,
    due_time: dueTime,
    agent: body.agent || '',
    agent_initials: body.agentInitials || '',
    notes: body.notes || '',
    property_interest: body.propertyInterest || '',
    relationship_status: body.relationshipStatus || 'New',
    completed_at: status === 'Completed' ? now : null,
    created_by: user.id,
    updated_at: now,
  };
  const leadId = String(body.leadId || '').trim();
  if (leadId) row.lead_id = leadId;

  try {
    const db: any = getSupabaseService();
    let saved: any;
    if (leadId) {
      // One reminder row per lead: refresh the existing one instead of
      // violating uq_follow_ups_lead_id (which previously failed silently).
      const { data, error } = await db
        .from('follow_ups')
        .upsert(row, { onConflict: 'lead_id' })
        .select()
        .single();
      if (error) throw new Error(error.message);
      saved = data;
      // Re-open a completed/cancelled row when it is explicitly re-followed.
      if (saved && ['Completed', 'Cancelled'].includes(saved.follow_up_status) && status === 'Pending') {
        const { data: reopened } = await db
          .from('follow_ups')
          .update({ follow_up_status: 'Pending', updated_at: now })
          .eq('id', saved.id)
          .select()
          .single();
        if (reopened) saved = reopened;
      }

      // Synchronize lead table: update follow_up_due and mark action_taken
      try {
        await db
          .from('leads')
          .update({
            follow_up_due: dueDate,
            last_action_at: now,
            last_action_by: user.id,
            last_activity_at: now,
          })
          .eq('id', leadId);
      } catch {}
    } else {
      const { data, error } = await db.from('follow_ups').insert(row).select().single();
      if (error) throw new Error(error.message);
      saved = data;
    }
    return NextResponse.json({ followUp: rowToFollowUp(saved) }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create follow-up' }, { status: 500 });
  }
}
