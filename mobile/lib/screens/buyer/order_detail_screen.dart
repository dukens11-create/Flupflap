import 'package:flutter/material.dart';

import '../../config/theme.dart';
import '../../models/order.dart';
import '../../services/order_service.dart';
import '../../widgets/common_widgets.dart';

class OrderDetailScreen extends StatefulWidget {
  final String orderId;
  const OrderDetailScreen({super.key, required this.orderId});

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  Order? _order;
  bool _loading = true;
  String? _error;
  final _service = OrderService();

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
      final o = await _service.fetchOrder(widget.orderId);
      if (mounted) setState(() => _order = o);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Order Details')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? AppErrorBanner(message: _error!, onRetry: _load)
              : _order == null
                  ? const AppEmptyState(
                      icon: Icons.receipt_long_outlined,
                      title: 'Order not found')
                  : _OrderDetailBody(order: _order!),
    );
  }
}

class _OrderDetailBody extends StatelessWidget {
  final Order order;
  const _OrderDetailBody({required this.order});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Status card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Order #${order.id.substring(0, 8).toUpperCase()}',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _formatDate(order.createdAt),
                          style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                  OrderStatusBadge(status: order.status),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Items
          Text('Items', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          ...order.items.map((item) => _OrderItemTile(item: item)),
          const SizedBox(height: 16),

          // Order summary
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Summary', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 12),
                  _Row('Subtotal', '\$${(order.subtotalCents / 100).toStringAsFixed(2)}'),
                  const SizedBox(height: 6),
                  _Row('Shipping', order.shippingCents == 0
                      ? 'Free'
                      : '\$${(order.shippingCents / 100).toStringAsFixed(2)}'),
                  if (order.taxCents > 0) ...[
                    const SizedBox(height: 6),
                    _Row('Tax', '\$${(order.taxCents / 100).toStringAsFixed(2)}'),
                  ],
                  const Divider(height: 20),
                  _Row(
                    'Total',
                    '\$${(order.totalCents / 100).toStringAsFixed(2)}',
                    bold: true,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Shipping / pickup info
          if (order.isPickup)
            _InfoCard(
              icon: Icons.location_on_outlined,
              title: 'Pickup Location',
              children: [
                if (order.pickupCity != null)
                  Text('${order.pickupCity}, ${order.pickupState ?? ''}'),
                if (order.pickupCode != null) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    decoration: BoxDecoration(
                      color: AppTheme.primary.withAlpha(15),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppTheme.primary.withAlpha(60)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.pin_outlined, color: AppTheme.primary),
                        const SizedBox(width: 8),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Pickup Code',
                                style: TextStyle(
                                    color: AppTheme.textSecondary, fontSize: 12)),
                            Text(
                              order.pickupCode!,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w900,
                                  fontSize: 22,
                                  letterSpacing: 4,
                                  color: AppTheme.primary),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            )
          else if (order.shippingName != null)
            _InfoCard(
              icon: Icons.local_shipping_outlined,
              title: 'Shipping',
              children: [
                if (order.trackingNumber != null)
                  Text('Tracking: ${order.trackingNumber}',
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                if (order.shippingCarrier != null)
                  Text(order.shippingCarrier!,
                      style: const TextStyle(color: AppTheme.textSecondary)),
              ],
            ),
        ],
      ),
    );
  }

  String _formatDate(DateTime dt) => '${dt.month}/${dt.day}/${dt.year}';
}

class _OrderItemTile extends StatelessWidget {
  final OrderItem item;
  const _OrderItemTile({required this.item});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Container(
                width: 56,
                height: 56,
                color: AppTheme.border,
                child: item.productImageUrl != null
                    ? Image.network(item.productImageUrl!, fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const Icon(
                            Icons.image_not_supported_outlined,
                            color: AppTheme.textSecondary))
                    : const Icon(Icons.image_not_supported_outlined,
                        color: AppTheme.textSecondary),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.productTitle ?? 'Product',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  Text(
                    '\$${(item.priceCents / 100).toStringAsFixed(2)}'
                    '${item.quantity > 1 ? ' × ${item.quantity}' : ''}',
                    style: const TextStyle(
                        color: AppTheme.primary, fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  final String label;
  final String value;
  final bool bold;
  const _Row(this.label, this.value, {this.bold = false});

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

class _InfoCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final List<Widget> children;
  const _InfoCard({required this.icon, required this.title, required this.children});

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
                Icon(icon, size: 18, color: AppTheme.primary),
                const SizedBox(width: 6),
                Text(title, style: Theme.of(context).textTheme.titleMedium),
              ],
            ),
            const SizedBox(height: 10),
            ...children,
          ],
        ),
      ),
    );
  }
}
