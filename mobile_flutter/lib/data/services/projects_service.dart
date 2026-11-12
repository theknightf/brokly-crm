import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/projects_models.dart';
import 'inventory_service.dart';
import 'supabase_service.dart';
import 'units_service.dart' show UnitModel;

/// Projects + developers. RLS lets every authenticated user read and manage
/// both tables (same as the website), so there is no client-side role gate.
class ProjectsService {
  final SupabaseClient _client = SupabaseService().client;

  /// Throws on failure (screens show error + retry).
  Future<List<ProjectsProject>> fetchProjects() async {
    Future<List<ProjectsProject>> run(String select) async {
      final res = await _client.from('projects').select(select).order('created_at', ascending: false);
      return (res as List<dynamic>).map((e) => ProjectsProject.fromJson(e as Map<String, dynamic>)).toList();
    }

    try {
      return await run('*, developers(id, name)');
    } catch (_) {
      return run('*');
    }
  }

  Future<ProjectsProject?> fetchProject(String id) async {
    try {
      final res = await _client.from('projects').select('*, developers(id, name)').eq('id', id).maybeSingle();
      return res == null ? null : ProjectsProject.fromJson(res);
    } catch (_) {
      return null;
    }
  }

  Future<List<ProjectsDeveloper>> fetchDevelopers() async {
    try {
      final res = await _client.from('developers').select('*').order('name', ascending: true);
      return (res as List<dynamic>).map((e) => ProjectsDeveloper.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<List<UnitModel>> fetchUnits() => InventoryService().fetchUnits();

  Map<String, dynamic> _row(ProjectsFormData d, String imagePath) => {
        'name': d.name,
        'developer_id': d.developerId.isEmpty ? null : d.developerId,
        'project_status': d.status,
        'latitude': d.latitude,
        'longitude': d.longitude,
        'radius_m': d.radiusM,
        'pitch_summary': d.pitchSummary,
        'why_buy': d.whyBuy,
        'selling_points': d.sellingPoints
            .split(RegExp(r'\r?\n'))
            .map((s) => s.trim())
            .where((s) => s.isNotEmpty)
            .join('\n'),
        'image_path': imagePath,
        'location': d.location,
        'full_description': d.fullDescription,
        'developer_description': d.developerDescription,
        'payment_plan_summary': d.paymentPlanSummary,
      };

  Future<void> createProject(ProjectsFormData d) async {
    await _client.from('projects').insert({..._row(d, ''), 'created_by': _client.auth.currentUser?.id});
  }

  /// [imagePath] keeps the existing cover (the web form re-sends it on edit).
  Future<void> updateProject(String id, ProjectsFormData d, {String imagePath = ''}) async {
    await _client.from('projects').update(_row(d, imagePath)).eq('id', id);
  }

  Future<void> deleteProject(String id) async {
    await _client.from('projects').delete().eq('id', id);
  }
}
