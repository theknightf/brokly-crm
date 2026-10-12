import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const AUTHORIZED_ROLES = new Set([
  'owner',
  'admin',
  'owner_admin',
  'owneradmin',
  'branch_manager',
  'team_leader',
]);

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'Import log ID is required' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: actor } = await supabase
    .from('user_profiles')
    .select('id, role, team_id, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (!actor || actor.is_active === false) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const normalizedRole = String(actor.role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (!AUTHORIZED_ROLES.has(normalizedRole)) {
    return NextResponse.json(
      { error: 'Access restricted to Admins and Team Leaders' },
      { status: 403 }
    );
  }

  const { data: logRow, error } = await (supabase as any)
    .from('import_logs')
    .select(
      'id, original_file_name, mime_type, storage_bucket, storage_path, file_base64, uploaded_by'
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !logRow) {
    return NextResponse.json({ error: 'Import record not found' }, { status: 404 });
  }

  // If Team Leader, verify the import belongs to self or team member
  if (normalizedRole === 'team_leader' && logRow.uploaded_by && logRow.uploaded_by !== actor.id) {
    let allowed = false;
    if (actor.team_id) {
      const { data: member } = await supabase
        .from('user_profiles')
        .select('id, team_id')
        .eq('id', logRow.uploaded_by)
        .maybeSingle();
      if (member?.team_id === actor.team_id) allowed = true;
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden: outside your team scope' }, { status: 403 });
    }
  }

  const fileName = String(logRow.original_file_name || `leads_import_${id.slice(0, 8)}.xlsx`);
  const mimeType =
    String(logRow.mime_type || '').trim() ||
    (fileName.toLowerCase().endsWith('.csv')
      ? 'text/csv'
      : fileName.toLowerCase().endsWith('.xls')
        ? 'application/vnd.ms-excel'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');

  // Optional signed-URL mode (short-lived 60s signed URL from Supabase Storage)
  if (mode === 'signed' && logRow.storage_path) {
    try {
      const bucket = logRow.storage_bucket || 'lead-imports';
      const { data: signedData, error: signedErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(logRow.storage_path, 60, {
          download: fileName,
        });
      if (!signedErr && signedData?.signedUrl) {
        return NextResponse.json({
          ok: true,
          signedUrl: signedData.signedUrl,
          fileName,
          expiresInSeconds: 60,
        });
      }
    } catch {}
    // Fallback to direct authenticated download endpoint
    return NextResponse.json({
      ok: true,
      signedUrl: `/api/leads/import-history/${id}/download`,
      fileName,
      expiresInSeconds: 60,
    });
  }

  // 1. Try downloading from Supabase Storage bucket first
  let fileBuffer: Buffer | null = null;
  if (logRow.storage_path) {
    try {
      const bucket = logRow.storage_bucket || 'lead-imports';
      const { data: blob, error: dlErr } = await supabase.storage
        .from(bucket)
        .download(logRow.storage_path);
      if (!dlErr && blob) {
        const arrBuf = await blob.arrayBuffer();
        fileBuffer = Buffer.from(arrBuf);
      }
    } catch {}
  }

  // 2. Fallback to file_base64 stored in import_logs
  if (!fileBuffer && logRow.file_base64) {
    try {
      fileBuffer = Buffer.from(String(logRow.file_base64), 'base64');
    } catch {}
  }

  if (!fileBuffer) {
    return NextResponse.json(
      { error: 'Original file binary is not available for this import record' },
      { status: 404 }
    );
  }

  const encodedFileName = encodeURIComponent(fileName);
  const asciiFallbackName = fileName.replace(/[^\x20-\x7E]/g, '_') || 'import_file.xlsx';

  return new NextResponse(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(fileBuffer.byteLength),
      'Content-Disposition': `attachment; filename="${asciiFallbackName}"; filename*=UTF-8''${encodedFileName}`,
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}
