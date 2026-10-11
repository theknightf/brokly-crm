import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/lead_model.dart';
import 'supabase_service.dart';

class ProjectModel {
  final String id;
  final String name;
  final String? developerId;
  final String developerName;
  final String status;
  final String pitchSummary;
  final String whyBuy;
  final List<String> sellingPoints;
  final String imagePath;
  final String location;
  final String fullDescription;
  final String developerDescription;
  final String paymentPlanSummary;

  const ProjectModel({
    required this.id,
    required this.name,
    this.developerId,
    this.developerName = '',
    this.status = 'Active',
    this.pitchSummary = '',
    this.whyBuy = '',
    this.sellingPoints = const [],
    this.imagePath = '',
    this.location = '',
    this.fullDescription = '',
    this.developerDescription = '',
    this.paymentPlanSummary = '',
  });

  static List<String> _splitSellingPoints(dynamic value) {
    if (value is List) {
      return value.map((e) => e.toString().trim()).where((s) => s.isNotEmpty).toList();
    }
    return (value?.toString() ?? '')
        .split(RegExp(r'\r?\n|,'))
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
  }

  factory ProjectModel.fromJson(Map<String, dynamic> row) {
    String devName = '';
    if (row['developers'] is Map) {
      devName = row['developers']['name']?.toString() ?? '';
    }
    return ProjectModel(
      id: row['id']?.toString() ?? '',
      name: row['name']?.toString() ?? '',
      developerId: row['developer_id']?.toString(),
      developerName: devName,
      status: row['project_status']?.toString() ?? 'Active',
      pitchSummary: row['pitch_summary']?.toString() ?? '',
      whyBuy: row['why_buy']?.toString() ?? '',
      sellingPoints: _splitSellingPoints(row['selling_points']),
      imagePath: row['image_path']?.toString() ?? '',
      location: row['location']?.toString() ?? '',
      fullDescription: row['full_description']?.toString() ?? '',
      developerDescription: row['developer_description']?.toString() ?? '',
      paymentPlanSummary: row['payment_plan_summary']?.toString() ?? '',
    );
  }
}

class UnitModel {
  final String id;
  final String projectId;
  final String projectName;
  final String name;
  final String unitType;
  final double area;
  final int floor;
  final double price;
  final String paymentPlan;
  final double downPaymentPct;
  final int installmentYears;
  final int installmentFrequency;
  final String status;
  final String imagePath;
  final String notes;
  final int filesCount;

  const UnitModel({
    required this.id,
    required this.projectId,
    this.projectName = '',
    required this.name,
    this.unitType = '',
    this.area = 0,
    this.floor = 0,
    this.price = 0,
    this.paymentPlan = '',
    this.downPaymentPct = 0,
    this.installmentYears = 0,
    this.installmentFrequency = 12,
    this.status = 'Available',
    this.imagePath = '',
    this.notes = '',
    this.filesCount = 0,
  });

  UnitModel copyWith({String? status}) {
    return UnitModel(
      id: id,
      projectId: projectId,
      projectName: projectName,
      name: name,
      unitType: unitType,
      area: area,
      floor: floor,
      price: price,
      paymentPlan: paymentPlan,
      downPaymentPct: downPaymentPct,
      installmentYears: installmentYears,
      installmentFrequency: installmentFrequency,
      status: status ?? this.status,
      imagePath: imagePath,
      notes: notes,
      filesCount: filesCount,
    );
  }

  factory UnitModel.fromJson(Map<String, dynamic> row) {
    String projName = '';
    if (row['projects'] is Map) {
      projName = row['projects']['name']?.toString() ?? '';
    }
    final filesList = row['unit_files'];
    return UnitModel(
      id: row['id']?.toString() ?? '',
      projectId: row['project_id']?.toString() ?? '',
      projectName: projName,
      name: row['name']?.toString() ?? '',
      unitType: row['unit_type']?.toString() ?? '',
      area: (row['area'] as num?)?.toDouble() ?? 0.0,
      floor: (row['floor'] as num?)?.toInt() ?? 0,
      price: (row['price'] as num?)?.toDouble() ?? 0.0,
      paymentPlan: row['payment_plan']?.toString() ?? '',
      downPaymentPct: (row['down_payment_pct'] as num?)?.toDouble() ?? 0.0,
      installmentYears: (row['installment_years'] as num?)?.toInt() ?? 0,
      installmentFrequency: (row['installment_frequency'] as num?)?.toInt() ?? 12,
      status: row['status']?.toString() ?? 'Available',
      imagePath: row['image_path']?.toString() ?? '',
      notes: row['notes']?.toString() ?? '',
      filesCount: filesList is List ? filesList.length : 0,
    );
  }
}

class UnitFileModel {
  final String id;
  final String unitId;
  final String fileName;
  final String filePath;
  final String mimeType;
  final int sizeBytes;
  final String kind;
  final String? url;

  const UnitFileModel({
    required this.id,
    required this.unitId,
    required this.fileName,
    required this.filePath,
    required this.mimeType,
    required this.sizeBytes,
    required this.kind,
    this.url,
  });

  UnitFileModel copyWith({String? url}) {
    return UnitFileModel(
      id: id,
      unitId: unitId,
      fileName: fileName,
      filePath: filePath,
      mimeType: mimeType,
      sizeBytes: sizeBytes,
      kind: kind,
      url: url ?? this.url,
    );
  }

