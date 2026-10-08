import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/lead_model.dart';
import 'supabase_service.dart';
import 'users_service.dart';

class LeadsService {
  final SupabaseClient _client = SupabaseService().client;
  final UsersService _usersService = UsersService();

  /// Fetch leads with assigned user profile join ordered by created_at DESC
  Future<List<LeadModel>> getAll({String? search, String? statusFilter, String? assignedToFilter}) async {
    final authIds = await _usersService.getAuthorizedUserIds();

    // If an explicit filter for another agent was requested but caller isn't authorized, deny
    if (authIds != null && assignedToFilter != null && assignedToFilter.isNotEmpty) {
      if (!authIds.contains(assignedToFilter)) {
        return [];
      }
    }

    try {
      var query = _client.from('leads').select(
        '*, assigned_to_profile:user_profiles!leads_assigned_to_fkey(id, full_name)',
      );

      // Role scoping
      if (authIds != null) {
        if (assignedToFilter != null && assignedToFilter.isNotEmpty) {
          query = query.eq('assigned_to', assignedToFilter);
        } else if (authIds.length == 1) {
          final uid = authIds.first;
          query = query.or('assigned_to.eq.$uid,created_by.eq.$uid');
        } else {
          final idsStr = authIds.join(',');
          query = query.or('assigned_to.in.($idsStr),created_by.in.($idsStr)');
        }
      } else if (assignedToFilter != null && assignedToFilter.isNotEmpty) {
        query = query.eq('assigned_to', assignedToFilter);
      }

      if (statusFilter != null && statusFilter.isNotEmpty && statusFilter != 'All Leads') {
        query = query.eq('crm_status', statusFilter);
      }

      if (search != null && search.trim().isNotEmpty) {
        final q = search.trim();
        query = query.or('name.ilike.%$q%,phone.ilike.%$q%,email.ilike.%$q%,project.ilike.%$q%');
      }

      final response = await query.order('created_at', ascending: false).limit(200);
      final List<dynamic> data = response as List<dynamic>;
      return data.map((json) => LeadModel.fromJson(json as Map<String, dynamic>)).toList();
    } catch (e) {
      // Fallback without foreign key join if schema relationship differs
      var fallbackQuery = _client.from('leads').select('*');

      if (authIds != null) {
        if (assignedToFilter != null && assignedToFilter.isNotEmpty) {
          fallbackQuery = fallbackQuery.eq('assigned_to', assignedToFilter);
        } else if (authIds.length == 1) {
          final uid = authIds.first;
          fallbackQuery = fallbackQuery.or('assigned_to.eq.$uid,created_by.eq.$uid');
        } else {
          final idsStr = authIds.join(',');
          fallbackQuery = fallbackQuery.or('assigned_to.in.($idsStr),created_by.in.($idsStr)');
        }
      } else if (assignedToFilter != null && assignedToFilter.isNotEmpty) {
        fallbackQuery = fallbackQuery.eq('assigned_to', assignedToFilter);
      }

      if (statusFilter != null && statusFilter.isNotEmpty && statusFilter != 'All Leads') {
        fallbackQuery = fallbackQuery.eq('crm_status', statusFilter);
      }

      if (search != null && search.trim().isNotEmpty) {
        final q = search.trim();
        fallbackQuery = fallbackQuery.or('name.ilike.%$q%,phone.ilike.%$q%,email.ilike.%$q%,project.ilike.%$q%');
      }

      final data = await fallbackQuery.order('created_at', ascending: false).limit(200);
      return (data as List<dynamic>).map((json) => LeadModel.fromJson(json as Map<String, dynamic>)).toList();
    }
  }

  /// Single lead by id
  Future<LeadModel?> getById(String id) async {
    try {
      final res = await _client
          .from('leads')
          .select('*, assigned_to_profile:user_profiles!leads_assigned_to_fkey(id, full_name)')
          .eq('id', id)
          .maybeSingle();

      if (res == null) return null;
      return LeadModel.fromJson(res);
    } catch (_) {
      final res = await _client.from('leads').select('*').eq('id', id).maybeSingle();
      if (res == null) return null;
      return LeadModel.fromJson(res);
    }
  }

  /// Create lead with duplicate phone/email detection
  Future<LeadModel> create(LeadModel lead) async {
    final currentUserId = _client.auth.currentUser?.id;

    // Duplicate check
    final normalizedPhone = lead.phone.replaceAll(RegExp(r'\D'), '');
    if (normalizedPhone.length >= 8) {
      final suffix = normalizedPhone.length >= 10 ? normalizedPhone.substring(normalizedPhone.length - 10) : normalizedPhone;
      final dup = await _client.from('leads').select('id, name, phone').ilike('phone', '%$suffix%').limit(1).maybeSingle();
      if (dup != null) {
        throw Exception('Duplicate phone number already exists for lead: ${dup['name']}');
      }
    }

    final row = lead.toJson(currentUserId: currentUserId);
    final res = await _client.from('leads').insert(row).select().single();
    return LeadModel.fromJson(res);
  }

  /// Update lead
  Future<LeadModel> update(String id, Map<String, dynamic> updates) async {
    final currentUserId = _client.auth.currentUser?.id;
    final row = Map<String, dynamic>.from(updates);
    row['last_action_at'] = DateTime.now().toUtc().toIso8601String();
    if (currentUserId != null) {
      row['last_action_by'] = currentUserId;
    }

    final res = await _client.from('leads').update(row).eq('id', id).select().single();
    return LeadModel.fromJson(res);
  }

  /// Update lead pipeline status
  Future<void> updateStatus(String id, String newStatus) async {
    final currentUserId = _client.auth.currentUser?.id;
    await _client.from('leads').update({
      'crm_status': newStatus,
      'last_action_at': DateTime.now().toUtc().toIso8601String(),
      if (currentUserId != null) 'last_action_by': currentUserId,
    }).eq('id', id);

    // Also log activity in activity_log
    try {
      await _client.from('activity_log').insert({
        'user_id': currentUserId,
        'action_type': 'Lead Status Updated',
        'entity_type': 'lead',
        'entity_id': id,
        'detail': 'Status changed to $newStatus',
      });
    } catch (_) {}
  }

  /// Quick note / comment on lead
  Future<void> addNote(String id, String note) async {
    final currentUserId = _client.auth.currentUser?.id;
    // Append to lead notes
    final current = await getById(id);
    final existingNotes = current?.notes ?? '';
    final timestamp = DateTime.now().toLocal().toString().split('.')[0];
    final updatedNotes = existingNotes.isEmpty ? '[$timestamp] $note' : '$existingNotes\n[$timestamp] $note';

    await _client.from('leads').update({
      'notes': updatedNotes,
      'last_action_at': DateTime.now().toUtc().toIso8601String(),
      if (currentUserId != null) 'last_action_by': currentUserId,
    }).eq('id', id);

    // Also insert into lead_comments table if present
    try {
      await _client.from('lead_comments').insert({
        'lead_id': id,
        'user_id': currentUserId,
        'comment': note,
      });
    } catch (_) {}
  }

  /// Delete lead
  Future<void> delete(String id) async {
    await _client.from('leads').delete().eq('id', id);
  }

  /// Subscribe to Realtime lead changes
  RealtimeChannel subscribeToChanges(void Function() onEvent) {
    return _client
        .channel('public:leads')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'leads',
          callback: (_) => onEvent(),
        )
        .subscribe();
  }
}
