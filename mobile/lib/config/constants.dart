/// App-wide constants for the FlupFlap mobile app.
class AppConstants {
  // Base URL for the FlupFlap backend API.
  // Override with your own base URL in a .env or build-config file for production.
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://flupflap.com',
  );

  static const String supportEmail = 'support@flupflap.com';
  static const String supportUrl = '$baseUrl';
  static const String forgotPasswordUrl = '$baseUrl/forgot-password';
  static const String legalTermsUrl = '$baseUrl/legal/terms';
  static const String legalPrivacyUrl = '$baseUrl/legal/privacy';
  static const String accountSecurityUrl = '$baseUrl/account';

  static const String firebaseApiKey = String.fromEnvironment('NEXT_PUBLIC_FIREBASE_API_KEY');
  static const String firebaseAppId = String.fromEnvironment('NEXT_PUBLIC_FIREBASE_APP_ID');
  static const String firebaseMessagingSenderId = String.fromEnvironment('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
  static const String firebaseProjectId = String.fromEnvironment('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  static const String firebaseAuthDomain = String.fromEnvironment('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
  static const String firebaseStorageBucket = String.fromEnvironment('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');
  static const String firebaseMeasurementId = String.fromEnvironment('NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID');

  static bool get hasFirebaseConfig =>
      firebaseApiKey.isNotEmpty &&
      firebaseAppId.isNotEmpty &&
      firebaseMessagingSenderId.isNotEmpty &&
      firebaseProjectId.isNotEmpty;

  // Product categories — must stay in sync with the web app.
  static const List<String> categories = [
    'Electronics',
    'Clothing',
    'Furniture',
    'Books',
    'Toys',
    'Sports',
    'Collectibles',
    'Asian Products',
    'Other',
  ];

  // Product conditions — must stay in sync with the web app.
  static const List<String> conditions = [
    'New',
    'New with box',
    'New without box',
    'Open box',
    'Like new',
    'Excellent',
    'Very good',
    'Good',
    'Fair',
    'Used',
    'For parts / not working',
  ];

  // Seller subscription price (informational display only — truth lives in Stripe).
  static const String subscriptionPriceDisplay = '\$4.99/month';

  // Platform commission rate for display (truth lives in MarketplaceSettings).
  static const double commissionRate = 0.07;

  // Pagination defaults
  static const int productsPerPage = 20;
  static const int ordersPerPage = 20;
}
