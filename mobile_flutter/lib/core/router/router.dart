import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../features/agent/agent_controller.dart';
import '../../features/agent/agent_shell.dart';
import '../../state/auth_provider.dart';
import '../../features/assistant/assistant_chat_screen.dart';
import '../../features/auth/login_screen.dart';
import '../../features/calculator/unit_calculator_screen.dart';
import '../../features/leads/add_lead_screen.dart';
import '../../features/leads/lead_detail_screen.dart';
import '../../features/shell/main_shell.dart';

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

      // Sales agents only have the two-tab agent app at /home. Any other route (deep link, notification,
      // calculator, assistant, lead details…) sends them back there.
      if (loggedIn && state.matchedLocation != '/home') {
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
        builder: (context, state) => Consumer<AuthProvider>(
          builder: (context, auth, _) {
            // Wait for the role before choosing the app, so an agent never sees the full app for a moment.
            if (auth.profile == null && auth.isLoading) {
              return const Scaffold(body: Center(child: CircularProgressIndicator()));
            }
            return isSalesAgent(auth.profile) ? const AgentShell() : const MainShell();
          },
        ),
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
