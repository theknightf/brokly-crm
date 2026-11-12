class ImportErrorDetail {
  final int rowNumber;
  final String name;
  final String phone;
  final String type; // invalid | skipped | duplicate_routed | error
  final String reason;
  const ImportErrorDetail({
    required this.rowNumber,
    required this.name,
    required this.phone,
    required this.type,
    required this.reason,
  });

  factory ImportErrorDetail.fromJson(Map<String, dynamic> j) => ImportErrorDetail(
        rowNumber: (j['rowNumber'] as num?)?.toInt() ?? 0,
        name: j['name']?.toString() ?? '',
        phone: j['phone']?.toString() ?? '',
        type: j['type']?.toString() ?? 'error',
        reason: j['reason']?.toString() ?? '',
      );
}

class ImportLogModel {
  final String id;
  final String fileName;
  final int fileSizeBytes;
  final String? uploadedBy;
  final String uploadedByName;
  final String uploadedByRole;
  final String status; // Processing | Completed | Partially Imported | Failed
  final String sourceName;
  final String targetStage;
  final String assignmentMode;
  final int totalRows;
  final int importedCount;
  final int routedDuplicatesCount;
  final int updatedCount;
  final int skippedCount;
  final int errorCount;
  final String summary;
  final List<ImportErrorDetail> errorDetails;
  final String? createdAt;
  final String? completedAt;

  const ImportLogModel({
    required this.id,
    required this.fileName,
    required this.fileSizeBytes,
    required this.uploadedBy,
    required this.uploadedByName,
    required this.uploadedByRole,
    required this.status,
    required this.sourceName,
    required this.targetStage,
    required this.assignmentMode,
    required this.totalRows,
    required this.importedCount,
    required this.routedDuplicatesCount,
    required this.updatedCount,
    required this.skippedCount,
    required this.errorCount,
    required this.summary,
    required this.errorDetails,
    required this.createdAt,
    required this.completedAt,
  });

  factory ImportLogModel.fromJson(Map<String, dynamic> r) {
    int n(String k) => (r[k] as num?)?.toInt() ?? 0;
    String s(String k, String fb) {
      final v = r[k]?.toString().trim() ?? '';
      return v.isEmpty ? fb : v;
    }

    final details = r['error_details'] is List
        ? (r['error_details'] as List)
            .whereType<Map>()
            .map((m) => ImportErrorDetail.fromJson(Map<String, dynamic>.from(m)))
            .toList()
        : <ImportErrorDetail>[];
    return ImportLogModel(
      id: r['id'].toString(),
      fileName: s('original_file_name', 'Import'),
      fileSizeBytes: n('file_size_bytes'),
      uploadedBy: r['uploaded_by']?.toString(),
      uploadedByName: s('uploaded_by_name', 'User'),
      uploadedByRole: s('uploaded_by_role', 'admin'),
      status: s('status', 'Completed'),
      sourceName: s('source_name', '—'),
      targetStage: s('target_stage', '—'),
      assignmentMode: s('assignment_mode', 'Unassigned Pool'),
      totalRows: n('total_rows'),
      importedCount: n('imported_count'),
      routedDuplicatesCount: n('routed_duplicates_count'),
      updatedCount: n('updated_count'),
      skippedCount: n('skipped_count'),
      errorCount: n('error_count'),
      summary: r['summary']?.toString() ?? '',
      errorDetails: details,
      createdAt: r['created_at']?.toString(),
      completedAt: r['completed_at']?.toString(),
    );
  }
}

class ImportStats {
  final int totalImports;
  final int totalRows;
  final int totalImported;
  final int totalDuplicatesRouted;
  final int totalErrors;
  const ImportStats({
    this.totalImports = 0,
    this.totalRows = 0,
    this.totalImported = 0,
    this.totalDuplicatesRouted = 0,
    this.totalErrors = 0,
  });
}

class ImportUploader {
  final String id;
  final String name;
  final String role;
  const ImportUploader({required this.id, required this.name, required this.role});
}

class ImportHistoryPage {
  final List<ImportLogModel> logs;
  final int total;
  final ImportStats stats;
  final List<ImportUploader> uploaders;
  const ImportHistoryPage({required this.logs, required this.total, required this.stats, required this.uploaders});
}

String importRoleLabel(String? role) {
  final r = (role ?? 'admin').trim().toLowerCase().replaceAll(RegExp(r'[\s-]+'), '_');
  const map = {
    'owner': 'Owner',
    'owner_admin': 'Owner',
    'admin': 'Admin',
    'branch_manager': 'Branch Manager',
    'team_leader': 'Team Leader',
    'senior_agent': 'Senior Agent',
    'agent': 'Sales Agent',
  };
  return map[r] ?? (role == null || role.isEmpty ? 'User' : role);
}

String formatFileSize(int bytes) {
  if (bytes <= 0) return '—';
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(2)} MB';
}
