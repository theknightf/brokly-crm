import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyDuplicateOwnersServer } from '@/lib/duplicateNotify';
import * as XLSX from 'xlsx';

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

function sanitizeFileName(name: string): string {
  const cleaned = String(name || 'leads_import.xlsx')
    .trim()
    .replace(/[^a-zA-Z0-9._-\u0600-\u06FF ]/g, '_')
    .replace(/\s+/g, '_');
  return cleaned || 'leads_import.xlsx';
}

function buildXlsxBase64FromRows(rows: any[]): { base64: string; size: number } {
  const sheetRows = rows.map((r, i) => ({
    Row: r.rowNumber ?? i + 2,
    Name: r.name || '',
    Phone: r.phone || '',
    Email: r.email || '',
    Source: r.source || '',
    Stage: r.status || r.stage || '',
    Project: r.project || '',
    Developer: r.developer || '',
    Location: r.location || '',
    Unit: r.unit || '',
    BudgetMin: r.budgetMin ?? r.budget_min ?? '',
    BudgetMax: r.budgetMax ?? r.budget_max ?? '',
    Notes: r.notes || '',
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Imported Leads');
  const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return { base64: buf.toString('base64'), size: buf.byteLength };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: 'rows array required' }, { status: 400 });
  }

  const rows: any[] = body.rows;
  const globalSource: string = String(body.globalSource || body.source || '').trim();
  const globalStage: string =
    String(body.globalStage || body.stage || 'Fresh Leads').trim() || 'Fresh Leads';
  const rawAssignedTo: string =
    body.globalAssignedTo !== undefined ? String(body.globalAssignedTo) : '';
  const globalAssignedTo: string = rawAssignedTo === 'unassigned' ? '' : rawAssignedTo;
  // Duplicates are NEVER skipped, merged or re-routed: they are inserted like any
  // other lead and the DB trigger marks is_duplicate / duplicate_of_lead_id.
  const sourceId: string | null = body.sourceId || null;

  const originalFileName: string =
    String(body.fileName || body.originalFileName || '').trim() ||
    `leads_import_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const mimeType: string =
    String(body.mimeType || '').trim() ||
    (originalFileName.toLowerCase().endsWith('.csv')
      ? 'text/csv'
      : originalFileName.toLowerCase().endsWith('.xls')
        ? 'application/vnd.ms-excel'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  if (!globalSource) {
    return NextResponse.json(
      { error: 'Source selection is required for import batch' },
      { status: 400 }
    );
  }
  if (!globalStage) {
    return NextResponse.json(
      { error: 'Stage selection is required for import batch' },
      { status: 400 }
    );
  }

  // Fetch uploader profile info
  const { data: uploaderProfile } = await supabase
    .from('user_profiles')
    .select('id, full_name, email, role')
    .eq('id', user.id)
    .maybeSingle();

  const uploaderName =
    uploaderProfile?.full_name ||
    user.user_metadata?.full_name ||
    uploaderProfile?.email ||
    user.email ||
    'User';
  const uploaderRole = String(uploaderProfile?.role || 'admin');

  // Prepare original file binary + storage upload
  let fileBase64: string = typeof body.fileBase64 === 'string' ? body.fileBase64.trim() : '';
  if (fileBase64.includes(',')) {
    fileBase64 = fileBase64.split(',').pop() || '';
  }
  let fileSizeBytes = Number(body.fileSize || 0);

  if (!fileBase64) {
    try {
      const generated = buildXlsxBase64FromRows(rows);
      fileBase64 = generated.base64;
      fileSizeBytes = generated.size;
    } catch {
      fileBase64 = '';
    }
  } else if (!fileSizeBytes && fileBase64) {
    fileSizeBytes = Math.floor((fileBase64.length * 3) / 4);
  }

  const nowIso = new Date().toISOString();
  const yyyyMm = nowIso.slice(0, 7);
  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const storagePath =
    typeof body.storagePath === 'string' && body.storagePath.trim()
      ? body.storagePath.trim()
      : `imports/${yyyyMm}/${uniqueSuffix}_${sanitizeFileName(originalFileName)}`;

  if (fileBase64 && !body.storagePath) {
    try {
      const fileBuffer = Buffer.from(fileBase64, 'base64');
      await supabase.storage.from('lead-imports').upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });
    } catch {
      // Fallback: file_base64 in import_logs guarantees download even if storage upload fails
    }
  }

  const assignmentModeLabel =
    globalAssignedTo === '__ROUND_ROBIN__' ||
    globalAssignedTo === 'round_robin' ||
    globalAssignedTo === 'round-robin'
      ? 'Round Robin'
      : !globalAssignedTo
        ? 'Unassigned Pool'
        : globalAssignedTo;

  // Create initial "Processing" log row in public.import_logs
  let importLogId: string | null = null;
  try {
    const { data: logRow } = await (supabase as any)
      .from('import_logs')
      .insert({
        original_file_name: originalFileName,
        file_size_bytes: fileSizeBytes,
        mime_type: mimeType,
        storage_bucket: 'lead-imports',
        storage_path: storagePath,
        file_base64: fileBase64 || null,
        uploaded_by: user.id,
        uploaded_by_name: uploaderName,
        uploaded_by_role: uploaderRole,
        status: 'Processing',
        source_name: globalSource,
        target_stage: globalStage,
        assignment_mode: assignmentModeLabel,
        total_rows: rows.length,
      })
      .select('id')
      .single();
    importLogId = logRow?.id || null;
  } catch {}

  // Fetch assignable users if round-robin requested
  let roundRobinUsers: { id: string; name: string }[] = [];
  const isRoundRobin =
    globalAssignedTo === '__ROUND_ROBIN__' ||
    globalAssignedTo === 'round_robin' ||
    globalAssignedTo === 'round-robin';
  if (isRoundRobin) {
    try {
      const { data: users, error } = await supabase
        .from('user_profiles')
        .select('id, full_name, role, is_active')
        .eq('is_active', true)
        .order('full_name');
      if (!error && users) {
        roundRobinUsers = users
          .filter((u: any) => !['owner', 'admin'].includes(u.role))
          .map((u: any) => ({ id: u.id, name: u.full_name || u.email }));
      }
      if (roundRobinUsers.length === 0) {
        const { data: all } = await supabase
          .from('user_profiles')
          .select('id, full_name')
          .eq('is_active', true)
          .limit(50);
        roundRobinUsers = (all || []).map((u: any) => ({ id: u.id, name: u.full_name }));
      }
    } catch {}
    if (roundRobinUsers.length === 0) {
      if (importLogId) {
        await (supabase as any)
          .from('import_logs')
          .update({
            status: 'Failed',
            error_count: rows.length,
            summary: 'No assignable users found for round-robin',
            error_details: [{ rowNumber: 0, reason: 'No assignable users found for round-robin', type: 'error' }],
            completed_at: new Date().toISOString(),
          })
          .eq('id', importLogId);
      }
      return NextResponse.json(
        { error: 'No assignable users found for round-robin' },
        { status: 400 }
      );
    }
  }

  // Resolve source
  let resolvedSource = globalSource;
  let resolvedSourceId = sourceId;
  try {
    if (!resolvedSourceId) {
      const { data: src } = await supabase
        .from('lead_sources')
        .select('id, name')
        .ilike('name', globalSource)
        .maybeSingle();
      if (src) {
        resolvedSource = src.name;
        resolvedSourceId = src.id;
      }
    }
  } catch {}

  // Pre-resolve single assignee name once if globalAssignedTo is a user id
  let preResolvedAssigneeName = '';
  if (
    !isRoundRobin &&
    globalAssignedTo &&
    globalAssignedTo !== '' &&
    globalAssignedTo !== '__UNASSIGNED__'
  ) {
    try {
      const { data: prof } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('id', globalAssignedTo)
        .maybeSingle();
      preResolvedAssigneeName = prof?.full_name || '';
    } catch {}
  }

  let imported = 0;
  const routedDuplicates = 0; // duplicates are not reported to the importer
  const duplicateIds: string[] = [];
  let skipped = 0;
  let updated = 0;
  let invalid = 0;
  const errors: string[] = [];
  const skippedDetails: string[] = [];
  const structuredErrorDetails: {
    rowNumber: number;
    name?: string;
    phone?: string;
    type: 'invalid' | 'skipped' | 'duplicate_routed' | 'error';
    reason: string;
  }[] = [];
  const seenBatchPhones = new Set<string>();

  let rrIndex = 0;
  const toInsert: any[] = [];
  const toUpdate: { id: string; payload: any; originalPhone: string; rowNum: number; name: string }[] = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNum = row.rowNumber || idx + 2;
    const phoneRaw = String(row.phone || '').trim();
    const phoneNorm = normalizePhone(phoneRaw);
    const phoneTail = phoneNorm.slice(-10);
    const name = String(row.name || '').trim() || `Lead ${phoneRaw.slice(-4) || rowNum}`;

    if (!phoneRaw || !phoneNorm) {
      invalid += 1;
      const msg = `Row ${rowNum}: missing phone number`;
      skippedDetails.push(msg);
      structuredErrorDetails.push({
        rowNumber: rowNum,
        name,
        phone: phoneRaw,
        type: 'invalid',
        reason: 'Missing phone number',
      });
      continue;
    }
    if (!isValidEgyptian(phoneRaw) && phoneNorm.length < 7) {
      invalid += 1;
      const msg = `Row ${rowNum}: invalid phone ${phoneRaw}`;
      skippedDetails.push(msg);
      structuredErrorDetails.push({
        rowNumber: rowNum,
        name,
        phone: phoneRaw,
        type: 'invalid',
        reason: `Invalid phone number (${phoneRaw})`,
      });
      continue;
    }

    let assignedTo: string | null = null;
    let agentName = '';
    let agentInitials = '';
    if (isRoundRobin) {
      const rr = roundRobinUsers[rrIndex % roundRobinUsers.length];
      rrIndex++;
      assignedTo = rr.id;
      agentName = rr.name;
      agentInitials = agentName
        .split(' ')
        .map((p: string) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    } else if (
      globalAssignedTo &&
      globalAssignedTo !== '' &&
      globalAssignedTo !== '__UNASSIGNED__'
    ) {
      assignedTo = globalAssignedTo;
      agentName = preResolvedAssigneeName || row.assignedName || '';
      agentInitials = agentName
        ? agentName
            .split(' ')
            .map((p: string) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()
        : '';
    } else if (row.assignedTo) {
      assignedTo = row.assignedTo;
      agentName = row.assignedName || '';
      agentInitials = agentName
        ? agentName
            .split(' ')
            .map((p: string) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()
        : '';
    }

    const rawNotes = String(row.notes || '').trim();

    const insertPayload: any = {
      name,
      phone: phoneRaw,
      email: row.email || null,
      source: resolvedSource,
      lead_source_id: resolvedSourceId,
      crm_status: globalStage,
      lead_status: 'New',
      notes: rawNotes,
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
      _rowNum: rowNum,
    };
    if (row.date) {
      const iso = String(row.date);
      insertPayload.created_at = /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : iso;
    }
    toInsert.push(insertPayload);
  }

  if (toInsert.length > 0) {
    const chunkSize = 50;
    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const rawChunk = toInsert.slice(i, i + chunkSize);
      const chunk = rawChunk.map(({ _rowNum, ...dbRow }) => dbRow);
      const { error, data } = await supabase
        .from('leads')
        .insert(chunk)
        .select('id, is_duplicate, crm_status');
      if (error) {
        for (let k = 0; k < chunk.length; k++) {
          const single = chunk[k];
          const rowNum = rawChunk[k]._rowNum || 0;
          const { error: singleErr, data: singleData } = await supabase
            .from('leads')
            .insert(single)
            .select('id, is_duplicate, crm_status')
            .single();
          if (singleErr) {
            skipped += 1;
            errors.push(`Insert failed for ${single.phone}: ${singleErr.message}`);
            structuredErrorDetails.push({
              rowNumber: rowNum,
              name: single.name,
              phone: single.phone,
              type: 'error',
              reason: `Insert failed: ${singleErr.message}`,
            });
          } else {
            imported += 1;
            if (singleData?.is_duplicate) duplicateIds.push(singleData.id);
          }
        }
      } else {
        imported += chunk.length;
        for (const r of (data || []) as any[]) if (r?.is_duplicate) duplicateIds.push(r.id);
      }
    }
  }

  // ONE grouped notification per original owner. Never a warning for the importer.
  if (duplicateIds.length) await notifyDuplicateOwnersServer(supabase as any, duplicateIds);

  const totalProcessed = rows.length;
  const totalFailedOrInvalid = invalid + errors.length;
  const finalStatus: 'Completed' | 'Partially Imported' | 'Failed' =
    imported + updated === 0
      ? 'Failed'
      : totalFailedOrInvalid > 0
        ? 'Partially Imported'
        : 'Completed';

  const summary = `Successfully imported ${imported} leads${updated > 0 ? `, ${updated} updated` : ''}${skipped > 0 ? `, ${skipped} skipped` : ''}${invalid > 0 ? `, ${invalid} invalid` : ''}.`;

  // Finalize import_logs record
  if (importLogId) {
    try {
      await (supabase as any)
        .from('import_logs')
        .update({
          status: finalStatus,
          total_rows: totalProcessed,
          imported_count: imported,
          routed_duplicates_count: routedDuplicates,
          updated_count: updated,
          skipped_count: skipped,
          error_count: totalFailedOrInvalid,
          summary,
          error_details: structuredErrorDetails.slice(0, 500),
          completed_at: new Date().toISOString(),
        })
        .eq('id', importLogId);
    } catch {}
  }

  // Also record in activity_log
  try {
    await supabase.from('activity_log').insert({
      user_id: user.id,
      action_type: 'Leads Imported',
      entity_type: 'import_log',
      entity_id: importLogId || originalFileName,
      detail: `${originalFileName}: ${summary}`,
    });
  } catch {}

  return NextResponse.json({
    ok: true,
    importLogId,
    fileName: originalFileName,
    status: finalStatus,
    summary,
    imported,
    routedDuplicates,
    updated,
    skipped,
    invalid,
    errorCount: totalFailedOrInvalid,
    total: totalProcessed,
    details: skippedDetails.slice(0, 50),
    errors: errors.slice(0, 50),
  });
}
