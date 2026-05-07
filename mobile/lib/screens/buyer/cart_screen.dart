import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/theme.dart';
import '../../providers/cart_provider.dart';
import '../../services/order_service.dart';
import '../../widgets/common_widgets.dart';

class CartScreen extends StatelessWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartProvider>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Cart'),
        actions: [
          if (cart.itemCount > 0)
            TextButton(
              onPressed: () => cart.clearCart(),
              child: const Text('Clear'),
            ),
        ],
      ),
      body: cart.items.isEmpty
          ? AppEmptyState(
              icon: Icons.shopping_cart_outlined,
              title: 'Your cart is empty',
              subtitle: 'Browse products and add items to your cart.',
              action: ElevatedButton(
                onPressed: () => context.go('/'),
                child: const Text('Browse Items'),
              ),
            )
          : Column(
              children: [
                Expanded(
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: cart.items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (_, i) {
                      final item = cart.items[i];
                      return Card(
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Row(
                            children: [
                              // Image
                              ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: CachedNetworkImage(
                                  imageUrl: item.product.imageUrl,
                                  width: 72,
                                  height: 72,
                                  fit: BoxFit.cover,
                                  errorWidget: (_, __, ___) => Container(
                                    width: 72,
                                    height: 72,
                                    color: AppTheme.border,
                                    child: const Icon(Icons.image_not_supported_outlined,
                                        color: AppTheme.textSecondary),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      item.product.title,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontWeight: FontWeight.w600),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '\$${item.product.priceUsd.toStringAsFixed(2)}',
                                      style: const TextStyle(
                                        color: AppTheme.primary,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    if (item.product.shippingCents > 0)
                                      Text(
                                        '+ \$${item.product.shippingUsd.toStringAsFixed(2)} shipping',
                                        style: const TextStyle(
                                            color: AppTheme.textSecondary, fontSize: 12),
                                      ),
                                  ],
                                ),
                              ),
                              // Quantity controls
                              Column(
                                children: [
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      InkWell(
                                        onTap: () => cart.updateQuantity(
                                            item.product.id, item.quantity - 1),
                                        child: Container(
                                          width: 28,
                                          height: 28,
                                          decoration: BoxDecoration(
                                            border: Border.all(color: AppTheme.border),
                                            borderRadius: BorderRadius.circular(6),
                                          ),
                                          child: const Icon(Icons.remove, size: 16),
                                        ),
                                      ),
                                      Padding(
                                        padding: const EdgeInsets.symmetric(horizontal: 10),
                                        child: Text('${item.quantity}',
                                            style: const TextStyle(fontWeight: FontWeight.w700)),
                                      ),
                                      InkWell(
                                        onTap: () => cart.updateQuantity(
                                            item.product.id, item.quantity + 1),
                                        child: Container(
                                          width: 28,
                                          height: 28,
                                          decoration: BoxDecoration(
                                            color: AppTheme.primary,
                                            borderRadius: BorderRadius.circular(6),
                                          ),
                                          child: const Icon(Icons.add, size: 16, color: Colors.white),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  GestureDetector(
                                    onTap: () =>
                                        cart.removeFromCart(item.product.id),
                                    child: const Icon(Icons.delete_outline,
                                        size: 20, color: AppTheme.danger),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),

                // Order summary + checkout
                SafeArea(
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      border: Border(top: BorderSide(color: AppTheme.border)),
                    ),
                    child: Column(
                      children: [
                        _SummaryRow(
                          label: 'Subtotal',
                          value:
                              '\$${(cart.cart.subtotalCents / 100).toStringAsFixed(2)}',
                        ),
                        const SizedBox(height: 6),
                        _SummaryRow(
                          label: 'Shipping',
                          value: cart.cart.shippingCents == 0
                              ? 'Free'
                              : '\$${(cart.cart.shippingCents / 100).toStringAsFixed(2)}',
                        ),
                        const Divider(height: 16),
                        _SummaryRow(
                          label: 'Total',
                          value:
                              '\$${(cart.cart.totalCents / 100).toStringAsFixed(2)}',
                          bold: true,
                        ),
                        const SizedBox(height: 14),
                        ElevatedButton(
                          onPressed: () => _checkout(context, cart),
                          child: const Text('Proceed to Checkout'),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  Future<void> _checkout(BuildContext context, CartProvider cart) async {
    final service = OrderService();
    try {
      final items = cart.items
          .map((i) => {
                'productId': i.product.id,
                'quantity': i.quantity,
              })
          .toList();
      final url = await service.cartCheckout(items);
      cart.clearCart();
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString()), backgroundColor: AppTheme.danger),
      );
    }
  }
}

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;
  final bool bold;
  const _SummaryRow({required this.label, required this.value, this.bold = false});

  @override
  Widget build(BuildContext context) {
    final style = bold
        ? const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)
        : const TextStyle(color: AppTheme.textSecondary);
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: style),
        Text(value, style: style.copyWith(color: bold ? AppTheme.primary : null)),
      ],
    );
  }
}
