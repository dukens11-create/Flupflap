import '../models/product.dart';
import 'api_client.dart';
import 'product_service.dart' show ServiceException;

class SellerService {
  final ApiClient _client;
  SellerService({ApiClient? client}) : _client = client ?? ApiClient();

  Future<List<Product>> fetchListings() async {
    final res = await _client.get('/api/seller/products');
    if (!res.ok) throw ServiceException(res.error ?? 'Failed to load listings');
    final list = res.data as List<dynamic>;
    return list.map((j) => Product.fromJson(j as Map<String, dynamic>)).toList();
  }

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
    required double weightOz,
    required double lengthIn,
    required double widthIn,
    required double heightIn,
    String submitAction = 'SUBMIT_REVIEW',
  }) async {
    final shippingMode = shippingUsd > 0 ? 'FLAT' : 'CALCULATED';
    final fields = <String, String>{
      'title': title,
      'description': description,
      'price': priceUsd.toStringAsFixed(2),
      'category': category,
      'condition': condition,
      'imageUrl': imageUrl,
      'shipping': shippingUsd.toStringAsFixed(2),
      'shippingMode': shippingMode,
      'inventory': inventory.toString(),
      'pickupAvailable': pickupAvailable ? 'true' : 'false',
      'weight': weightOz.toStringAsFixed(2),
      'weightUnit': 'oz',
      'length': lengthIn.toStringAsFixed(2),
      'width': widthIn.toStringAsFixed(2),
      'height': heightIn.toStringAsFixed(2),
      'submitAction': submitAction,
    };
    if (pickupCity != null && pickupCity.isNotEmpty) fields['pickupCity'] = pickupCity;
    if (pickupState != null && pickupState.isNotEmpty) fields['pickupState'] = pickupState;
    if (pickupPostalCode != null && pickupPostalCode.isNotEmpty) fields['pickupPostalCode'] = pickupPostalCode;

    final res = await _client.postForm('/api/seller/products', fields: fields);
    if (!res.ok) throw ServiceException(res.error ?? 'Failed to create listing');
    return Product.fromJson(res.data as Map<String, dynamic>);
  }

  Future<Product> updateListing(String productId, Map<String, dynamic> fields) async {
    final res = await _client.patch('/api/seller/products/$productId', body: fields);
    if (!res.ok) throw ServiceException(res.error ?? 'Failed to update listing');
    return Product.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> deleteListing(String productId) async {
    final res = await _client.delete('/api/seller/products/$productId');
    if (!res.ok) throw ServiceException(res.error ?? 'Failed to delete listing');
  }

  Future<Map<String, dynamic>> fetchSubscriptionStatus() async {
    final res = await _client.get('/api/seller/subscription');
    if (!res.ok) throw ServiceException(res.error ?? 'Failed to load subscription');
    return res.data as Map<String, dynamic>;
  }

  Future<String> startSubscriptionCheckout() async {
    final res = await _client.post('/api/seller/subscription');
    if (!res.ok) throw ServiceException(res.error ?? 'Could not start subscription');
    final url = (res.data as Map<String, dynamic>)['url'] as String?;
    if (url == null) throw ServiceException('Invalid subscription response');
    return url;
  }

  Future<String> openBillingPortal() async {
    final res = await _client.post('/api/seller/subscription/portal');
    if (!res.ok) throw ServiceException(res.error ?? 'Could not open billing portal');
    final url = (res.data as Map<String, dynamic>)['url'] as String?;
    if (url == null) throw ServiceException('Invalid portal response');
    return url;
  }

  Future<String> startStripeOnboarding() async {
    final res = await _client.post('/api/stripe/connect/create-link');
    if (!res.ok) throw ServiceException(res.error ?? 'Could not start onboarding');
    final data = res.data as Map<String, dynamic>;
    final url = data['url'] as String? ?? data['link'] as String?;
    if (url == null || url.isEmpty) throw ServiceException('Invalid onboarding response');
    return url;
  }

  Future<Map<String, dynamic>> fetchVerificationStatus() async {
    final res = await _client.get('/api/seller/verification');
    if (!res.ok) throw ServiceException(res.error ?? 'Failed to load seller verification status');
    return res.data as Map<String, dynamic>;
  }

  Future<String> startVerification() async {
    final res = await _client.post('/api/seller/verification/initiate');
    if (!res.ok) throw ServiceException(res.error ?? 'Unable to start seller verification');
    final data = res.data as Map<String, dynamic>;
    final url = data['sessionUrl'] as String?;
    if (url == null || url.isEmpty) throw ServiceException('Missing seller verification URL');
    return url;
  }

  Future<Map<String, dynamic>> getUploadSignature({
    required String contentType,
    required int fileSize,
  }) async {
    final res = await _client.post('/api/upload/product-media', body: {
      'contentType': contentType,
      'fileSize': fileSize,
    });
    if (!res.ok) throw ServiceException(res.error ?? 'Could not get upload signature');
    return res.data as Map<String, dynamic>;
  }

  Future<List<Map<String, dynamic>>> fetchSellerOrders() async {
    // Dedicated seller-orders API is not available yet. Keep dashboard stable.
    return <Map<String, dynamic>>[];
  }
}
