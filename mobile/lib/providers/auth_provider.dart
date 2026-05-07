import 'package:flutter/foundation.dart';

import '../models/user.dart';
import '../services/auth_service.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthProvider extends ChangeNotifier {
  final AuthService _authService;

  AuthStatus _status = AuthStatus.unknown;
  AppUser? _user;
  String? _error;
  bool _loading = false;

  AuthProvider({AuthService? authService})
      : _authService = authService ?? AuthService();

  AuthStatus get status => _status;
  AppUser? get user => _user;
  String? get error => _error;
  bool get loading => _loading;
  bool get isLoggedIn => _status == AuthStatus.authenticated;

  /// Call on app startup to restore the session.
  Future<void> init() async {
    _setLoading(true);
    try {
      final hasSession = await _authService.hasLocalSession();
      if (hasSession) {
        final user = await _authService.fetchCurrentUser();
        _user = user;
        _status = AuthStatus.authenticated;
      } else {
        _status = AuthStatus.unauthenticated;
      }
    } catch (_) {
      _status = AuthStatus.unauthenticated;
    } finally {
      _setLoading(false);
    }
  }

  Future<void> login(String email, String password) async {
    _clearError();
    _setLoading(true);
    try {
      _user = await _authService.login(email, password);
      _status = AuthStatus.authenticated;
    } on AuthException catch (e) {
      _error = e.message;
      _status = AuthStatus.unauthenticated;
    } finally {
      _setLoading(false);
    }
  }

  Future<void> signup({
    required String name,
    required String email,
    required String password,
    String role = 'CUSTOMER',
  }) async {
    _clearError();
    _setLoading(true);
    try {
      _user = await _authService.signup(
        name: name,
        email: email,
        password: password,
        role: role,
      );
      _status = AuthStatus.authenticated;
    } on AuthException catch (e) {
      _error = e.message;
    } finally {
      _setLoading(false);
    }
  }

  Future<void> sendOtp(String phone) async {
    _clearError();
    _setLoading(true);
    try {
      await _authService.sendOtp(phone);
    } on AuthException catch (e) {
      _error = e.message;
    } finally {
      _setLoading(false);
    }
  }

  Future<void> verifyOtp(String phone, String code) async {
    _clearError();
    _setLoading(true);
    try {
      _user = await _authService.verifyOtp(phone, code);
      _status = AuthStatus.authenticated;
    } on AuthException catch (e) {
      _error = e.message;
    } finally {
      _setLoading(false);
    }
  }

  Future<void> logout() async {
    await _authService.logout();
    _user = null;
    _status = AuthStatus.unauthenticated;
    notifyListeners();
  }

  /// Called by CartProvider so the cart can reset on auth change.
  void _setLoading(bool v) {
    _loading = v;
    notifyListeners();
  }

  void _clearError() {
    _error = null;
  }
}
