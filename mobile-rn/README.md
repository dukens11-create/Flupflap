# FlupFlap React Native — Seller Notifications

React Native client for **seller purchase notifications** in the FlupFlap marketplace.  
It provides in-app notification feed, push notification handling, and deep-link routing — all targeting the same backend REST API used by the web app.

---

## Architecture overview

```
mobile-rn/
├── src/
│   ├── types/           # Shared TypeScript types (notification, navigation)
│   ├── constants/       # API base URL and storage keys
│   ├── services/
│   │   ├── apiClient.ts           # Session-cookie HTTP client (AsyncStorage)
│   │   ├── notificationService.ts # GET/PATCH /api/notifications wrappers
│   │   └── pushNotificationService.ts  # FCM foreground/background/cold-start
│   ├── store/
│   │   └── notificationStore.ts   # Zustand store (fetch, markRead, invalidate)
│   ├── navigation/
│   │   ├── AppNavigator.tsx       # Root + Seller stack navigators
│   │   └── routes.ts              # Route name constants
│   ├── screens/
│   │   ├── auth/LoginScreen.tsx
│   │   └── seller/
│   │       ├── SellerDashboardScreen.tsx      # Landing with notification badge
│   │       ├── SellerNotificationsScreen.tsx  # Notification feed
│   │       └── SellerOrderDetailScreen.tsx    # Order detail from notification tap
│   └── components/notifications/
│       ├── NotificationItem.tsx   # Feed row — unread/read state, purchase detail
│       └── NotificationBadge.tsx  # Unread-count badge
└── android/ ios/         # Platform config (Firebase/FCM wired up)
```

### Key design decisions

| Decision | Rationale |
|---|---|
| **Zustand** for notifications state | Lightweight, no boilerplate, works well outside React (background handler calls `getState()` directly) |
| **@react-native-firebase/messaging** | Official Firebase SDK; handles FCM on both Android & iOS; used by the existing push webhook pattern |
| **Optimistic markRead** | Keeps UI snappy — rolls back to server state if the API call fails |
| **`invalidate()` from background handler** | Avoids unnecessary API calls while app is in background; refreshes on next foreground |
| **`parsePushPayload()`** | All payload fields are optional/string so every field is type-narrowed defensively before use |

---

## Notification flow

### In-app (foreground)

```
FCM message arrives
  → setupForegroundHandler fires
    → notificationStore.refresh()   // re-fetches /api/notifications
      → SellerNotificationsScreen re-renders with new item + unread count
```

### Background / quit-state tap

```
User taps push notification
  → setupNotificationOpenedHandler fires
    → parsePushPayload(message)
      → routeFromPayload(payload, navigationRef)
        → if ORDER_UPDATE + orderId → SellerOrderDetailScreen
        → otherwise → SellerNotificationsScreen
```

### Cold start (app was killed)

```
App launched from notification tap
  → getInitialNotification() checked in App.tsx useEffect
    → waits until navigationRef.isReady()
      → routeFromPayload(...)
```

---

## Setup

### Prerequisites

- Node.js ≥ 18, npm ≥ 10
- React Native 0.74 dev environment (Xcode 15+ / Android Studio Hedgehog+)
- A Firebase project with **FCM** enabled

### Environment

| Variable | Purpose |
|---|---|
| `FLUPFLAP_API_URL` | Backend base URL (defaults to `https://flupflap.com`) |

### Android

1. Download `google-services.json` from your Firebase console and place it at  
   `android/app/google-services.json` (excluded from version control via `.gitignore`).
2. Ensure `android/local.properties` contains `sdk.dir` pointing to your Android SDK.

### iOS

1. Download `GoogleService-Info.plist` from your Firebase console and add it to the  
   `ios/FlupFlapRN/` folder in Xcode (excluded from version control via `.gitignore`).
2. In Xcode → Signing & Capabilities, add the **Push Notifications** capability.
3. Run `cd ios && pod install`.

### Install & run

```bash
cd mobile-rn
npm install

# iOS
npx react-native run-ios

# Android
npx react-native run-android
```

### Tests

```bash
npm test                # run all tests
npm run test:coverage   # with coverage report
npm run typecheck       # TypeScript type-check
```

Test coverage includes:

- `NotificationItem.test.tsx` — renders purchase notification content, handles read/unread state, calls `onPress`
- `notificationStore.test.ts` — refresh, markRead (optimistic + rollback), markAllRead, invalidate
- `pushNotificationService.test.ts` — payload parsing, navigation routing, foreground handler, background handler

---

## Backend integration

All data is sourced from the same endpoints used by the web app:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/notifications` | `GET` | Fetch up to 50 notifications newest-first + unread count |
| `/api/notifications` | `PATCH` | Mark specific IDs or all as read |
| `/api/seller/orders` | `GET` | Fetch seller orders (used by SellerOrderDetailScreen) |

Authentication uses the NextAuth session cookie stored in `AsyncStorage` (key: `flupflap_rn_session_cookie`).

Push notifications are dispatched by the backend via `PUSH_NOTIFICATION_WEBHOOK_URL` (see `lib/push-notifications.ts`).  
The FCM registration token should be sent to the backend through the user's profile/device endpoint so the server can target the correct device.
