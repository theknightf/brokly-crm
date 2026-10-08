import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../data/models/lead_model.dart';
import '../data/services/leads_service.dart';

class LeadsProvider extends ChangeNotifier {
  final LeadsService _service = LeadsService();

  List<LeadModel> _leads = [];
  bool _isLoading = false;
  String? _error;
  String _searchQuery = '';
  String _statusFilter = 'All Leads';
  String? _assigneeFilter;
  bool _isKanban = false;
  RealtimeChannel? _subscription;

  List<LeadModel> get leads => _leads;
  bool get isLoading => _isLoading;
  String? get error => _error;
  String get searchQuery => _searchQuery;
  String get statusFilter => _statusFilter;
  String? get assigneeFilter => _assigneeFilter;
  bool get isKanban => _isKanban;

  LeadsProvider() {
    fetchLeads();
    _setupRealtime();
  }

  void _setupRealtime() {
    _subscription = _service.subscribeToChanges(() {
      fetchLeads(silent: true);
    });
  }

  void toggleViewMode() {
    _isKanban = !_isKanban;
    notifyListeners();
  }

  void setSearchQuery(String query) {
    _searchQuery = query;
    fetchLeads();
  }

  void setStatusFilter(String status) {
    _statusFilter = status;
    fetchLeads();
  }

  void setAssigneeFilter(String? assigneeId) {
    _assigneeFilter = assigneeId;
    fetchLeads();
  }

  void clearFilters() {
    _searchQuery = '';
    _statusFilter = 'All Leads';
    _assigneeFilter = null;
    fetchLeads();
  }

  Future<void> fetchLeads({bool silent = false}) async {
    if (!silent) {
      _isLoading = true;
      _error = null;
      notifyListeners();
    }

    try {
      _leads = await _service.getAll(
        search: _searchQuery,
        statusFilter: _statusFilter,
        assignedToFilter: _assigneeFilter,
      );
      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> updateStatus(String leadId, String newStatus) async {
    // Optimistic update
    final index = _leads.indexWhere((l) => l.id == leadId);
    if (index != -1) {
      _leads[index] = _leads[index].copyWith(
        status: newStatus,
        actionTakenToday: true,
      );
      notifyListeners();
    }

    try {
      await _service.updateStatus(leadId, newStatus);
    } catch (_) {
      fetchLeads(silent: true);
    }
  }

  Future<LeadModel> updateLead(String leadId, Map<String, dynamic> updates) async {
    final updated = await _service.update(leadId, updates);
    final index = _leads.indexWhere((l) => l.id == leadId);
    if (index != -1) {
      _leads[index] = updated;
      notifyListeners();
    }
    return updated;
  }

  Future<void> addNote(String leadId, String note) async {
    try {
      await _service.addNote(leadId, note);
      fetchLeads(silent: true);
    } catch (_) {}
  }

  Future<LeadModel> createLead(LeadModel lead) async {
    final created = await _service.create(lead);
    _leads.insert(0, created);
    notifyListeners();
    return created;
  }

  Future<void> deleteLead(String leadId) async {
    _leads.removeWhere((l) => l.id == leadId);
    notifyListeners();
    try {
      await _service.delete(leadId);
    } catch (_) {
      fetchLeads(silent: true);
    }
  }

  @override
  void dispose() {
    _subscription?.unsubscribe();
    super.dispose();
  }
}
