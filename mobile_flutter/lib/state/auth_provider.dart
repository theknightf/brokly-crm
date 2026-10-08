import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../data/models/user_profile_model.dart';
import '../data/services/supabase_service.dart';
import '../data/services/users_service.dart';

class AuthProvider extends ChangeNotifier {
  final SupabaseClient _client = SupabaseService().client;
  final UsersService _usersService = UsersService();

  User? _user;
  UserProfileModel? _profile;
  bool _isLoading = true;
  String? _errorMessage;
  StreamSubscription<AuthState>? _authSubscription;

  User? get user => _user;
  UserProfileModel? get profile => _profile;
  bool get isLoading => _isLoading;
  bool get isAuthenticated => _user != null;
  String? get errorMessage => _errorMessage;

  AuthProvider() {
    _init();
  }

  void _init() {
    _user = _client.auth.currentUser;
    if (_user != null) {
      _loadProfile();
    } else {
      _isLoading = false;
      notifyListeners();
    }

    _authSubscription = _client.auth.onAuthStateChange.listen((data) {
      _user = data.session?.user;
      if (_user != null) {
        _loadProfile();
      } else {
        _profile = null;
        _isLoading = false;
        notifyListeners();
      }
    });
  }

  Future<void> _loadProfile() async {
    try {
      _profile = await _usersService.getCurrentUserProfile();
    } catch (_) {}
    _isLoading = false;
    notifyListeners();
  }

  Future<bool> signIn(String email, String password) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final res = await _client.auth.signInWithPassword(
        email: email.trim(),
        password: password,
      );
      _user = res.user;
      await _loadProfile();
      return true;
    } on AuthException catch (e) {
      _errorMessage = e.message;
      _isLoading = false;
      notifyListeners();
      return false;
    } catch (e) {
      _errorMessage = 'Sign in failed. Check your network connection.';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> resetPassword(String email) async {
    try {
      await _client.auth.resetPasswordForEmail(email.trim());
      return true;
    } catch (e) {
      _errorMessage = 'Failed to send reset link.';
      notifyListeners();
      return false;
    }
  }

  Future<void> signOut() async {
    _isLoading = true;
    notifyListeners();
    await _client.auth.signOut();
    _user = null;
    _profile = null;
    _isLoading = false;
    notifyListeners();
  }

  @override
  void dispose() {
    _authSubscription?.cancel();
    super.dispose();
  }
}
