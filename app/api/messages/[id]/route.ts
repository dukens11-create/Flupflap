import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { NotificationType } from '@prisma/client';
import { createNotification } from '@/lib/notifications';
import { z } from 'zod';

const MESSAGE_MAX_LENGTH = 2000;

const replySchema = z.object({
  body: z.string().min(1).max(MESSAGE_MAX_LENGTH),
});

async function getConversationForUser(id: string, userId: string) {
  return prisma.conversation.findFirst({
    where: {
      id,
      OR: [{ buyerId: userId }, { sellerId: userId }],
    },
  });
}

/**
 * GET /api/messages/[id]
 * Returns a conversation with all messages. Marks unread messages as read.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  const conversation = await prisma.conversation.findFirst({
    where: {
      id,
      OR: [{ buyerId: userId }, { sellerId: userId }],
    },
    include: {
      buyer: { select: { id: true, name: true } },
      seller: { select: { id: true, name: true } },
      product: {
        select: { id: true, title: true, imageUrl: true, priceCents: true, status: true },
      },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { sender: { select: { id: true, name: true } } },
      },
    },
  });

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  // Mark messages sent by the other party as read
  const unreadIds = conversation.messages
    .filter((m) => m.senderId !== userId && m.readAt === null)
    .map((m) => m.id);

  if (unreadIds.length > 0) {
    await prisma.message.updateMany({
      where: { id: { in: unreadIds } },
      data: { readAt: new Date() },
    });
  }

  return NextResponse.json(conversation);
}

/**
 * POST /api/messages/[id]
 * Send a reply in an existing conversation.
 * Body: { body }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  const conversation = await getConversationForUser(id, userId);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  let parsed: z.infer<typeof replySchema>;
  try {
    const json = await req.json();
    parsed = replySchema.parse(json);
  } catch {
    return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
  }

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: userId,
        body: parsed.body.trim(),
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    }),
  ]);

  const recipientId = conversation.buyerId === userId ? conversation.sellerId : conversation.buyerId;
  await createNotification({
    userId: recipientId,
    type: NotificationType.MESSAGE,
    title: 'New message in your conversation',
    body: parsed.body.trim().length > 120 ? `${parsed.body.trim().slice(0, 117)}...` : parsed.body.trim(),
    link: `/messages/${conversation.id}`,
    data: { conversationId: conversation.id },
  });

  return NextResponse.json({ messageId: message.id }, { status: 201 });
}
