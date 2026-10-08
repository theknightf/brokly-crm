import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// A [Listenable] that notifies go_router whenever the auth state changes so
/// the route guard can re-evaluate (e.g. right after login/logout).
class AuthStateListenable extends ChangeNotifier {
  AuthStateListenable() {
    _sub = Supabase.instance.client.auth.onAuthStateChange.listen((_) => notifyListeners());
  }

  late final StreamSubscription<AuthState> _sub;

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}
