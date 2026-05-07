import '../models/order.dart';
import 'api_client.dart';
import 'product_service.dart' show ServiceException;

class OrderService {
  final ApiClient _client;
  OrderService({ApiClient? client}) : _client = client ?? ApiClient();

  /// Fetch buyer's orders.
  Future<List<Order>> fetchOrders() async {
    final res = await _client.get('/api/orders');
    if (!res.ok) throw ServiceException(res.error ?? 'Failed to load orders');
    final list = res.data as List<dynamic>;
    return list.map((j) => Order.fromJson(j as Map<String, dynamic>)).toList();
  }

  /// Fetch a single order by ID.
  Future<Order> fetchOrder(String id) async {
    final res = await _client.get('/api/orders/$id');
    if (!res.ok) throw ServiceException(res.error ?? 'Order not found');
    return Order.fromJson(res.data as Map<String, dynamic>);
  }

  /// Initiate buy-now checkout — returns a Stripe checkout URL.
  Future<String> buyNow(String productId, {String? addressId}) async {
    final res = await _client.post('/api/checkout/buynow', body: {
      'productId': productId,
      if (addressId != null) 'addressId': addressId,
    });
    if (!res.ok) throw ServiceException(res.error ?? 'Checkout failed');
    final url = (res.data as Map<String, dynamic>)['url'] as String?;
    if (url == null) throw ServiceException('Invalid checkout response');
    return url;
  }

  /// Initiate cart checkout — returns a Stripe checkout URL.
  Future<String> cartCheckout(
    List<Map<String, dynamic>> cartItems, {
    String? addressId,
  }) async {
    final res = await _client.post('/api/checkout/cart', body: {
      'items': cartItems,
      if (addressId != null) 'addressId': addressId,
    });
    if (!res.ok) throw ServiceException(res.error ?? 'Checkout failed');
    final url = (res.data as Map<String, dynamic>)['url'] as String?;
    if (url == null) throw ServiceException('Invalid checkout response');
    return url;
  }
}
