import '../models/product.dart';
import 'api_client.dart';

class ProductService {
  final ApiClient _client;
  ProductService({ApiClient? client}) : _client = client ?? ApiClient();

  /// Fetch approved products with optional filters.
  Future<List<Product>> fetchProducts({
    String? query,
    String? category,
    String? condition,
    double? minPrice,
    double? maxPrice,
    int page = 1,
  }) async {
    final params = <String, String>{};
    if (query != null && query.isNotEmpty) params['q'] = query;
    if (category != null) params['category'] = category;
    if (condition != null) params['condition'] = condition;
    if (minPrice != null) params['minPrice'] = minPrice.toString();
    if (maxPrice != null) params['maxPrice'] = maxPrice.toString();
    params['page'] = page.toString();

    final res = await _client.get('/api/products', query: params);
    if (!res.ok) throw ServiceException(res.error ?? 'Failed to load products');
    final list = res.data as List<dynamic>;
    return list.map((j) => Product.fromJson(j as Map<String, dynamic>)).toList();
  }

  /// Fetch a single product by ID.
  Future<Product> fetchProduct(String id) async {
    final res = await _client.get('/api/products/$id');
    if (!res.ok) throw ServiceException(res.error ?? 'Product not found');
    return Product.fromJson(res.data as Map<String, dynamic>);
  }
}

class ServiceException implements Exception {
  final String message;
  ServiceException(this.message);

  @override
  String toString() => message;
}
