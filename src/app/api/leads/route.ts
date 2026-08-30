import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leads — create lead with global deduplication (phone & email)
 * Spec 2.C: Automatic validation on phone/email before insertion,
 * prevent duplicates globally and provide clickable redirect link to existing lead.
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

  // --- Pre-check dedup via normalized lookup (best-effort fast path) ---
  try {
    const phoneNorm = phone.replace(/\D/g, '');
    if (phoneNorm && phoneNorm.length >= 8) {
      const { data: existing } = await db.from('leads').select('id, name, phone, email, crm_status').ilike('phone', `%${phoneNorm.slice(-10)}%`).limit(1).maybeSingle();
      // Verify exact normalized match
      if (existing && String(existing.phone || '').replace(/\D/g, '').slice(-10) === phoneNorm.slice(-10)) {
        return NextResponse.json({
          error: 'Duplicate lead: phone already exists',
          duplicate: true,
          existingLeadId: existing.id,
          existingLeadName: existing.name,
          redirectLink: `/api/leads/${existing.id}/profile`,
          profileLink: `/leads-management?leadId=${existing.id}`,
        }, { status: 409 });
      }
    }
    if (email) {
      const emailNorm = email.toLowerCase().trim();
      const { data: existing } = await db.from('leads').select('id, name, phone, email').ilike('email', emailNorm).limit(1).maybeSingle();
      if (existing && String(existing.email || '').toLowerCase().trim() === emailNorm) {
        return NextResponse.json({
          error: 'Duplicate lead: email already exists',
          duplicate: true,
          existingLeadId: existing.id,
          existingLeadName: existing.name,
          redirectLink: `/api/leads/${existing.id}/profile`,
          profileLink: `/leads-management?leadId=${existing.id}`,
        }, { status: 409 });
      }
    }
  } catch {}

  // --- Insert with DB uniqueness fallback (handles race) ---
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
    crm_status: body.stage || body.status || body.crm_status || 'Fresh Leads',
    lead_status: body.lead_status || 'New',
    notes: body.notes || '',
    location: body.location || '',
    developer: body.developer || '',
    project: body.project || '',
    assigned_to: body.assignedToUserId || body.assigned_to || body.assignedTo || null,
    created_by: user.id,
  };

  const { data, error } = await db.from('leads').insert(row).select().single();
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    const isDup = error.code === '23505' || msg.includes('duplicate') || msg.includes('unique') || msg.includes('idx_leads_phone') || msg.includes('idx_leads_email');
    if (isDup) {
      // Fetch existing for redirect link
      let existing: any = null;
      try {
        const phoneNorm = phone.replace(/\D/g, '');
        if (phoneNorm) {
          const { data: byPhone } = await db.from('leads').select('id, name').ilike('phone', `%${phoneNorm.slice(-10)}%`).limit(1).maybeSingle();
          if (byPhone) existing = byPhone;
        }
        if (!existing && email) {
          const { data: byEmail } = await db.from('leads').select('id, name').ilike('email', email.toLowerCase().trim()).limit(1).maybeSingle();
          if (byEmail) existing = byEmail;
        }
      } catch {}
      return NextResponse.json({
        error: 'Duplicate lead detected (global uniqueness)',
        duplicate: true,
        existingLeadId: existing?.id || null,
        redirectLink: existing ? `/api/leads/${existing.id}/profile` : null,
        profileLink: existing ? `/leads-management?leadId=${existing.id}` : null,
        detail: error.message,
      }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

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
