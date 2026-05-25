import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../providers/auth_provider.dart';
import '../../services/firebase_otp_service.dart';

const int _otpCodeLength = 6;

class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  final _firebaseOtp = FirebaseOtpService();
  String _role = 'CUSTOMER';
  bool _obscurePassword = true;
  bool _otpSent = false;
  bool _otpVerified = false;
  String? _firebaseIdToken;
  String? _verifiedPhone;
  String _maskedPhone = '';

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _phoneCtrl.dispose();
    _otpCtrl.dispose();
    super.dispose();
  }

  Future<void> _sendSellerOtp() async {
    final auth = context.read<AuthProvider>();
    final phone = _phoneCtrl.text.trim();
    if (phone.isEmpty) {
      auth.setError('Phone number is required for seller signup.');
      return;
    }
    try {
      await _firebaseOtp.sendCode(phone, resend: _otpSent);
      if (!mounted) return;
      auth.clearError();
      setState(() {
        _otpSent = true;
        _otpVerified = false;
        _firebaseIdToken = null;
        _verifiedPhone = phone;
        final digits = phone.replaceAll(RegExp(r'\D'), '');
        _maskedPhone = digits.length >= 4 ? '***-***-${digits.substring(digits.length - 4)}' : phone;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Verification code sent.'),
          backgroundColor: AppTheme.accent,
        ),
      );
    } on FirebaseOtpException catch (e) {
      auth.setError(e.message);
    }
  }

  Future<void> _verifySellerOtp() async {
    final auth = context.read<AuthProvider>();
    final code = _otpCtrl.text.trim();
    if (code.length != _otpCodeLength) {
      auth.setError('Please enter the $_otpCodeLength-digit OTP code.');
      return;
    }
    try {
      final proof = await _firebaseOtp.verifyCode(code);
      if (!mounted) return;
      auth.clearError();
      setState(() {
        _otpVerified = true;
        _firebaseIdToken = proof.idToken;
        _verifiedPhone = proof.phoneNumber ?? _phoneCtrl.text.trim();
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Phone verified successfully.'),
          backgroundColor: AppTheme.accent,
        ),
      );
    } on FirebaseOtpException catch (e) {
      auth.setError(e.message);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final auth = context.read<AuthProvider>();

    if (_role == 'SELLER') {
      if (!_otpSent) {
        auth.setError('Please send a verification code to your phone first.');
        return;
      }
      if (!_otpVerified || _firebaseIdToken == null || _firebaseIdToken!.isEmpty) {
        auth.setError('Please verify your phone number before creating a seller account.');
        return;
      }
    }

    await auth.signup(
      name: _nameCtrl.text.trim(),
      email: _emailCtrl.text.trim(),
      password: _passwordCtrl.text,
      role: _role,
      phone: _role == 'SELLER' ? _verifiedPhone ?? _phoneCtrl.text.trim() : null,
      firebaseIdToken: _role == 'SELLER' ? _firebaseIdToken : null,
    );
    if (!mounted) return;
    if (auth.isLoggedIn) {
      context.go('/');
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final isSeller = _role == 'SELLER';
    return Scaffold(
      appBar: AppBar(title: const Text('Create Account')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Join FlupFlap',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 24),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Create your account to start buying or selling.',
                  style: TextStyle(color: AppTheme.textSecondary),
                ),
                const SizedBox(height: 24),
                TextFormField(
                  controller: _nameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Full name',
                    prefixIcon: Icon(Icons.person_outline),
                  ),
                  textInputAction: TextInputAction.next,
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Name is required' : null,
                ),
                const SizedBox(height: 14),
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
                  validator: (v) {
                    if (v == null || v.isEmpty) return 'Password is required';
                    if (v.length < 8) return 'Password must be at least 8 characters';
                    return null;
                  },
                ),
                const SizedBox(height: 20),
                const Text(
                  'I want to…',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 10),
                _RoleOption(
                  value: 'CUSTOMER',
                  groupValue: _role,
                  icon: Icons.shopping_bag_outlined,
                  title: 'Buy items',
                  subtitle: 'Browse and purchase from sellers',
                  onChanged: (v) => setState(() {
                    _role = v!;
                    auth.clearError();
                  }),
                ),
                const SizedBox(height: 8),
                _RoleOption(
                  value: 'SELLER',
                  groupValue: _role,
                  icon: Icons.storefront_outlined,
                  title: 'Sell items',
                  subtitle: 'List and sell your items — \$4.99/month',
                  onChanged: (v) => setState(() {
                    _role = v!;
                    auth.clearError();
                  }),
                ),
                if (isSeller) ...[
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _phoneCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Phone number',
                      prefixIcon: Icon(Icons.phone_outlined),
                      hintText: '+1 555 000 1234',
                    ),
                    keyboardType: TextInputType.phone,
                    validator: (v) {
                      if (!isSeller) return null;
                      if (v == null || v.trim().isEmpty) {
                        return 'Phone number is required for seller signup';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton(
                    onPressed: auth.loading ? null : _sendSellerOtp,
                    child: Text(_otpSent ? 'Resend verification code' : 'Send verification code'),
                  ),
                  if (_otpSent) ...[
                    const SizedBox(height: 10),
                    TextFormField(
                      controller: _otpCtrl,
                      decoration: InputDecoration(
                        labelText: 'OTP code',
                        prefixIcon: const Icon(Icons.pin_outlined),
                        helperText: _maskedPhone.isNotEmpty
                            ? 'Code sent to $_maskedPhone'
                            : null,
                      ),
                      maxLength: _otpCodeLength,
                      keyboardType: TextInputType.number,
                    ),
                    ElevatedButton(
                      onPressed: auth.loading ? null : _verifySellerOtp,
                      child: const Text('Verify phone'),
                    ),
                    if (_otpVerified)
                      const Padding(
                        padding: EdgeInsets.only(top: 8),
                        child: Text(
                          'Phone verified ✓',
                          style: TextStyle(color: AppTheme.accent, fontWeight: FontWeight.w600),
                          textAlign: TextAlign.center,
                        ),
                      ),
                  ],
                ],
                if (auth.error != null) ...[
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppTheme.danger.withAlpha(20),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppTheme.danger.withAlpha(80)),
                    ),
                    child: Text(
                      auth.error!,
                      style: const TextStyle(color: AppTheme.danger, fontSize: 13),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: auth.loading ? null : _submit,
                  child: auth.loading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('Create Account'),
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text('Already have an account? '),
                    TextButton(
                      onPressed: () => context.pop(),
                      child: const Text('Sign In'),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Text(
                  'By creating an account you agree to our Terms of Service and Privacy Policy.',
                  style: const TextStyle(color: AppTheme.textSecondary, fontSize: 11),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RoleOption extends StatelessWidget {
  final String value;
  final String groupValue;
  final IconData icon;
  final String title;
  final String subtitle;
  final ValueChanged<String?> onChanged;

  const _RoleOption({
    required this.value,
    required this.groupValue,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final selected = value == groupValue;
    return GestureDetector(
      onTap: () => onChanged(value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: selected ? AppTheme.primary.withAlpha(15) : Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: selected ? AppTheme.primary : AppTheme.border,
            width: selected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Radio<String>(
              value: value,
              groupValue: groupValue,
              onChanged: onChanged,
              activeColor: AppTheme.primary,
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            const SizedBox(width: 8),
            Icon(icon, color: selected ? AppTheme.primary : AppTheme.textSecondary),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: selected ? AppTheme.primary : AppTheme.textPrimary,
                      )),
                  Text(subtitle,
                      style: const TextStyle(
                          color: AppTheme.textSecondary, fontSize: 12)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
