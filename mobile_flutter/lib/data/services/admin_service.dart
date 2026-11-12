import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/admin_models.dart';
import 'supabase_service.dart';

/// Direct-to-Supabase port of the web Admin console data layer
/// (crmService.usersService / adminSettingsService / developersService and
/// peopleOpsService). All access is governed by RLS; nothing here uses a
/// service-role key. Operations that need one stay web-only (see
/// [AdminService.updateUser] notes and the module report).
class AdminService {
  final SupabaseClient _client = SupabaseService().client;

  List<Map<String, dynamic>> _rows(dynamic res) =>
      (res as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();

  // ─── Users ────────────────────────────────────────────────────────────────

  static const String _userAdminJoin = '*, admin:user_profiles!user_profiles_admin_id_fkey(id, full_name)';

  Future<List<AdminUser>> getUsers() async {
    try {
      final res = await _client.from('user_profiles').select(_userAdminJoin).order('created_at', ascending: false);
      return _rows(res).map(AdminUser.fromJson).toList();
    } on PostgrestException {
      // admin_id migration not applied yet: plain read (same fallback as web).
      final res = await _client.from('user_profiles').select('*').order('created_at', ascending: false);
      return _rows(res).map(AdminUser.fromJson).toList();
    }
  }

  /// Update a profile row. Allowed for admin/owner by the RLS policy
  /// `admins_manage_profiles`; DB triggers still guard role/is_active/admin_id.
  /// Client-side guards mirror PATCH /api/admin/users.
  Future<void> updateUser(
    String id, {
    required String actorId,
    required String actorRole,
    String? fullName,
    String? phone,
    String? role,
    bool? isActive,
    String? teamId,
    bool clearTeam = false,
    double? baseSalary,
  }) async {
    final actor = actorRole.toLowerCase();
    final payload = <String, dynamic>{};
    if (fullName != null) payload['full_name'] = fullName.trim();
    if (phone != null) payload['phone'] = phone.trim();
    if (role != null) {
      if (!adminAllowedRoles.contains(role)) throw Exception('Invalid role');
      if ((role == 'owner' || role == 'admin') && actor != 'owner') {
        throw Exception('Only an owner can grant $role');
      }
      payload['role'] = role;
    }
    if (isActive != null) payload['is_active'] = isActive;
    if (clearTeam) {
      payload['team_id'] = null;
    } else if (teamId != null) {
      payload['team_id'] = teamId;
    }
    if (baseSalary != null) payload['base_salary'] = baseSalary;

    if (id == actorId) {
      if (payload.containsKey('role')) throw Exception('Cannot change your own role');
      if (payload['is_active'] == false) throw Exception('Cannot deactivate yourself');
    }
    if (payload.isEmpty) return;
    final res = await _client.from('user_profiles').update(payload).eq('id', id).select('id');
    if ((res as List).isEmpty) {
      throw Exception('Update was not permitted for this user');
    }
  }

  Future<List<AdminUser>> getAdmins() async {
    final res = await _client.from('user_profiles').select('*').inFilter('role', ['admin', 'owner']).order('full_name');
    return _rows(res).map(AdminUser.fromJson).toList();
  }

  Future<void> sendPasswordReset(String email) async {
    await _client.auth.resetPasswordForEmail(email);
  }

  // ─── Settings lists (admin_settings) + developers ─────────────────────────

  Future<List<AdminSettingItem>> getSettings(String category) async {
    final res = await _client
        .from('admin_settings')
        .select('*')
        .eq('category', category)
        .order('sort_order', ascending: true);
    return _rows(res).map(AdminSettingItem.fromSettings).toList();
  }

  Future<void> createSetting(String category, {required String name, String? color, int order = 0, bool active = true}) async {
    await _client.from('admin_settings').insert({
      'category': category,
      'name': name,
      'color': color,
      'sort_order': order,
      'is_active': active,
    });
  }

  Future<void> updateSetting(String id, {required String name, String? color, int order = 0, required bool active}) async {
    await _client.from('admin_settings').update({
      'name': name,
      'color': color,
      'sort_order': order,
      'is_active': active,
    }).eq('id', id);
  }

  Future<void> deleteSetting(String id) async {
    await _client.from('admin_settings').delete().eq('id', id);
  }

  Future<List<AdminSettingItem>> getDevelopers() async {
    final res = await _client.from('developers').select('*').order('name', ascending: true);
    return _rows(res).map(AdminSettingItem.fromDeveloper).toList();
  }

  Future<void> createDeveloper(String name) async {
    await _client.from('developers').insert({'name': name, 'is_active': true});
  }

  Future<void> updateDeveloper(String id, String name, bool active) async {
    await _client.from('developers').update({'name': name, 'is_active': active}).eq('id', id);
  }

  Future<void> deleteDeveloper(String id) async {
    await _client.from('developers').delete().eq('id', id);
  }

  // ─── Leave ────────────────────────────────────────────────────────────────

  Future<List<AdminLeave>> getLeave() async {
    final res = await _client
        .from('leave_requests')
        .select('*, user_name:user_profiles!leave_requests_user_id_fkey(full_name)')
        .order('start_date', ascending: false);
    return _rows(res).map(AdminLeave.fromJson).toList();
  }

  Future<void> requestLeave({
    required String userId,
    required String leaveType,
    required String startDate,
    required String endDate,
    required double days,
    String reason = '',
  }) async {
    await _client.from('leave_requests').insert({
      'user_id': userId,
      'leave_type': leaveType,
      'start_date': startDate,
      'end_date': endDate,
      'days': days,
      'reason': reason,
      'status': 'pending',
    });
  }

  Future<void> reviewLeave(String id, String status, String actorId) async {
    await _client.from('leave_requests').update({
      'status': status,
      'approved_by': actorId,
      'reviewed_at': DateTime.now().toUtc().toIso8601String(),
    }).eq('id', id);
  }

  Future<void> cancelLeave(String id) async {
    await _client.from('leave_requests').update({'status': 'cancelled'}).eq('id', id);
  }

  // ─── KPI targets ──────────────────────────────────────────────────────────

  Future<List<AdminKpiTarget>> getKpiTargets() async {
    final res = await _client.from('kpi_targets').select('*').order('period_type').order('metric');
    return _rows(res).map(AdminKpiTarget.fromJson).toList();
  }

  Future<void> saveKpiTarget({
    String? id,
    required String metric,
    required String label,
    required double targetValue,
    required String periodType,
    required String targetRole,
    required bool isActive,
  }) async {
    final row = {
      'metric': metric,
      'label': label,
      'target_value': targetValue,
      'period_type': periodType,
      'target_role': targetRole,
      'is_active': isActive,
    };
    if (id != null) {
      await _client.from('kpi_targets').update(row).eq('id', id);
    } else {
      await _client.from('kpi_targets').insert(row);
    }
  }

  Future<void> deleteKpiTarget(String id) async {
    await _client.from('kpi_targets').delete().eq('id', id);
  }

  // ─── Tasks ────────────────────────────────────────────────────────────────

  Future<List<AdminTask>> getTasks() async {
    final res = await _client.from('tasks').select('*').eq('is_active', true).order('created_at', ascending: false);
    return _rows(res).map(AdminTask.fromJson).toList();
  }

  Future<void> createTask({
    required String title,
    String description = '',
    String targetRole = 'all',
    String? dueDate,
    String priority = 'Medium',
  }) async {
    await _client.from('tasks').insert({
      'title': title,
      'description': description,
      'target_role': targetRole,
      'due_date': dueDate,
      'priority': priority,
      'assigned_by': _client.auth.currentUser?.id,
    });
  }

  Future<void> deleteTask(String id) async {
    await _client.from('tasks').delete().eq('id', id);
  }

  // ─── Company settings (working hours / payroll rules) ─────────────────────

  Future<Map<String, dynamic>?> getCompanySetting(String key) async {
    final res = await _client.from('company_settings').select('value').eq('key', key).maybeSingle();
    final v = res?['value'];
    return v is Map ? Map<String, dynamic>.from(v) : null;
  }

  /// Upserts a company_settings row, preserving unknown keys already stored
  /// (e.g. dressThreshold used by other tooling) by merging over the old value.
  Future<void> saveCompanySetting(String key, Map<String, dynamic> patch) async {
    final existing = await getCompanySetting(key) ?? <String, dynamic>{};
    final value = {...existing, ...patch};
    await _client.from('company_settings').upsert({
      'key': key,
      'value': value,
      'updated_by': _client.auth.currentUser?.id,
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    });
  }

  // ─── Lead rotation (config + history; the run itself stays web-only) ──────

  Future<({bool enabled, int days})> getRotationConfig() async {
    final res = await _client.from('admin_settings').select('*').eq('category', 'rotation');
    final items = _rows(res);
    bool enabled = false;
    int days = 7;
    for (final i in items) {
      if (i['name'] == 'rotation_enabled') enabled = i['is_active'] == true;
      if (i['name'] == 'inactivity_days') {
        final d = admNum(i['sort_order']).round();
        if (d > 0) days = d;
      }
    }
    return (enabled: enabled, days: days);
  }

  Future<void> saveRotationConfig(bool enabled, int days) async {
    Future<void> upsert(String name, bool active, int order) async {
      final existing = await _client.from('admin_settings').select('id').eq('category', 'rotation').eq('name', name);
      final list = _rows(existing);
      if (list.isNotEmpty) {
        await _client.from('admin_settings').update({'is_active': active, 'sort_order': order}).eq('id', list.first['id']);
      } else {
        await _client.from('admin_settings').insert({
          'category': 'rotation',
          'name': name,
          'sort_order': order,
          'is_active': active,
        });
      }
    }

    await upsert('rotation_enabled', enabled, 0);
    await upsert('inactivity_days', true, days);
  }

  Future<List<AdminRotationLog>> getRotationHistory() async {
    final res = await _client
        .from('lead_rotation_log')
        .select(
            '*, from_user:user_profiles!lead_rotation_log_from_user_id_fkey(full_name), to_user:user_profiles!lead_rotation_log_to_user_id_fkey(full_name), lead:leads!lead_rotation_log_lead_id_fkey(name)')
        .order('rotated_at', ascending: false)
        .limit(100);
    return _rows(res).map(AdminRotationLog.fromJson).toList();
  }

  // ─── Claim conflicts (admin/owner SELECT only, by RLS) ────────────────────

  Future<List<AdminClaimConflict>> getClaimConflicts({int limit = 200}) async {
    final res = await _client
        .from('lead_claim_conflicts')
        .select(
            'id, created_at, lead_id, lead_name, lead_phone, holder_id, holder_name, requester_id, requester_name, attempted_action, status')
        .order('created_at', ascending: false)
        .limit(limit.clamp(1, 500));
    return _rows(res).map(AdminClaimConflict.fromJson).toList();
  }

  // ─── Employee list (for pickers) ──────────────────────────────────────────

  Future<List<AdminUser>> getActiveEmployees() async {
    final res = await _client
        .from('user_profiles')
        .select('id, full_name, email, role, is_active')
        .eq('is_active', true)
        .order('full_name');
    return _rows(res).map(AdminUser.fromJson).toList();
  }
}

/// Roles an admin may assign (ALLOWED_ROLES in /api/admin/users).
const List<String> adminAllowedRoles = [
  'admin',
  'owner',
  'broker',
  'branch_manager',
  'team_leader',
  'senior_agent',
  'agent',
  'telecaller',
];

/// Roles a KPI target or task can be aimed at (TARGET_ROLE_OPTIONS).
const List<({String value, String label})> adminTargetRoles = [
  (value: 'all', label: 'Everyone'),
  (value: 'broker', label: 'Brokers'),
  (value: 'senior_agent', label: 'Senior Agents'),
  (value: 'agent', label: 'Sales Agents'),
  (value: 'telecaller', label: 'Telecallers'),
];
