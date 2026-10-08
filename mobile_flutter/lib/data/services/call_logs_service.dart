import 'package:call_log/call_log.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/call_log_model.dart';
import 'supabase_service.dart';
import 'users_service.dart';

class CallLogsService {
  final SupabaseClient _client = SupabaseService().client;
  final UsersService _usersService = UsersService();

  /// Fetch call logs with optional filters
  Future<List<CallLogModel>> getAll({
    String? search,
    String? channelFilter,
    String? entityId,
    int limit = 100,
  }) async {
    try {
      final authIds = await _usersService.getAuthorizedUserIds();

      var query = _client.from('call_logs').select('*');

      if (authIds != null) {
        if (authIds.length == 1) {
          query = query.eq('user_id', authIds.first);
        } else {
          query = query.inFilter('user_id', authIds);
        }
      }

      if (entityId != null && entityId.isNotEmpty) {
        query = query.eq('entity_id', entityId);
      }

      if (channelFilter != null && channelFilter.isNotEmpty && channelFilter != 'All') {
        query = query.eq('channel', channelFilter);
      }

      final res = await query.order('created_at', ascending: false).limit(limit);
      final list = res as List<dynamic>;
      var items = list.map((e) => CallLogModel.fromJson(e as Map<String, dynamic>)).toList();

      if (search != null && search.trim().isNotEmpty) {
        final q = search.trim().toLowerCase();
        items = items.where((c) {
          final hay = [
            c.contactName,
            c.contactPhone,
            c.outcome,
            c.projectName,
            c.notes,
          ].where((s) => s != null).join(' ').toLowerCase();
          return hay.contains(q);
        }).toList();
      }

      return items;
    } catch (_) {
      return [];
    }
  }

  /// Log a call and update linked lead's stage and touchpoint
  Future<CallLogModel> logCall(CallLogModel call) async {
    final user = _client.auth.currentUser;
    final row = call.toJson(currentUserId: user?.id);

    final res = await _client.from('call_logs').insert(row).select().single();
    final saved = CallLogModel.fromJson(res);

    // If linked to lead, update lead last_action and sync pipeline stage
    if (call.entityType == 'lead' && call.entityId != null && call.entityId!.isNotEmpty) {
      final leadId = call.entityId!;
      final nextStatus = _outcomeToLeadStatus(call.outcome);
      final nowIso = DateTime.now().toUtc().toIso8601String();

      final Map<String, dynamic> updates = {
        'last_action_at': nowIso,
        if (user != null) 'last_action_by': user.id,
      };

      if (nextStatus != null) {
        updates['crm_status'] = nextStatus;
      }

      try {
        await _client.from('leads').update(updates).eq('id', leadId);
      } catch (_) {}
    }

    return saved;
  }

  /// Native call log syncing via the call_log package
  Future<int> syncDeviceCallLogs({int limit = 20}) async {
    final user = _client.auth.currentUser;
    if (user == null) return 0;

    int syncedCount = 0;
    try {
      final Iterable<CallLogEntry> entries = await CallLog.get();
      final recent = entries.take(limit).toList();

      for (final entry in recent) {
        final phone = entry.number?.trim() ?? '';
        if (phone.isEmpty) continue;

        // Normalize phone suffix
        final normalized = phone.replaceAll(RegExp(r'\D'), '');
        final suffix = normalized.length >= 10
            ? normalized.substring(normalized.length - 10)
            : normalized;

        // Try to match with existing lead
        String? leadId;
        String? leadName = entry.name;
        try {
          final dup = await _client
              .from('leads')
              .select('id, name')
              .ilike('phone', '%$suffix%')
              .limit(1)
              .maybeSingle();
          if (dup != null) {
            leadId = dup['id']?.toString();
            leadName = dup['name']?.toString() ?? leadName;
          }
        } catch (_) {}

        final direction = entry.callType == CallType.incoming ? 'incoming' : 'outgoing';
        final duration = entry.duration ?? 0;
        final outcome = duration > 0 ? 'Connected' : 'No Answer';

        final clientRef = 'native-${entry.timestamp}-$normalized';

        // Check if already logged
        final existing = await _client
            .from('call_logs')
            .select('id')
            .eq('client_ref', clientRef)
            .maybeSingle();

        if (existing == null) {
          await _client.from('call_logs').insert({
            'user_id': user.id,
            'entity_type': 'lead',
            'entity_id': leadId ?? '',
            'contact_name': leadName ?? phone,
            'contact_phone': phone,
            'channel': 'Call',
            'direction': direction,
            'duration_seconds': duration,
            'outcome': outcome,
            'notes': 'Synced from device call history ($duration s)',
            'client_ref': clientRef,
          });
          syncedCount++;
        }
      }
    } catch (_) {
      // Permission denied or not supported on current platform
    }

    return syncedCount;
  }

  static String? _outcomeToLeadStatus(String outcome) {
    switch (outcome.trim()) {
      case 'Interested':
        return 'Interested';
      case 'Site Visit':
      case 'Meeting':
      case 'Schedule Meeting':
        return 'Meeting';
      case 'Won Deal':
        return 'Done Deal';
      case 'Not Interested':
        return 'Not Interested';
      case 'No Answer':
        return 'No Answer';
      case 'Wrong Number':
      case 'Wrong Phone':
        return 'Wrong Number';
      case 'Cancellation':
        return 'Cancellation';
      case 'Answered':
      case 'Follow-up':
      case 'Following Up':
        return 'Following Up';
      default:
        return null;
    }
  }

  /// Subscribe to call log additions
  RealtimeChannel subscribeToChanges(void Function() onEvent) {
    return _client
        .channel('public:call_logs')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'call_logs',
          callback: (_) => onEvent(),
        )
        .subscribe();
  }
}
