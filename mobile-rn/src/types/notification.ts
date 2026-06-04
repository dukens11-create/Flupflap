/**
 * Notification domain types mirroring the FlupFlap backend Prisma schema.
 */

/** Subset of NotificationType values used on the seller side. */
export type NotificationType =
  | 'ORDER_UPDATE'
  | 'PAYOUT'
  | 'MESSAGE'
  | 'REVIEW'
  | 'SYSTEM';

/**
 * Structured data attached to seller purchase notifications.
 * The `data` field on the Notification model is `Json?` so every key is
 * optional — always apply defensive checks before reading.
 */
export interface SellerPurchaseNotificationData {
  orderId?: string;
  purchasedAt?: string;
  itemTitles?: string[];
  itemCount?: number;
  buyerName?: string;
}

/** A single notification record as returned by GET /api/notifications. */
export interface SellerNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  data: SellerPurchaseNotificationData | Record<string, unknown> | null;
  dedupeKey: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Response shape for GET /api/notifications. */
export interface NotificationListResponse {
  notifications: SellerNotification[];
  unreadCount: number;
}

/**
 * Push notification data payload sent by the backend.
 * All fields are optional because payloads from different providers may vary.
 */
export interface PushNotificationPayload {
  type?: NotificationType;
  orderId?: string;
  purchasedAt?: string;
  link?: string;
  notificationId?: string;
  [key: string]: string | undefined;
}

/** Arguments passed to PATCH /api/notifications to mark notifications read. */
export type MarkReadInput =
  | {ids: string[]; markAllRead?: never}
  | {markAllRead: true; ids?: never};
