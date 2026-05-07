/// Product model mirroring the FlupFlap backend Product schema.
class Product {
  final String id;
  final String title;
  final String description;
  final int priceCents;
  final int shippingCents;
  final String condition;
  final String category;
  final String imageUrl;
  final int inventory;
  final String status; // PENDING | APPROVED | REJECTED | SOLD | HIDDEN
  final String sellerId;
  final String? sellerName;
  final DateTime createdAt;
  // Pickup
  final bool pickupAvailable;
  final String? pickupCity;
  final String? pickupState;
  final String? pickupPostalCode;
  // Promotion flag (set by API when product has an active promotion)
  final bool isFeatured;

  const Product({
    required this.id,
    required this.title,
    required this.description,
    required this.priceCents,
    this.shippingCents = 0,
    required this.condition,
    required this.category,
    required this.imageUrl,
    this.inventory = 1,
    this.status = 'APPROVED',
    required this.sellerId,
    this.sellerName,
    required this.createdAt,
    this.pickupAvailable = false,
    this.pickupCity,
    this.pickupState,
    this.pickupPostalCode,
    this.isFeatured = false,
  });

  double get priceUsd => priceCents / 100;
  double get shippingUsd => shippingCents / 100;

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      id: json['id'] as String,
      title: json['title'] as String,
      description: json['description'] as String,
      priceCents: json['priceCents'] as int,
      shippingCents: json['shippingCents'] as int? ?? 0,
      condition: json['condition'] as String,
      category: json['category'] as String,
      imageUrl: json['imageUrl'] as String,
      inventory: json['inventory'] as int? ?? 1,
      status: json['status'] as String? ?? 'APPROVED',
      sellerId: json['sellerId'] as String,
      sellerName: json['seller'] != null
          ? (json['seller'] as Map<String, dynamic>)['name'] as String?
          : json['sellerName'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      pickupAvailable: json['pickupAvailable'] as bool? ?? false,
      pickupCity: json['pickupCity'] as String?,
      pickupState: json['pickupState'] as String?,
      pickupPostalCode: json['pickupPostalCode'] as String?,
      isFeatured: json['isFeatured'] as bool? ??
          (json['promotions'] != null &&
              (json['promotions'] as List).isNotEmpty),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'description': description,
        'priceCents': priceCents,
        'shippingCents': shippingCents,
        'condition': condition,
        'category': category,
        'imageUrl': imageUrl,
        'inventory': inventory,
        'status': status,
        'sellerId': sellerId,
        'sellerName': sellerName,
        'createdAt': createdAt.toIso8601String(),
        'pickupAvailable': pickupAvailable,
        'pickupCity': pickupCity,
        'pickupState': pickupState,
        'pickupPostalCode': pickupPostalCode,
        'isFeatured': isFeatured,
      };
}
