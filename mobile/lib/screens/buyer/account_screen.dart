import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../providers/auth_provider.dart';

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final auth = context.read<AuthProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('My Account')),
      body: SingleChildScrollView(
        child: Column(
          children: [
            // Profile header
            Container(
              padding: const EdgeInsets.all(24),
              color: Colors.white,
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 36,
                    backgroundColor: AppTheme.primary.withAlpha(30),
                    backgroundImage: user?.image != null
                        ? NetworkImage(user!.image!)
                        : null,
                    child: user?.image == null
                        ? Text(
                            user?.name.isNotEmpty == true
                                ? user!.name[0].toUpperCase()
                                : '?',
                            style: const TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.w700,
                              color: AppTheme.primary,
                            ),
                          )
                        : null,
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user?.name ?? 'FlupFlap User',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        Text(
                          user?.email ?? '',
                          style: const TextStyle(color: AppTheme.textSecondary),
                        ),
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppTheme.primary.withAlpha(20),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            user?.isSeller == true ? 'Seller' : 'Buyer',
                            style: const TextStyle(
                              color: AppTheme.primary,
                              fontWeight: FontWeight.w600,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 8),

            // Menu items
            _SectionHeader(title: 'Shopping'),
            _MenuItem(
              icon: Icons.receipt_long_outlined,
              title: 'My Orders',
              onTap: () => context.go('/orders'),
            ),
            _MenuItem(
              icon: Icons.shopping_cart_outlined,
              title: 'Cart',
              onTap: () => context.go('/cart'),
            ),
            _MenuItem(
              icon: Icons.chat_bubble_outline,
              title: 'Messages',
              onTap: () => context.go('/messages'),
            ),

            if (user?.isSeller == true) ...[
              const SizedBox(height: 8),
              _SectionHeader(title: 'Selling'),
              _MenuItem(
                icon: Icons.storefront_outlined,
                title: 'Seller Dashboard',
                onTap: () => context.push('/seller'),
              ),
              _MenuItem(
                icon: Icons.list_alt_outlined,
                title: 'My Listings',
                onTap: () => context.push('/seller/listings'),
              ),
              _MenuItem(
                icon: Icons.add_box_outlined,
                title: 'New Listing',
                onTap: () => context.push('/seller/new'),
              ),
              _MenuItem(
                icon: Icons.subscriptions_outlined,
                title: 'Subscription',
                onTap: () => context.push('/seller/subscription'),
              ),
              _MenuItem(
                icon: Icons.receipt_long_outlined,
                title: 'Tax Center',
                onTap: () => context.push('/seller/tax-center'),
              ),
            ],

            const SizedBox(height: 8),
            _SectionHeader(title: 'Account'),
            _MenuItem(
              icon: Icons.lock_outline,
              title: 'Change Password',
              onTap: () {
                // TODO: implement change password
              },
            ),
            _MenuItem(
              icon: Icons.phone_outlined,
              title: 'Phone & Security',
              trailing: user?.phoneVerified == true
                  ? const Icon(Icons.verified, color: AppTheme.accent, size: 18)
                  : null,
              onTap: () {
                // TODO: implement phone verification
              },
            ),
            _MenuItem(
              icon: Icons.help_outline,
              title: 'Help & Support',
              onTap: () {
                // TODO: open support
              },
            ),
            _MenuItem(
              icon: Icons.description_outlined,
              title: 'Terms & Privacy',
              onTap: () {
                // TODO: open legal
              },
            ),

            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.all(16),
              child: OutlinedButton.icon(
                icon: const Icon(Icons.logout, size: 18),
                label: const Text('Sign Out'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppTheme.danger,
                  side: const BorderSide(color: AppTheme.danger),
                ),
                onPressed: () async {
                  await auth.logout();
                  if (!context.mounted) return;
                  context.go('/login');
                },
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Text(
        title.toUpperCase(),
        style: const TextStyle(
          color: AppTheme.textSecondary,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.8,
        ),
      ),
    );
  }
}

class _MenuItem extends StatelessWidget {
  final IconData icon;
  final String title;
  final VoidCallback onTap;
  final Widget? trailing;

  const _MenuItem({
    required this.icon,
    required this.title,
    required this.onTap,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      child: ListTile(
        leading: Icon(icon, color: AppTheme.textSecondary, size: 22),
        title: Text(title),
        trailing: trailing ?? const Icon(Icons.chevron_right, color: AppTheme.textSecondary),
        onTap: onTap,
      ),
    );
  }
}
