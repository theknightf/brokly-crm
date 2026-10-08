import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../state/auth_provider.dart';
import '../state/attendance_provider.dart';
import '../state/call_logs_provider.dart';
import '../state/leads_provider.dart';
import '../state/theme_provider.dart';
import 'router/auth_state_listenable.dart';
import 'router/router.dart';
import 'theme/app_theme.dart';

class BroklyApp extends StatefulWidget {
  const BroklyApp({super.key});

  @override
  State<BroklyApp> createState() => _BroklyAppState();
}

class _BroklyAppState extends State<BroklyApp> {
  late final AuthStateListenable _authListenable;
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    _authListenable = AuthStateListenable();
    _router = buildRouter(refreshListenable: _authListenable);
  }

  @override
  void dispose() {
    _router.dispose();
    _authListenable.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ThemeProvider()),
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => LeadsProvider()),
        ChangeNotifierProvider(create: (_) => AttendanceProvider()),
        ChangeNotifierProvider(create: (_) => CallLogsProvider()),
      ],
      child: Consumer<ThemeProvider>(
        builder: (context, theme, _) {
          return MaterialApp.router(
            title: 'Brokly CRM',
            debugShowCheckedModeBanner: false,
            theme: AppTheme.lightTheme,
            darkTheme: AppTheme.darkTheme,
            themeMode: theme.themeMode,
            routerConfig: _router,
          );
        },
      ),
    );
  }
}
