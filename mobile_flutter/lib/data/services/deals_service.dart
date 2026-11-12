import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/lead_model.dart';
import 'leads_service.dart';
import 'supabase_service.dart';

/// Deals ("Done Deal") and Reservations are leads filtered by `crm_status`,
/// exactly like the web pages (LeadsManagementScreen with an initial status).
/// Role scoping (admin = all, team leader = team, agent = own) is applied by
/// [LeadsService.getAll]; the database RLS enforces it again server-side.
class DealsService {
  static const String reservation = 'Reservation';
  static const String doneDeal = 'Done Deal';

  final SupabaseClient _client = SupabaseService().client;
  final LeadsService _leads = LeadsService();

  Future<List<LeadModel>> fetch(String status) => _leads.getAll(statusFilter: status);

  /// Mirrors web `handleQuickDealStatus`: stage + payment snapshot + activity log.
  Future<void> saveDeal({
    required LeadModel lead,
    required String status,
    required String date, // yyyy-MM-dd
    required double amount, // reservation amount (Reservation only)
    required double finalPrice,
    required double commission,
  }) async {
    final isReservation = status == reservation;
    final userId = _client.auth.currentUser?.id;
    final payload = <String, dynamic>{
      'crm_status': status,
      'lead_status': legacyStatus(status),
      if (isReservation) 'reservation_amount': amount,
      if (isReservation) 'reservation_date': date,
      if (!isReservation) 'closing_date': date,
      'final_price': finalPrice,
      'commission': commission,
      if (isReservation) 'payment_status': 'In Progress',
      'last_action_at': DateTime.now().toUtc().toIso8601String(),
      if (userId != null) 'last_action_by': userId,
    };
    await _client.from('leads').update(payload).eq('id', lead.id);
    try {
      await _client.from('activity_log').insert({
        'user_id': userId,
        'action_type': isReservation ? 'Lead Reserved' : 'Done Deal',
        'entity_type': 'lead',
        'entity_id': lead.id,
        'detail': '${lead.name.isEmpty ? 'Lead' : lead.name} marked as $status',
      });
    } catch (_) {}
  }

  /// Mirrors web mapCrmStatusToLegacy.
  static String legacyStatus(String crm) {
    const map = {
      'Fresh Leads': 'New',
      'Cold Calls': 'Contacted',
      'Pending Leads': 'Contacted',
      'Following Up': 'Qualified',
      'Follow Up After Meeting': 'Qualified',
      'Meeting': 'Site Visit Scheduled',
      'Interested': 'Qualified',
      'Not Interested': 'Lost',
      'Cancellation': 'Lost',
      'Done Deal': 'Won',
      'Reservation': 'Negotiation',
      'Duplicate Leads': 'Lost',
      'Wrong Number': 'Lost',
      'Data Rotation': 'Contacted',
      'Closed Number': 'Lost',
      'No Answer': 'Contacted',
      'No Answer At All': 'Contacted',
      'Low Budget': 'Lost',
      'Reschedule Meeting': 'Site Visit Scheduled',
    };
    return map[crm] ?? 'New';
  }

  /// Move a lead to another (non deal) pipeline stage.
  Future<void> changeStage(String id, String status) async {
    final userId = _client.auth.currentUser?.id;
    await _client.from('leads').update({
      'crm_status': status,
      'lead_status': legacyStatus(status),
      'last_action_at': DateTime.now().toUtc().toIso8601String(),
      if (userId != null) 'last_action_by': userId,
    }).eq('id', id);
    try {
      await _client.from('activity_log').insert({
        'user_id': userId,
        'action_type': 'Lead Status Updated',
        'entity_type': 'lead',
        'entity_id': id,
        'detail': 'Status changed to $status',
      });
    } catch (_) {}
  }

  /// Admin/owner only (web canDeleteLead); RLS enforces it too.
  Future<void> delete(String id) => _leads.delete(id);
}