  factory UnitFileModel.fromJson(Map<String, dynamic> row) {
    return UnitFileModel(
      id: row['id']?.toString() ?? '',
      unitId: row['unit_id']?.toString() ?? '',
      fileName: row['file_name']?.toString() ?? '',
      filePath: row['file_path']?.toString() ?? '',
      mimeType: row['mime_type']?.toString() ?? 'application/octet-stream',
      sizeBytes: (row['size_bytes'] as num?)?.toInt() ?? 0,
      kind: row['kind']?.toString() ?? 'image',
    );
  }
}

class UnitsService {
  final SupabaseClient _client = SupabaseService().client;
  static const String _unitBucket = 'unit-files';
  static const String _projectImageBucket = 'project-images';

  Future<List<UnitModel>> getAllUnits({String? projectId}) async {
    try {
      var query = _client.from('units').select('*, unit_files(id), projects(name)');
      if (projectId != null && projectId.isNotEmpty) {
        query = query.eq('project_id', projectId);
      }
      final res = await query.order('name', ascending: true);
      return (res as List<dynamic>)
          .map((e) => UnitModel.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      try {
        var retry = _client.from('units').select('*');
        if (projectId != null && projectId.isNotEmpty) {
          retry = retry.eq('project_id', projectId);
        }
        final res = await retry.order('name', ascending: true);
        return (res as List<dynamic>)
            .map((e) => UnitModel.fromJson(e as Map<String, dynamic>))
            .toList();
      } catch (_) {
        return [];
      }
    }
  }

  Future<List<ProjectModel>> getAllProjects() async {
    try {
      final res = await _client
          .from('projects')
          .select('*, developers(id, name)')
          .order('created_at', ascending: false);
      return (res as List<dynamic>)
          .map((e) => ProjectModel.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      try {
        final res = await _client
            .from('projects')
            .select('*')
            .order('created_at', ascending: false);
        return (res as List<dynamic>)
            .map((e) => ProjectModel.fromJson(e as Map<String, dynamic>))
            .toList();
      } catch (_) {
        return [];
      }
    }
  }

  Future<List<UnitFileModel>> getUnitFiles(String unitId) async {
    try {
      final res = await _client
          .from('unit_files')
          .select('*')
          .eq('unit_id', unitId)
          .order('created_at', ascending: false);
      final files = (res as List<dynamic>)
          .map((e) => UnitFileModel.fromJson(e as Map<String, dynamic>))
          .toList();

      final resolved = <UnitFileModel>[];
      for (final f in files) {
        String? signedUrl;
        try {
          signedUrl = await _client.storage.from(_unitBucket).createSignedUrl(f.filePath, 3600);
        } catch (_) {}
        resolved.add(f.copyWith(url: signedUrl));
      }
      return resolved;
    } catch (_) {
      return [];
    }
  }

  Future<String> resolveUnitImageUrl(UnitModel unit, ProjectModel? project) async {
    if (unit.imagePath.isNotEmpty) {
      if (unit.imagePath.startsWith('http')) return unit.imagePath;
      try {
        final url = await _client.storage.from(_unitBucket).createSignedUrl(unit.imagePath, 3600);
        if (url.isNotEmpty) return url;
      } catch (_) {}
    }

    try {
      final files = await getUnitFiles(unit.id);
      final imgFile = files.where((f) => f.kind == 'image' && (f.url?.isNotEmpty ?? false)).firstOrNull;
      if (imgFile != null && imgFile.url != null) {
        return imgFile.url!;
      }
    } catch (_) {}

    if (project != null && project.imagePath.isNotEmpty) {
      if (project.imagePath.startsWith('http')) return project.imagePath;
      try {
        final url = await _client.storage
            .from(_projectImageBucket)
            .createSignedUrl(project.imagePath, 3600);
        if (url.isNotEmpty) return url;
      } catch (_) {}
    }

    return '';
  }

  Future<void> reserveUnit(UnitModel unit, {LeadModel? lead}) async {
    final userId = _client.auth.currentUser?.id;

    await _client.from('units').update({
      'status': 'Reserved',
    }).eq('id', unit.id);

    if (lead != null && lead.id.isNotEmpty) {
      try {
        await _client.from('leads').update({
          'unit_id': unit.id,
          'unit': unit.name,
          if (unit.projectName.isNotEmpty) 'project': unit.projectName,
          'crm_status': 'Interested',
          'lead_status': 'Qualified',
          'last_action_at': DateTime.now().toUtc().toIso8601String(),
          if (userId != null) 'last_action_by': userId,
        }).eq('id', lead.id);
      } catch (_) {}
    }
  }

  Future<void> addRecommendedUnitToLead(String leadId, String unitId) async {
    final userId = _client.auth.currentUser?.id;
    await _client.from('lead_recommended_units').insert({
      'lead_id': leadId,
      'unit_id': unitId,
      if (userId != null) 'created_by': userId,
    });

    try {
      await _client.from('activity_log').insert({
        if (userId != null) 'user_id': userId,
        'action_type': 'Recommended Unit Added',
        'entity_type': 'lead',
        'entity_id': leadId,
        'detail': unitId,
      });
    } catch (_) {}
  }
}
