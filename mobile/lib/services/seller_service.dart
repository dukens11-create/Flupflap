import '../models/product.dart';
import 'api_client.dart';
import 'product_service.dart' show ServiceException;

/// Service for seller-specific API calls.
class SellerService {
  final ApiClient _client;
  SellerService({ApiClient? client}) : _client = client ?? ApiClient();

  // ── Listings ───────────────────────────────────────────────────────────────

  /// Fetch the current seller's own listings.
  Future<List<Product>> fetchListings() async {
    final res = await _client.get('/api/seller/products');
    if (!res.ok) throw ServiceException(res.error ?? 'Failed to load listings');
    final list = res.data as List<dynamic>;
    return list.map((j) => Product.fromJson(j as Map<String, dynamic>)).toList();
  }

  /// Create a new listing.
  ///
  /// The backend expects a multipart POST to /api/seller/products.
  /// [imageUrl] should be a publicly accessible URL obtained from the
  /// image upload endpoint (/api/seller/upload) before calling this method.
  Future<Product> createListing({
    required String title,
    required String description,
    required double priceUsd,
    required String category,
    required String condition,
    required String imageUrl,
    double shippingUsd = 0,
    int inventory = 1,
    bool pickupAvailable = false,
    String? pickupCity,
    String? pickupState,
    String? pickupPostalCode,
  }) async {
    final res = await _client.post('/api/seller/products', body: {
      'title': title,
      'description': description,
      'price': priceUsd.toStringAsFixed(2),
      'category': category,
      'condition': condition,
      'imageUrl': imageUrl,
      'shipping': shippingUsd.toStringAsFixed(2),
      'inventory': inventory.toString(),
      'pickupAvailable': pickupAvailable ? 'true' : 'false',
      if (pickupCity != null) 'pickupCity': pickupCity,
      if (pickupState != null) 'pickupState': pickupState,
      if (pickupPostalCode != null) 'pickupPostalCode': pickupPostalCode,
    });
    if (!res.ok) throw ServiceException(res.error ?? 'Failed to create listing');
    return Product.fromJson(res.data as Map<String, dynamic>);
  }

  /// Update an existing listing.
  Future<Product> updateListing(String productId, Map<String, dynamic> fields) async {
    final res = await _client.patch('/api/seller/products/$productId', body: fields);
    if (!res.ok) throw ServiceException(res.error ?? 'Failed to update listing');
    return Product.fromJson(res.data as Map<String, dynamic>);
  }

  /// Delete a listing.
  Future<void> deleteListing(String productId) async {
    final res = await _client.delete('/api/seller/products/$productId');
    if (!res.ok) throw ServiceException(res.error ?? 'Failed to delete listing');
  }

  // ── Subscription ───────────────────────────────────────────────────────────

  /// Get current subscription status.
  Future<Map<String, dynamic>> fetchSubscriptionStatus() async {
    final res = await _client.get('/api/seller/subscription');
    if (!res.ok) throw ServiceException(res.error ?? 'Failed to load subscription');
    return res.data as Map<String, dynamic>;
  }

  /// Create a Stripe Checkout session for subscribing — returns a checkout URL.
  Future<String> startSubscriptionCheckout() async {
    final res = await _client.post('/api/seller/subscription');
    if (!res.ok) throw ServiceException(res.error ?? 'Could not start subscription');
    final url = (res.data as Map<String, dynamic>)['url'] as String?;
    if (url == null) throw ServiceException('Invalid subscription response');
    return url;
  }

  /// Open the Stripe billing portal — returns a portal URL.
  Future<String> openBillingPortal() async {
    final res = await _client.post('/api/seller/subscription/portal');
    if (!res.ok) throw ServiceException(res.error ?? 'Could not open billing portal');
    final url = (res.data as Map<String, dynamic>)['url'] as String?;
    if (url == null) throw ServiceException('Invalid portal response');
    return url;
  }

  // ── Stripe Connect onboarding ──────────────────────────────────────────────

  /// Start Stripe Connect onboarding — returns a Stripe onboarding URL.
  Future<String> startStripeOnboarding() async {
    final res = await _client.post('/api/seller/connect');
    if (!res.ok) throw ServiceException(res.error ?? 'Could not start onboarding');
    final url = (res.data as Map<String, dynamic>)['url'] as String?;
    if (url == null) throw ServiceException('Invalid onboarding response');
    return url;
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  /// Fetch seller's incoming orders.
  Future<List<Map<String, dynamic>>> fetchSellerOrders() async {
    final res = await _client.get('/api/seller/orders');
    if (!res.ok) throw ServiceException(res.error ?? 'Failed to load orders');
    return (res.data as List<dynamic>)
        .map((j) => j as Map<String, dynamic>)
        .toList();
  }

  // ── Image upload ───────────────────────────────────────────────────────────

  /// Request a pre-signed upload URL from the server.
  Future<Map<String, dynamic>> getUploadUrl(String filename, String mimeType) async {
    final res = await _client.post('/api/seller/upload', body: {
      'filename': filename,
      'contentType': mimeType,
    });
    if (!res.ok) throw ServiceException(res.error ?? 'Could not get upload URL');
    return res.data as Map<String, dynamic>;
  }
}
