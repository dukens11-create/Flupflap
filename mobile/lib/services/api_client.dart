import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../config/constants.dart';

/// Low-level HTTP client that attaches the session cookie / JWT token
/// and handles common error cases.
///
/// The FlupFlap backend uses NextAuth session cookies for authentication.
/// When the app logs in via /api/auth/credentials it receives a Set-Cookie
/// header with the session token.  Subsequent requests send that cookie.
class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  ApiClient._internal();

  static const _storage = FlutterSecureStorage();
  static const _sessionKey = 'flupflap_session_cookie';

  String get baseUrl => AppConstants.baseUrl;

  // ── Cookie management ──────────────────────────────────────────────────────

  Future<String?> getSessionCookie() => _storage.read(key: _sessionKey);

  Future<void> saveSessionCookie(String cookie) =>
      _storage.write(key: _sessionKey, value: cookie);

  Future<void> clearSession() => _storage.delete(key: _sessionKey);

  // ── Request helpers ────────────────────────────────────────────────────────

  Future<Map<String, String>> _headers({bool json = true}) async {
    final cookie = await getSessionCookie();
    return {
      if (json) HttpHeaders.contentTypeHeader: 'application/json',
      HttpHeaders.acceptHeader: 'application/json',
      if (cookie != null) HttpHeaders.cookieHeader: cookie,
    };
  }

  /// Extracts the Set-Cookie value from a response and persists it.
  Future<void> _maybeStoreCookie(http.Response response) async {
    final setCookie = response.headers['set-cookie'];
    if (setCookie != null && setCookie.isNotEmpty) {
      // Extract just the name=value part before the first semicolon
      final cookieValue = setCookie.split(';').first.trim();
      await saveSessionCookie(cookieValue);
    }
  }

  // ── Public HTTP methods ────────────────────────────────────────────────────

  Future<ApiResponse> get(String path, {Map<String, String>? query}) async {
    var uri = Uri.parse('$baseUrl$path');
    if (query != null && query.isNotEmpty) {
      uri = uri.replace(queryParameters: query);
    }
    final response = await http.get(uri, headers: await _headers());
    await _maybeStoreCookie(response);
    return _parse(response);
  }

  Future<ApiResponse> post(String path, {dynamic body}) async {
    final uri = Uri.parse('$baseUrl$path');
    final response = await http.post(
      uri,
      headers: await _headers(),
      body: body != null ? jsonEncode(body) : null,
    );
    await _maybeStoreCookie(response);
    return _parse(response);
  }

  Future<ApiResponse> postForm(String path, {Map<String, String>? fields}) async {
    final uri = Uri.parse('$baseUrl$path');
    final request = http.MultipartRequest('POST', uri);
    final cookie = await getSessionCookie();
    request.headers[HttpHeaders.acceptHeader] = 'application/json';
    if (cookie != null) {
      request.headers[HttpHeaders.cookieHeader] = cookie;
    }
    if (fields != null && fields.isNotEmpty) {
      request.fields.addAll(fields);
    }

    final streamed = await request.send();
    final response = await http.Response.fromStream(streamed);
    await _maybeStoreCookie(response);
    return _parse(response);
  }

  Future<ApiResponse> patch(String path, {dynamic body}) async {
    final uri = Uri.parse('$baseUrl$path');
    final response = await http.patch(
      uri,
      headers: await _headers(),
      body: body != null ? jsonEncode(body) : null,
    );
    await _maybeStoreCookie(response);
    return _parse(response);
  }

  Future<ApiResponse> delete(String path) async {
    final uri = Uri.parse('$baseUrl$path');
    final response = await http.delete(uri, headers: await _headers());
    await _maybeStoreCookie(response);
    return _parse(response);
  }

  ApiResponse _parse(http.Response response) {
    final statusCode = response.statusCode;
    dynamic data;
    try {
      data = jsonDecode(response.body);
    } catch (_) {
      data = response.body;
    }

    final ok = statusCode >= 200 && statusCode < 300;
    String? errorMessage;
    if (!ok) {
      if (data is Map<String, dynamic>) {
        errorMessage = data['error'] as String? ??
            data['message'] as String? ??
            'Request failed ($statusCode)';
      } else {
        errorMessage = 'Request failed ($statusCode)';
      }
    }

    return ApiResponse(
      statusCode: statusCode,
      data: ok ? data : null,
      error: errorMessage,
    );
  }
}

class ApiResponse {
  final int statusCode;
  final dynamic data;
  final String? error;

  bool get ok => error == null && statusCode >= 200 && statusCode < 300;

  const ApiResponse({
    required this.statusCode,
    this.data,
    this.error,
  });
}
