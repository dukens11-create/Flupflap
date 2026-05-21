import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { isGarageSalePubliclyVisible } from '@/lib/garage-sale-visibility';
import {
  LIVE_ENGAGEMENT_EVENTS,
  LIVE_ENGAGEMENT_SIGNAL_KINDS,
  getLiveEngagementActorId,
  normalizeGuestId,
  resolveLiveEngagementContext,
} from '@/lib/live-engagement';
import { applyRateLimitAsync } from '@/lib/security';

export const dynamic = 'force-dynamic';

const DEFAULT_GUEST_NAME = 'Guest';

type Params = { params: Promise<{ id: string }> };

/** GET /api/garage-sales/[id]/chat — fetch recent messages (public) */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const url = new URL(req.url);
  const since = url.searchParams.get('since');
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;

  const sale = await prisma.garageSale.findUnique({
    where: { id },
    select: { status: true, paymentStatus: true, isArchived: true, isSpam: true, isLive: true, startDate: true, endDate: true, sellerId: true },
  });
  if (!sale || (!isGarageSalePubliclyVisible(sale) && sale.sellerId !== userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const messages = await prisma.garageSaleChat.findMany({
    where: {
      saleId: id,
      isHidden: false,
      ...(since ? { createdAt: { gt: new Date(since) } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: { id: true, userId: true, guestName: true, message: true, createdAt: true },
  });

  return NextResponse.json({ messages, isLive: sale.isLive });
}

/** POST /api/garage-sales/[id]/chat — post a chat message */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;

  const sale = await prisma.garageSale.findUnique({
    where: { id },
    select: { status: true, paymentStatus: true, isArchived: true, isSpam: true, isLive: true, startDate: true, endDate: true, liveStartedAt: true },
  });
  if (!sale || !isGarageSalePubliclyVisible(sale)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!sale.isLive) {
    return NextResponse.json({ error: 'Live session is not active' }, { status: 422 });
  }

  const session = await getServerSession(authOptions);
  const limit = await applyRateLimitAsync({
    request: req,
    key: 'garage-sales:chat',
    windowMs: 60 * 1000,
    max: 30,
    userId: session?.user?.id,
  });
  if (limit.limited) {
    return NextResponse.json(
      { error: 'Too many messages. Please wait before sending another.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { message, guestName, guestId, liveSessionId, roomId } = body as {
    message?: string;
    guestName?: string;
    guestId?: string;
    liveSessionId?: string | null;
    roomId?: string;
  };
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }
  if (message.trim().length > 500) {
    return NextResponse.json({ error: 'Message too long (max 500 chars)' }, { status: 400 });
  }

  const userId = session?.user?.id ?? null;
  const resolvedGuestId = !userId ? normalizeGuestId(guestId) : null;
  let resolvedGuestName: string | null = null;
  if (!userId) {
    const trimmedName = typeof guestName === 'string' ? guestName.trim() : '';
    resolvedGuestName = trimmedName ? trimmedName.slice(0, 50) : DEFAULT_GUEST_NAME;
  }
  const liveContext = resolveLiveEngagementContext(id, sale.liveStartedAt ?? null, { liveSessionId, roomId });
  const actorId = getLiveEngagementActorId(userId, resolvedGuestId);

  console.info('[garage-sale-chat] message send attempt', {
    saleId: id,
    liveSessionId: liveContext.liveSessionId,
    receivedLiveSessionId: liveContext.receivedLiveSessionId,
    roomId: liveContext.roomId,
    receivedRoomId: liveContext.receivedRoomId,
    roomMatches: liveContext.roomMatches,
    liveSessionMatches: liveContext.liveSessionMatches,
    actorId,
  });

  try {
    const msg = await prisma.$transaction(async (tx) => {
      const createdMessage = await tx.garageSaleChat.create({
        data: {
          saleId: id,
          userId,
          guestName: resolvedGuestName,
          message: message.trim(),
        },
        select: { id: true, userId: true, guestName: true, message: true, createdAt: true },
      });

      await tx.garageSaleLiveSignal.create({
        data: {
          saleId: id,
          sender: 'BUYER',
          kind: LIVE_ENGAGEMENT_SIGNAL_KINDS.MESSAGE_SENT,
          payload: {
            event: LIVE_ENGAGEMENT_EVENTS.MESSAGE_SENT,
            roomId: liveContext.roomId,
            liveSessionId: liveContext.liveSessionId,
            actorId,
            message: {
              id: createdMessage.id,
              userId: createdMessage.userId,
              guestName: createdMessage.guestName,
              message: createdMessage.message,
              createdAt: createdMessage.createdAt.toISOString(),
            },
          },
        },
      });

      return createdMessage;
    });

    console.info('[garage-sale-chat] live_message_sent emitted', {
      saleId: id,
      messageId: msg.id,
      liveSessionId: liveContext.liveSessionId,
      roomId: liveContext.roomId,
      actorId,
    });

    return NextResponse.json({
      ...msg,
      roomId: liveContext.roomId,
      liveSessionId: liveContext.liveSessionId,
      event: LIVE_ENGAGEMENT_EVENTS.MESSAGE_SENT,
    }, { status: 201 });
  } catch (error) {
    console.error('[garage-sale-chat] message save error', {
      saleId: id,
      liveSessionId: liveContext.liveSessionId,
      actorId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ error: 'Failed to save live chat message' }, { status: 500 });
  }
}
