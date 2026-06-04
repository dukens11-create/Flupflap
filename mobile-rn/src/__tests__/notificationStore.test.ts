/**
 * Tests for the notification Zustand store.
 *
 * Verifies:
 *  - refresh() populates notifications and unreadCount
 *  - markRead() optimistically clears readAt and decrements unreadCount
 *  - markAllRead() clears all readAt values and sets unreadCount to 0
 *  - markRead() rolls back on API failure
 *  - invalidate() sets isStale to true
 */

// Mock the notification service before importing the store
jest.mock('@/services/notificationService', () => ({
  fetchNotifications: jest.fn(),
  markNotificationsRead: jest.fn(),
}));

import {useNotificationStore} from '@/store/notificationStore';
import {
  fetchNotifications,
  markNotificationsRead,
} from '@/services/notificationService';
import type {SellerNotification} from '@/types/notification';

const mockFetch = fetchNotifications as jest.MockedFunction<
  typeof fetchNotifications
>;
const mockMarkRead = markNotificationsRead as jest.MockedFunction<
  typeof markNotificationsRead
>;

const makeNotif = (
  id: string,
  read = false,
  type: SellerNotification['type'] = 'ORDER_UPDATE',
): SellerNotification => ({
  id,
  type,
  title: `Notification ${id}`,
  body: 'A buyer purchased an item.',
  link: '/seller',
  data: {orderId: `ord_${id}`, purchasedAt: new Date().toISOString()},
  dedupeKey: `key_${id}`,
  readAt: read ? new Date().toISOString() : null,
  createdAt: new Date().toISOString(),
});

beforeEach(() => {
  // Reset store state between tests
  useNotificationStore.setState({
    notifications: [],
    unreadCount: 0,
    isLoading: false,
    isStale: true,
    error: null,
  });
  jest.clearAllMocks();
});

describe('notificationStore — refresh', () => {
  it('populates notifications and unreadCount on success', async () => {
    const notifs = [makeNotif('1'), makeNotif('2', true)];
    mockFetch.mockResolvedValueOnce({notifications: notifs, unreadCount: 1});

    await useNotificationStore.getState().refresh();

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(2);
    expect(state.unreadCount).toBe(1);
    expect(state.isLoading).toBe(false);
    expect(state.isStale).toBe(false);
    expect(state.error).toBeNull();
  });

  it('sets error on fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await useNotificationStore.getState().refresh();

    const state = useNotificationStore.getState();
    expect(state.error).toBe('Network error');
    expect(state.isLoading).toBe(false);
  });
});

describe('notificationStore — markRead', () => {
  it('optimistically marks specific notifications as read and decrements count', async () => {
    mockMarkRead.mockResolvedValueOnce(undefined);
    useNotificationStore.setState({
      notifications: [makeNotif('1'), makeNotif('2')],
      unreadCount: 2,
    });

    await useNotificationStore.getState().markRead(['1']);

    const state = useNotificationStore.getState();
    const n1 = state.notifications.find(n => n.id === '1');
    expect(n1?.readAt).not.toBeNull();
    expect(state.unreadCount).toBe(1);
    expect(mockMarkRead).toHaveBeenCalledWith({ids: ['1']});
  });

  it('rolls back to server state when API call fails', async () => {
    const notifs = [makeNotif('1'), makeNotif('2')];
    mockMarkRead.mockRejectedValueOnce(new Error('API error'));
    // refresh() will be called on rollback
    mockFetch.mockResolvedValueOnce({notifications: notifs, unreadCount: 2});

    useNotificationStore.setState({
      notifications: notifs,
      unreadCount: 2,
    });

    await useNotificationStore.getState().markRead(['1']);

    // After rollback the store should reflect server state
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when ids array is empty', async () => {
    await useNotificationStore.getState().markRead([]);
    expect(mockMarkRead).not.toHaveBeenCalled();
  });
});

describe('notificationStore — markAllRead', () => {
  it('sets readAt on all notifications and resets unreadCount to 0', async () => {
    mockMarkRead.mockResolvedValueOnce(undefined);
    useNotificationStore.setState({
      notifications: [makeNotif('1'), makeNotif('2'), makeNotif('3')],
      unreadCount: 3,
    });

    await useNotificationStore.getState().markAllRead();

    const state = useNotificationStore.getState();
    expect(state.unreadCount).toBe(0);
    state.notifications.forEach(n => {
      expect(n.readAt).not.toBeNull();
    });
    expect(mockMarkRead).toHaveBeenCalledWith({markAllRead: true});
  });
});

describe('notificationStore — invalidate', () => {
  it('sets isStale to true', () => {
    useNotificationStore.setState({isStale: false});
    useNotificationStore.getState().invalidate();
    expect(useNotificationStore.getState().isStale).toBe(true);
  });
});
