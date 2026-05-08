/// App-wide constants for the FlupFlap mobile app.
class AppConstants {
  // Base URL for the FlupFlap backend API.
  // Override with your own base URL in a .env or build-config file for production.
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://flupflap.com',
  );

  // Product categories — must stay in sync with the web app.
  static const List<String> categories = [
    'Electronics',
    'Clothing',
    'Furniture',
    'Books',
    'Toys',
    'Sports',
    'Collectibles',
    'Other',
  ];

  // Product conditions — must stay in sync with the web app.
  static const List<String> conditions = [
    'New',
    'Like New',
    'Used',
    'For Parts',
  ];

  // Seller subscription price (informational display only — truth lives in Stripe).
  static const String subscriptionPriceDisplay = '\$4.99/month';

  // Platform commission rate for display (truth lives in MarketplaceSettings).
  static const double commissionRate = 0.07;

  // Pagination defaults
  static const int productsPerPage = 20;
  static const int ordersPerPage = 20;
}
