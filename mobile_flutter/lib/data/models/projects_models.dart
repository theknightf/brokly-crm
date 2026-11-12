import '../services/units_service.dart' show UnitModel;

/// Developer row (developers table).
class ProjectsDeveloper {
  final String id;
  final String name;
  final bool isActive;

  const ProjectsDeveloper({required this.id, required this.name, this.isActive = true});

  factory ProjectsDeveloper.fromJson(Map<String, dynamic> row) => ProjectsDeveloper(
        id: row['id']?.toString() ?? '',
        name: row['name']?.toString() ?? '',
        isActive: row['is_active'] != false,
      );
}

/// Full project row (projects table + developers join). Richer than the
/// calculator's ProjectModel: includes GPS pin, radius and creation date.
class ProjectsProject {
  final String id;
  final String name;
  final String? developerId;
  final String developerName;
  final String status; // 'Active' | 'Inactive'
  final DateTime? createdAt;
  final double? latitude;
  final double? longitude;
  final int radiusM;
  final String pitchSummary;
  final String whyBuy;
  final List<String> sellingPoints;
  final String imagePath;
  final String location;
  final String fullDescription;
  final String developerDescription;
  final String paymentPlanSummary;

  const ProjectsProject({
    required this.id,
    required this.name,
    this.developerId,
    this.developerName = '',
    this.status = 'Active',
    this.createdAt,
    this.latitude,
    this.longitude,
    this.radiusM = 300,
    this.pitchSummary = '',
    this.whyBuy = '',
    this.sellingPoints = const [],
    this.imagePath = '',
    this.location = '',
    this.fullDescription = '',
    this.developerDescription = '',
    this.paymentPlanSummary = '',
  });

  bool get isActive => status == 'Active';
  bool get hasGps => latitude != null && longitude != null;

  static List<String> _splitPoints(dynamic value) {
    if (value is List) {
      return value.map((e) => e.toString().trim()).where((s) => s.isNotEmpty).toList();
    }
    return (value?.toString() ?? '')
        .split(RegExp(r'\r?\n|,'))
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
  }

  factory ProjectsProject.fromJson(Map<String, dynamic> row) {
    final dev = row['developers'];
    return ProjectsProject(
      id: row['id']?.toString() ?? '',
      name: row['name']?.toString() ?? '',
      developerId: row['developer_id']?.toString(),
      developerName: dev is Map ? (dev['name']?.toString() ?? '') : '',
      status: (row['project_status']?.toString().isNotEmpty ?? false)
          ? row['project_status'].toString()
          : 'Active',
      createdAt: DateTime.tryParse(row['created_at']?.toString() ?? ''),
      latitude: (row['latitude'] as num?)?.toDouble(),
      longitude: (row['longitude'] as num?)?.toDouble(),
      radiusM: (row['radius_m'] as num?)?.toInt() ?? 300,
      pitchSummary: row['pitch_summary']?.toString() ?? '',
      whyBuy: row['why_buy']?.toString() ?? '',
      sellingPoints: _splitPoints(row['selling_points']),
      imagePath: row['image_path']?.toString() ?? '',
      location: row['location']?.toString() ?? '',
      fullDescription: row['full_description']?.toString() ?? '',
      developerDescription: row['developer_description']?.toString() ?? '',
      paymentPlanSummary: row['payment_plan_summary']?.toString() ?? '',
    );
  }
}

/// Values collected by the project form.
class ProjectsFormData {
  final String name;
  final String developerId;
  final String status;
  final String location;
  final double? latitude;
  final double? longitude;
  final int? radiusM;
  final String pitchSummary;
  final String fullDescription;
  final String developerDescription;
  final String paymentPlanSummary;
  final String whyBuy;
  final String sellingPoints; // one per line

  const ProjectsFormData({
    required this.name,
    required this.developerId,
    required this.status,
    this.location = '',
    this.latitude,
    this.longitude,
    this.radiusM,
    this.pitchSummary = '',
    this.fullDescription = '',
    this.developerDescription = '',
    this.paymentPlanSummary = '',
    this.whyBuy = '',
    this.sellingPoints = '',
  });
}

/// Per-project aggregate of its units (starting price + status counts).
class ProjectsUnitStats {
  double? minPrice;
  int available = 0;
  int reserved = 0;
  int sold = 0;
  final List<UnitModel> units = [];

  static Map<String, ProjectsUnitStats> build(List<UnitModel> all) {
    final out = <String, ProjectsUnitStats>{};
    for (final u in all) {
      final s = out.putIfAbsent(u.projectId, () => ProjectsUnitStats());
      s.units.add(u);
      if (u.price > 0 && (s.minPrice == null || u.price < s.minPrice!)) s.minPrice = u.price;
      if (u.status == 'Available') {
        s.available++;
      } else if (u.status == 'Reserved') {
        s.reserved++;
      } else if (u.status == 'Sold') {
        s.sold++;
      }
    }
    return out;
  }
}
