import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/duplicates_models.dart' show normalizeRoleKey;
import '../models/import_history_models.dart';
import 'supabase_service.dart';

class ImportHistoryException implements Exception {
  final String message;
  ImportHistoryException(this.message);
  @override
  String toString() => message;
}

/// Roles allowed to open Import History (web /api/leads/import-history).
const _authorizedRoles = {'owner', 'admin', 'owner_admin', 'owneradmin', 'branch_manager', 'team_leader'};

bool canViewImportHistory(String? role) => _authorizedRoles.contains(normalizeRoleKey(role));

/// Read-only list of `import_logs`. Team leaders are scoped to their own team + themselves,
/// exactly like the web route (RLS alone would let them read every log).
class ImportHistoryService {
  SupabaseClient get _db => SupabaseService().client;

  static const _cols =
      'id, original_file_name, file_size_bytes, mime_type, uploaded_by, uploaded_by_name, uploaded_by_role, status, source_name, target_stage, assignment_mode, total_rows, imported_count, routed_duplicates_count, updated_count, skipped_count, error_count, summary, error_details, created_at, completed_at';

  Future<List<String>?> _allowedUploaders(String role, String userId, String? teamId) async {
    if (normalizeRoleKey(role) != 'team_leader') return null;
    final ids = <String>{userId};
    if (teamId != null && teamId.isNotEmpty) {
      try {
        final m = await _db.from('team_memberships').select('user_id').eq('team_id', teamId);
        for (final r in List<Map<String, dynamic>>.from(m as List)) {
          final id = r['user_id']?.toString();
          if (id != null && id.isNotEmpty) ids.add(id);
        }
      } catch (_) {}
      try {
        final p = await _db.from('user_profiles').select('id').eq('team_id', teamId);
        for (final r in List<Map<String, dynamic>>.from(p as List)) {
          final id = r['id']?.toString();
          if (id != null && id.isNotEmpty) ids.add(id);
        }
      } catch (_) {}
    }
    return ids.toList();
  }

  /// [from] / [to] are yyyy-MM-dd (inclusive, UTC day bounds like the web).
  Future<ImportHistoryPage> fetch({
    required String role,
    required String userId,
    String? teamId,
    int page = 1,
    int pageSize = 20,
    String search = '',
    String status = 'All',
    String? uploadedBy,
    String? from,
    String? to,
  }) async {
    if (!canViewImportHistory(role)) {
      throw ImportHistoryException('Access restricted to Admins and Team Leaders');
    }
    final allowed = await _allowedUploaders(role, userId, teamId);

    dynamic q = _db.from('import_logs').select(_cols);
    if (allowed != null) q = q.inFilter('uploaded_by', allowed);
    if (uploadedBy != null && uploadedBy.isNotEmpty) q = q.eq('uploaded_by', uploadedBy);
    if (status != 'All' && status.isNotEmpty) q = q.eq('status', status);
    if (from != null && from.isNotEmpty) q = q.gte('created_at', '${from}T00:00:00.000Z');
    if (to != null && to.isNotEmpty) q = q.lte('created_at', '${to}T23:59:59.999Z');
    final safe = search.trim().replaceAll(RegExp(r'[%_,()]'), '');
    if (safe.isNotEmpty) {
      q = q.or('original_file_name.ilike.%$safe%,uploaded_by_name.ilike.%$safe%,source_name.ilike.%$safe%,target_stage.ilike.%$safe%');
    }
    final start = (page - 1) * pageSize;

    // The exact total comes from a separate count query (same filters).
    final rowsF = q.order('created_at', ascending: false).range(start, start + pageSize - 1);
    final statsF = _stats(allowed);
    final countF = _count(allowed, uploadedBy, status, from, to, safe);
    final rows = List<Map<String, dynamic>>.from(await rowsF as List);
    final stats = await statsF;
    final total = await countF;

    return ImportHistoryPage(
      logs: rows.map(ImportLogModel.fromJson).toList(),
      total: total ?? (start + rows.length),
      stats: stats.$1,
      uploaders: stats.$2,
    );
  }

  Future<int?> _count(List<String>? allowed, String? uploadedBy, String status, String? from, String? to, String safe) async {
    try {
      dynamic q = _db.from('import_logs').select('id');
      if (allowed != null) q = q.inFilter('uploaded_by', allowed);
      if (uploadedBy != null && uploadedBy.isNotEmpty) q = q.eq('uploaded_by', uploadedBy);
      if (status != 'All' && status.isNotEmpty) q = q.eq('status', status);
      if (from != null && from.isNotEmpty) q = q.gte('created_at', '${from}T00:00:00.000Z');
      if (to != null && to.isNotEmpty) q = q.lte('created_at', '${to}T23:59:59.999Z');
      if (safe.isNotEmpty) {
        q = q.or('original_file_name.ilike.%$safe%,uploaded_by_name.ilike.%$safe%,source_name.ilike.%$safe%,target_stage.ilike.%$safe%');
      }
      final res = await (q as PostgrestFilterBuilder).count(CountOption.exact);
      return res.count;
    } catch (_) {
      return null;
    }
  }

  /// Aggregates over the latest 500 logs (same window as the web page) plus the uploader filter list.
  Future<(ImportStats, List<ImportUploader>)> _stats(List<String>? allowed) async {
    try {
      dynamic q = _db
          .from('import_logs')
          .select('id, uploaded_by, uploaded_by_name, uploaded_by_role, status, total_rows, imported_count, routed_duplicates_count, skipped_count, error_count');
      if (allowed != null) q = q.inFilter('uploaded_by', allowed);
      final rows = List<Map<String, dynamic>>.from(await q.order('created_at', ascending: false).limit(500) as List);
      var totalRows = 0, imported = 0, dups = 0, errors = 0;
      final up = <String, ImportUploader>{};
      int n(Object? v) => (v as num?)?.toInt() ?? 0;
      for (final r in rows) {
        totalRows += n(r['total_rows']);
        imported += n(r['imported_count']);
        dups += n(r['routed_duplicates_count']);
        errors += n(r['error_count']) + n(r['skipped_count']);
        final id = r['uploaded_by']?.toString();
        if (id != null && id.isNotEmpty && !up.containsKey(id)) {
          final name = r['uploaded_by_name']?.toString().trim() ?? '';
          up[id] = ImportUploader(id: id, name: name.isEmpty ? 'User' : name, role: r['uploaded_by_role']?.toString() ?? 'admin');
        }
      }
      return (
        ImportStats(totalImports: rows.length, totalRows: totalRows, totalImported: imported, totalDuplicatesRouted: dups, totalErrors: errors),
        up.values.toList(),
      );
    } catch (_) {
      return (const ImportStats(), <ImportUploader>[]);
    }
  }
}
