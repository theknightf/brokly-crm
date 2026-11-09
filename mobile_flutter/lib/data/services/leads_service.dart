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

    // Fresh query per page: builders must not be reused across .range() calls.
    PostgrestFilterBuilder<PostgrestList> scoped(String columns) {
      var query = _client.from('leads').select(columns);

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
      return query;
    }

    try {
      return await _fetchAllPaged(() => scoped(
            '*, assigned_to_profile:user_profiles!leads_assigned_to_fkey(id, full_name)',
          ));
    } catch (e) {
      // Fallback without foreign key join if schema relationship differs
      return _fetchAllPaged(() => scoped('*'));
    }
  }

  /// Loads every matching lead in pages of 1000. Two reasons: PostgREST silently caps a single response at
  /// 1000 rows (an unpaged select dropped everything after that), and parsing one huge JSON body at once makes
  /// a memory spike (raw JSON + decoded maps + models) that the low-memory killer punishes on 2-3 GB phones.
  /// Each page is turned into models and its raw JSON is released before the next page is requested.
  Future<List<LeadModel>> _fetchAllPaged(PostgrestFilterBuilder<PostgrestList> Function() build) async {
    const pageSize = 1000;
    final leads = <LeadModel>[];
    for (var from = 0; from < 50000; from += pageSize) {
      final page = await build()
          .order('created_at', ascending: false)
          .order('id')
          .range(from, from + pageSize - 1);
      for (final json in page) {
        leads.add(LeadModel.fromJson(json));
      }
      if (page.length < pageSize) break;
    }
    return leads;
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

  /// Create lead and automatically route duplicates to Duplicate Center without blocking
  Future<LeadModel> create(LeadModel lead) async {
    final currentUserId = _client.auth.currentUser?.id;

    String? matchedDupId;
    String? matchedDupName;
    try {
      final normalizedPhone = lead.phone.replaceAll(RegExp(r'\D'), '');
      if (normalizedPhone.length >= 8) {
        final suffix = normalizedPhone.length >= 10
            ? normalizedPhone.substring(normalizedPhone.length - 10)
            : normalizedPhone;
        final dup = await _client
            .from('leads')
            .select('id, name, phone')
            .ilike('phone', '%$suffix%')
            .order('created_at', ascending: true)
            .limit(1)
            .maybeSingle();
        if (dup != null) {
          final dupDigits = (dup['phone']?.toString() ?? '').replaceAll(RegExp(r'\D'), '');
          final dupTail = dupDigits.length >= 10 ? dupDigits.substring(dupDigits.length - 10) : dupDigits;
          if (dupTail == suffix) {
            matchedDupId = dup['id']?.toString();
            matchedDupName = dup['name']?.toString();
          }
        }
      }
      final emailNorm = (lead.email ?? '').trim().toLowerCase();
      if (matchedDupId == null && emailNorm.isNotEmpty && emailNorm.contains('@')) {
        final dup = await _client
            .from('leads')
            .select('id, name, email')
            .ilike('email', emailNorm)
            .order('created_at', ascending: true)
            .limit(1)
            .maybeSingle();
        if (dup != null) {
          matchedDupId = dup['id']?.toString();
          matchedDupName = dup['name']?.toString();
        }
      }
    } catch (_) {}

    final row = lead.toJson(currentUserId: currentUserId);
    if (matchedDupId != null) {
      row['crm_status'] = 'Duplicate Leads';
      row['lead_status'] = 'Lost';
      row['is_duplicate'] = true;
      row['duplicate_of_lead_id'] = matchedDupId;
      row['routed_to_duplicate_center_at'] = DateTime.now().toUtc().toIso8601String();
      final existingNotes = (row['notes']?.toString() ?? '').trim();
      final shortId = matchedDupId.length >= 8 ? matchedDupId.substring(0, 8) : matchedDupId;
      final tag = '[Pending Review / Duplicate of #$shortId (${matchedDupName ?? 'Existing Lead'})]';
      if (!existingNotes.contains('[Pending Review / Duplicate')) {
        row['notes'] = existingNotes.isEmpty ? tag : '$existingNotes\n$tag';
      }
    }

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

  /// A written note on the lead (a lead comment). Not swallowed: the caller must know whether it was saved, because a
  /// sales user's stage change is only allowed after it.
  Future<void> addComment(String id, String body) async {
    final uid = _client.auth.currentUser?.id;
    await _client.from('lead_comments').insert({'lead_id': id, 'user_id': uid, 'body': body});
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
        'body': note, // the column is "body"; "comment" made every quick note fail silently (never counted as an action)
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
