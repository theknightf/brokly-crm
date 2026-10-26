import 'package:call_log/call_log.dart';
import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/call_log_model.dart';
import 'supabase_service.dart';
import 'users_service.dart';

/// Metadata captured directly from the device's native call log after a call ends
class DeviceCallMetadata {
  final int durationSeconds;
  final DateTime timestamp;
  final String detectedOutcome;
  final String direction;
  final String callTypeLabel;
  final String clientRef;
  final String? syncedCallLogId;

  const DeviceCallMetadata({
    required this.durationSeconds,
    required this.timestamp,
    required this.detectedOutcome,
    required this.direction,
    required this.callTypeLabel,
    required this.clientRef,
    this.syncedCallLogId,
  });
}

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

  /// Automatically capture the most recent device call log entry for a specific lead
  /// after a call ends, sync it to Supabase, and attach metadata to the lead's history.
  Future<DeviceCallMetadata?> captureAndSyncCallForLead({
    required String leadId,
    required String leadName,
    required String leadPhone,
    required DateTime callStartedAt,
    String? projectName,
  }) async {
    if (kIsWeb) return null;

    final user = _client.auth.currentUser;
    final cleanTarget = leadPhone.replaceAll(RegExp(r'\D'), '');
    if (cleanTarget.isEmpty) return null;
    final targetSuffix = cleanTarget.length >= 8
        ? cleanTarget.substring(cleanTarget.length - 8)
        : cleanTarget;

    try {
      final Iterable<CallLogEntry> entries = await CallLog.get();
      final minEpoch = callStartedAt
          .subtract(const Duration(seconds: 30))
          .millisecondsSinceEpoch;

      CallLogEntry? matched;
      for (final entry in entries.take(15)) {
        final numStr = (entry.number ?? '').replaceAll(RegExp(r'\D'), '');
        if (numStr.isEmpty) continue;
        final entryTs = entry.timestamp ?? 0;
        if (numStr.endsWith(targetSuffix) && entryTs >= minEpoch) {
          matched = entry;
          break;
        }
      }

      if (matched == null) return null;

      final duration = matched.duration ?? 0;
      final tsMillis = matched.timestamp ?? DateTime.now().millisecondsSinceEpoch;
      final callTimestamp = DateTime.fromMillisecondsSinceEpoch(tsMillis);
      final callTypeLabel = _callTypeToLabel(matched.callType);
      final direction = matched.callType == CallType.incoming ? 'incoming' : 'outgoing';
      final isMissedOrRejected = matched.callType == CallType.missed ||
          matched.callType == CallType.rejected ||
          matched.callType == CallType.blocked;
      final detectedOutcome = (isMissedOrRejected || duration == 0) ? 'No Answer' : 'Answered';
      final clientRef = 'native-$tsMillis-$cleanTarget';
      final formattedTs = DateFormat('yyyy-MM-dd HH:mm:ss').format(callTimestamp.toLocal());
      final autoNote =
          'Auto-captured device call ($callTypeLabel • $detectedOutcome • ${duration}s at $formattedTs)';

      String? syncedId;

      if (user != null) {
        try {
          final existing = await _client
              .from('call_logs')
              .select('id')
              .eq('client_ref', clientRef)
              .maybeSingle();

          if (existing != null) {
            syncedId = existing['id']?.toString();
          } else {
            final row = {
              'user_id': user.id,
              'entity_type': 'lead',
              'entity_id': leadId,
              'contact_name': leadName,
              'contact_phone': leadPhone,
              'channel': 'Call',
              'direction': direction,
              'duration_seconds': duration,
              'outcome': detectedOutcome,
              'notes': autoNote,
              'client_ref': clientRef,
              if (projectName != null && projectName.isNotEmpty) 'project_name': projectName,
              'created_at': callTimestamp.toUtc().toIso8601String(),
            };

            try {
              final inserted = await _client.from('call_logs').insert(row).select('id').single();
              syncedId = inserted['id']?.toString();
            } catch (_) {
              final fallbackRow = Map<String, dynamic>.from(row)
                ..remove('client_ref')
                ..remove('project_name');
              final inserted = await _client.from('call_logs').insert(fallbackRow).select('id').single();
              syncedId = inserted['id']?.toString();
            }

            // Attach call metadata to lead's history immediately
            await _attachCallMetadataToLeadHistory(
              leadId: leadId,
              userId: user.id,
              callTimestamp: callTimestamp,
              durationSeconds: duration,
              callTypeLabel: callTypeLabel,
              outcome: detectedOutcome,
            );
          }
        } catch (_) {}
      }

      return DeviceCallMetadata(
        durationSeconds: duration,
        timestamp: callTimestamp,
        detectedOutcome: detectedOutcome,
        direction: direction,
        callTypeLabel: callTypeLabel,
        clientRef: clientRef,
        syncedCallLogId: syncedId,
      );
    } catch (_) {
      return null;
    }
  }

  /// Log a call and update linked lead's stage, notes, and follow-up schedule.
  /// If an auto-synced call_logs entry already exists (matched via clientRef),
  /// updates that row so there is no duplicate entry.
  Future<CallLogModel> logCall(
    CallLogModel call, {
    String? followUpDate,
    String? followUpTime,
  }) async {
    final user = _client.auth.currentUser;
    final row = call.toJson(currentUserId: user?.id);

    CallLogModel saved;
    Map<String, dynamic>? existingRow;

    if (call.clientRef != null && call.clientRef!.isNotEmpty) {
      try {
        existingRow = await _client
            .from('call_logs')
            .select('id')
            .eq('client_ref', call.clientRef!)
            .maybeSingle();
      } catch (_) {}
    }

    if (existingRow != null && existingRow['id'] != null) {
      final existingId = existingRow['id'].toString();
      try {
        final res = await _client
            .from('call_logs')
            .update({
              'outcome': call.outcome,
              'duration_seconds': call.durationSeconds,
              'notes': call.notes,
              'direction': call.direction,
            })
            .eq('id', existingId)
            .select()
            .single();
        saved = CallLogModel.fromJson(res);
      } catch (_) {
        saved = call;
      }
    } else {
      try {
        final res = await _client.from('call_logs').insert(row).select().single();
        saved = CallLogModel.fromJson(res);
      } catch (_) {
        // Fallback if optional columns like client_ref/project_name aren't migrated
        final plainRow = Map<String, dynamic>.from(row)
          ..remove('client_ref')
          ..remove('project_name');
        final res = await _client.from('call_logs').insert(plainRow).select().single();
        saved = CallLogModel.fromJson(res);
      }
    }

    // If linked to lead, update lead last_action, status, notes, and follow_up_due
    if (call.entityType == 'lead' && call.entityId != null && call.entityId!.isNotEmpty) {
      final leadId = call.entityId!;
      final nextStatus = _outcomeToLeadStatus(call.outcome);
      final nowIso = DateTime.now().toUtc().toIso8601String();
      final todayStr = nowIso.split('T').first;

      final Map<String, dynamic> updates = {
        'last_action_at': nowIso,
        'last_contact': todayStr,
        if (user != null) 'last_action_by': user.id,
      };

      if (nextStatus != null) {
        updates['crm_status'] = nextStatus;
        updates['lead_status'] = _mapCrmStatusToLegacy(nextStatus);
      }

      if (followUpDate != null && followUpDate.trim().isNotEmpty) {
        updates['follow_up_due'] = followUpDate.trim();
      }

      // Append call note + duration/status metadata to lead's notes & lead_comments
      final durationLabel = '${call.durationSeconds}s';
      final userNote = call.notes?.trim() ?? '';
      final noteText = userNote.isNotEmpty
          ? '[${call.channel} • ${call.outcome} • $durationLabel] $userNote'
          : '[${call.channel} • ${call.outcome} • $durationLabel] Call outcome logged';

      try {
        final existingLead = await _client
            .from('leads')
            .select('notes')
            .eq('id', leadId)
            .maybeSingle();
        final existingNotes = existingLead?['notes']?.toString() ?? '';
        final ts = DateFormat('yyyy-MM-dd HH:mm').format(DateTime.now().toLocal());
        updates['notes'] = existingNotes.isEmpty
            ? '[$ts] $noteText'
            : '$existingNotes\n[$ts] $noteText';
      } catch (_) {}

      try {
        await _client.from('lead_comments').insert({
          'lead_id': leadId,
          'user_id': user?.id,
          'body': noteText,
        });
      } catch (_) {}

      try {
        await _client.from('leads').update(updates).eq('id', leadId);
      } catch (_) {}

      // If a follow-up or meeting date was scheduled, upsert/insert into follow_ups
      if (followUpDate != null && followUpDate.trim().isNotEmpty) {
        try {
          final isMeeting = call.outcome == 'Schedule Meeting' ||
              call.outcome == 'Meeting' ||
              call.outcome == 'Site Visit';
          await _client.from('follow_ups').insert({
            'lead_id': leadId,
            'title': '${isMeeting ? "Meeting" : "Follow up"}: ${call.contactName ?? "Lead"}',
            'contact_name': call.contactName ?? 'Lead',
            'contact_phone': call.contactPhone,
            'property_interest': call.projectName ?? '',
            'due_date': followUpDate.trim(),
            'due_time': (followUpTime != null && followUpTime.trim().isNotEmpty)
                ? followUpTime.trim()
                : '10:00',
            'follow_up_status': 'Pending',
            'priority': isMeeting ? 'High' : 'Medium',
            'notes': call.notes ?? 'Scheduled after ${call.outcome}',
            if (user != null) 'created_by': user.id,
          });
        } catch (_) {}
      }

      // Best-effort activity_log entry
      try {
        await _client.from('activity_log').insert({
          if (user != null) 'user_id': user.id,
          'action_type': '${call.channel} Logged',
          'entity_type': 'lead',
          'entity_id': leadId,
          'detail':
              '${call.outcome} ($durationLabel)${userNote.isNotEmpty ? " — $userNote" : ""}',
        });
      } catch (_) {}
    }

    return saved;
  }

  /// Native call log syncing via the call_log package.
  /// Captures duration, timestamp, and call status and attaches them to matched leads' history.
  Future<int> syncDeviceCallLogs({int limit = 20, String? filterLeadId}) async {
    if (kIsWeb) return 0;
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
        if (normalized.isEmpty) continue;
        final suffix = normalized.length >= 8
            ? normalized.substring(normalized.length - 8)
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

        if (filterLeadId != null && leadId != filterLeadId) {
          continue;
        }

        final callTypeLabel = _callTypeToLabel(entry.callType);
        final direction = entry.callType == CallType.incoming ? 'incoming' : 'outgoing';
        final duration = entry.duration ?? 0;
        final isMissedOrRejected = entry.callType == CallType.missed ||
            entry.callType == CallType.rejected ||
            entry.callType == CallType.blocked;
        final outcome = (isMissedOrRejected || duration == 0) ? 'No Answer' : 'Answered';
        final tsMillis = entry.timestamp ?? DateTime.now().millisecondsSinceEpoch;
        final callTimestamp = DateTime.fromMillisecondsSinceEpoch(tsMillis);
        final formattedTs = DateFormat('yyyy-MM-dd HH:mm:ss').format(callTimestamp.toLocal());

        final clientRef = 'native-$tsMillis-$normalized';

        // Check if already logged
        final existing = await _client
            .from('call_logs')
            .select('id')
            .eq('client_ref', clientRef)
            .maybeSingle();

        if (existing == null) {
          final noteStr =
              'Device Call Log ($callTypeLabel • $outcome • ${duration}s at $formattedTs)';
          try {
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
              'notes': noteStr,
              'client_ref': clientRef,
              'created_at': callTimestamp.toUtc().toIso8601String(),
            });
          } catch (_) {
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
              'notes': noteStr,
            });
          }

          if (leadId != null && leadId.isNotEmpty) {
            await _attachCallMetadataToLeadHistory(
              leadId: leadId,
              userId: user.id,
              callTimestamp: callTimestamp,
              durationSeconds: duration,
              callTypeLabel: callTypeLabel,
              outcome: outcome,
            );
          }

          syncedCount++;
        }
      }
    } catch (_) {
      // Permission denied or not supported on current platform
    }

    return syncedCount;
  }

  Future<void> _attachCallMetadataToLeadHistory({
    required String leadId,
    required String userId,
    required DateTime callTimestamp,
    required int durationSeconds,
    required String callTypeLabel,
    required String outcome,
  }) async {
    final formattedTs = DateFormat('yyyy-MM-dd HH:mm').format(callTimestamp.toLocal());
    final metadataNote =
        '[Device Call Sync • $formattedTs] $callTypeLabel ($outcome) • Duration: ${durationSeconds}s';

    try {
      final existingLead = await _client
          .from('leads')
          .select('notes')
          .eq('id', leadId)
          .maybeSingle();
      final existingNotes = existingLead?['notes']?.toString() ?? '';
      final updatedNotes = existingNotes.isEmpty
          ? metadataNote
          : '$existingNotes\n$metadataNote';

      await _client.from('leads').update({
        'last_action_at': callTimestamp.toUtc().toIso8601String(),
        'last_contact': callTimestamp.toUtc().toIso8601String().split('T').first,
        'last_action_by': userId,
        'notes': updatedNotes,
      }).eq('id', leadId);
    } catch (_) {}

    try {
      await _client.from('lead_comments').insert({
        'lead_id': leadId,
        'user_id': userId,
        'body': metadataNote,
      });
    } catch (_) {}

    try {
      await _client.from('activity_log').insert({
        'user_id': userId,
        'action_type': 'Device Call Synced',
        'entity_type': 'lead',
        'entity_id': leadId,
        'detail': '$callTypeLabel ($outcome) • ${durationSeconds}s at $formattedTs',
      });
    } catch (_) {}
  }

  static String _callTypeToLabel(CallType? type) {
    switch (type) {
      case CallType.incoming:
        return 'Incoming Call';
      case CallType.outgoing:
        return 'Outgoing Call';
      case CallType.missed:
        return 'Missed Call';
      case CallType.rejected:
        return 'Rejected Call';
      case CallType.blocked:
        return 'Blocked Call';
      case CallType.voiceMail:
        return 'Voicemail';
      default:
        return 'Outgoing Call';
    }
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
      case 'Closed Number':
        return 'Closed Number';
      case 'Cancellation':
        return 'Cancellation';
      case 'Answered':
      case 'Connected':
      case 'Follow-up':
      case 'Follow Up':
      case 'Following Up':
        return 'Following Up';
      default:
        return null;
    }
  }

  static String _mapCrmStatusToLegacy(String crm) {
    switch (crm) {
      case 'Fresh Leads':
        return 'New';
      case 'Cold Calls':
      case 'Pending Leads':
      case 'Data Rotation':
      case 'No Answer':
      case 'No Answer At All':
        return 'Contacted';
      case 'Following Up':
      case 'Interested':
        return 'Qualified';
      case 'Meeting':
      case 'Reschedule Meeting':
        return 'Site Visit Scheduled';
      case 'Done Deal':
        return 'Won';
      case 'Not Interested':
      case 'Cancellation':
      case 'Duplicate Leads':
      case 'Wrong Number':
      case 'Closed Number':
      case 'Low Budget':
        return 'Lost';
      default:
        return 'Contacted';
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
