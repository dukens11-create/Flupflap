import { NotificationType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { sellerPurchaseEmail } from '@/lib/email-templates';
import { sendPushNotification } from '@/lib/push-notifications';
import { appUrl } from '@/lib/stripe';
import { logError, logInfo, logWarn } from '@/lib/logger';

export type SellerPurchaseSummary = {
  sellerId: string;
  sellerEmail?: string | null;
  sellerName?: string | null;
  itemTitles: string[];
  itemCount: number;
};

export type NotifySellersOfPaidOrderInput = {
  purchaseStatus: string;
  orderId: string;
  purchasedAt: Date;
  buyerName?: string | null;
  sellers: SellerPurchaseSummary[];
};

type SellerPurchaseNotificationDeps = {
  hasDedupeNotification: (dedupeKey: string) => Promise<boolean>;
  createInAppNotification: typeof createNotification;
  sendEmail: typeof sendEmail;
  sendPush: typeof sendPushNotification;
};

const defaultDeps: SellerPurchaseNotificationDeps = {
  hasDedupeNotification: async (dedupeKey: string) => {
    const existing = await prisma.notification.findUnique({
      where: { dedupeKey },
      select: { id: true },
    });
    return !!existing;
  },
  createInAppNotification: createNotification,
  sendEmail,
  sendPush: sendPushNotification,
};

function summarizeBuyer(name?: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return 'A buyer';
  const [firstName] = trimmed.split(/\s+/);
  return `Buyer ${firstName}`;
}

function summarizeItems(itemTitles: string[], itemCount: number): string {
  const normalizedTitles = Array.from(new Set(itemTitles.map((title) => title.trim()).filter(Boolean)));
  if (normalizedTitles.length === 0) {
    return `${itemCount} item${itemCount === 1 ? '' : 's'}`;
  }
  if (normalizedTitles.length === 1) {
    return normalizedTitles[0];
  }
  return `${normalizedTitles[0]} and ${itemCount - 1} more item${itemCount - 1 === 1 ? '' : 's'}`;
}

export async function notifySellersOfPaidOrder(
  input: NotifySellersOfPaidOrderInput,
  deps: SellerPurchaseNotificationDeps = defaultDeps,
): Promise<void> {
  if (input.purchaseStatus !== 'PAID') {
    return;
  }

  const purchasedAtIso = input.purchasedAt.toISOString();
  const buyerSummary = summarizeBuyer(input.buyerName);

  for (const seller of input.sellers) {
    const dedupeKey = `seller-purchase:${input.orderId}:${seller.sellerId}`;
    const channelLink = `/seller/orders-to-ship?orderId=${encodeURIComponent(input.orderId)}`;
    const itemSummary = summarizeItems(seller.itemTitles, seller.itemCount);
    const title = 'New purchase received';
    const body = `${buyerSummary} purchased ${itemSummary}.`;
    const channelData = {
      orderId: input.orderId,
      buyerSummary,
      itemSummary,
      purchasedAt: purchasedAtIso,
      actionPath: channelLink,
    };

    const alreadyNotified = await deps.hasDedupeNotification(dedupeKey);
    if (alreadyNotified) {
      logInfo('Seller purchase notification skipped: duplicate event', {
        tag: 'seller-purchase-notifications',
        orderId: input.orderId,
        sellerId: seller.sellerId,
      });
      continue;
    }

    try {
      await deps.createInAppNotification({
        userId: seller.sellerId,
        type: NotificationType.ORDER_UPDATE,
        title,
        body,
        link: channelLink,
        data: channelData,
        dedupeKey,
      });
      logInfo('Seller purchase in-app notification sent', {
        tag: 'seller-purchase-notifications',
        orderId: input.orderId,
        sellerId: seller.sellerId,
      });
    } catch (err) {
      logError('Seller purchase in-app notification failed', err, {
        tag: 'seller-purchase-notifications',
        orderId: input.orderId,
        sellerId: seller.sellerId,
      });
    }

    if (seller.sellerEmail) {
      const { subject, html } = sellerPurchaseEmail({
        sellerName: seller.sellerName,
        buyerSummary,
        itemSummary,
        orderReference: input.orderId,
        purchasedAtIso,
        actionUrl: `${appUrl}${channelLink}`,
      });

      const emailSent = await deps.sendEmail(seller.sellerEmail, subject, html);
      if (emailSent) {
        logInfo('Seller purchase email sent', {
          tag: 'seller-purchase-notifications',
          orderId: input.orderId,
          sellerId: seller.sellerId,
        });
      } else {
        logWarn('Seller purchase email failed', {
          tag: 'seller-purchase-notifications',
          orderId: input.orderId,
          sellerId: seller.sellerId,
        });
      }
    } else {
      logWarn('Seller purchase email skipped: missing seller email', {
        tag: 'seller-purchase-notifications',
        orderId: input.orderId,
        sellerId: seller.sellerId,
      });
    }

    const pushSent = await deps.sendPush({
      userId: seller.sellerId,
      title,
      body,
      link: channelLink,
      data: channelData,
    });

    if (pushSent) {
      logInfo('Seller purchase push notification sent', {
        tag: 'seller-purchase-notifications',
        orderId: input.orderId,
        sellerId: seller.sellerId,
      });
    } else {
      logWarn('Seller purchase push notification failed', {
        tag: 'seller-purchase-notifications',
        orderId: input.orderId,
        sellerId: seller.sellerId,
      });
    }
  }
}
