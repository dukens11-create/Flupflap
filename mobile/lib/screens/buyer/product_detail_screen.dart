import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/theme.dart';
import '../../models/product.dart';
import '../../providers/auth_provider.dart';
import '../../providers/cart_provider.dart';
import '../../services/message_service.dart';
import '../../services/order_service.dart';
import '../../services/product_service.dart';
import '../../widgets/common_widgets.dart';

class ProductDetailScreen extends StatefulWidget {
  final String productId;
  const ProductDetailScreen({super.key, required this.productId});

  @override
  State<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends State<ProductDetailScreen> {
  Product? _product;
  bool _loading = true;
  String? _error;
  final _productService = ProductService();
  final _orderService = OrderService();
  final _messageService = MessageService();

  @override
  void initState() {
    super.initState();
    _loadProduct();
  }

  Future<void> _loadProduct() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final p = await _productService.fetchProduct(widget.productId);
      if (mounted) setState(() => _product = p);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _addToCart() async {
    if (_product == null) return;
    context.read<CartProvider>().addToCart(_product!);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Text('Added to cart'),
        behavior: SnackBarBehavior.floating,
        action: SnackBarAction(
          label: 'View Cart',
          onPressed: () => context.go('/cart'),
        ),
      ),
    );
  }

  Future<void> _buyNow() async {
    if (_product == null) return;
    try {
      final url = await _orderService.buyNow(_product!.id);
      if (!mounted) return;
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString()), backgroundColor: AppTheme.danger),
      );
    }
  }

  Future<void> _contactSeller() async {
    if (_product == null) return;
    try {
      final convo = await _messageService.startConversation(_product!.id);
      if (!mounted) return;
      context.push('/messages/${convo.id}');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString()), backgroundColor: AppTheme.danger),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_product?.title ?? 'Product'),
        actions: [
          Consumer<CartProvider>(
            builder: (_, cart, __) => Stack(
              children: [
                IconButton(
                  icon: const Icon(Icons.shopping_cart_outlined),
                  onPressed: () => context.go('/cart'),
                ),
                if (cart.itemCount > 0)
                  Positioned(
                    right: 6,
                    top: 6,
                    child: Container(
                      width: 16,
                      height: 16,
                      decoration: const BoxDecoration(
                        color: AppTheme.danger,
                        shape: BoxShape.circle,
                      ),
                      child: Text(
                        '${cart.itemCount}',
                        style: const TextStyle(color: Colors.white, fontSize: 10),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? AppErrorBanner(message: _error!, onRetry: _loadProduct)
              : _product == null
                  ? const AppEmptyState(icon: Icons.search_off, title: 'Product not found')
                  : _ProductDetailBody(
                      product: _product!,
                      onAddToCart: _addToCart,
                      onBuyNow: _buyNow,
                      onContactSeller: _contactSeller,
                    ),
    );
  }
}

class _ProductDetailBody extends StatelessWidget {
  final Product product;
  final VoidCallback onAddToCart;
  final VoidCallback onBuyNow;
  final VoidCallback onContactSeller;

  const _ProductDetailBody({
    required this.product,
    required this.onAddToCart,
    required this.onBuyNow,
    required this.onContactSeller,
  });

  @override
  Widget build(BuildContext context) {
    final isSelf =
        context.watch<AuthProvider>().user?.id == product.sellerId;

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Image
                AspectRatio(
                  aspectRatio: 1,
                  child: CachedNetworkImage(
                    imageUrl: product.imageUrl,
                    fit: BoxFit.cover,
                    placeholder: (_, __) => Container(
                      color: AppTheme.border,
                      child: const Center(child: CircularProgressIndicator()),
                    ),
                    errorWidget: (_, __, ___) => Container(
                      color: AppTheme.border,
                      child: const Icon(
                        Icons.image_not_supported_outlined,
                        size: 64,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ),
                ),

                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Badges
                      Row(
                        children: [
                          if (product.isFeatured)
                            _Badge(label: 'Featured', color: AppTheme.warning),
                          if (product.pickupAvailable) ...[
                            if (product.isFeatured) const SizedBox(width: 6),
                            _Badge(label: 'Local Pickup', color: AppTheme.accent),
                          ],
                        ],
                      ),
                      if (product.isFeatured || product.pickupAvailable)
                        const SizedBox(height: 10),

                      // Title
                      Text(product.title,
                          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.w800,
                                fontSize: 20,
                              )),
                      const SizedBox(height: 8),

                      // Price + shipping
                      Row(
                        children: [
                          Text(
                            '\$${product.priceUsd.toStringAsFixed(2)}',
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 24,
                              color: AppTheme.primary,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Text(
                            product.shippingCents == 0
                                ? 'Free shipping'
                                : '+ \$${product.shippingUsd.toStringAsFixed(2)} shipping',
                            style: const TextStyle(color: AppTheme.textSecondary),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),

                      // Condition + category
                      Row(
                        children: [
                          _InfoChip(label: product.condition, icon: Icons.info_outline),
                          const SizedBox(width: 8),
                          _InfoChip(label: product.category, icon: Icons.category_outlined),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // Description
                      Text('Description',
                          style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 6),
                      Text(product.description,
                          style: const TextStyle(color: AppTheme.textPrimary, height: 1.5)),
                      const SizedBox(height: 16),

                      // Pickup info
                      if (product.pickupAvailable) ...[
                        const Divider(),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            const Icon(Icons.location_on_outlined,
                                size: 18, color: AppTheme.accent),
                            const SizedBox(width: 6),
                            const Text('Local Pickup Available',
                                style: TextStyle(fontWeight: FontWeight.w700)),
                          ],
                        ),
                        if (product.pickupCity != null) ...[
                          const SizedBox(height: 4),
                          Text(
                            [
                              product.pickupCity,
                              product.pickupState,
                              product.pickupPostalCode,
                            ].where((s) => s != null).join(', '),
                            style: const TextStyle(color: AppTheme.textSecondary),
                          ),
                        ],
                        const SizedBox(height: 16),
                      ],

                      // Seller
                      if (product.sellerName != null) ...[
                        const Divider(),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            const CircleAvatar(
                              radius: 18,
                              backgroundColor: AppTheme.border,
                              child: Icon(Icons.person, color: AppTheme.textSecondary),
                            ),
                            const SizedBox(width: 10),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Sold by',
                                    style: TextStyle(
                                        color: AppTheme.textSecondary, fontSize: 12)),
                                Text(product.sellerName!,
                                    style: const TextStyle(fontWeight: FontWeight.w700)),
                              ],
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),

        // Action bar
        if (!isSelf)
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.shopping_cart_outlined, size: 18),
                      label: const Text('Add to Cart'),
                      onPressed: onAddToCart,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: onBuyNow,
                      child: const Text('Buy Now'),
                    ),
                  ),
                ],
              ),
            ),
          ),

        // Contact seller
        if (!isSelf)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: OutlinedButton.icon(
              icon: const Icon(Icons.chat_bubble_outline, size: 18),
              label: const Text('Message Seller'),
              onPressed: onContactSeller,
            ),
          ),
      ],
    );
  }
}

class _Badge extends StatelessWidget {
  final String label;
  final Color color;
  const _Badge({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: const TextStyle(
            color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12),
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  final String label;
  final IconData icon;
  const _InfoChip({required this.label, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: AppTheme.textSecondary),
          const SizedBox(width: 4),
          Text(label, style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
        ],
      ),
    );
  }
}
