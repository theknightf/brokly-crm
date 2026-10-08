import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_overlay_window/flutter_overlay_window.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:phone_state/phone_state.dart';
import '../../data/services/call_logs_service.dart';
import '../../data/services/supabase_service.dart';
import '../utils/currency_formatter.dart';

class TelephonyService {
  static final TelephonyService _instance = TelephonyService._internal();
  factory TelephonyService() => _instance;
  TelephonyService._internal();

  StreamSubscription<PhoneState>? _phoneSubscription;
  bool _isInitialized = false;

  /// Initialize telephony listeners and background state observer
  Future<void> init() async {
    if (_isInitialized) return;
    _isInitialized = true;

    // Only start telephony listener on platforms that support it (Android / mobile)
    if (kIsWeb) return;

    try {
      _phoneSubscription = PhoneState.stream.listen((event) async {
        switch (event.status) {
          case PhoneStateStatus.CALL_INCOMING:
            await _handleIncomingCall(event.number);
            break;
          case PhoneStateStatus.CALL_ENDED:
            await _handleCallEnded();
            break;
          case PhoneStateStatus.CALL_STARTED:
          case PhoneStateStatus.CALL_OUTGOING:
          case PhoneStateStatus.NOTHING:
            break;
        }
      });
    } catch (_) {
      // Graceful fallback on unsupported environments
    }
  }

  /// Request all required Android telephony and overlay permissions
  Future<bool> requestPermissions() async {
    if (kIsWeb) return false;

    try {
      final statuses = await [
        Permission.phone,
        Permission.contacts,
      ].request();

      final overlayGranted = await FlutterOverlayWindow.isPermissionGranted();
      if (!overlayGranted) {
        await FlutterOverlayWindow.requestPermission();
      }

      return statuses.values.every((s) => s.isGranted);
    } catch (_) {
      return false;
    }
  }

  /// Process incoming call and display floating Caller ID overlay
  Future<void> _handleIncomingCall(String? phoneNumber) async {
    if (phoneNumber == null || phoneNumber.isEmpty) return;

    try {
      final clean = phoneNumber.replaceAll(RegExp(r'\D'), '');
      final suffix = clean.length >= 8 ? clean.substring(clean.length - 8) : clean;

      // Query Supabase for lead
      final client = SupabaseService().client;
      final lead = await client
          .from('leads')
          .select('name, phone, crm_status, project_interested, budget_min, budget_max')
          .ilike('phone', '%$suffix%')
          .limit(1)
          .maybeSingle();

      String name = 'Unknown Caller';
      String phone = phoneNumber;
      String status = 'Fresh Lead';
      String project = 'Residential Opportunity';
      String budget = '--';

      if (lead != null) {
        name = lead['name']?.toString() ?? name;
        phone = lead['phone']?.toString() ?? phone;
        status = lead['crm_status']?.toString() ?? status;
        project = lead['project_interested']?.toString() ?? project;
        final bMin = lead['budget_min'] != null ? double.tryParse(lead['budget_min'].toString()) : null;
        final bMax = lead['budget_max'] != null ? double.tryParse(lead['budget_max'].toString()) : null;
        budget = CurrencyFormatter.formatRange(bMin, bMax);
      }

      final hasOverlayPerm = await FlutterOverlayWindow.isPermissionGranted();
      if (hasOverlayPerm) {
        await FlutterOverlayWindow.showOverlay(
          height: 240,
          alignment: OverlayAlignment.topCenter,
          flag: OverlayFlag.defaultFlag,
          overlayTitle: 'Incoming Call: $name',
          overlayContent: '$status · $project',
        );

        await FlutterOverlayWindow.shareData({
          'name': name,
          'phone': phone,
          'status': status,
          'project': project,
          'budget': budget,
        });
      }
    } catch (_) {
      // Fallback
    }
  }

  /// Close overlay and sync call log record to Supabase
  Future<void> _handleCallEnded() async {
    try {
      await FlutterOverlayWindow.closeOverlay();
    } catch (_) {}

    // Automatically sync call logs to Supabase
    try {
      await CallLogsService().syncDeviceCallLogs();
    } catch (_) {}
  }

  void dispose() {
    _phoneSubscription?.cancel();
    _isInitialized = false;
  }
}
