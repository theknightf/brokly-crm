import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/constants/lead_stages.dart';
import '../core/utils/date_utils.dart';
import '../data/models/lead_model.dart';
import '../data/services/leads_service.dart';
import '../data/services/supabase_service.dart';

class LeadsProvider extends ChangeNotifier {
  final LeadsService _service = LeadsService();
  final SupabaseClient _client = SupabaseService().client;

  List<LeadModel> _allLeads = [];
  bool _isLoading = false;
  String? _error;

  // Stage & multi-criteria filter state shared across Dashboard and Leads Screen
  String _searchQuery = '';
  String _statusFilter = LeadStages.allLeads;
  String _projectFilter = 'All Projects';
  String _propertyTypeFilter = 'All Types';
  String _sourceFilter = 'All Sources';
  String _activityFilter = 'All Leads'; // 'All Leads' | 'Action Today' | 'Called' | 'Not Called' | 'Overdue'
  String? _assigneeFilter;

  // View modes: 'stages' | 'list' | 'kanban'
  String _viewMode = 'stages';

  RealtimeChannel? _subscription;
  StreamSubscription<AuthState>? _authSub;
  String? _activeUserId;

  List<LeadModel> get allLeads => _allLeads;
  bool get isLoading => _isLoading;
  String? get error => _error;
  String get searchQuery => _searchQuery;
  String get statusFilter => _statusFilter;
  String get projectFilter => _projectFilter;
  String get propertyTypeFilter => _propertyTypeFilter;
  String get sourceFilter => _sourceFilter;
  String get activityFilter => _activityFilter;
  String? get assigneeFilter => _assigneeFilter;
  String get viewMode => _viewMode;
  bool get isKanban => _viewMode == 'kanban';
  bool get isStagesView => _viewMode == 'stages';

  bool get hasActiveFilters =>
      _statusFilter != LeadStages.allLeads ||
      _searchQuery.trim().isNotEmpty ||
      _projectFilter != 'All Projects' ||
      _propertyTypeFilter != 'All Types' ||
      _sourceFilter != 'All Sources' ||
      _activityFilter != 'All Leads' ||
      (_assigneeFilter != null && _assigneeFilter!.isNotEmpty);

  int get activeFilterCount {
    int count = 0;
    if (_statusFilter != LeadStages.allLeads) count++;
    if (_searchQuery.trim().isNotEmpty) count++;
    if (_projectFilter != 'All Projects') count++;
    if (_propertyTypeFilter != 'All Types') count++;
    if (_sourceFilter != 'All Sources') count++;
    if (_activityFilter != 'All Leads') count++;
    if (_assigneeFilter != null && _assigneeFilter!.isNotEmpty) count++;
    return count;
  }

  /// Leads matching all non-stage filter criteria (search, project, propertyType, source, activity, assignee).
  /// Used to compute dynamic stage counts on stage filter chips!
  List<LeadModel> get baseFilteredLeads {
    return _allLeads.where(_matchesNonStageCriteria).toList();
  }

  /// Final filtered leads matching both non-stage criteria AND the selected stage filter.
  List<LeadModel> get leads {
    final base = baseFilteredLeads;
    if (_statusFilter == LeadStages.allLeads || _statusFilter.isEmpty) {
      return base;
    }
    final targetNorm = LeadStages.normalize(_statusFilter);
    return base.where((l) {
      return l.status == _statusFilter ||
          LeadStages.normalize(l.status) == targetNorm;
    }).toList();
  }

  /// Live count of leads for 'All Leads' and every canonical stage in LeadStages.allStatuses
  Map<String, int> get stageCounts {
    final base = baseFilteredLeads;
    final Map<String, int> counts = {
      LeadStages.allLeads: base.length,
      for (final s in LeadStages.allStatuses) s: 0,
    };

    for (final l in base) {
      final norm = LeadStages.normalize(l.status);
      counts[norm] = (counts[norm] ?? 0) + 1;
      if (l.status != norm) {
        counts[l.status] = (counts[l.status] ?? 0) + 1;
      }
    }
    return counts;
  }

