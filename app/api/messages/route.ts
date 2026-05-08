import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { evaluateMessageModeration, formatBlockedMessage } from '@/lib/moderation';
import { NotificationType } from '@prisma/client';
import { createNotification } from '@/lib/notifications';
import { z } from 'zod';

const MESSAGE_MAX_LENGTH = 2000;

const startSchema = z.object({
  productId: z.string().min(1),
  body: z.string().min(1).max(MESSAGE_MAX_LENGTH),
});

/**
 * GET /api/messages
 * Returns all conversations for the currently logged-in user (as buyer or seller).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  const conversations = await prisma.conversation.findMany({
    where: {
      OR: [{ buyerId: userId }, { sellerId: userId }],
    },
    include: {
      buyer: { select: { id: true, name: true } },
      seller: { select: { id: true, name: true } },
      product: { select: { id: true, title: true, imageUrl: true, status: true } },
      // Last message for preview
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, body: true, createdAt: true, senderId: true, readAt: true },
      },
      // Separate count of all unread messages from the other party
      _count: {
        select: {
          messages: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Compute per-conversation unread count using a separate aggregation query
  // to avoid relying on the single take:1 preview message.
  const unreadCounts = await Promise.all(
    conversations.map((conv) =>
      prisma.message.count({
        where: {
          conversationId: conv.id,
          senderId: { not: userId },
          readAt: null,
        },
      }),
    ),
  );

  const result = conversations.map((conv, i) => {
    const { _count: _, ...rest } = conv;
    return { ...rest, unreadCount: unreadCounts[i], unread: unreadCounts[i] > 0 };
  });

  return NextResponse.json(result);
}

/**
 * POST /api/messages
 * Start a new conversation (or return the existing one) and send the first message.
 * Body: { productId, body }
 * Only buyers (CUSTOMER or SELLER buying from another seller) can start conversations.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let parsed: z.infer<typeof startSchema>;
  try {
    const json = await req.json();
    parsed = startSchema.parse(json);
  } catch {
    return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
  }

  const { productId, body } = parsed;
  const trimmedBody = body.trim();
  const moderation = evaluateMessageModeration(trimmedBody);

  if (moderation.decision === 'block') {
    return NextResponse.json(
      {
        error: formatBlockedMessage(moderation),
        moderation,
      },
      { status: 422 },
    );
  }

  // Load product to get seller info
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, sellerId: true, status: true },
  });

  if (!product || product.status === 'REJECTED') {
    return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
  }

  const buyerId = session.user.id;
  const sellerId = product.sellerId;

  if (buyerId === sellerId) {
    return NextResponse.json({ error: 'You cannot message yourself.' }, { status: 400 });
  }

  // Upsert conversation (one thread per buyer/seller/product)
  const conversation = await prisma.conversation.upsert({
    where: {
      buyerId_sellerId_productId: { buyerId, sellerId, productId },
    },
    create: { buyerId, sellerId, productId },
    update: { updatedAt: new Date() },
  });

  // Create the message
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: buyerId,
      body: trimmedBody,
    },
  });

  await createNotification({
    userId: sellerId,
    type: NotificationType.MESSAGE,
    title: 'New message from a buyer',
    body: trimmedBody.length > 120 ? `${trimmedBody.slice(0, 117)}...` : trimmedBody,
    link: `/messages/${conversation.id}`,
    data: { conversationId: conversation.id, productId },
  });

  return NextResponse.json({ conversationId: conversation.id, messageId: message.id }, { status: 201 });
}
