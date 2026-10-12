import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leads — create lead and automatically detect & route duplicates
 * to the Duplicate Center without blocking ingestion.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const email = String(body.email || '').trim();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  if (!phone && !email) return NextResponse.json({ error: 'phone or email required' }, { status: 400 });

  const db: any = supabase as any;

  // --- Detect existing matching lead by normalized phone or email ---
  let existingMatch: { id: string; name: string; phone?: string; email?: string } | null = null;
  try {
    const phoneNorm = phone.replace(/\D/g, '');
    if (phoneNorm && phoneNorm.length >= 8) {
      const { data: existing } = await db
        .from('leads')
        .select('id, name, phone, email, crm_status')
        .ilike('phone', `%${phoneNorm.slice(-10)}%`)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (existing && String(existing.phone || '').replace(/\D/g, '').slice(-10) === phoneNorm.slice(-10)) {
        existingMatch = existing;
      }
    }
    if (!existingMatch && email && email.includes('@')) {
      const emailNorm = email.toLowerCase().trim();
      const { data: existing } = await db
        .from('leads')
        .select('id, name, phone, email')
        .ilike('email', emailNorm)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (existing && String(existing.email || '').toLowerCase().trim() === emailNorm) {
        existingMatch = existing;
      }
    }
  } catch {}

  const requestedStatus = body.stage || body.status || body.crm_status || 'Fresh Leads';
  const rawNotes = String(body.notes || '').trim();
  const duplicateNoteTag = existingMatch
    ? `[Pending Review / Duplicate of #${String(existingMatch.id).slice(0, 8)} (${existingMatch.name || 'Existing Lead'})]`
    : '';

  const row: any = {
    name,
    phone,
    email: email || null,
    property_type: body.propertyType || body.property_type || '',
    budget_min: body.budgetMin ?? body.budget_min ?? 0,
    budget_max: body.budgetMax ?? body.budget_max ?? 0,
    source: body.source || '',
    agent: body.agent || '',
    agent_initials: body.agentInitials || body.agent_initials || '',
    crm_status: existingMatch ? 'Duplicate Leads' : requestedStatus,
    lead_status: existingMatch ? 'Lost' : (body.lead_status || 'New'),
    is_duplicate: Boolean(existingMatch),
    duplicate_of_lead_id: existingMatch?.id || null,
    routed_to_duplicate_center_at: existingMatch ? new Date().toISOString() : null,
    notes: duplicateNoteTag && !rawNotes.includes('[Pending Review / Duplicate')
      ? `${rawNotes}\n${duplicateNoteTag}`.trim()
      : rawNotes,
    location: body.location || '',
    developer: body.developer || '',
    project: body.project || '',
    assigned_to: body.assignedToUserId || body.assigned_to || body.assignedTo || null,
    created_by: user.id,
  };

  const { data, error } = await db.from('leads').insert(row).select().single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const isDuplicate = Boolean(existingMatch || data?.is_duplicate || data?.crm_status === 'Duplicate Leads');
  const matchedId = existingMatch?.id || data?.duplicate_of_lead_id || null;

  return NextResponse.json({
    lead: data,
    duplicate: isDuplicate,
    routedToDuplicateCenter: isDuplicate,
    existingLeadId: matchedId,
    existingLeadName: existingMatch?.name || null,
    duplicateCenterLink: '/duplicate-leads',
    redirectLink: matchedId ? `/api/leads/${matchedId}/profile` : null,
    profileLink: matchedId ? `/leads-management?leadId=${matchedId}` : null,
    message: isDuplicate
      ? 'Duplicate lead ingested and routed to Duplicate Center for review'
      : 'Lead created',
  }, { status: 201 });
}

// GET /api/leads — paginated list (supports drill-down filtering)
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const stage = url.searchParams.get('stage') || url.searchParams.get('status') || '';
  const assignedTo = url.searchParams.get('assignedTo') || '';
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get('pageSize') || 25)));

  let query: any = supabase.from('leads').select('*, assigned_to_profile:user_profiles!leads_assigned_to_fkey(full_name)', { count: 'exact' });

  // Privacy isolation: only team leaders and admins can see other members' leads
  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    const role = (profile as any)?.role;
    if (!isAdminRole(role)) {
      if (role === 'team_leader' || role === 'Team Lead' || role === 'manager') {
        const { data: teams } = await supabase.from('teams').select('id').eq('leader_id', user.id);
        const teamIds = (teams || []).map((t: any) => t.id);
        let memberIds = [user.id];
        if (teamIds.length > 0) {
          const { data: members } = await supabase.from('team_memberships').select('user_id').in('team_id', teamIds);
          if (members && members.length > 0) {
            memberIds = Array.from(new Set([user.id, ...members.map((m: any) => m.user_id)]));
          }
        }
        query = query.or(`assigned_to.in.(${memberIds.join(',')}),created_by.in.(${memberIds.join(',')})`);
      } else {
        // Regular Agent: only leads assigned to or created by current user
        query = query.or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`);
      }
    }
  } catch {}

  if (search) {
    const q = search.trim();
    query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%,project.ilike.%${q}%`);
  }
  if (stage) query = query.eq('crm_status', stage);
  if (assignedTo) query = query.eq('assigned_to', assignedTo);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ leads: data || [], total: count ?? (data || []).length, page, pageSize });
}

// PATCH /api/leads — bulk assign helper (1-click dropdown per spec 2.B)
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const leadId = body?.leadId || body?.id;
  const assignedTo = body?.assignedToUserId || body?.assignedTo || null;
  if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

  // Verify lead exists
  const { data: lead } = await (supabase as any).from('leads').select('id').eq('id', leadId).maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  let assignedName: string | null = null;
  if (assignedTo) {
    const { data: profile } = await (supabase as any).from('user_profiles').select('full_name').eq('id', assignedTo).maybeSingle();
    assignedName = profile?.full_name || null;
  }

  const payload: any = { assigned_to: assignedTo };
  if (assignedName) {
    payload.agent = assignedName;
    payload.agent_initials = assignedName.split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase();
  }

  const { data, error } = await (supabase as any).from('leads').update(payload).eq('id', leadId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Notify assignee (best-effort)
  if (assignedTo) {
    try {
      await (supabase as any).from('activity_log').insert({
        user_id: assignedTo,
        action_type: 'Lead Assigned',
        entity_type: 'lead',
        entity_id: leadId,
        detail: data?.name || 'A lead',
      });
    } catch {}
  }

  return NextResponse.json({ lead: data, message: assignedTo ? `Assigned to ${assignedName || assignedTo}` : 'Unassigned' });
}
