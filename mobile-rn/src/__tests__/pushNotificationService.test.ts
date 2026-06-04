/**
 * Tests for pushNotificationService.
 *
 * Verifies:
 *  - parsePushPayload extracts typed fields from a remote message
 *  - parsePushPayload is defensive with missing / non-string fields
 *  - routeFromPayload navigates to SellerOrderDetail for ORDER_UPDATE with orderId
 *  - routeFromPayload falls back to SellerNotifications when data is incomplete
 *  - routeFromPayload is a no-op when navigation is not ready
 *  - setupForegroundHandler calls store refresh on each message
 *  - registerBackgroundMessageHandler calls store invalidate
 */

// Mocks must be set up before any imports that use the mocked modules.
const mockIsReady = jest.fn(() => true);
const mockNavigate = jest.fn();

const mockNavigationRef = {
  isReady: mockIsReady,
  navigate: mockNavigate,
};

const mockOnMessage = jest.fn();
const mockSetBackgroundMessageHandler = jest.fn();
const mockOnNotificationOpenedApp = jest.fn(() => jest.fn());
const mockGetInitialNotification = jest.fn(() => Promise.resolve(null));
const mockRequestPermission = jest.fn(() =>
  Promise.resolve(1 /* AUTHORIZED */),
);

jest.mock('@react-native-firebase/messaging', () => {
  const messagingFn = jest.fn(() => ({
    onMessage: mockOnMessage,
    setBackgroundMessageHandler: mockSetBackgroundMessageHandler,
    onNotificationOpenedApp: mockOnNotificationOpenedApp,
    getInitialNotification: mockGetInitialNotification,
    requestPermission: mockRequestPermission,
  }));
  (messagingFn as unknown as Record<string, unknown>).AuthorizationStatus = {
    AUTHORIZED: 1,
    PROVISIONAL: 2,
    DENIED: 0,
    NOT_DETERMINED: -1,
  };
  return {__esModule: true, default: messagingFn};
});

const mockRefresh = jest.fn(() => Promise.resolve());
const mockInvalidate = jest.fn();

jest.mock('@/store/notificationStore', () => ({
  useNotificationStore: {
    getState: jest.fn(() => ({
      refresh: mockRefresh,
      invalidate: mockInvalidate,
    })),
  },
}));

import {
  parsePushPayload,
  routeFromPayload,
  setupForegroundHandler,
  registerBackgroundMessageHandler,
} from '@/services/pushNotificationService';
import type {FirebaseMessagingTypes} from '@react-native-firebase/messaging';
import type {RootStackParamList} from '@/types/navigation';
import type {NavigationContainerRef} from '@react-navigation/native';

function makeMessage(
  data: Record<string, string> = {},
): FirebaseMessagingTypes.RemoteMessage {
  return {data} as FirebaseMessagingTypes.RemoteMessage;
}

describe('parsePushPayload', () => {
  it('extracts known typed fields from message data', () => {
    const payload = parsePushPayload(
      makeMessage({
        type: 'ORDER_UPDATE',
        orderId: 'ord_abc123',
        purchasedAt: '2026-06-01T12:00:00Z',
        link: '/seller',
        notificationId: 'notif_xyz',
      }),
    );

    expect(payload.type).toBe('ORDER_UPDATE');
    expect(payload.orderId).toBe('ord_abc123');
    expect(payload.purchasedAt).toBe('2026-06-01T12:00:00Z');
    expect(payload.link).toBe('/seller');
    expect(payload.notificationId).toBe('notif_xyz');
  });

  it('returns undefined for missing fields', () => {
    const payload = parsePushPayload(makeMessage({}));

    expect(payload.type).toBeUndefined();
    expect(payload.orderId).toBeUndefined();
    expect(payload.purchasedAt).toBeUndefined();
    expect(payload.link).toBeUndefined();
  });

  it('handles undefined data gracefully', () => {
    const msg = {} as FirebaseMessagingTypes.RemoteMessage;
    expect(() => parsePushPayload(msg)).not.toThrow();
    const payload = parsePushPayload(msg);
    expect(payload.orderId).toBeUndefined();
  });
});

describe('routeFromPayload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsReady.mockReturnValue(true);
  });

  it('navigates to SellerOrderDetail for ORDER_UPDATE with orderId', () => {
    routeFromPayload(
      {type: 'ORDER_UPDATE', orderId: 'ord_abc123'},
      mockNavigationRef as unknown as NavigationContainerRef<RootStackParamList>,
    );

    expect(mockNavigate).toHaveBeenCalledWith('SellerOrderDetail', {
      orderId: 'ord_abc123',
    });
  });

  it('falls back to SellerNotifications when orderId is missing', () => {
    routeFromPayload(
      {type: 'ORDER_UPDATE'},
      mockNavigationRef as unknown as NavigationContainerRef<RootStackParamList>,
    );

    expect(mockNavigate).toHaveBeenCalledWith('SellerNotifications', undefined);
  });

  it('falls back to SellerNotifications for unknown type', () => {
    routeFromPayload(
      {type: 'PAYOUT', orderId: 'ord_abc123'},
      mockNavigationRef as unknown as NavigationContainerRef<RootStackParamList>,
    );

    expect(mockNavigate).toHaveBeenCalledWith('SellerNotifications', undefined);
  });

  it('is a no-op when navigator is not ready', () => {
    mockIsReady.mockReturnValue(false);

    routeFromPayload(
      {type: 'ORDER_UPDATE', orderId: 'ord_abc123'},
      mockNavigationRef as unknown as NavigationContainerRef<RootStackParamList>,
    );

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('setupForegroundHandler', () => {
  it('registers an onMessage listener', () => {
    mockOnMessage.mockReturnValue(jest.fn());
    setupForegroundHandler();
    expect(mockOnMessage).toHaveBeenCalledTimes(1);
  });

  it('calls store refresh when a foreground message arrives', async () => {
    let capturedHandler: ((msg: unknown) => Promise<void>) | null = null;
    mockOnMessage.mockImplementation((handler: (msg: unknown) => Promise<void>) => {
      capturedHandler = handler;
      return jest.fn();
    });

    setupForegroundHandler();

    expect(capturedHandler).not.toBeNull();
    await capturedHandler!(makeMessage({type: 'ORDER_UPDATE'}));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('registerBackgroundMessageHandler', () => {
  it('registers a background message handler', () => {
    registerBackgroundMessageHandler();
    expect(mockSetBackgroundMessageHandler).toHaveBeenCalledTimes(1);
  });

  it('calls store invalidate when the background handler fires', async () => {
    let capturedHandler: ((msg: unknown) => Promise<void>) | null = null;
    mockSetBackgroundMessageHandler.mockImplementation(
      (handler: (msg: unknown) => Promise<void>) => {
        capturedHandler = handler;
      },
    );

    registerBackgroundMessageHandler();

    expect(capturedHandler).not.toBeNull();
    await capturedHandler!(makeMessage({type: 'ORDER_UPDATE'}));
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
  });
});