  /// Leads grouped by canonical stage name
  Map<String, List<LeadModel>> get leadsByStage {
    final currentLeads = leads;
    final Map<String, List<LeadModel>> grouped = {
      for (final s in LeadStages.allStatuses) s: <LeadModel>[],
    };

    for (final l in currentLeads) {
      final norm = LeadStages.normalize(l.status);
      grouped.putIfAbsent(norm, () => <LeadModel>[]).add(l);
    }
    return grouped;
  }

  /// Distinct project options available across loaded leads
  List<String> get availableProjects {
    final set = <String>{'All Projects'};
    for (final l in _allLeads) {
      if (l.project != null && l.project!.trim().isNotEmpty) {
        set.add(l.project!.trim());
      }
    }
    set.addAll([
      'Mountain View iCity',
      'Badya Palm Hills',
      'Villette Sodic',
      'Zed Towers',
      'Mivida Emaar',
      'Swan Lake',
    ]);
    return set.toList();
  }

  /// Distinct lead sources available across loaded leads
  List<String> get availableSources {
    final set = <String>{'All Sources'};
    for (final l in _allLeads) {
      if (l.source != null && l.source!.trim().isNotEmpty) {
        set.add(l.source!.trim());
      }
    }
    set.addAll([
      'Facebook Ads',
      'Instagram',
      'WhatsApp',
      'Cold Call',
      'Referral',
      'Website',
      'Walk-in',
      'Property Finder',
    ]);
    return set.toList();
  }

  LeadsProvider() {
    _init();
  }

  void _init() {
    final currentUser = _client.auth.currentUser;
    if (currentUser != null) {
      _activeUserId = currentUser.id;
      fetchLeads();
      _setupRealtime();
    }

    _authSub = _client.auth.onAuthStateChange.listen((authState) {
      final newUser = authState.session?.user;
      if (newUser != null && newUser.id != _activeUserId) {
        _activeUserId = newUser.id;
        fetchLeads();
        _setupRealtime();
      } else if (newUser == null && _activeUserId != null) {
        _activeUserId = null;
        _allLeads = [];
        _subscription?.unsubscribe();
        _subscription = null;
        notifyListeners();
      }
    });
  }

  void _setupRealtime() {
    try {
      _subscription?.unsubscribe();
      _subscription = _service.subscribeToChanges(() {
        fetchLeads(silent: true);
      });
    } catch (_) {}
  }

  bool _matchesNonStageCriteria(LeadModel l) {
    // 1. Search query
    if (_searchQuery.trim().isNotEmpty) {
      final q = _searchQuery.trim().toLowerCase();
      final matchesName = l.name.toLowerCase().contains(q);
      final matchesPhone = l.phone.toLowerCase().contains(q);
      final matchesEmail = (l.email ?? '').toLowerCase().contains(q);
      final matchesProject = (l.project ?? '').toLowerCase().contains(q);
      final matchesLocation = (l.location ?? '').toLowerCase().contains(q);
      final matchesUnit = (l.unit ?? '').toLowerCase().contains(q);
      final matchesStage = l.status.toLowerCase().contains(q);
      if (!matchesName &&
          !matchesPhone &&
          !matchesEmail &&
          !matchesProject &&
          !matchesLocation &&
          !matchesUnit &&
          !matchesStage) {
        return false;
      }
    }

    // 2. Project filter
    if (_projectFilter != 'All Projects' && _projectFilter.isNotEmpty) {
      if ((l.project ?? '').trim() != _projectFilter) return false;
    }

    // 3. Property type filter
    if (_propertyTypeFilter != 'All Types' && _propertyTypeFilter.isNotEmpty) {
      final pt = (l.propertyType ?? '').toLowerCase();
      if (_propertyTypeFilter == 'Villa & Penthouse') {
        if (!pt.contains('villa') && !pt.contains('penthouse')) return false;
      } else if (!pt.contains(_propertyTypeFilter.toLowerCase())) {
        return false;
      }
    }

    // 4. Source filter
    if (_sourceFilter != 'All Sources' && _sourceFilter.isNotEmpty) {
      if ((l.source ?? '').trim().toLowerCase() !=
          _sourceFilter.trim().toLowerCase()) {
        return false;
      }
    }

    // 5. Assignee filter
    if (_assigneeFilter != null && _assigneeFilter!.isNotEmpty) {
      if (l.assignedTo != _assigneeFilter &&
          l.assignedToName != _assigneeFilter &&
          l.agent != _assigneeFilter) {
        return false;
      }
    }

    // 6. Activity filter
    if (_activityFilter == 'Action Today') {
      if (!l.actionTakenToday && !AppDateUtils.isDueToday(l.followUpDue)) {
        return false;
      }
    } else if (_activityFilter == 'Called') {
      final norm = LeadStages.normalize(l.status);
      if (!l.hasBeenCalled && norm == 'Fresh Leads') return false;
    } else if (_activityFilter == 'Not Called') {
      final norm = LeadStages.normalize(l.status);
      if (l.hasBeenCalled && norm != 'Fresh Leads' && norm != 'Cold Calls') {
        return false;
      }
    } else if (_activityFilter == 'Overdue') {
      if (!AppDateUtils.isOverdue(l.followUpDue)) return false;
    }

    return true;
  }

