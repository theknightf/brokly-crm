import 'dart:math';
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
    // An empty list means the profile could not be read (session not ready / network). Treat it as a failed load,
    // not as "this user has no leads", so the screens show an error and the provider retries.
    if (authIds != null && authIds.isEmpty) {
      throw Exception('Could not load your profile. Check the connection and try again.');
    }

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

  /// Create a lead.
  ///
  /// Duplicates (same normalized phone) are saved like any lead: the database moves them to the
  /// 'Duplicate Leads' stage and hides them from sales. So the insert has no RETURNING (a sales user
  /// cannot read the row back, and RETURNING would turn that into an error), and the agent just sees
  /// the normal "added" result.
  Future<LeadModel> create(LeadModel lead) async {
    final currentUserId = _client.auth.currentUser?.id;
    final row = lead.toJson(currentUserId: currentUserId);
    row['id'] = _newUuid();

    await _client.from('leads').insert(row);
    final visible = await _client.from('leads').select().eq('id', row['id']).maybeSingle();
    return LeadModel.fromJson(visible ??
        {...row, 'created_at': DateTime.now().toUtc().toIso8601String()});
  }

  /// Update lead (no RETURNING: changing the phone to an existing number hides the lead from sales).
  Future<LeadModel> update(String id, Map<String, dynamic> updates) async {
    final currentUserId = _client.auth.currentUser?.id;
    final row = Map<String, dynamic>.from(updates);
    row['last_action_at'] = DateTime.now().toUtc().toIso8601String();
    if (currentUserId != null) {
      row['last_action_by'] = currentUserId;
    }

    await _client.from('leads').update(row).eq('id', id);
    final visible = await _client.from('leads').select().eq('id', id).maybeSingle();
    return LeadModel.fromJson(visible ?? {...row, 'id': id});
  }

  /// Random UUID v4 for a new lead id (so the row can be written without RETURNING).
  static String _newUuid() {
    final r = Random.secure();
    final b = List<int>.generate(16, (_) => r.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
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
  /// [assignedTo] limits the stream to that user's own leads. The server applies the filter BEFORE the row-level
  /// security check, so every agent no longer costs one RLS evaluation per change made by anybody.
  RealtimeChannel subscribeToChanges(void Function() onEvent, {String? assignedTo}) {
    return _client
        .channel('public:leads')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'leads',
          filter: assignedTo == null
              ? null
              : PostgresChangeFilter(type: PostgresChangeFilterType.eq, column: 'assigned_to', value: assignedTo),
          callback: (_) => onEvent(),
        )
        .subscribe();
  }
}
