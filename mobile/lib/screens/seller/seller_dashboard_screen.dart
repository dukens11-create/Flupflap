import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/constants.dart';
import '../../config/theme.dart';
import '../../providers/auth_provider.dart';
import '../../services/seller_service.dart';
import '../../widgets/common_widgets.dart';

class SellerDashboardScreen extends StatefulWidget {
  const SellerDashboardScreen({super.key});

  @override
  State<SellerDashboardScreen> createState() => _SellerDashboardScreenState();
}

class _SellerDashboardScreenState extends State<SellerDashboardScreen> {
  final _service = SellerService();
  Map<String, dynamic>? _subscriptionData;
  Map<String, dynamic>? _verificationData;
  List<Map<String, dynamic>> _recentOrders = [];
  bool _loading = true;
  String? _error;

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
      final subData = await _service.fetchSubscriptionStatus();
      Map<String, dynamic>? verificationData;
      try {
        verificationData = await _service.fetchVerificationStatus();
      } catch (_) {}
      List<Map<String, dynamic>> orders = [];
      try {
        orders = await _service.fetchSellerOrders();
      } catch (_) {}
      if (mounted) {
        setState(() {
          _subscriptionData = subData;
          _verificationData = verificationData;
          _recentOrders = orders.take(5).toList();
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Seller Dashboard'),
        actions: [
          TextButton.icon(
            icon: const Icon(Icons.add, size: 18),
            label: const Text('New Listing'),
            onPressed: () => context.push('/seller/new'),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? AppErrorBanner(message: _error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      // Seller status
                      if (user?.sellerStatus != 'ACTIVE')
                        Container(
                          padding: const EdgeInsets.all(14),
                          margin: const EdgeInsets.only(bottom: 16),
                          decoration: BoxDecoration(
                            color: AppTheme.danger.withAlpha(20),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: AppTheme.danger.withAlpha(80)),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.warning_amber_outlined,
                                  color: AppTheme.danger),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Account ${user?.sellerStatus ?? 'Restricted'}',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        color: AppTheme.danger,
                                      ),
                                    ),
                                    if (user?.sellerStatusReason != null)
                                      Text(user!.sellerStatusReason!,
                                          style: const TextStyle(
                                              color: AppTheme.textSecondary, fontSize: 12)),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),

                      // Subscription status card
                      _SubscriptionCard(
                        data: _subscriptionData,
                        onManage: _openBillingPortal,
                        onSubscribe: _startSubscription,
                      ),
                      const SizedBox(height: 16),

                      // Stripe Connect onboarding
                      if (user?.stripeOnboardingComplete == false)
                        _OnboardingCard(onStart: _startOnboarding),
                      const SizedBox(height: 8),
                      _SellerVerificationCard(
                        verificationData: _verificationData,
                        onStartVerification: _startSellerVerification,
                        onOpenShipping: _openShippingLabels,
                      ),

                      // Quick actions
                      const SizedBox(height: 8),
                      Text('Quick Actions',
                          style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          _QuickAction(
                            icon: Icons.list_alt_outlined,
                            label: 'My Listings',
                            onTap: () => context.push('/seller/listings'),
                          ),
                          const SizedBox(width: 10),
                          _QuickAction(
                            icon: Icons.add_box_outlined,
                            label: 'New Listing',
                            onTap: () => context.push('/seller/new'),
                          ),
                          const SizedBox(width: 10),
                          _QuickAction(
                            icon: Icons.chat_bubble_outline,
                            label: 'Messages',
                            onTap: () => context.go('/messages'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),

                      // Recent orders
                      if (_recentOrders.isNotEmpty) ...[
                        Text('Recent Orders',
                            style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 10),
                        ..._recentOrders.map((o) => _SellerOrderTile(order: o)),
                      ],
                    ],
                  ),
                ),
    );
  }

