import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../features/auth/login_screen.dart';
import '../../features/leads/add_lead_screen.dart';
import '../../features/leads/lead_detail_screen.dart';
import '../../features/shell/main_shell.dart';

GoRouter buildRouter({required Listenable refreshListenable}) {
  return GoRouter(
    refreshListenable: refreshListenable,
    initialLocation: '/home',
    redirect: (context, state) {
      final loggedIn = Supabase.instance.client.auth.currentSession != null;
      final onLogin = state.matchedLocation == '/login';

      if (!loggedIn && !onLogin) return '/login';
      if (loggedIn && onLogin) return '/home';
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
    ],
  );
}
