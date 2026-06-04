/**
 * Push notification service for the FlupFlap React Native app.
 *
 * Uses @react-native-firebase/messaging (FCM) for both Android and iOS.
 * Call each setup function at the appropriate point in the app lifecycle:
 *
 *   registerBackgroundMessageHandler()  — in index.js, before AppRegistry
 *   requestNotificationPermission()     — in App.tsx useEffect
 *   setupForegroundHandler()            — in App.tsx useEffect
 *   setupNotificationOpenedHandler()    — in App.tsx useEffect
 */
import messaging, {
  FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import type {NavigationContainerRef} from '@react-navigation/native';
import type {PushNotificationPayload} from '@/types/notification';
import type {RootStackParamList} from '@/types/navigation';
import {useNotificationStore} from '@/store/notificationStore';

// ── Payload parsing ───────────────────────────────────────────────────────────

/**
 * Safely extract a typed payload from a remote message's `data` object.
 * All fields are treated as optional; absent / non-string values become
 * `undefined` so callers must guard before using them.
 */
export function parsePushPayload(
  message: FirebaseMessagingTypes.RemoteMessage,
): PushNotificationPayload {
  const raw = message.data ?? {};
  return {
    type: typeof raw['type'] === 'string'
      ? (raw['type'] as PushNotificationPayload['type'])
      : undefined,
    orderId: typeof raw['orderId'] === 'string' ? raw['orderId'] : undefined,
    purchasedAt:
      typeof raw['purchasedAt'] === 'string' ? raw['purchasedAt'] : undefined,
    link: typeof raw['link'] === 'string' ? raw['link'] : undefined,
    notificationId:
      typeof raw['notificationId'] === 'string'
        ? raw['notificationId']
        : undefined,
  };
}

// ── Navigation helper ─────────────────────────────────────────────────────────

/**
 * Route the seller to the appropriate screen based on the push payload.
 * Falls back gracefully when fields are missing or navigation is not ready.
 */
export function routeFromPayload(
  payload: PushNotificationPayload,
  navigationRef: NavigationContainerRef<RootStackParamList>,
): void {
  if (!navigationRef.isReady()) {
    return;
  }

  const {orderId, type} = payload;

  if (type === 'ORDER_UPDATE' && orderId) {
    navigationRef.navigate('SellerOrderDetail', {orderId});
    return;
  }

  // Fallback: open the seller notifications feed
  navigationRef.navigate('SellerNotifications', undefined);
}

// ── Permission ────────────────────────────────────────────────────────────────

/**
 * Request notification permission on iOS (Android 13+ is handled via the
 * manifest <uses-permission> declarations).
 *
 * Returns true when permission is granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const authStatus = await messaging().requestPermission();
  return (
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL
  );
}

// ── Background handler ────────────────────────────────────────────────────────

/**
 * Register the FCM background/quit-state message handler.
 *
 * Must be called in index.js BEFORE AppRegistry.registerComponent so that
 * it is active even when the JS bundle is started solely to handle a
 * background message.
 *
 * The handler simply invalidates the notification store so the feed
 * refreshes next time the app is foregrounded.
 */
export function registerBackgroundMessageHandler(): void {
  messaging().setBackgroundMessageHandler(async _message => {
    // Mark store as stale — the feed will reload on next foreground.
    useNotificationStore.getState().invalidate();
  });
}

// ── Foreground handler ────────────────────────────────────────────────────────

/**
 * Listen for FCM messages while the app is in the foreground.
 *
 * Refreshes the in-app notification store so the badge/feed updates
 * immediately without requiring a manual pull-to-refresh.
 *
 * Returns an unsubscribe function — call it in a useEffect cleanup.
 */
export function setupForegroundHandler(): () => void {
  return messaging().onMessage(async _message => {
    // Refresh the notification store so badge count and feed update.
    await useNotificationStore.getState().refresh();
  });
}

// ── Notification-opened handler ───────────────────────────────────────────────

/**
 * Handle taps on notifications that bring the app from background to
 * foreground, and check for an initial notification that launched the app
 * from a quit state (cold start).
 *
 * Returns an unsubscribe function — call it in a useEffect cleanup.
 */
export function setupNotificationOpenedHandler(
  navigationRef: NavigationContainerRef<RootStackParamList>,
): () => void {
  // Background → foreground tap
  const unsubscribe = messaging().onNotificationOpenedApp(message => {
    const payload = parsePushPayload(message);
    routeFromPayload(payload, navigationRef);
  });

  // Cold start — app was opened from a push notification while terminated
  messaging()
    .getInitialNotification()
    .then(message => {
      if (message) {
        const payload = parsePushPayload(message);
        // Defer navigation until the navigator has mounted.
        // Stop polling after 5 seconds (50 × 100 ms) to avoid indefinite intervals.
        let attempts = 0;
        const maxAttempts = 50;
        const waitForNav = setInterval(() => {
          attempts += 1;
          if (navigationRef.isReady()) {
            clearInterval(waitForNav);
            routeFromPayload(payload, navigationRef);
          } else if (attempts >= maxAttempts) {
            clearInterval(waitForNav);
          }
        }, 100);
      }
    })
    .catch(() => {
      // Non-fatal — cold-start routing is best-effort
    });

  return unsubscribe;
}
