import { prisma } from '@/lib/db';
import {
  isAllowedMessageAttachmentUrl,
  MESSAGE_ATTACHMENT_ALLOWED_TYPES,
  MESSAGE_ATTACHMENT_MAX_BYTES,
  MESSAGE_UPLOAD_FOLDER,
} from '@/lib/message-attachments';

export const MESSAGE_MAX_LENGTH = 2000;
export const MESSAGE_RATE_LIMIT_WINDOW_MINUTES = 10;
export const MESSAGE_RATE_LIMIT_MAX = 6;
export const MESSAGE_DUPLICATE_WINDOW_MINUTES = 2;
export const SELLER_RESPONSE_LOOKBACK_DAYS = 90;
export const SELLER_RESPONSE_WINDOW_HOURS = 24;

export function normalizeMessageBody(body?: string | null) {
  return (body ?? '').trim().replace(/\s+/g, ' ');
}

export function getMessagePreview(message?: { body: string; attachmentUrl?: string | null } | null) {
  if (!message) return '';

  const body = normalizeMessageBody(message.body);
  if (body && message.attachmentUrl) return `${body} · Photo`;
  if (body) return body;
  if (message.attachmentUrl) return '📷 Photo attachment';
  return '';
}

export async function getInboxConversations(userId: string) {
  const conversations = await prisma.conversation.findMany({
    where: {
      OR: [{ buyerId: userId }, { sellerId: userId }],
    },
    include: {
      buyer: { select: { id: true, name: true } },
      seller: { select: { id: true, name: true } },
      product: { select: { id: true, title: true, imageUrl: true, status: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          body: true,
          attachmentUrl: true,
          createdAt: true,
          senderId: true,
          readAt: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const unreadCounts = await Promise.all(
    conversations.map((conversation) =>
      prisma.message.count({
        where: {
          conversationId: conversation.id,
          senderId: { not: userId },
          readAt: null,
        },
      }),
    ),
  );

  return conversations.map((conversation, index) => ({
    ...conversation,
    unreadCount: unreadCounts[index],
    unread: unreadCounts[index] > 0,
  }));
}

export async function getMessageSpamError({
  senderId,
  body,
}: {
  senderId: string;
  body: string;
}) {
  const normalizedBody = normalizeMessageBody(body);
  const rateLimitWindowStart = new Date(
    Date.now() - MESSAGE_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  );

  const recentMessageCount = await prisma.message.count({
    where: {
      senderId,
      createdAt: { gte: rateLimitWindowStart },
    },
  });

  if (recentMessageCount >= MESSAGE_RATE_LIMIT_MAX) {
    return `You’re sending messages too quickly. Please wait a few minutes before trying again.`;
  }

  if (!normalizedBody) {
    return null;
  }

  const duplicateWindowStart = new Date(
    Date.now() - MESSAGE_DUPLICATE_WINDOW_MINUTES * 60 * 1000,
  );

  const recentMessages = await prisma.message.findMany({
    where: {
      senderId,
      createdAt: { gte: duplicateWindowStart },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { body: true },
  });

  const duplicateFound = recentMessages.some(
    (message) =>
      normalizeMessageBody(message.body).toLowerCase() === normalizedBody.toLowerCase(),
  );

  if (duplicateFound) {
    return 'Please avoid sending the same message repeatedly.';
  }

  return null;
}

export async function getSellerResponseStats(sellerId: string) {
  const now = Date.now();
  const lookbackStart = new Date(
    now - SELLER_RESPONSE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );

  const conversations = await prisma.conversation.findMany({
    where: {
      sellerId,
      updatedAt: { gte: lookbackStart },
    },
    select: {
      id: true,
      buyerId: true,
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { senderId: true, createdAt: true },
      },
    },
  });

  let eligibleCount = 0;
  let respondedCount = 0;
  let awaitingReplyCount = 0;

  for (const conversation of conversations) {
    const firstBuyerMessage = conversation.messages.find(
      (message) => message.senderId === conversation.buyerId,
    );
    const lastMessage = conversation.messages[conversation.messages.length - 1];

    if (lastMessage && lastMessage.senderId === conversation.buyerId) {
      awaitingReplyCount += 1;
    }

    if (!firstBuyerMessage || firstBuyerMessage.createdAt < lookbackStart) {
      continue;
    }

    const sellerReply = conversation.messages.find(
      (message) =>
        message.senderId === sellerId &&
        message.createdAt > firstBuyerMessage.createdAt,
    );

    const responseDeadline =
      firstBuyerMessage.createdAt.getTime() +
      SELLER_RESPONSE_WINDOW_HOURS * 60 * 60 * 1000;

    if (now >= responseDeadline) {
      eligibleCount += 1;

      if (sellerReply && sellerReply.createdAt.getTime() <= responseDeadline) {
        respondedCount += 1;
      }
    }
  }

  return {
    respondedCount,
    eligibleCount,
    awaitingReplyCount,
    responseRate:
      eligibleCount > 0 ? Math.round((respondedCount / eligibleCount) * 100) : null,
  };
}
