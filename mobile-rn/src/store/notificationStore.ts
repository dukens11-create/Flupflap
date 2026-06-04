/**
 * Zustand store for seller notifications.
 *
 * Provides:
 *  - notifications list (newest-first)
 *  - unread count
 *  - loading / error state
 *  - refresh() — fetches latest notifications from the API
 *  - invalidate() — marks data as stale (e.g. from a background push)
 *  - markRead(ids) / markAllRead() — optimistically clears readAt locally
 *    and calls the API
 */
import {create} from 'zustand';
import {
  fetchNotifications,
  markNotificationsRead,
} from '@/services/notificationService';
import type {SellerNotification} from '@/types/notification';

interface NotificationState {
  notifications: SellerNotification[];
  unreadCount: number;
  isLoading: boolean;
  isStale: boolean;
  error: string | null;

  /** Fetch (or re-fetch) notifications from the backend. */
  refresh: () => Promise<void>;

  /**
   * Mark the store data as stale so the next foreground activation
   * triggers a refresh. Used by the background push handler.
   */
  invalidate: () => void;

  /**
   * Mark specific notification IDs as read — applies optimistic update
   * then persists via API.
   */
  markRead: (ids: string[]) => Promise<void>;

  /** Mark ALL unread notifications as read. */
  markAllRead: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  isStale: true,
  error: null,

  refresh: async () => {
    if (get().isLoading) return;
    set({isLoading: true, error: null});
    try {
      const result = await fetchNotifications();
      set({
        notifications: result.notifications,
        unreadCount: result.unreadCount,
        isLoading: false,
        isStale: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load notifications',
      });
    }
  },

  invalidate: () => {
    set({isStale: true});
  },

  markRead: async (ids: string[]) => {
    if (ids.length === 0) return;

    // Optimistic update
    set(state => ({
      notifications: state.notifications.map(n =>
        ids.includes(n.id) ? {...n, readAt: new Date().toISOString()} : n,
      ),
      unreadCount: Math.max(
        0,
        state.unreadCount -
          state.notifications.filter(n => ids.includes(n.id) && !n.readAt)
            .length,
      ),
    }));

    try {
      await markNotificationsRead({ids});
    } catch {
      // Revert on failure by refreshing from server
      await get().refresh();
    }
  },

  markAllRead: async () => {
    // Optimistic update
    const now = new Date().toISOString();
    set(state => ({
      notifications: state.notifications.map(n => ({
        ...n,
        readAt: n.readAt ?? now,
      })),
      unreadCount: 0,
    }));

    try {
      await markNotificationsRead({markAllRead: true});
    } catch {
      // Revert on failure
      await get().refresh();
    }
  },
}));
