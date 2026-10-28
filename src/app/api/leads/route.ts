import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/roles';
import { notifyDuplicateOwnersServer } from '@/lib/duplicateNotify';
import { checkAndRecordDuplicates } from '@/lib/duplicateCheck';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leads — create a lead. A duplicate (normalized phone, or e-mail) is NOT
 * created: it is recorded in duplicate_leads for the original owner to review and the
 * caller only gets a generic 409 "This lead already exists".
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

  try {
    const { duplicates } = await checkAndRecordDuplicates(supabase as any, [body]);
    if (duplicates[0]) {
      return NextResponse.json(
        { error: 'This lead already exists', code: 'DUPLICATE_LEAD' },
        { status: 409 }
      );
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Duplicate check failed' }, { status: 500 });
  }

  const requestedStatus = body.stage || body.status || body.crm_status || 'Fresh Leads';
  const rawNotes = String(body.notes || '').trim();

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
    crm_status: requestedStatus,
    lead_status: body.lead_status || 'New',
    notes: rawNotes,
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

  if (data?.is_duplicate) await notifyDuplicateOwnersServer(supabase as any, [data.id]);

  return NextResponse.json({ lead: data, message: 'Lead created' }, { status: 201 });
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
