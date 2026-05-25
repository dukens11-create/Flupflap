import 'package:http/http.dart' as http;

import '../config/constants.dart';
import '../models/user.dart';
import 'api_client.dart';

class LoginFlowResponse {
  final String step; // signin | add_phone | otp
  final String? phone;
  final String? maskedPhone;

  const LoginFlowResponse({
    required this.step,
    this.phone,
    this.maskedPhone,
  });
}

class AuthService {
  final ApiClient _client;
  AuthService({ApiClient? client}) : _client = client ?? ApiClient();

  Future<AppUser> login(
    String email,
    String password, {
    String? phone,
    String? firebaseIdToken,
  }) async {
    final csrfRes = await _client.get('/api/auth/csrf');
    if (!csrfRes.ok) throw AuthException('Could not initiate login. Please try again.');
    final csrfToken = (csrfRes.data as Map<String, dynamic>)['csrfToken'] as String;

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
        if (phone != null && phone.isNotEmpty) 'phone': phone,
        if (firebaseIdToken != null && firebaseIdToken.isNotEmpty) 'firebaseIdToken': firebaseIdToken,
      },
    );

    await _client.saveSessionCookie(
      response.headers['set-cookie']?.split(';').first.trim() ?? '',
    );

    return _fetchSession();
  }

  Future<LoginFlowResponse> startLoginFlow({
    required String email,
    required String password,
  }) async {
    final res = await _client.post('/api/auth/otp/send', body: {
      'email': email,
      'password': password,
    });
    if (!res.ok) throw AuthException(res.error ?? 'Invalid email or password.');

    final data = (res.data as Map<String, dynamic>? ?? const <String, dynamic>{});
    final step = (data['step'] as String? ?? 'signin').trim();
    return LoginFlowResponse(
      step: step,
      phone: data['phone'] as String?,
      maskedPhone: data['maskedPhone'] as String?,
    );
  }

  Future<LoginFlowResponse> setupSellerPhone({
    required String email,
    required String password,
    required String phone,
  }) async {
    final res = await _client.post('/api/auth/otp/setup-phone', body: {
      'email': email,
      'password': password,
      'phone': phone,
    });
    if (!res.ok) throw AuthException(res.error ?? 'Could not save phone number.');
    final data = (res.data as Map<String, dynamic>? ?? const <String, dynamic>{});
    return LoginFlowResponse(
      step: (data['step'] as String? ?? 'otp').trim(),
      phone: data['phone'] as String?,
      maskedPhone: data['maskedPhone'] as String?,
    );
  }

  Future<AppUser> signup({
    required String name,
    required String email,
    required String password,
    String role = 'CUSTOMER',
    String? phone,
    String? firebaseIdToken,
  }) async {
    final body = <String, dynamic>{
      'name': name,
      'email': email,
      'password': password,
      'role': role,
    };
    if (phone != null && phone.isNotEmpty) body['phone'] = phone;
    if (firebaseIdToken != null && firebaseIdToken.isNotEmpty) body['firebaseIdToken'] = firebaseIdToken;

    final res = await _client.post('/api/auth/signup', body: body);
    if (!res.ok) {
      throw AuthException(res.error ?? 'Signup failed');
    }
    return login(
      email,
      password,
      phone: phone,
      firebaseIdToken: firebaseIdToken,
    );
  }

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

  Future<void> logout() async {
    try {
      await _client.post('/api/auth/signout', body: {'callbackUrl': '/'});
    } catch (_) {}
    await _client.clearSession();
  }

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
