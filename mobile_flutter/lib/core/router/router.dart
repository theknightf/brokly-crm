import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../features/assistant/assistant_chat_screen.dart';
import '../../features/auth/login_screen.dart';
import '../../features/calculator/unit_calculator_screen.dart';
import '../../features/leads/add_lead_screen.dart';
import '../../features/leads/lead_detail_screen.dart';
import '../../features/shell/main_shell.dart';
import '../../state/auth_provider.dart';
import '../utils/sales_role.dart';

/// Global root navigator key for deep linking from push/in-app notifications
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

GoRouter buildRouter({required Listenable refreshListenable}) {
  return GoRouter(
    navigatorKey: rootNavigatorKey,
    refreshListenable: refreshListenable,
    initialLocation: '/home',
    redirect: (context, state) {
      final loggedIn = Supabase.instance.client.auth.currentSession != null;
      final onLogin = state.matchedLocation == '/login';

      if (!loggedIn && !onLogin) return '/login';
      if (loggedIn && onLogin) return '/home';

      // Sales agents only use Dashboard, Workspace and the AI assistant (plus lead details / add lead): no calculator.
      final loc = state.matchedLocation;
      if (loggedIn && loc == '/calculator') {
        final profile = Provider.of<AuthProvider>(context, listen: false).profile;
        if (isSalesAgent(profile)) return '/home';
      }
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/home',
        builder: (context, state) => const MainShell(),
      ),
      GoRoute(
        path: '/leads/:id',
        builder: (context, state) {
          final id = state.pathParameters['id'] ?? '';
          return LeadDetailScreen(leadId: id);
        },
      ),
      GoRoute(
        path: '/add-lead',
        builder: (context, state) => const AddLeadScreen(),
      ),
      GoRoute(
        path: '/calculator',
        builder: (context, state) => const UnitCalculatorScreen(),
      ),
      GoRoute(
        path: '/assistant',
        builder: (context, state) => const AssistantChatScreen(),
      ),
    ],
  );
}
