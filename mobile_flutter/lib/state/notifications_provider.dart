import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/services/local_push_notification_service.dart';
import '../data/models/app_notification_model.dart';
import '../data/services/notifications_service.dart';
import '../data/services/supabase_service.dart';

class NotificationsProvider extends ChangeNotifier {
  final NotificationsService _service = NotificationsService();
  final LocalPushNotificationService _pushService =
      LocalPushNotificationService();
  final SupabaseClient _client = SupabaseService().client;

  List<AppNotificationModel> _items = [];
  final Set<String> _readIds = {};
  final Set<String> _alertedIds = {};
  bool _isLoading = false;
  bool _initialLoadCompleted = false;
  String? _activeUserId;

  RealtimeChannel? _channel;
  Timer? _pollTimer;
  StreamSubscription<AuthState>? _authSub;

  final StreamController<AppNotificationModel> _alertController =
      StreamController<AppNotificationModel>.broadcast();

  List<AppNotificationModel> get items => _items;
  bool get isLoading => _isLoading;
  int get unreadCount => _items.where((n) => !n.isRead).length;
  bool get isPushPermissionGranted => _pushService.isPermissionGranted;
  bool get isPushTokenSynced => _pushService.isTokenSynced;
  String? get devicePushToken => _pushService.deviceToken;
  Stream<AppNotificationModel> get alertStream => _alertController.stream;
  Stream<NotificationDeepLinkPayload> get deepLinkStream =>
      _pushService.deepLinkStream;

  NotificationsProvider() {
    _init();
  }

  Future<void> _init() async {
    await _pushService.init();
    notifyListeners();

    final currentUser = _client.auth.currentUser;
    if (currentUser != null) {
      _activeUserId = currentUser.id;
      await _pushService.syncPushTokenWithBackend();
      _setupRealtime();
      await refresh(isInitial: true);
    }

    // Listen for auth state changes so logging in / switching user immediately
    // initializes push token sync, realtime subscriptions, and notification feed
    _authSub = _client.auth.onAuthStateChange.listen((authState) async {
      final newUser = authState.session?.user;
      if (newUser != null && newUser.id != _activeUserId) {
        _activeUserId = newUser.id;
        _initialLoadCompleted = false;
        _alertedIds.clear();
        await _pushService.checkAndRequestPermissions(promptIfNeeded: true);
        _setupRealtime();
        await refresh(isInitial: true);
      } else if (newUser == null && _activeUserId != null) {
        _activeUserId = null;
        _initialLoadCompleted = false;
        _items = [];
        _alertedIds.clear();
        _channel?.unsubscribe();
        _channel = null;
        notifyListeners();
      }
    });

    // Poll every 25s to catch newly due/overdue follow-up reminders & assignments
    _pollTimer = Timer.periodic(const Duration(seconds: 25), (_) {
      if (_client.auth.currentUser != null) {
        refresh();
      }
    });
  }

  void _setupRealtime() {
    try {
      _channel?.unsubscribe();
      _channel = _service.subscribeToRealtimeAlerts(
        onEvent: (immediateAlert) {
          if (immediateAlert != null) {
            _emitAlert(immediateAlert, force: true);
          }
          refresh();
        },
      );
    } catch (_) {}
  }

  /// Request OS push notification permissions and sync FCM/device token with Supabase
  Future<bool> enableAndSyncPushNotifications() async {
    final granted =
        await _pushService.checkAndRequestPermissions(promptIfNeeded: true);
    await _pushService.syncPushTokenWithBackend();
    notifyListeners();
    return granted;
  }

  /// Resolve lead ID for deep-linking when a notification is tapped
  Future<String?> resolveLeadId(AppNotificationModel notification) {
    return _service.resolveLeadId(notification);
  }

  Future<void> refresh({bool isInitial = false}) async {
    final user = _client.auth.currentUser;
    if (user == null) {
      _isLoading = false;
      notifyListeners();
      return;
    }

    if (isInitial) {
      _isLoading = true;
      notifyListeners();
    }

    try {
      final fetched = await _service.fetchNotifications(readIds: _readIds);

      if (!_initialLoadCompleted) {
        _initialLoadCompleted = true;

        // Find the most urgent unread notification (overdue/today follow-up or recent assignment)
        final urgentItems = fetched.where((n) => !n.isRead &&
            (n.type == 'overdue_reminder' ||
                n.type == 'upcoming_reminder' ||
                n.type == 'assignment'));

        // Record initial items as seen so we don't spam multiple banners,
        // but DO fire the top urgent alert on startup so the agent sees active reminders/assignments immediately
        for (final item in fetched) {
          _alertedIds.add(item.id);
        }

        if (urgentItems.isNotEmpty) {
          final topAlert = urgentItems.first;
          Future.delayed(const Duration(milliseconds: 1200), () {
            _emitAlert(topAlert, force: true);
          });
        }
      } else {
        // On subsequent refreshes, alert any newly assigned lead or newly due follow-up reminder
        for (final item in fetched) {
          if (!_alertedIds.contains(item.id) && !item.isRead) {
            _alertedIds.add(item.id);
            if (item.type == 'assignment' ||
                item.type == 'overdue_reminder' ||
                item.type == 'upcoming_reminder') {
              _emitAlert(item, force: true);
              break;
            }
          }
        }
      }

      _items = fetched;
    } catch (_) {}

    _isLoading = false;
    notifyListeners();
  }

  /// Trigger a real-time in-app & OS push alert for testing or immediate verification
  Future<void> triggerInstantVerificationAlert({String? targetLeadId, String? leadName}) async {
    final sampleLeadId = targetLeadId ??
        _items.firstWhere(
          (i) => i.leadId != null && i.leadId!.isNotEmpty,
          orElse: () => AppNotificationModel(
            id: 'test',
            type: 'assignment',
            title: '',
            body: '',
            entityType: 'lead',
            entityId: '',
            createdAt: DateTime.now(),
          ),
        ).leadId;

    final alert = AppNotificationModel(
      id: 'live-alert-${DateTime.now().millisecondsSinceEpoch}',
      type: 'assignment',
      title: 'Push Notifications Active & Synced',
      body: leadName != null && leadName.isNotEmpty
          ? 'Tap to open lead: $leadName'
          : 'Real-time lead assignment & follow-up alerts are active. Tap to view lead details.',
      leadId: sampleLeadId,
      entityType: 'lead',
      entityId: sampleLeadId ?? '',
      createdAt: DateTime.now(),
    );

    _items = [alert, ..._items];
    notifyListeners();
    _emitAlert(alert, force: true);
  }

  void _emitAlert(AppNotificationModel alert, {bool force = false}) {
    if (!force && _alertedIds.contains(alert.id)) return;
    _alertedIds.add(alert.id);

    try {
      HapticFeedback.heavyImpact();
      SystemSound.play(SystemSoundType.alert);
    } catch (_) {}

    // Also dispatch a native Android/iOS OS status-bar notification
    _pushService.showNativeNotification(alert);

    if (!_alertController.isClosed) {
      _alertController.add(alert);
    }
  }

  void markAsRead(String id) {
    _readIds.add(id);
    _items = _items
        .map((item) => item.id == id ? item.copyWith(isRead: true) : item)
        .toList();
    notifyListeners();
  }

  void markAllAsRead() {
    for (final item in _items) {
      _readIds.add(item.id);
    }
    _items = _items.map((item) => item.copyWith(isRead: true)).toList();
    notifyListeners();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _authSub?.cancel();
    _channel?.unsubscribe();
    _alertController.close();
    super.dispose();
  }
}
