import { logError, logInfo, logWarn } from '@/lib/logger';

export type PushNotificationInput = {
  userId: string;
  title: string;
  body: string;
  link?: string | null;
  data?: Record<string, unknown>;
};

type PushWebhookPayload = {
  recipientUserId: string;
  title: string;
  body: string;
  link: string | null;
  data: Record<string, unknown>;
};

/**
 * Dispatch a push notification through the configured push webhook provider.
 *
 * When PUSH_NOTIFICATION_WEBHOOK_URL is not configured, this safely no-ops and
 * returns false so callers can log a skipped push dispatch.
 */
export async function sendPushNotification(input: PushNotificationInput): Promise<boolean> {
  const webhookUrl = process.env.PUSH_NOTIFICATION_WEBHOOK_URL;
  if (!webhookUrl) {
    logWarn('Push notification skipped: provider not configured', {
      tag: 'push/send',
      userId: input.userId,
    });
    return false;
  }

  const payload: PushWebhookPayload = {
    recipientUserId: input.userId,
    title: input.title,
    body: input.body,
    link: input.link ?? null,
    data: input.data ?? {},
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logWarn('Push notification provider returned non-OK response', {
        tag: 'push/send',
        userId: input.userId,
        status: response.status,
      });
      return false;
    }

    logInfo('Push notification sent', {
      tag: 'push/send',
      userId: input.userId,
    });
    return true;
  } catch (err) {
    logError('Push notification dispatch failed', err, {
      tag: 'push/send',
      userId: input.userId,
    });
    return false;
  }
}
