import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase_service.dart';
import 'units_service.dart' show UnitModel, UnitFileModel;

/// Signed-URL helper for the private storage buckets, with a small in-memory
/// cache so scrolling lists do not re-sign the same image over and over.
class InventoryStorage {
  static const String unitBucket = 'unit-files';
  static const String projectBucket = 'project-images';
  static final Map<String, ({String url, DateTime at})> _cache = {};
  static final Map<String, Future<String>> _inflight = {};

  static Future<String> signedUrl(String bucket, String path) {
    if (path.isEmpty) return Future.value('');
    if (path.startsWith('http')) return Future.value(path);
    final key = '$bucket/$path';
    final hit = _cache[key];
    if (hit != null && DateTime.now().difference(hit.at) < const Duration(minutes: 45)) {
      return Future.value(hit.url);
    }
    return _inflight[key] ??= () async {
      try {
        final url = await SupabaseService().client.storage.from(bucket).createSignedUrl(path, 3600);
        _cache[key] = (url: url, at: DateTime.now());
        return url;
      } catch (_) {
        return '';
      } finally {
        _inflight.remove(key);
      }
    }();
  }
}

/// Everything the user can enter on the unit form.
class InventoryUnitInput {
  final String projectId;
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
  final String notes;
  final String imagePath; // existing cover path is preserved on edit

  const InventoryUnitInput({
    required this.projectId,
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
    this.notes = '',
    this.imagePath = '',
  });

  Map<String, dynamic> toRow() => {
        'project_id': projectId,
        'name': name,
        'unit_type': unitType,
        'area': area,
        'floor': floor,
        'price': price,
        'payment_plan': paymentPlan,
        'down_payment_pct': downPaymentPct,
        'installment_years': installmentYears,
        'installment_frequency': installmentFrequency,
        'status': status,
        'image_path': imagePath,
        'notes': notes,
      };
}

/// Units inventory (units + unit_files). RLS: every authenticated user may
/// read and manage units / projects (same as the website), so no client-side
/// role gating is applied here.
class InventoryService {
  final SupabaseClient _client = SupabaseService().client;

  static const List<String> statuses = ['Available', 'Reserved', 'Sold'];
  static const List<String> unitTypes = [
    '1 BHK',
    '2 BHK',
    '3 BHK',
    'Penthouse',
    'Villa',
    'Townhouse',
    'Studio',
    'Commercial',
  ];

  /// Throws on failure so screens can show an error + retry state.
  Future<List<UnitModel>> fetchUnits({String? projectId}) async {
    Future<List<UnitModel>> run(String select) async {
      var q = _client.from('units').select(select);
      if (projectId != null && projectId.isNotEmpty) q = q.eq('project_id', projectId);
      final res = await q.order('name', ascending: true);
      return (res as List<dynamic>).map((e) => UnitModel.fromJson(e as Map<String, dynamic>)).toList();
    }

    try {
      return await run('*, unit_files(id), projects(name)');
    } catch (_) {
      // projects(name) join may be missing on older databases.
      return run('*, unit_files(id)');
    }
  }

  Future<UnitModel> createUnit(InventoryUnitInput input, {String? userId}) async {
    final row = {...input.toRow(), 'created_by': userId};
    final res = await _client.from('units').insert(row).select('*, projects(name)').single();
    return UnitModel.fromJson(res);
  }

  Future<void> updateUnit(String id, InventoryUnitInput input) async {
    await _client.from('units').update(input.toRow()).eq('id', id);
  }

  Future<void> setStatus(String id, String status) async {
    await _client.from('units').update({'status': status}).eq('id', id);
  }

  Future<void> deleteUnit(String id) async {
    await _client.from('units').delete().eq('id', id);
  }

  Future<List<UnitFileModel>> fetchFiles(String unitId) async {
    final res = await _client
        .from('unit_files')
        .select('*')
        .eq('unit_id', unitId)
        .order('created_at', ascending: false);
    final files = (res as List<dynamic>).map((e) => UnitFileModel.fromJson(e as Map<String, dynamic>)).toList();
    final out = <UnitFileModel>[];
    for (final f in files) {
      final url = await InventoryStorage.signedUrl(InventoryStorage.unitBucket, f.filePath);
      out.add(f.copyWith(url: url.isEmpty ? null : url));
    }
    return out;
  }

  /// Removes the metadata row, then best-effort removes the storage object.
  Future<void> deleteFile(UnitFileModel file) async {
    await _client.from('unit_files').delete().eq('id', file.id);
    if (file.filePath.isNotEmpty) {
      try {
        await _client.storage.from(InventoryStorage.unitBucket).remove([file.filePath]);
      } catch (_) {}
    }
  }

  /// Mirrors the web "Reserve" action (status -> Reserved).
  Future<void> reserve(String unitId) => setStatus(unitId, 'Reserved');

  String? get currentUserId => _client.auth.currentUser?.id;
}
