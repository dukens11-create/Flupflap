import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../providers/cart_provider.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/signup_screen.dart';
import '../screens/auth/otp_screen.dart';
import '../screens/buyer/home_screen.dart';
import '../screens/buyer/product_detail_screen.dart';
import '../screens/buyer/cart_screen.dart';
import '../screens/buyer/orders_screen.dart';
import '../screens/buyer/order_detail_screen.dart';
import '../screens/buyer/messages_screen.dart';
import '../screens/buyer/message_thread_screen.dart';
import '../screens/buyer/account_screen.dart';
import '../screens/seller/seller_dashboard_screen.dart';
import '../screens/seller/seller_listings_screen.dart';
import '../screens/seller/seller_new_listing_screen.dart';
import '../screens/seller/seller_edit_listing_screen.dart';
import '../screens/seller/seller_subscription_screen.dart';

class AppRouter {
  /// Creates a [GoRouter] that observes [authProvider] for redirect decisions.
  /// Call once in [State.initState] — not in [build] — to avoid re-creating
  /// the router on every rebuild.
  static GoRouter createRouter(AuthProvider authProvider) {
    return GoRouter(
      initialLocation: '/',
      refreshListenable: authProvider,
      redirect: (ctx, state) {
        final isLoggedIn = authProvider.isLoggedIn;
        final isInitializing = authProvider.status == AuthStatus.unknown;

        // While checking the stored session, show a loading screen.
        if (isInitializing) return null;

        final isOnAuth = state.matchedLocation.startsWith('/login') ||
            state.matchedLocation.startsWith('/signup') ||
            state.matchedLocation.startsWith('/otp');

        if (!isLoggedIn && !isOnAuth) return '/login';
        if (isLoggedIn && isOnAuth) return '/';
        return null;
      },
      routes: [
        // ── Auth ──────────────────────────────────────────────────────────
        GoRoute(
          path: '/login',
          name: 'login',
          builder: (ctx, state) => const LoginScreen(),
        ),
        GoRoute(
          path: '/signup',
          name: 'signup',
          builder: (ctx, state) => const SignupScreen(),
        ),
        GoRoute(
          path: '/otp',
          name: 'otp',
          builder: (ctx, state) {
            final phone = state.uri.queryParameters['phone'] ?? '';
            return OtpScreen(phone: phone);
          },
        ),

        // ── Buyer shell with bottom navigation ────────────────────────────
        ShellRoute(
          builder: (ctx, state, child) => BuyerShell(child: child),
          routes: [
            GoRoute(
              path: '/',
              name: 'home',
              builder: (ctx, state) => const HomeScreen(),
            ),
            GoRoute(
              path: '/cart',
              name: 'cart',
              builder: (ctx, state) => const CartScreen(),
            ),
            GoRoute(
              path: '/orders',
              name: 'orders',
              builder: (ctx, state) => const OrdersScreen(),
            ),
            GoRoute(
              path: '/messages',
              name: 'messages',
              builder: (ctx, state) => const MessagesScreen(),
            ),
            GoRoute(
              path: '/account',
              name: 'account',
              builder: (ctx, state) => const AccountScreen(),
            ),
          ],
        ),

        // ── Buyer detail routes (outside shell, full-screen) ──────────────
        GoRoute(
          path: '/products/:id',
          name: 'product-detail',
          builder: (ctx, state) => ProductDetailScreen(
            productId: state.pathParameters['id']!,
          ),
        ),
        GoRoute(
          path: '/orders/:id',
          name: 'order-detail',
          builder: (ctx, state) => OrderDetailScreen(
            orderId: state.pathParameters['id']!,
          ),
        ),
        GoRoute(
          path: '/messages/:id',
          name: 'message-thread',
          builder: (ctx, state) => MessageThreadScreen(
            conversationId: state.pathParameters['id']!,
          ),
        ),

        // ── Seller routes ─────────────────────────────────────────────────
        GoRoute(
          path: '/seller',
          name: 'seller-dashboard',
          builder: (ctx, state) => const SellerDashboardScreen(),
        ),
        GoRoute(
          path: '/seller/listings',
          name: 'seller-listings',
          builder: (ctx, state) => const SellerListingsScreen(),
        ),
        GoRoute(
          path: '/seller/new',
          name: 'seller-new-listing',
          builder: (ctx, state) => const SellerNewListingScreen(),
        ),
        GoRoute(
          path: '/seller/edit/:id',
          name: 'seller-edit-listing',
          builder: (ctx, state) => SellerEditListingScreen(
            productId: state.pathParameters['id']!,
          ),
        ),
        GoRoute(
          path: '/seller/subscription',
          name: 'seller-subscription',
          builder: (ctx, state) => const SellerSubscriptionScreen(),
        ),
      ],
    );
  }
}

// ── Buyer shell (bottom navigation bar) ──────────────────────────────────────

class BuyerShell extends StatelessWidget {
  final Widget child;
  const BuyerShell({super.key, required this.child});

  int _currentIndex(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    if (location == '/') return 0;
    if (location.startsWith('/cart')) return 1;
    if (location.startsWith('/orders')) return 2;
    if (location.startsWith('/messages')) return 3;
    if (location.startsWith('/account')) return 4;
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final idx = _currentIndex(context);
    final cartCount = context.watch<CartProvider>().itemCount;
    return Scaffold(
      body: child,
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: idx,
        onTap: (i) {
          switch (i) {
            case 0:
              context.go('/');
            case 1:
              context.go('/cart');
            case 2:
              context.go('/orders');
            case 3:
              context.go('/messages');
            case 4:
              context.go('/account');
          }
        },
        items: [
          const BottomNavigationBarItem(
            icon: Icon(Icons.store_outlined),
            activeIcon: Icon(Icons.store),
            label: 'Browse',
          ),
          BottomNavigationBarItem(
            icon: Badge(
              isLabelVisible: cartCount > 0,
              label: Text('$cartCount'),
              child: const Icon(Icons.shopping_cart_outlined),
            ),
            activeIcon: Badge(
              isLabelVisible: cartCount > 0,
              label: Text('$cartCount'),
              child: const Icon(Icons.shopping_cart),
            ),
            label: 'Cart',
          ),
          const BottomNavigationBarItem(
            icon: Icon(Icons.receipt_long_outlined),
            activeIcon: Icon(Icons.receipt_long),
            label: 'Orders',
          ),
          const BottomNavigationBarItem(
            icon: Icon(Icons.chat_bubble_outline),
            activeIcon: Icon(Icons.chat_bubble),
            label: 'Messages',
          ),
          const BottomNavigationBarItem(
            icon: Icon(Icons.person_outline),
            activeIcon: Icon(Icons.person),
            label: 'Account',
          ),
        ],
      ),
    );
  }
}