  void setViewMode(String mode) {
    if (_viewMode == mode) return;
    _viewMode = mode;
    notifyListeners();
  }

  void toggleViewMode() {
    if (_viewMode == 'list') {
      _viewMode = 'stages';
    } else if (_viewMode == 'stages') {
      _viewMode = 'kanban';
    } else {
      _viewMode = 'list';
    }
    notifyListeners();
  }

  void setSearchQuery(String query) {
    _searchQuery = query;
    notifyListeners();
  }

  void setStatusFilter(String status) {
    _statusFilter = status.isEmpty ? LeadStages.allLeads : status;
    notifyListeners();
  }

  void setProjectFilter(String project) {
    _projectFilter = project;
    notifyListeners();
  }

  void setPropertyTypeFilter(String propertyType) {
    _propertyTypeFilter = propertyType;
    notifyListeners();
  }

  void setSourceFilter(String source) {
    _sourceFilter = source;
    notifyListeners();
  }

  void setActivityFilter(String activity) {
    _activityFilter = activity;
    notifyListeners();
  }

  void setAssigneeFilter(String? assigneeId) {
    _assigneeFilter = assigneeId;
    notifyListeners();
  }

  void clearFilters() {
    _searchQuery = '';
    _statusFilter = LeadStages.allLeads;
    _projectFilter = 'All Projects';
    _propertyTypeFilter = 'All Types';
    _sourceFilter = 'All Sources';
    _activityFilter = 'All Leads';
    _assigneeFilter = null;
    notifyListeners();
  }

  Future<void> fetchLeads({bool silent = false}) async {
    if (!silent) {
      _isLoading = true;
      _error = null;
      notifyListeners();
    }

    try {
      _allLeads = await _service.getAll();
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
    final index = _allLeads.indexWhere((l) => l.id == leadId);
    if (index != -1) {
      _allLeads[index] = _allLeads[index].copyWith(
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

  Future<LeadModel> updateLead(
      String leadId, Map<String, dynamic> updates) async {
    final updated = await _service.update(leadId, updates);
    final index = _allLeads.indexWhere((l) => l.id == leadId);
    if (index != -1) {
      _allLeads[index] = updated;
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
    _allLeads.insert(0, created);
    notifyListeners();
    return created;
  }

  Future<void> deleteLead(String leadId) async {
    _allLeads.removeWhere((l) => l.id == leadId);
    notifyListeners();
    try {
      await _service.delete(leadId);
    } catch (_) {
      fetchLeads(silent: true);
    }
  }

  @override
  void dispose() {
    _authSub?.cancel();
    _subscription?.unsubscribe();
    super.dispose();
  }
}
