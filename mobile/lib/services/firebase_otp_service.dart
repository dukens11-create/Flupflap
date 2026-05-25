import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';

import '../config/constants.dart';

class FirebaseOtpProof {
  final String idToken;
  final String? phoneNumber;

  const FirebaseOtpProof({
    required this.idToken,
    required this.phoneNumber,
  });
}

class FirebaseOtpService {
  FirebaseOtpService._internal();
  static final FirebaseOtpService _instance = FirebaseOtpService._internal();
  factory FirebaseOtpService() => _instance;

  FirebaseApp? _app;
  FirebaseAuth? _auth;
  String? _verificationId;
  int? _resendToken;

  String? _nullIfEmpty(String value) => value.isEmpty ? null : value;

  Future<void> _ensureInitialized() async {
    if (!AppConstants.hasFirebaseConfig) {
      throw FirebaseOtpException(
        'Seller phone verification is unavailable right now. Missing Firebase mobile configuration.',
      );
    }

    if (_app != null && _auth != null) return;
    _app = await Firebase.initializeApp(
      options: FirebaseOptions(
        apiKey: AppConstants.firebaseApiKey,
        appId: AppConstants.firebaseAppId,
        messagingSenderId: AppConstants.firebaseMessagingSenderId,
        projectId: AppConstants.firebaseProjectId,
        authDomain: _nullIfEmpty(AppConstants.firebaseAuthDomain),
        storageBucket: _nullIfEmpty(AppConstants.firebaseStorageBucket),
        measurementId: _nullIfEmpty(AppConstants.firebaseMeasurementId),
      ),
    );
    _auth = FirebaseAuth.instanceFor(app: _app!);
  }

  Future<void> sendCode(String phone, {bool resend = false}) async {
    await _ensureInitialized();
    final auth = _auth!;
    final completer = Completer<void>();

    await auth.verifyPhoneNumber(
      phoneNumber: phone,
      timeout: const Duration(seconds: 90),
      forceResendingToken: resend ? _resendToken : null,
      verificationCompleted: (credential) async {
        // iOS/Android may auto-resolve in some cases; we still keep manual code UX.
      },
      verificationFailed: (e) {
        if (!completer.isCompleted) {
          completer.completeError(FirebaseOtpException(_firebaseAuthMessage(e)));
        }
      },
      codeSent: (verificationId, forceResendingToken) {
        _verificationId = verificationId;
        _resendToken = forceResendingToken;
        if (!completer.isCompleted) completer.complete();
      },
      codeAutoRetrievalTimeout: (verificationId) {
        _verificationId = verificationId;
        if (!completer.isCompleted) completer.complete();
      },
    );

    await completer.future;
  }

  Future<FirebaseOtpProof> verifyCode(String code) async {
    await _ensureInitialized();
    final verificationId = _verificationId;
    if (verificationId == null || verificationId.isEmpty) {
      throw FirebaseOtpException('Please request a verification code first.');
    }

    final credential = PhoneAuthProvider.credential(
      verificationId: verificationId,
      smsCode: code.trim(),
    );

    try {
      final auth = _auth!;
      final result = await auth.signInWithCredential(credential);
      final firebaseUser = result.user;
      final idToken = await firebaseUser?.getIdToken(true);
      if (idToken == null || idToken.isEmpty) {
        throw FirebaseOtpException('Phone verification failed. Please request a new code.');
      }
      final proof = FirebaseOtpProof(
        idToken: idToken,
        phoneNumber: firebaseUser?.phoneNumber,
      );
      await auth.signOut().catchError((_) {});
      return proof;
    } on FirebaseAuthException catch (e) {
      throw FirebaseOtpException(_firebaseAuthMessage(e));
    }
  }

  String _firebaseAuthMessage(FirebaseAuthException error) {
    switch (error.code) {
      case 'invalid-verification-code':
        return 'Invalid OTP code. Please check the code and try again.';
      case 'session-expired':
      case 'code-expired':
        return 'This OTP has expired. Please request a new code.';
      case 'too-many-requests':
        return 'Too many attempts. Please wait and try again.';
      case 'invalid-phone-number':
        return 'Invalid phone number. Please include your country code (for example +1...).';
      case 'operation-not-allowed':
        return 'Phone sign-in is not enabled for this app. Please contact support.';
      default:
        return error.message?.trim().isNotEmpty == true
            ? error.message!.trim()
            : 'Phone verification failed. Please try again.';
    }
  }
}

class FirebaseOtpException implements Exception {
  final String message;

  FirebaseOtpException(this.message);

  @override
  String toString() => message;
}
