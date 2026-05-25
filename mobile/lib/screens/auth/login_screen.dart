import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/constants.dart';
import '../../config/theme.dart';
import '../../providers/auth_provider.dart';
import '../../services/firebase_otp_service.dart';

enum _LoginStep { credentials, addPhone, otp }
const int _otpCodeLength = 6;

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  final _firebaseOtp = FirebaseOtpService();
  bool _obscurePassword = true;
  _LoginStep _step = _LoginStep.credentials;
  String _pendingEmail = '';
  String _pendingPassword = '';
  String _pendingPhone = '';
  String _maskedPhone = '';

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _phoneCtrl.dispose();
    _otpCtrl.dispose();
    super.dispose();
  }

  Future<void> _submitCredentials() async {
    if (!_formKey.currentState!.validate()) return;
    final auth = context.read<AuthProvider>();
    final email = _emailCtrl.text.trim();
    final password = _passwordCtrl.text;
    final flow = await auth.startLoginFlow(email: email, password: password);
    if (!mounted || flow == null) return;
    if (auth.isLoggedIn) {
      context.go('/');
      return;
    }
    _pendingEmail = email;
    _pendingPassword = password;

    if (flow.step == 'add_phone') {
      setState(() => _step = _LoginStep.addPhone);
      return;
    }
    if (flow.step == 'otp' && flow.phone != null && flow.phone!.isNotEmpty) {
      await _startOtp(flow.phone!, flow.maskedPhone ?? flow.phone!);
      return;
    }
  }

  Future<void> _submitPhone() async {
    final auth = context.read<AuthProvider>();
    final enteredPhone = _phoneCtrl.text.trim();
    if (enteredPhone.isEmpty) return;
    final flow = await auth.setupSellerPhoneForLogin(
      email: _pendingEmail,
      password: _pendingPassword,
      phone: enteredPhone,
    );
    if (!mounted || flow == null) return;
    if (flow.step == 'otp' && flow.phone != null && flow.phone!.isNotEmpty) {
      await _startOtp(flow.phone!, flow.maskedPhone ?? flow.phone!);
    }
  }

  Future<void> _startOtp(String phone, String maskedPhone) async {
    final auth = context.read<AuthProvider>();
    try {
      await _firebaseOtp.sendCode(phone);
      if (!mounted) return;
      auth.clearError();
      setState(() {
        _step = _LoginStep.otp;
        _pendingPhone = phone;
        _maskedPhone = maskedPhone;
        _otpCtrl.clear();
      });
    } on FirebaseOtpException catch (e) {
      auth.setError(e.message);
    }
  }

  Future<void> _resendOtp() async {
    final auth = context.read<AuthProvider>();
    if (_pendingPhone.isEmpty) return;
    try {
      await _firebaseOtp.sendCode(_pendingPhone, resend: true);
      if (!mounted) return;
      auth.clearError();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Verification code resent.'),
          backgroundColor: AppTheme.accent,
        ),
      );
    } on FirebaseOtpException catch (e) {
      auth.setError(e.message);
    }
  }

  Future<void> _verifyOtp() async {
    final auth = context.read<AuthProvider>();
    final code = _otpCtrl.text.trim();
    if (code.length != _otpCodeLength) return;
    try {
      final proof = await _firebaseOtp.verifyCode(code);
      final verifiedPhone = proof.phoneNumber ?? _pendingPhone;
      await auth.completeSellerOtpLogin(
        email: _pendingEmail,
        password: _pendingPassword,
        phone: verifiedPhone,
        firebaseIdToken: proof.idToken,
      );
      if (!mounted) return;
      if (auth.isLoggedIn) {
        context.go('/');
      }
    } on FirebaseOtpException catch (e) {
      auth.setError(e.message);
    }
  }

  Future<void> _openForgotPassword() async {
    final uri = Uri.parse(AppConstants.forgotPasswordUrl);
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 40),
              Center(
                child: Column(
                  children: [
                    Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        color: AppTheme.primary,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: const Icon(Icons.swap_horiz_rounded, color: Colors.white, size: 40),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'FlupFlap',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Buy & sell new and used items',
                      style: TextStyle(color: AppTheme.textSecondary),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),
              if (_step == _LoginStep.credentials) _buildCredentials(auth),
              if (_step == _LoginStep.addPhone) _buildAddPhone(auth),
              if (_step == _LoginStep.otp) _buildOtp(auth),
              const SizedBox(height: 24),
              if (_step == _LoginStep.credentials)
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text("Don't have an account? "),
                    TextButton(
                      onPressed: () => context.push('/signup'),
                      child: const Text('Sign Up'),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCredentials(AuthProvider auth) {
    return Form(
      key: _formKey,
      child: Column(
        children: [
          TextFormField(
            controller: _emailCtrl,
            decoration: const InputDecoration(
              labelText: 'Email address',
              prefixIcon: Icon(Icons.email_outlined),
            ),
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            validator: (v) {
              if (v == null || v.isEmpty) return 'Email is required';
              if (!v.contains('@')) return 'Enter a valid email';
              return null;
            },
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _passwordCtrl,
            obscureText: _obscurePassword,
            decoration: InputDecoration(
              labelText: 'Password',
              prefixIcon: const Icon(Icons.lock_outline),
              suffixIcon: IconButton(
                icon: Icon(_obscurePassword
                    ? Icons.visibility_outlined
                    : Icons.visibility_off_outlined),
                onPressed: () =>
                    setState(() => _obscurePassword = !_obscurePassword),
              ),
            ),
            textInputAction: TextInputAction.done,
            onFieldSubmitted: (_) => _submitCredentials(),
            validator: (v) {
              if (v == null || v.isEmpty) return 'Password is required';
              return null;
            },
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: _openForgotPassword,
              child: const Text('Forgot password?'),
            ),
          ),
          if (auth.error != null) _errorBox(auth.error!),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: auth.loading ? null : _submitCredentials,
            child: auth.loading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text('Sign In'),
          ),
        ],
      ),
    );
  }

  Widget _buildAddPhone(AuthProvider auth) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Add your phone number',
          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 20),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        const Text(
          'This seller account needs a verified phone number for OTP login.',
          style: TextStyle(color: AppTheme.textSecondary),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 20),
        TextFormField(
          controller: _phoneCtrl,
          decoration: const InputDecoration(
            labelText: 'Phone number',
            prefixIcon: Icon(Icons.phone_outlined),
            hintText: '+1 555 000 1234',
          ),
          keyboardType: TextInputType.phone,
        ),
        if (auth.error != null) ...[
          const SizedBox(height: 10),
          _errorBox(auth.error!),
        ],
        const SizedBox(height: 16),
        ElevatedButton(
          onPressed: auth.loading ? null : _submitPhone,
          child: auth.loading
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : const Text('Send verification code'),
        ),
        TextButton(
          onPressed: auth.loading
              ? null
              : () => setState(() {
                    _step = _LoginStep.credentials;
                    auth.clearError();
                  }),
          child: const Text('Back'),
        ),
      ],
    );
  }

  Widget _buildOtp(AuthProvider auth) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Icon(Icons.sms_outlined, size: 64, color: AppTheme.primary),
        const SizedBox(height: 16),
        const Text(
          'Verify phone',
          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 20),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          'We sent a $_otpCodeLength-digit code to $_maskedPhone',
          style: const TextStyle(color: AppTheme.textSecondary),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),
        TextFormField(
          controller: _otpCtrl,
          decoration: const InputDecoration(
            labelText: 'Verification code',
            prefixIcon: Icon(Icons.pin_outlined),
          ),
          keyboardType: TextInputType.number,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 24, letterSpacing: 8),
          maxLength: _otpCodeLength,
        ),
        if (auth.error != null) _errorBox(auth.error!),
        const SizedBox(height: 16),
        ElevatedButton(
          onPressed: auth.loading ? null : _verifyOtp,
          child: auth.loading
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : const Text('Verify and sign in'),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: auth.loading ? null : _resendOtp,
          child: const Text('Resend code'),
        ),
        TextButton(
          onPressed: auth.loading
              ? null
              : () => setState(() {
                    _step = _LoginStep.credentials;
                    auth.clearError();
                  }),
          child: const Text('Back'),
        ),
      ],
    );
  }

  Widget _errorBox(String message) {
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.danger.withAlpha(20),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppTheme.danger.withAlpha(80)),
      ),
      child: Text(
        message,
        style: const TextStyle(color: AppTheme.danger, fontSize: 13),
        textAlign: TextAlign.center,
      ),
    );
  }
}
