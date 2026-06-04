/**
 * Notification service — wraps GET /api/notifications and
 * PATCH /api/notifications for the FlupFlap React Native app.
 */
import {apiClient} from '@/services/apiClient';
import type {
  MarkReadInput,
  NotificationListResponse,
  SellerNotification,
} from '@/types/notification';

export class NotificationServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'NotificationServiceError';
  }
}

/**
 * Fetch the current user's notifications.
 * Returns up to 50 entries ordered newest-first plus an unread count,
 * matching GET /api/notifications.
 */
export async function fetchNotifications(): Promise<NotificationListResponse> {
  const res =
    await apiClient.get<NotificationListResponse>('/api/notifications');

  if (!res.ok || !res.data) {
    throw new NotificationServiceError(
      res.error ?? 'Failed to load notifications',
      res.status,
    );
  }

  return res.data;
}

/**
 * Mark one or more notifications as read.
 *
 * - Pass `{ids: [...]}` to mark specific notifications.
 * - Pass `{markAllRead: true}` to mark all unread notifications.
 */
export async function markNotificationsRead(
  input: MarkReadInput,
): Promise<void> {
  const res = await apiClient.patch<{ok: boolean}>(
    '/api/notifications',
    input,
  );

  if (!res.ok) {
    throw new NotificationServiceError(
      res.error ?? 'Failed to update notifications',
      res.status,
    );
  }
}

/**
 * Helper that returns a type-narrowed check for a seller purchase
 * notification based on its type and data fields.
 */
export function isSellerPurchaseNotification(
  n: SellerNotification,
): boolean {
  return (
    n.type === 'ORDER_UPDATE' &&
    n.data !== null &&
    typeof n.data === 'object' &&
    'orderId' in n.data
  );
}
