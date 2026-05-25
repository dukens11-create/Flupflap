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

  Future<void> init() async {
    _setLoading(true);
    try {
      final hasSession = await _authService.hasLocalSession();
      if (hasSession) {
        _user = await _authService.fetchCurrentUser();
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

  Future<LoginFlowResponse?> startLoginFlow({
    required String email,
    required String password,
  }) async {
    _clearError();
    _setLoading(true);
    try {
      final response = await _authService.startLoginFlow(
        email: email,
        password: password,
      );
      if (response.step == 'signin') {
        _user = await _authService.login(email, password);
        _status = AuthStatus.authenticated;
      }
      return response;
    } on AuthException catch (e) {
      _error = e.message;
      _status = AuthStatus.unauthenticated;
      return null;
    } finally {
      _setLoading(false);
    }
  }

  Future<LoginFlowResponse?> setupSellerPhoneForLogin({
    required String email,
    required String password,
    required String phone,
  }) async {
    _clearError();
    _setLoading(true);
    try {
      return await _authService.setupSellerPhone(
        email: email,
        password: password,
        phone: phone,
      );
    } on AuthException catch (e) {
      _error = e.message;
      return null;
    } finally {
      _setLoading(false);
    }
  }

  Future<void> completeSellerOtpLogin({
    required String email,
    required String password,
    required String phone,
    required String firebaseIdToken,
  }) async {
    _clearError();
    _setLoading(true);
    try {
      _user = await _authService.login(
        email,
        password,
        phone: phone,
        firebaseIdToken: firebaseIdToken,
      );
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
    String? phone,
    String? firebaseIdToken,
  }) async {
    _clearError();
    _setLoading(true);
    try {
      _user = await _authService.signup(
        name: name,
        email: email,
        password: password,
        role: role,
        phone: phone,
        firebaseIdToken: firebaseIdToken,
      );
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

  void clearError() {
    _clearError();
    notifyListeners();
  }

  void setError(String message) {
    _error = message;
    notifyListeners();
  }

  void _setLoading(bool value) {
    _loading = value;
    notifyListeners();
  }

  void _clearError() {
    _error = null;
  }
}
