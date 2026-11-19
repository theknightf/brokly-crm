import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseCommentBody } from '@/lib/leadNotes';

export const dynamic = 'force-dynamic';

/**
 * GET /api/leads/:id/profile
 * Spec: Lead drill-down — full Lead Profile for clickable names in Call Logs
 * Returns: lead, assigned user, call history, follow-ups, timeline, duplicates
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params;
  if (!leadId) return NextResponse.json({ error: 'Missing lead id' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db: any = supabase;
    const [
      leadRes,
      callsRes,
      followUpRes,
      commentsRes,
      rotationRes,
      activityRes,
    ] = await Promise.all([
      db.from('leads').select('*, assigned_to_profile:user_profiles!leads_assigned_to_fkey(id, full_name, email), created_by_profile:user_profiles!leads_created_by_fkey(id, full_name)').eq('id', leadId).maybeSingle(),
      db.from('call_logs').select('*').or(`lead_id.eq.${leadId},entity_id.eq.${leadId}`).order('created_at', { ascending: false }).limit(100),
      db.from('follow_up_tasks').select('*').eq('lead_id', leadId).order('scheduled_at', { ascending: true }).limit(50),
      // fallback to follow_ups table if follow_up_tasks empty
      db.from('follow_ups').select('*').eq('lead_id', leadId).order('due_date', { ascending: true }).limit(50),
      db.from('lead_rotation_log').select('*, from_user:user_profiles!lead_rotation_log_from_user_id_fkey(full_name), to_user:user_profiles!lead_rotation_log_to_user_id_fkey(full_name)').eq('lead_id', leadId).order('rotated_at', { ascending: false }).limit(20),
      db.from('activity_log').select('*').eq('entity_type', 'lead').eq('entity_id', leadId).order('created_at', { ascending: false }).limit(100),
    ]);

    if (leadRes.error) return NextResponse.json({ error: leadRes.error.message }, { status: 400 });
    if (!leadRes.data) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const lead = leadRes.data;
    // Who did the last action (the lead keeps last_action_at / last_action_by).
    let lastActionByName: string | null = null;
    if (lead.last_action_by) {
      const { data: lab } = await db.from('user_profiles').select('full_name').eq('id', lead.last_action_by).maybeSingle();
      lastActionByName = lab?.full_name || null;
    }
    // Duplicate detection: same normalized phone/email
    let duplicates: any[] = [];
    try {
      const phoneNorm = (lead.phone || '').replace(/\D/g, '');
      const emailNorm = (lead.email || '').toLowerCase().trim();
      if (phoneNorm && phoneNorm.length >= 8) {
        const { data: byPhone } = await db.from('leads').select('id, name, phone, crm_status, assigned_to, created_at').ilike('phone', `%${phoneNorm.slice(-10)}%`).neq('id', leadId).limit(5);
        duplicates = byPhone || [];
      }
      if (!duplicates.length && emailNorm) {
        const { data: byEmail } = await db.from('leads').select('id, name, email, crm_status, assigned_to, created_at').ilike('email', `%${emailNorm}%`).neq('id', leadId).limit(5);
        duplicates = byEmail || [];
      }
    } catch {}

    // Notes (what people wrote) and stage / owner history, with who did it. Shown on the lead profile.
    const [cmtRes, lnRes, evRes] = await Promise.all([
      db.from('lead_comments').select('id, user_id, body, created_at').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(200),
      db.from('lead_notes').select('id, author_id, body, created_at').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(200),
      db.from('lead_events').select('id, type, old_value, new_value, actor_id, created_at').eq('lead_id', leadId).in('type', ['stage', 'assigned']).order('created_at', { ascending: false }).limit(200),
    ]);
    const evRows = (evRes.data || []) as any[];
    const peopleIds = new Set<string>();
    for (const c of (cmtRes.data || []) as any[]) if (c.user_id) peopleIds.add(c.user_id);
    for (const n of (lnRes.data || []) as any[]) if (n.author_id) peopleIds.add(n.author_id);
    for (const e of evRows) {
      if (e.actor_id) peopleIds.add(e.actor_id);
      if (e.type === 'assigned' && /^[0-9a-f-]{36}$/i.test(String(e.new_value || ''))) peopleIds.add(e.new_value);
      if (e.type === 'assigned' && /^[0-9a-f-]{36}$/i.test(String(e.old_value || ''))) peopleIds.add(e.old_value);
    }
    const nameOf = new Map<string, string>();
    if (peopleIds.size) {
      const { data: ppl } = await db.from('user_profiles').select('id, full_name').in('id', Array.from(peopleIds));
      for (const p of (ppl || []) as any[]) nameOf.set(p.id, p.full_name || '');
    }
    const who = (id?: string | null) => (id && nameOf.get(id)) || null;
    const notesList = [
      ...((cmtRes.data || []) as any[])
        .map((c) => ({ c, p: parseCommentBody(c.body) }))
        .filter((x) => x.p.written)
        .map(({ c, p }) => ({ id: c.id, body: p.text, by: who(c.user_id), at: c.created_at, callOutcome: p.outcome || null })),
      ...((lnRes.data || []) as any[]).map((n) => ({ id: n.id, body: n.body, by: who(n.author_id), at: n.created_at, callOutcome: null })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1));
    const stageHistory = evRows
      .filter((e) => e.type === 'stage')
      .map((e) => ({ id: e.id, from: e.old_value, to: e.new_value, by: who(e.actor_id), at: e.created_at }));
    const ownerHistory = evRows
      .filter((e) => e.type === 'assigned')
      .map((e) => ({ id: e.id, from: who(e.old_value) || null, to: who(e.new_value) || (e.new_value ? 'Someone' : 'Unassigned'), by: who(e.actor_id), at: e.created_at }));

    // Merge follow-up sources
    const followUps = [
      ...((followUpRes.data || []) as any[]).map((f: any) => ({ source: 'follow_up_tasks', ...f })),
      ...((commentsRes.data || []) as any[]).map((f: any) => ({ source: 'follow_ups_legacy', ...f })),
    ];

    const callLogs = callsRes.data || [];
    const validCalls = callLogs.filter((c: any) => c.is_valid !== false);
    const flaggedCalls = callLogs.filter((c: any) => c.is_flagged);

    // Build timeline
    const timeline: any[] = [];
    callLogs.forEach((c: any) => timeline.push({ at: c.created_at, type: 'call', label: `${c.channel || 'Call'} · ${c.outcome}`, meta: `${Math.round((c.duration_seconds||0)/60)}m`, detail: c.notes || '' }));
    (rotationRes.data || []).forEach((r: any) => timeline.push({ at: r.rotated_at, type: 'rotation', label: `Rotated to ${r.to_user?.full_name || r.to_user_id}`, detail: r.reason || '' }));
    (activityRes.data || []).forEach((a: any) => timeline.push({ at: a.created_at, type: 'activity', label: a.action_type, detail: a.detail || '' }));
    timeline.sort((a, b) => (a.at < b.at ? 1 : -1));

    return NextResponse.json({
      lead: {
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        stage: lead.crm_status || lead.lead_status,
        crmStatus: lead.crm_status,
        leadStatus: lead.lead_status,
        assignedTo: lead.assigned_to,
        assignedToName: lead.assigned_to_profile?.full_name || null,
        createdByName: lead.created_by_profile?.full_name || null,
        source: lead.source,
        location: lead.location,
        developer: lead.developer,
        project: lead.project,
        agent: lead.agent,
        budgetMin: lead.budget_min,
        budgetMax: lead.budget_max,
        notes: lead.notes,
        followUpDue: lead.follow_up_due,
        lastActivityAt: lead.last_activity_at,
        lastActionAt: lead.last_action_at,
        lastActionByName,
        createdAt: lead.created_at,
        updatedAt: lead.updated_at,
      },
      metrics: {
        totalCalls: callLogs.length,
        validCalls: validCalls.length,
        flaggedCalls: flaggedCalls.length,
        followUpsPending: (followUpRes.data || []).filter((f: any) => f.status === 'PENDING').length,
        rotations: (rotationRes.data || []).length,
      },
      callLogs,
      notes: notesList,
      stageHistory,
      ownerHistory,
      followUps,
      followUpTasks: followUpRes.data || [],
      rotations: rotationRes.data || [],
      activity: activityRes.data || [],
      duplicates: duplicates.map((d: any) => ({
        id: d.id,
        name: d.name,
        phone: d.phone,
        email: d.email,
        status: d.crm_status || d.lead_status,
        profileLink: `/api/leads/${d.id}/profile`,
      })),
      timeline: timeline.slice(0, 100),
      drillLinks: {
        employee360: lead.assigned_to ? `/admin/employees/${lead.assigned_to}/360` : null,
        leadProfile: `/api/leads/${leadId}/profile`,
        callLogs: `/api/call-log?entity_type=lead&entity_id=${leadId}`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Unknown' }, { status: 500 });
  }
}
