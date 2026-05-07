import 'dart:convert';
import 'package:http/http.dart' as http;

import '../config/constants.dart';
import '../models/user.dart';
import 'api_client.dart';

/// Handles login, signup, OTP verification, session check, and logout.
///
/// The FlupFlap backend uses NextAuth with a credentials provider.
/// Login POSTs to /api/auth/callback/credentials (NextAuth standard endpoint).
class AuthService {
  final ApiClient _client;
  AuthService({ApiClient? client}) : _client = client ?? ApiClient();

  /// Sign in with email + password.
  /// Returns [AppUser] on success or throws [AuthException].
  Future<AppUser> login(String email, String password) async {
    // Step 1: Fetch the CSRF token required by NextAuth
    final csrfRes = await _client.get('/api/auth/csrf');
    if (!csrfRes.ok) throw AuthException('Could not initiate login. Please try again.');
    final csrfToken = (csrfRes.data as Map<String, dynamic>)['csrfToken'] as String;

    // Step 2: POST to NextAuth credentials callback
    final uri = Uri.parse('${AppConstants.baseUrl}/api/auth/callback/credentials');
    final cookie = await _client.getSessionCookie();
    final response = await http.post(
      uri,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        if (cookie != null) 'Cookie': cookie,
      },
      body: {
        'email': email,
        'password': password,
        'csrfToken': csrfToken,
        'callbackUrl': '/',
        'json': 'true',
      },
    );
    await _client.saveSessionCookie(
      response.headers['set-cookie']?.split(';').first.trim() ?? '',
    );

    // Step 3: Fetch session to get user details
    return _fetchSession();
  }

  /// Sign up with name, email, password, and role.
  Future<AppUser> signup({
    required String name,
    required String email,
    required String password,
    String role = 'CUSTOMER',
  }) async {
    final res = await _client.post('/api/auth/signup', body: {
      'name': name,
      'email': email,
      'password': password,
      'role': role,
    });
    if (!res.ok) {
      throw AuthException(res.error ?? 'Signup failed');
    }
    return login(email, password);
  }

  /// Send OTP to seller's phone number.
  Future<void> sendOtp(String phone) async {
    final res = await _client.post('/api/auth/otp/send', body: {'phone': phone});
    if (!res.ok) throw AuthException(res.error ?? 'Could not send OTP');
  }

  /// Verify OTP code for seller phone authentication.
  Future<AppUser> verifyOtp(String phone, String code) async {
    final res = await _client.post('/api/auth/otp/verify', body: {
      'phone': phone,
      'code': code,
    });
    if (!res.ok) throw AuthException(res.error ?? 'Invalid or expired OTP');
    return _fetchSession();
  }

  /// Fetch current session user from /api/auth/session.
  Future<AppUser> fetchCurrentUser() => _fetchSession();

  Future<AppUser> _fetchSession() async {
    final res = await _client.get('/api/auth/session');
    if (!res.ok || res.data == null) {
      throw AuthException('Not authenticated');
    }
    final data = res.data as Map<String, dynamic>;
    final userJson = data['user'] as Map<String, dynamic>?;
    if (userJson == null) throw AuthException('No active session');
    return AppUser.fromJson(userJson);
  }

  /// Clear local session cookie.
  Future<void> logout() async {
    try {
      await _client.post('/api/auth/signout', body: {'callbackUrl': '/'});
    } catch (_) {}
    await _client.clearSession();
  }

  /// Check whether a session cookie is stored locally.
  Future<bool> hasLocalSession() async {
    final cookie = await _client.getSessionCookie();
    return cookie != null && cookie.isNotEmpty;
  }
}

class AuthException implements Exception {
  final String message;
  AuthException(this.message);

  @override
  String toString() => message;
}
