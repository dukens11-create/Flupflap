/// Order model mirroring the FlupFlap backend Order schema.
class Order {
  final String id;
  final int totalCents;
  final int subtotalCents;
  final int shippingCents;
  final int taxCents;
  final int platformFeeCents;
  final String status;
  final String? trackingNumber;
  final String? shippingCarrier;
  final bool isPickup;
  final String? pickupCity;
  final String? pickupState;
  final String? pickupCode;
  final DateTime createdAt;
  final List<OrderItem> items;

  const Order({
    required this.id,
    required this.totalCents,
    required this.subtotalCents,
    this.shippingCents = 0,
    this.taxCents = 0,
    required this.platformFeeCents,
    required this.status,
    this.trackingNumber,
    this.shippingCarrier,
    this.isPickup = false,
    this.pickupCity,
    this.pickupState,
    this.pickupCode,
    required this.createdAt,
    this.items = const [],
  });

  double get totalUsd => totalCents / 100;

  factory Order.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'] as List<dynamic>? ?? [];
    return Order(
      id: json['id'] as String,
      totalCents: json['totalCents'] as int,
      subtotalCents: json['subtotalCents'] as int? ?? 0,
      shippingCents: json['shippingCents'] as int? ?? 0,
      taxCents: json['taxCents'] as int? ?? 0,
      platformFeeCents: json['platformFeeCents'] as int? ?? 0,
      status: json['status'] as String,
      trackingNumber: json['trackingNumber'] as String?,
      shippingCarrier: json['shippingCarrier'] as String?,
      isPickup: json['isPickup'] as bool? ?? false,
      pickupCity: json['pickupCity'] as String?,
      pickupState: json['pickupState'] as String?,
      pickupCode: json['pickupCode'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      items: rawItems
          .map((i) => OrderItem.fromJson(i as Map<String, dynamic>))
          .toList(),
    );
  }
}

class OrderItem {
  final String id;
  final String productId;
  final String? productTitle;
  final String? productImageUrl;
  final int priceCents;
  final int shippingCents;
  final int quantity;

  const OrderItem({
    required this.id,
    required this.productId,
    this.productTitle,
    this.productImageUrl,
    required this.priceCents,
    this.shippingCents = 0,
    this.quantity = 1,
  });

  factory OrderItem.fromJson(Map<String, dynamic> json) {
    final product = json['product'] as Map<String, dynamic>?;
    return OrderItem(
      id: json['id'] as String,
      productId: json['productId'] as String,
      productTitle: product?['title'] as String?,
      productImageUrl: product?['imageUrl'] as String?,
      priceCents: json['priceCents'] as int,
      shippingCents: json['shippingCents'] as int? ?? 0,
      quantity: json['quantity'] as int? ?? 1,
    );
  }
}
