# FlupFlap Mobile App

A Flutter mobile app for the FlupFlap marketplace — supporting both buyer and seller flows.

## Prerequisites

- **Flutter SDK** 3.27+ — [Install Flutter](https://docs.flutter.dev/get-started/install)
- **Dart** 3.3+
- **Android Studio** (for Android) or **Xcode** (for iOS)
- An existing FlupFlap backend (see root `README.md`)

## Project structure

```
mobile/
├── lib/
│   ├── main.dart               # App entry point
│   ├── config/
│   │   ├── constants.dart      # App-wide constants (API URL, categories, etc.)
│   │   ├── routes.dart         # go_router navigation + bottom nav shell
│   │   └── theme.dart          # Material 3 theme (mirrors website palette)
│   ├── models/
│   │   ├── user.dart           # AppUser model
│   │   ├── product.dart        # Product model
│   │   ├── order.dart          # Order + OrderItem models
│   │   ├── cart.dart           # Cart + CartItem (local state)
│   │   └── conversation.dart   # Conversation + Message models
│   ├── services/
│   │   ├── api_client.dart     # Low-level HTTP client (cookie auth)
│   │   ├── auth_service.dart   # Login, signup, OTP, session
│   │   ├── product_service.dart
│   │   ├── order_service.dart
│   │   ├── message_service.dart
│   │   └── seller_service.dart # Listings, subscription, Stripe Connect
│   ├── providers/
│   │   ├── auth_provider.dart  # ChangeNotifier for auth state
│   │   └── cart_provider.dart  # ChangeNotifier for cart state
│   ├── screens/
│   │   ├── auth/
│   │   │   ├── login_screen.dart
│   │   │   ├── signup_screen.dart
│   │   │   └── otp_screen.dart
│   │   ├── buyer/
│   │   │   ├── home_screen.dart          # Browse + search + filters
│   │   │   ├── product_detail_screen.dart
│   │   │   ├── cart_screen.dart
│   │   │   ├── orders_screen.dart
│   │   │   ├── order_detail_screen.dart
│   │   │   ├── messages_screen.dart
│   │   │   ├── message_thread_screen.dart
│   │   │   └── account_screen.dart
│   │   └── seller/
│   │       ├── seller_dashboard_screen.dart
│   │       ├── seller_listings_screen.dart
│   │       ├── seller_new_listing_screen.dart
│   │       ├── seller_edit_listing_screen.dart
│   │       └── seller_subscription_screen.dart
│   └── widgets/
│       ├── product_card.dart
│       └── common_widgets.dart  # LoadingOverlay, ErrorBanner, EmptyState, StatusBadge
├── android/                    # Android project files
├── ios/                        # iOS project files (Podfile)
├── assets/images/              # Static image assets
├── pubspec.yaml
└── analysis_options.yaml
```

## Getting started

### 1. Clone and navigate

```bash
# From the repo root
cd mobile
```

### 2. Install Flutter dependencies

```bash
flutter pub get
```

### 3. Configure the backend URL

The app connects to the FlupFlap backend. By default it points to `https://flupflap.com`.

To override during development:

```bash
# Point to your local backend
flutter run --dart-define=API_BASE_URL=http://localhost:3000
```

Or create a `.env`-like approach by editing `lib/config/constants.dart` directly during development.

### 4. Run on a device / emulator

```bash
# List available devices
flutter devices

# Run on a specific device
flutter run -d <device-id>

# Run in debug mode on default device
flutter run
```

### 5. Build for release

```bash
# Android APK
flutter build apk --release

# Android App Bundle (Play Store)
flutter build appbundle --release

# iOS (requires macOS + Xcode)
flutter build ios --release
```

## Authentication

The app uses NextAuth session cookies, exactly like the website:

1. **Buyer signup / login** — email + password via `/api/auth/callback/credentials`
2. **Seller signup** — email + password + phone OTP via `/api/auth/otp/verify`
3. Session cookie is stored securely using `flutter_secure_storage`

## Seller flow

| Screen | Route | Description |
|--------|-------|-------------|
| Dashboard | `/seller` | Subscription status, quick actions, recent orders |
| Listings | `/seller/listings` | View, edit, delete listings |
| New Listing | `/seller/new` | Create a listing (requires active subscription) |
| Edit Listing | `/seller/edit/:id` | Update an existing listing |
| Subscription | `/seller/subscription` | Subscribe (\$4.99/mo), manage billing portal |

### Subscription requirement

Sellers must have an active subscription (`subscriptionStatus = ACTIVE | PAST_DUE`) to create listings. The subscription screen opens a Stripe Checkout session (handled in-browser via `url_launcher`).

### Stripe Connect / payouts

After subscribing, sellers must complete Stripe Connect onboarding before they receive payouts. A banner on the dashboard prompts them to complete this.

## Buyer flow

| Screen | Route | Description |
|--------|-------|-------------|
| Home/Browse | `/` | Searchable product grid with category/condition filters |
| Product Detail | `/products/:id` | Full product info, Add to Cart, Buy Now, Message Seller |
| Cart | `/cart` | Cart management, shipping summary, checkout |
| Orders | `/orders` | Order history |
| Order Detail | `/orders/:id` | Full order info, pickup code, tracking |
| Messages | `/messages` | Conversation inbox |
| Thread | `/messages/:id` | Real-time-like chat with a seller |
| Account | `/account` | Profile, settings, sign-out |

## Checkout

Checkout is handled by Stripe Checkout (hosted page), just like the website:

1. App calls `/api/checkout/buynow` or `/api/checkout/cart`
2. Receives a Stripe Checkout URL
3. Opens the URL in an external browser via `url_launcher`
4. After payment, the webhook updates the order status

## Dependencies

| Package | Purpose |
|---------|---------|
| `go_router` | Navigation |
| `provider` | State management |
| `http` | HTTP requests |
| `flutter_secure_storage` | Secure cookie storage |
| `cached_network_image` | Image loading + caching |
| `url_launcher` | Open Stripe checkout / billing portal |
| `shared_preferences` | Local preferences |

## Contributing

This Flutter app lives in the `mobile/` directory of the FlupFlap monorepo. The website and app share the same backend — do not modify API contracts without updating both clients.
