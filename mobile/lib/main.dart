import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'config/routes.dart';
import 'config/theme.dart';
import 'providers/auth_provider.dart';
import 'providers/cart_provider.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const FlupFlapApp());
}

class FlupFlapApp extends StatefulWidget {
  const FlupFlapApp({super.key});

  @override
  State<FlupFlapApp> createState() => _FlupFlapAppState();
}

class _FlupFlapAppState extends State<FlupFlapApp> {
  late final AuthProvider _authProvider;
  late final CartProvider _cartProvider;

  @override
  void initState() {
    super.initState();
    _authProvider = AuthProvider();
    _cartProvider = CartProvider();
    // Restore session from secure storage on startup
    _authProvider.init();
  }

  @override
  void dispose() {
    _authProvider.dispose();
    _cartProvider.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: _authProvider),
        ChangeNotifierProvider<CartProvider>.value(value: _cartProvider),
      ],
      child: MaterialApp.router(
        title: 'FlupFlap',
        theme: AppTheme.lightTheme,
        routerConfig: AppRouter.createRouter(_authProvider),
        debugShowCheckedModeBanner: false,
      ),
    );
  }
}