  Future<void> _openBillingPortal() async {
    try {
      final url = await _service.openBillingPortal();
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString()), backgroundColor: AppTheme.danger),
      );
    }
  }

  Future<void> _startSubscription() async {
    context.push('/seller/subscription');
  }

  Future<void> _startOnboarding() async {
    try {
      final url = await _service.startStripeOnboarding();
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString()), backgroundColor: AppTheme.danger),
      );
    }

    Future<void> _startSellerVerification() async {
      try {
        final url = await _service.startVerification();
        await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      } catch (e) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: AppTheme.danger),
        );
      }
    }

    Future<void> _openShippingLabels() async {
      await launchUrl(
        Uri.parse('${AppConstants.baseUrl}/seller/orders-to-ship'),
        mode: LaunchMode.externalApplication,
      );
    }
  }

  class _SellerVerificationCard extends StatelessWidget {
    final Map<String, dynamic>? verificationData;
    final VoidCallback onStartVerification;
    final VoidCallback onOpenShipping;

    const _SellerVerificationCard({
      required this.verificationData,
      required this.onStartVerification,
      required this.onOpenShipping,
    });

    @override
    Widget build(BuildContext context) {
      final status = verificationData?['verificationStatus'] as String?;
      final isApproved = status == 'APPROVED';
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    isApproved ? Icons.verified_user_outlined : Icons.badge_outlined,
                    color: isApproved ? AppTheme.accent : AppTheme.warning,
                  ),
                  const SizedBox(width: 8),
                  Text('Seller Verification', style: Theme.of(context).textTheme.titleMedium),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                isApproved
                    ? 'Identity verified. You can manage shipping labels for paid orders.'
                    : 'Complete identity verification to unlock listing and shipping features.',
                style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13),
              ),
              const SizedBox(height: 12),
              if (!isApproved)
                ElevatedButton(
                  onPressed: onStartVerification,
                  style: ElevatedButton.styleFrom(minimumSize: const Size(double.infinity, 40)),
                  child: const Text('Start Verification'),
                )
              else
                OutlinedButton(
                  onPressed: onOpenShipping,
                  style: OutlinedButton.styleFrom(minimumSize: const Size(double.infinity, 40)),
                  child: const Text('Manage Shipping Labels'),
                ),
            ],
          ),
        ),
      );
    }
  }
}

class _SubscriptionCard extends StatelessWidget {
  final Map<String, dynamic>? data;
  final VoidCallback onManage;
  final VoidCallback onSubscribe;
  const _SubscriptionCard(
      {required this.data, required this.onManage, required this.onSubscribe});

  @override
  Widget build(BuildContext context) {
    final status = data?['subscriptionStatus'] as String? ?? 'INACTIVE';
    final isActive = status == 'ACTIVE' || status == 'PAST_DUE';
    final periodEnd = data?['subscriptionCurrentPeriodEnd'] as String?;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.verified_outlined, color: AppTheme.primary),
                const SizedBox(width: 8),
                Text('Seller Subscription',
                    style: Theme.of(context).textTheme.titleMedium),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: isActive
                        ? AppTheme.accent.withAlpha(30)
                        : AppTheme.danger.withAlpha(20),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                        color: isActive
                            ? AppTheme.accent.withAlpha(80)
                            : AppTheme.danger.withAlpha(60)),
                  ),
                  child: Text(
                    isActive ? 'Active' : status,
                    style: TextStyle(
                      color: isActive ? AppTheme.accent : AppTheme.danger,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (isActive && periodEnd != null)
              Text(
                'Renews ${_formatDate(DateTime.tryParse(periodEnd))}',
                style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13),
              )
            else if (!isActive)
              const Text(
                'Subscribe for \$4.99/month to list items.',
                style: TextStyle(color: AppTheme.textSecondary, fontSize: 13),
              ),
            const SizedBox(height: 12),
            isActive
                ? OutlinedButton(
                    onPressed: onManage,
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(double.infinity, 40),
                    ),
                    child: const Text('Manage Subscription'),
                  )
                : ElevatedButton(
                    onPressed: onSubscribe,
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size(double.infinity, 40),
                    ),
                    child: const Text('Subscribe — \$4.99/mo'),
                  ),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime? dt) {
    if (dt == null) return '';
    return '${dt.month}/${dt.day}/${dt.year}';
  }
}

class _OnboardingCard extends StatelessWidget {
  final VoidCallback onStart;
  const _OnboardingCard({required this.onStart});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.account_balance_outlined, color: AppTheme.warning),
                const SizedBox(width: 8),
                Text('Stripe Payout Setup',
                    style: Theme.of(context).textTheme.titleMedium),
              ],
            ),
            const SizedBox(height: 8),
            const Text(
              'Complete your Stripe Connect onboarding to receive payouts from your sales.',
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 13),
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: onStart,
              style: ElevatedButton.styleFrom(
                minimumSize: const Size(double.infinity, 40),
                backgroundColor: AppTheme.warning,
              ),
              child: const Text('Complete Payout Setup'),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _QuickAction(
      {required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppTheme.border),
          ),
          child: Column(
            children: [
              Icon(icon, color: AppTheme.primary, size: 24),
              const SizedBox(height: 6),
              Text(label,
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                  textAlign: TextAlign.center),
            ],
          ),
        ),
      ),
    );
  }
}

class _SellerOrderTile extends StatelessWidget {
  final Map<String, dynamic> order;
  const _SellerOrderTile({required this.order});

  @override
  Widget build(BuildContext context) {
    final status = order['status'] as String? ?? 'PENDING';
    final totalCents = order['totalCents'] as int? ?? 0;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: const Icon(Icons.receipt_long_outlined, color: AppTheme.primary),
        title: Text(
          'Order #${(order['id'] as String).substring(0, 8).toUpperCase()}',
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
        ),
        subtitle: Text('\$${(totalCents / 100).toStringAsFixed(2)}'),
        trailing: OrderStatusBadge(status: status),
      ),
    );
  }
}
