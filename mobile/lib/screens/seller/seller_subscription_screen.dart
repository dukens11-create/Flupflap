import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/theme.dart';
import '../../services/seller_service.dart';
import '../../widgets/common_widgets.dart';

/// Seller subscription / paywall screen.
/// Displays subscription status and allows subscribing or managing the plan.
class SellerSubscriptionScreen extends StatefulWidget {
  const SellerSubscriptionScreen({super.key});

  @override
  State<SellerSubscriptionScreen> createState() =>
      _SellerSubscriptionScreenState();
}

class _SellerSubscriptionScreenState extends State<SellerSubscriptionScreen> {
  final _service = SellerService();
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;
  bool _actionLoading = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await _service.fetchSubscriptionStatus();
      if (mounted) setState(() => _data = data);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _subscribe() async {
    setState(() => _actionLoading = true);
    try {
      final url = await _service.startSubscriptionCheckout();
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString()), backgroundColor: AppTheme.danger),
      );
    } finally {
      if (mounted) setState(() => _actionLoading = false);
    }
  }

  Future<void> _managePortal() async {
    setState(() => _actionLoading = true);
    try {
      final url = await _service.openBillingPortal();
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString()), backgroundColor: AppTheme.danger),
      );
    } finally {
      if (mounted) setState(() => _actionLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Seller Subscription')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? AppErrorBanner(message: _error!, onRetry: _load)
              : AppLoadingOverlay(
                  loading: _actionLoading,
                  message: 'Opening…',
                  child: _SubscriptionBody(
                    data: _data,
                    onSubscribe: _subscribe,
                    onManage: _managePortal,
                  ),
                ),
    );
  }
}

class _SubscriptionBody extends StatelessWidget {
  final Map<String, dynamic>? data;
  final VoidCallback onSubscribe;
  final VoidCallback onManage;

  const _SubscriptionBody({
    required this.data,
    required this.onSubscribe,
    required this.onManage,
  });

  @override
  Widget build(BuildContext context) {
    final status = data?['subscriptionStatus'] as String? ?? 'INACTIVE';
    final isActive = status == 'ACTIVE' || status == 'PAST_DUE';
    final periodEnd = data?['subscriptionCurrentPeriodEnd'] as String?;
    final periodEndDate = periodEnd != null ? DateTime.tryParse(periodEnd) : null;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Status card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: isActive
                          ? AppTheme.accent.withAlpha(30)
                          : AppTheme.danger.withAlpha(20),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      isActive ? Icons.verified_outlined : Icons.lock_outline,
                      color: isActive ? AppTheme.accent : AppTheme.danger,
                      size: 36,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    isActive ? 'Subscription Active' : 'No Active Subscription',
                    style: Theme.of(context).textTheme.titleLarge,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  if (isActive && periodEndDate != null)
                    Text(
                      'Renews ${_fmtDate(periodEndDate)}',
                      style: const TextStyle(color: AppTheme.textSecondary),
                      textAlign: TextAlign.center,
                    )
                  else
                    const Text(
                      'Subscribe to list items on FlupFlap.',
                      style: TextStyle(color: AppTheme.textSecondary),
                      textAlign: TextAlign.center,
                    ),
                  const SizedBox(height: 20),
                  if (isActive)
                    OutlinedButton(
                      onPressed: onManage,
                      child: const Text('Manage in Billing Portal'),
                    )
                  else
                    ElevatedButton(
                      onPressed: onSubscribe,
                      child: const Text('Subscribe — \$4.99/month'),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

          // What's included
          Text('What\'s included',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          _Feature(
            icon: Icons.list_alt_outlined,
            title: 'Unlimited listings',
            subtitle: 'List as many items as you want.',
          ),
          _Feature(
            icon: Icons.sell_outlined,
            title: 'Only 6% commission',
            subtitle: 'A small platform fee keeps FlupFlap running.',
          ),
          _Feature(
            icon: Icons.bolt_outlined,
            title: 'Featured listing boosts',
            subtitle:
                'Pay to promote your listings for more visibility.',
          ),
          _Feature(
            icon: Icons.chat_bubble_outline,
            title: 'Buyer messages',
            subtitle: 'Chat directly with interested buyers.',
          ),
          _Feature(
            icon: Icons.location_on_outlined,
            title: 'Local pickup support',
            subtitle:
                'Enable pickup-in-person options for your items.',
          ),
          const SizedBox(height: 24),

          if (!isActive) ...[
            const Divider(),
            const SizedBox(height: 16),
            const Text(
              'Subscription is billed monthly at \$4.99 and can be cancelled at any time from the billing portal.',
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 12),
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }

  String _fmtDate(DateTime dt) => '${dt.month}/${dt.day}/${dt.year}';
}

class _Feature extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  const _Feature({required this.icon, required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppTheme.primary.withAlpha(20),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: AppTheme.primary, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                Text(subtitle,
                    style: const TextStyle(
                        color: AppTheme.textSecondary, fontSize: 12)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
