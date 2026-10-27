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

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: actor } = await supabase
    .from('user_profiles')
    .select('id, full_name, role, team_id, is_active')
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

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get('pageSize') || 20)));
  const search = (url.searchParams.get('search') || '').trim();
  const status = (url.searchParams.get('status') || '').trim();
  const uploadedBy = (url.searchParams.get('uploadedBy') || '').trim();
  const from = (url.searchParams.get('from') || '').trim();
  const to = (url.searchParams.get('to') || '').trim();

  // If Team Leader, scope to own team members + self
  let allowedUploaderIds: string[] | null = null;
  if (normalizedRole === 'team_leader') {
    const ids = new Set<string>([actor.id]);
    if (actor.team_id) {
      const { data: members } = await (supabase as any)
        .from('team_memberships')
        .select('user_id')
        .eq('team_id', actor.team_id);
      for (const m of members || []) {
        if (m.user_id) ids.add(m.user_id);
      }
      const { data: profMembers } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('team_id', actor.team_id);
      for (const p of profMembers || []) {
        if (p.id) ids.add(p.id);
      }
    }
    allowedUploaderIds = Array.from(ids);
  }

  // Select all columns EXCEPT file_base64 to keep list response ultra-fast
  const selectCols =
    'id, original_file_name, file_size_bytes, mime_type, storage_bucket, storage_path, uploaded_by, uploaded_by_name, uploaded_by_role, status, source_name, target_stage, assignment_mode, total_rows, imported_count, routed_duplicates_count, updated_count, skipped_count, error_count, summary, error_details, created_at, completed_at';

  let query = (supabase as any)
    .from('import_logs')
    .select(selectCols, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (allowedUploaderIds) {
    query = query.in('uploaded_by', allowedUploaderIds);
  }
  if (uploadedBy) {
    query = query.eq('uploaded_by', uploadedBy);
  }
  if (status && status !== 'All') {
    query = query.eq('status', status);
  }
  if (from) {
    query = query.gte('created_at', `${from}T00:00:00.000Z`);
  }
  if (to) {
    query = query.lte('created_at', `${to}T23:59:59.999Z`);
  }
  if (search) {
    const safe = search.replace(/[%_]/g, '');
    query = query.or(
      `original_file_name.ilike.%${safe}%,uploaded_by_name.ilike.%${safe}%,source_name.ilike.%${safe}%,target_stage.ilike.%${safe}%`
    );
  }

  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;
  const { data: rows, count, error } = await query.range(start, end);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also compute aggregate stats + uploaders list for filter dropdown
  let statsQuery = (supabase as any)
    .from('import_logs')
    .select(
      'id, uploaded_by, uploaded_by_name, uploaded_by_role, status, total_rows, imported_count, routed_duplicates_count, skipped_count, error_count'
    )
    .order('created_at', { ascending: false })
    .limit(500);

  if (allowedUploaderIds) {
    statsQuery = statsQuery.in('uploaded_by', allowedUploaderIds);
  }

  const { data: allStatsRows } = await statsQuery;
  const statsList = (allStatsRows || []) as any[];

  let totalImports = statsList.length;
  let totalRows = 0;
  let totalImported = 0;
  let totalDuplicatesRouted = 0;
  let totalErrors = 0;
  const uploaderMap = new Map<string, { id: string; name: string; role: string }>();

  for (const r of statsList) {
    totalRows += Number(r.total_rows || 0);
    totalImported += Number(r.imported_count || 0);
    totalDuplicatesRouted += Number(r.routed_duplicates_count || 0);
    totalErrors += Number(r.error_count || 0) + Number(r.skipped_count || 0);
    if (r.uploaded_by && !uploaderMap.has(r.uploaded_by)) {
      uploaderMap.set(r.uploaded_by, {
        id: r.uploaded_by,
        name: r.uploaded_by_name || 'User',
        role: r.uploaded_by_role || 'admin',
      });
    }
  }

  const logs = ((rows || []) as any[]).map((r) => ({
    id: r.id,
    originalFileName: r.original_file_name,
    fileSizeBytes: Number(r.file_size_bytes || 0),
    mimeType: r.mime_type,
    storageBucket: r.storage_bucket,
    storagePath: r.storage_path,
    uploadedBy: r.uploaded_by,
    uploadedByName: r.uploaded_by_name || 'User',
    uploadedByRole: r.uploaded_by_role || 'admin',
    status: r.status || 'Completed',
    sourceName: r.source_name || '—',
    targetStage: r.target_stage || '—',
    assignmentMode: r.assignment_mode || 'Unassigned Pool',
    totalRows: Number(r.total_rows || 0),
    importedCount: Number(r.imported_count || 0),
    routedDuplicatesCount: Number(r.routed_duplicates_count || 0),
    updatedCount: Number(r.updated_count || 0),
    skippedCount: Number(r.skipped_count || 0),
    errorCount: Number(r.error_count || 0),
    summary: r.summary || '',
    errorDetails: Array.isArray(r.error_details) ? r.error_details : [],
    createdAt: r.created_at,
    completedAt: r.completed_at,
    downloadUrl: `/api/leads/import-history/${r.id}/download`,
  }));

  return NextResponse.json({
    logs,
    total: count ?? logs.length,
    page,
    pageSize,
    stats: {
      totalImports,
      totalRows,
      totalImported,
      totalDuplicatesRouted,
      totalErrors,
    },
    uploaders: Array.from(uploaderMap.values()),
  });
}
