import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/phone';
import { notifyDuplicateOwnersServer } from '@/lib/duplicateNotify';

export const dynamic = 'force-dynamic';

function digitsOnly(phone: string): string {
  return String(phone || '').replace(/\D/g, '');
}

// Egyptian phone validation consistent with leadsImport
function isValidEgyptian(phone: string): boolean {
  let digits = digitsOnly(phone);
  if (!digits) return false;
  if (digits.startsWith('0020')) digits = digits.slice(4);
  else if (digits.startsWith('20')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return /^1[0125]\d{8}$/.test(digits);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: 'rows array required' }, { status: 400 });
  }

  const rows: any[] = body.rows; // parsed rows from frontend
  const globalSource: string = String(body.globalSource || body.source || '').trim();
  const globalStage: string = String(body.globalStage || body.stage || 'New Fresh').trim() || 'New Fresh';
  // Assignee keywords: 'unassigned' = Pool, 'round-robin' = even split, else the user's unique id
  // (legacy '__ROUND_ROBIN__' / 'round_robin' / '__UNASSIGNED__' still accepted)
  const rawAssignedTo: string = body.globalAssignedTo !== undefined ? String(body.globalAssignedTo) : '';
  const globalAssignedTo: string = rawAssignedTo === 'unassigned' ? '' : rawAssignedTo;
  const sourceId: string | null = body.sourceId || null;

  // Validate global settings are provided (mandatory per spec Step 2)
  if (!globalSource) {
    return NextResponse.json({ error: 'Source selection is required for import batch' }, { status: 400 });
  }
  if (!globalStage) {
    return NextResponse.json({ error: 'Stage selection is required for import batch' }, { status: 400 });
  }

  // Fetch assignable users if round-robin requested
  let roundRobinUsers: { id: string; name: string }[] = [];
  const isRoundRobin =
    globalAssignedTo === '__ROUND_ROBIN__' ||
    globalAssignedTo === 'round_robin' ||
    globalAssignedTo === 'round-robin';
  if (isRoundRobin) {
    try {
      const { data: users, error } = await supabase.from('user_profiles').select('id, full_name, role, is_active').eq('is_active', true).order('full_name');
      if (!error && users) {
        roundRobinUsers = users
          .filter((u: any) => !['owner', 'admin'].includes(u.role))
          .map((u: any) => ({ id: u.id, name: u.full_name || u.email }));
      }
      if (roundRobinUsers.length === 0) {
        // fallback to all active
        const { data: all } = await supabase.from('user_profiles').select('id, full_name').eq('is_active', true).limit(50);
        roundRobinUsers = (all || []).map((u: any) => ({ id: u.id, name: u.full_name }));
      }
    } catch {}
    if (roundRobinUsers.length === 0) {
      return NextResponse.json({ error: 'No assignable users found for round-robin' }, { status: 400 });
    }
  }

  // Resolve source: verify it exists, otherwise keep as provided string
  let resolvedSource = globalSource;
  let resolvedSourceId = sourceId;
  try {
    if (!resolvedSourceId) {
      const { data: src } = await supabase.from('lead_sources').select('id, name').ilike('name', globalSource).maybeSingle();
      if (src) {
        resolvedSource = src.name;
        resolvedSourceId = src.id;
      }
    }
  } catch {}

  let imported = 0;
  const duplicateIds: string[] = [];
  let skipped = 0;
  let invalid = 0;
  const errors: string[] = [];
  const skippedDetails: string[] = [];

  // Process rows sequentially to handle per-row logic and round-robin index
  let rrIndex = 0;
  const toInsert: any[] = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNum = row.rowNumber || idx + 2;
    const phoneRaw = String(row.phone || '').trim();
    const phoneNorm = normalizePhone(phoneRaw);
    const name = String(row.name || '').trim();

    // Validation: phone format and name exists
    if (!name || name.length < 2) {
      invalid += 1;
      skippedDetails.push(`Row ${rowNum}: missing or too short name`);
      continue;
    }
    if (!phoneRaw || !phoneNorm) {
      invalid += 1;
      skippedDetails.push(`Row ${rowNum}: missing phone`);
      continue;
    }
    if (!isValidEgyptian(phoneRaw)) {
      invalid += 1;
      skippedDetails.push(`Row ${rowNum}: invalid Egyptian phone ${phoneRaw}`);
      continue;
    }

    // Duplicates are NEVER skipped: the DB trigger flags is_duplicate / duplicate_of_lead_id.
    // Prepare insert
    let assignedTo: string | null = null;
    let agentName = '';
    let agentInitials = '';
    if (isRoundRobin) {
      const rr = roundRobinUsers[rrIndex % roundRobinUsers.length];
      rrIndex++;
      assignedTo = rr.id;
      agentName = rr.name;
      agentInitials = agentName.split(' ').map((p:string)=> p[0]).join('').slice(0,2).toUpperCase();
    } else if (globalAssignedTo && globalAssignedTo !== '' && globalAssignedTo !== '__UNASSIGNED__') {
      assignedTo = globalAssignedTo;
      try {
        const { data: prof } = await supabase.from('user_profiles').select('full_name').eq('id', assignedTo).maybeSingle();
        agentName = prof?.full_name || row.assignedName || '';
      } catch { agentName = row.assignedName || ''; }
      agentInitials = agentName ? agentName.split(' ').map((p:string)=> p[0]).join('').slice(0,2).toUpperCase() : '';
    } else if (row.assignedTo) {
      assignedTo = row.assignedTo;
      agentName = row.assignedName || '';
      agentInitials = agentName ? agentName.split(' ').map((p:string)=> p[0]).join('').slice(0,2).toUpperCase() : '';
    } else {
      // Unassigned / Pool
      assignedTo = null;
      agentName = '';
      agentInitials = '';
    }

    const insertPayload: any = {
      name,
      phone: phoneRaw,
      email: row.email || null,
      source: resolvedSource,
      lead_source_id: resolvedSourceId,
      crm_status: globalStage,
      lead_status: 'New',
      notes: row.notes || '',
      location: row.location || '',
      developer: row.developer || '',
      project: row.project || '',
      unit: row.unit || '',
      interest_level: row.interestLevel || '',
      budget_min: row.budgetMin ?? row.budget_min ?? 0,
      budget_max: row.budgetMax ?? row.budget_max ?? 0,
      agent: agentName,
      agent_initials: agentInitials,
      assigned_to: assignedTo,
      created_by: user.id,
    };
    // Handle date if provided
    if (row.date) {
      const iso = String(row.date);
      insertPayload.created_at = /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0,10) : iso;
    }
    toInsert.push(insertPayload);
  }

  // Perform bulk insert for remaining
  if (toInsert.length > 0) {
    // Chunk inserts to avoid payload limits (50 per chunk)
    const chunkSize = 50;
    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const chunk = toInsert.slice(i, i + chunkSize);
      const { error, data } = await supabase.from('leads').insert(chunk).select('id, is_duplicate');
      if (error) {
        // Fallback to row-by-row to isolate bad rows
        for (const single of chunk) {
          const { data: one, error: singleErr } = await supabase.from('leads').insert(single).select('id, is_duplicate').single();
          if (singleErr) {
            skipped += 1;
            errors.push(`Insert failed for ${single.phone}: ${singleErr.message}`);
          } else {
            imported += 1;
            if ((one as any)?.is_duplicate) duplicateIds.push((one as any).id);
          }
        }
      } else {
        imported += chunk.length;
        for (const r of (data || []) as any[]) if (r.is_duplicate) duplicateIds.push(r.id);
      }
    }
  }

  // One grouped notification per original owner (never a warning for the importer).
  if (duplicateIds.length) await notifyDuplicateOwnersServer(supabase as any, duplicateIds);

  const totalProcessed = rows.length;
  const summary = `Successfully imported ${imported} leads${skipped>0 ? `, ${skipped} failed` : ''}${invalid>0 ? `, ${invalid} invalid` : ''}.`;

  return NextResponse.json({
    ok: true,
    summary,
    imported,
    updated: 0,
    skipped,
    invalid,
    total: totalProcessed,
    details: skippedDetails.slice(0, 20),
    errors: errors.slice(0, 20),
  });
}
