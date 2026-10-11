import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../data/models/app_notification_model.dart';
import '../data/services/notifications_service.dart';

class NotificationsProvider extends ChangeNotifier {
  final NotificationsService _service = NotificationsService();

  List<AppNotificationModel> _items = [];
  final Set<String> _readIds = {};
  final Set<String> _alertedIds = {};
  bool _isLoading = false;
  bool _initialLoadCompleted = false;

  RealtimeChannel? _channel;
  Timer? _pollTimer;

  final StreamController<AppNotificationModel> _alertController =
      StreamController<AppNotificationModel>.broadcast();

  List<AppNotificationModel> get items => _items;
  bool get isLoading => _isLoading;
  int get unreadCount => _items.where((n) => !n.isRead).length;
  Stream<AppNotificationModel> get alertStream => _alertController.stream;

  NotificationsProvider() {
    _init();
  }

  void _init() {
    refresh(isInitial: true);

    try {
      _channel = _service.subscribeToRealtimeAlerts(
        onEvent: (immediateAlert) {
          if (immediateAlert != null) {
            _emitAlert(immediateAlert);
          }
          refresh();
        },
      );
    } catch (_) {}

    // Poll every 30s to catch newly due/overdue follow-up reminders & assignments
    _pollTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      refresh();
    });
  }

  Future<void> refresh({bool isInitial = false}) async {
    if (isInitial) {
      _isLoading = true;
      notifyListeners();
    }

    try {
      final fetched = await _service.fetchNotifications(readIds: _readIds);

      if (!_initialLoadCompleted) {
        _initialLoadCompleted = true;
        // Record existing assignment IDs so we only pop up for newly assigned leads,
        // while we DO surface the top urgent overdue/upcoming follow-up reminder once on startup.
        for (final item in fetched) {
          if (item.type == 'assignment') {
            _alertedIds.add(item.id);
          }
        }

        // Trigger a timely reminder notification for the most urgent due/overdue follow-up
        final urgentReminder = fetched.where((n) =>
            (n.type == 'overdue_reminder' || n.type == 'upcoming_reminder') && !n.isRead);
        if (urgentReminder.isNotEmpty) {
          final firstRem = urgentReminder.first;
          _alertedIds.add(firstRem.id);
          // Mark remaining initial reminders as alerted so we don't spam multiple banners at startup
          for (final r in urgentReminder.skip(1)) {
            _alertedIds.add(r.id);
          }
          Future.delayed(const Duration(seconds: 2), () {
            _emitAlert(firstRem, force: true);
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

  void _emitAlert(AppNotificationModel alert, {bool force = false}) {
    if (!force && _alertedIds.contains(alert.id)) return;
    _alertedIds.add(alert.id);

    try {
      HapticFeedback.heavyImpact();
      SystemSound.play(SystemSoundType.alert);
    } catch (_) {}

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
    _channel?.unsubscribe();
    _alertController.close();
    super.dispose();
  }
}
