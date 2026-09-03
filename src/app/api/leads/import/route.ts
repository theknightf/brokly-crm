import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function normalizePhone(phone: string): string {
  return String(phone || '').replace(/\D/g, '');
}

// Egyptian phone validation consistent with leadsImport
function isValidEgyptian(phone: string): boolean {
  let digits = normalizePhone(phone);
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
  const duplicateAction: 'skip' | 'update' = body.duplicateAction === 'update' ? 'update' : 'skip';
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

  // Pre-fetch existing phones for duplicate check (batch)
  const phonesToCheck = rows.map(r => normalizePhone(r.phone || '')).filter(Boolean);
  const existingPhoneMap = new Map<string, { id: string; phone: string }>();
  const existingIdByPhone = new Map<string, string>();
  if (phonesToCheck.length) {
    // chunk to avoid URL length limits
    for (let i = 0; i < phonesToCheck.length; i += 50) {
      const chunk = phonesToCheck.slice(i, i + 50);
      try {
        const { data, error } = await supabase.from('leads').select('id, phone').or(chunk.map(p => `phone.ilike.%${p.slice(-10)}%`).join(','));
        if (!error && data) {
          for (const lead of data as any[]) {
            const norm = normalizePhone(lead.phone || '').slice(-10);
            if (norm) {
              // find matching chunk phone that equals this
              for (const cp of chunk) {
                if (cp.slice(-10) === norm) {
                  existingPhoneMap.set(cp, { id: lead.id, phone: lead.phone });
                  existingIdByPhone.set(cp, lead.id);
                }
              }
            }
          }
        }
      } catch {}
    }
  }

  let imported = 0;
  let skipped = 0;
  let updated = 0;
  let invalid = 0;
  const errors: string[] = [];
  const skippedDetails: string[] = [];

  // Process rows sequentially to handle per-row logic and round-robin index
  let rrIndex = 0;
  const toInsert: any[] = [];
  const toUpdate: { id: string; payload: any; originalPhone: string }[] = [];

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

    const isDuplicate = phoneNorm ? existingPhoneMap.has(phoneNorm) || existingIdByPhone.has(phoneNorm) : false;

    if (isDuplicate) {
      if (duplicateAction === 'skip') {
        skipped += 1;
        skippedDetails.push(`Row ${rowNum}: duplicate phone ${phoneRaw} — skipped`);
        continue;
      } else {
        // Update existing
        const existingId = existingIdByPhone.get(phoneNorm) || existingPhoneMap.get(phoneNorm)?.id;
        if (!existingId) {
          skipped += 1;
          skippedDetails.push(`Row ${rowNum}: duplicate phone ${phoneRaw} but no ID found — skipped`);
          continue;
        }
        // Determine assignee for update: respect globalAssignedTo if set, otherwise keep existing
        let assignedTo: string | null = null;
        let agentName = '';
        if (isRoundRobin) {
          const rr = roundRobinUsers[rrIndex % roundRobinUsers.length];
          rrIndex++;
          assignedTo = rr.id;
          agentName = rr.name;
        } else if (globalAssignedTo && globalAssignedTo !== '' && globalAssignedTo !== '__UNASSIGNED__') {
          assignedTo = globalAssignedTo;
          // fetch name for agent
          try {
            const { data: prof } = await supabase.from('user_profiles').select('full_name').eq('id', assignedTo).maybeSingle();
            agentName = prof?.full_name || '';
          } catch {}
        } else if (row.assignedTo) {
          assignedTo = row.assignedTo;
          agentName = row.assignedName || '';
        }

        const payload: any = {
          name,
          phone: phoneRaw,
          email: row.email || null,
          source: resolvedSource,
          lead_source_id: resolvedSourceId,
          crm_status: globalStage,
          lead_status: globalStage, // will be mapped on update handler as needed; keep simple
          notes: row.notes || '',
          location: row.location || '',
          developer: row.developer || '',
          project: row.project || '',
          unit: row.unit || '',
          interest_level: row.interestLevel || '',
          budget_min: row.budgetMin ?? row.budget_min ?? 0,
          budget_max: row.budgetMax ?? row.budget_max ?? 0,
          updated_at: new Date().toISOString(),
        };
        if (assignedTo !== null) {
          payload.assigned_to = assignedTo;
          if (agentName) {
            payload.agent = agentName;
            payload.agent_initials = agentName.split(' ').map((p:string)=> p[0]).join('').slice(0,2).toUpperCase();
          }
        }
        toUpdate.push({ id: existingId, payload, originalPhone: phoneRaw });
        continue;
      }
    }

    // Not duplicate — prepare insert
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

  // Perform updates for duplicateAction=update
  for (const upd of toUpdate) {
    try {
      const { error } = await supabase.from('leads').update(upd.payload).eq('id', upd.id);
      if (error) {
        skipped += 1;
        errors.push(`Update failed for ${upd.originalPhone}: ${error.message}`);
      } else {
        updated += 1;
      }
    } catch (e:any) {
      skipped += 1;
      errors.push(`Update failed for ${upd.originalPhone}: ${e?.message || 'unknown'}`);
    }
  }

  // Perform bulk insert for remaining
  if (toInsert.length > 0) {
    // Chunk inserts to avoid payload limits (50 per chunk)
    const chunkSize = 50;
    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const chunk = toInsert.slice(i, i + chunkSize);
      const { error, data } = await supabase.from('leads').insert(chunk).select('id');
      if (error) {
        // Fallback to row-by-row to isolate bad rows
        for (const single of chunk) {
          const { error: singleErr } = await supabase.from('leads').insert(single).select('id').single();
          if (singleErr) {
            skipped += 1;
            errors.push(`Insert failed for ${single.phone}: ${singleErr.message}`);
          } else {
            imported += 1;
          }
        }
      } else {
        imported += chunk.length;
      }
    }
  }

  const totalProcessed = rows.length;
  const summary = `Successfully imported ${imported} leads${updated>0 ? `, ${updated} updated` : ''}${skipped>0 ? `, ${skipped} duplicates skipped` : ''}${invalid>0 ? `, ${invalid} invalid` : ''}.`;

  return NextResponse.json({
    ok: true,
    summary,
    imported,
    updated,
    skipped,
    invalid,
    total: totalProcessed,
    details: skippedDetails.slice(0, 20),
    errors: errors.slice(0, 20),
  });
}
