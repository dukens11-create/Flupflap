import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { isAllowedMessageAttachmentUrl } from '@/lib/message-attachments';
import {
  getInboxConversations,
  getMessageSpamError,
  MESSAGE_MAX_LENGTH,
  normalizeMessageBody,
} from '@/lib/messages';

const startSchema = z.object({
  productId: z.string().min(1),
  body: z.string().max(MESSAGE_MAX_LENGTH).optional().default(''),
  attachmentUrl: z.string().url().optional().nullable(),
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

  const conversations = await getInboxConversations(session.user.id);
  return NextResponse.json(conversations);
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

  const body = normalizeMessageBody(parsed.body);
  const attachmentUrl = parsed.attachmentUrl?.trim() || null;

  if (!body && !attachmentUrl) {
    return NextResponse.json(
      { error: 'Add a message or attach a photo before sending.' },
      { status: 400 },
    );
  }

  if (attachmentUrl && !isAllowedMessageAttachmentUrl(attachmentUrl)) {
    return NextResponse.json(
      { error: 'Please upload your photo using the attachment picker.' },
      { status: 400 },
    );
  }

  const { productId } = parsed;

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

  const spamError = await getMessageSpamError({ senderId: buyerId, body });
  if (spamError) {
    return NextResponse.json({ error: spamError }, { status: 429 });
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
      body,
      attachmentUrl,
    },
  });

  return NextResponse.json({ conversationId: conversation.id, messageId: message.id }, { status: 201 });
}
