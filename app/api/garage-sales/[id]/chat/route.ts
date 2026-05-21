import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { isGarageSalePubliclyVisible } from '@/lib/garage-sale-visibility';
import {
  buildLiveEngagementIdentifiers,
  LIVE_ENGAGEMENT_EVENTS,
  LIVE_ENGAGEMENT_SIGNAL_KINDS,
  getLiveEngagementActorId,
  resolveLiveEngagementContext,
} from '@/lib/live-engagement';
import { applyRateLimitAsync } from '@/lib/security';

export const dynamic = 'force-dynamic';

const DEFAULT_AUTHENTICATED_BUYER_NAME = 'Anonymous Buyer';

type Params = { params: Promise<{ id: string }> };

function getPrismaErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function isMissingSellerIdColumnError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const prismaCode = getPrismaErrorCode(error);
  const errorMessage = error instanceof Error ? error.message : '';
  return prismaCode === 'P2022' && errorMessage.includes('sellerId');
}

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
    select: { status: true, paymentStatus: true, isArchived: true, isSpam: true, isLive: true, startDate: true, endDate: true, liveStartedAt: true, sellerId: true },
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

  const parsedBody = body as Record<string, unknown>;
  const message = typeof parsedBody.message === 'string' ? parsedBody.message : undefined;
  const liveSessionId = (typeof parsedBody.liveSessionId === 'string' || parsedBody.liveSessionId === null
    ? parsedBody.liveSessionId
    : (typeof parsedBody.live_session_id === 'string' || parsedBody.live_session_id === null
      ? parsedBody.live_session_id
      : undefined)) as string | null | undefined;
  const roomId = (typeof parsedBody.roomId === 'string'
    ? parsedBody.roomId
    : (typeof parsedBody.room_id === 'string' ? parsedBody.room_id : undefined)) as string | undefined;
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }
  if (message.trim().length > 500) {
    return NextResponse.json({ error: 'Message too long (max 500 chars)' }, { status: 400 });
  }

  const userId = session?.user?.id ?? null;
  if (!userId) {
    return NextResponse.json({ error: 'Please log in to chat' }, { status: 401 });
  }
  const sessionDisplayName = typeof session?.user?.name === 'string' ? session.user.name.trim() : '';
  const resolvedDisplayName = sessionDisplayName
    ? sessionDisplayName.slice(0, 50)
    : DEFAULT_AUTHENTICATED_BUYER_NAME;
  const liveContext = resolveLiveEngagementContext(id, sale.liveStartedAt ?? null, {
    roomId,
    room_id: parsedBody.room_id,
    liveSessionId,
    live_session_id: parsedBody.live_session_id,
    saleId: parsedBody.saleId,
    liveId: parsedBody.liveId,
    liveSaleId: parsedBody.liveSaleId,
    streamId: parsedBody.streamId,
  });
  if (!liveContext.saleMatches) {
    console.warn('[garage-sale-chat] sale identifier mismatch', {
      operation: 'chat.write.validate',
      saleId: id,
      receivedCanonicalSaleId: liveContext.receivedCanonicalSaleId,
      userId,
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ error: 'Live sale identifier mismatch' }, { status: 400 });
  }
  const actorId = getLiveEngagementActorId(userId, null);
  const insertCreatedAt = new Date();
  const identifiers = buildLiveEngagementIdentifiers(id);
  const insertPayload = {
    ...identifiers,
    roomId: liveContext.roomId,
    liveSessionId: liveContext.liveSessionId,
    userId,
    guestId: null,
    sellerId: sale.sellerId,
    displayName: resolvedDisplayName,
    message: message.trim(),
    createdAt: insertCreatedAt.toISOString(),
  };

  console.info('[garage-sale-chat] message send attempt', {
    saleId: id,
    liveSessionId: liveContext.liveSessionId,
    receivedLiveSessionId: liveContext.receivedLiveSessionId,
    roomId: liveContext.roomId,
    receivedRoomId: liveContext.receivedRoomId,
    roomMatches: liveContext.roomMatches,
    liveSessionMatches: liveContext.liveSessionMatches,
    actorId,
    operation: 'chat.write',
    timestamp: insertCreatedAt.toISOString(),
  });

  try {
    const createChatMessage = async (includeSellerId: boolean) => prisma.garageSaleChat.create({
      data: {
        saleId: id,
        userId,
        ...(includeSellerId ? { sellerId: sale.sellerId } : {}),
        guestName: resolvedDisplayName,
        message: insertPayload.message,
        createdAt: insertCreatedAt,
      },
      select: { id: true, userId: true, guestName: true, message: true, createdAt: true },
    });

    let msg;
    try {
      msg = await createChatMessage(true);
    } catch (chatInsertError) {
      if (!isMissingSellerIdColumnError(chatInsertError)) throw chatInsertError;
      console.warn('[garage-sale-chat] retrying chat write without sellerId column for backward compatibility', {
        operation: 'chat.write.retry_without_seller_id',
        saleId: id,
        userId,
        prismaCode: getPrismaErrorCode(chatInsertError),
        timestamp: new Date().toISOString(),
      });
      // TODO(garage-sale-chat): remove this fallback after all environments have the sellerId column.
      msg = await createChatMessage(false);
    }

    let signalEmitted = true;
    try {
      await prisma.garageSaleLiveSignal.create({
        data: {
          saleId: id,
          sender: 'BUYER',
          kind: LIVE_ENGAGEMENT_SIGNAL_KINDS.MESSAGE_SENT,
          payload: {
            event: LIVE_ENGAGEMENT_EVENTS.MESSAGE_SENT,
            ...identifiers,
            roomId: liveContext.roomId,
            liveSessionId: liveContext.liveSessionId,
            actorId,
            message: {
              id: msg.id,
              userId: msg.userId,
              guestName: msg.guestName,
              message: msg.message,
              createdAt: msg.createdAt.toISOString(),
            },
          },
        },
      });
    } catch (signalError) {
      signalEmitted = false;
      console.error('[garage-sale-chat] live_message_sent emit failed', {
        saleId: id,
        liveSessionId: liveContext.liveSessionId,
        roomId: liveContext.roomId,
        actorId,
        messageId: msg.id,
        operation: 'chat.signal.emit',
        timestamp: new Date().toISOString(),
        errorName: signalError instanceof Error ? signalError.name : 'unknown',
        errorMessage: signalError instanceof Error ? signalError.message : 'unknown',
        prismaCode: getPrismaErrorCode(signalError),
      });
    }

    console.info('[garage-sale-chat] live_message_sent emitted', {
      saleId: id,
      messageId: msg.id,
      liveSessionId: liveContext.liveSessionId,
      roomId: liveContext.roomId,
      actorId,
      signalEmitted,
      operation: 'chat.write.success',
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      ...msg,
      ...identifiers,
      roomId: liveContext.roomId,
      liveSessionId: liveContext.liveSessionId,
      event: LIVE_ENGAGEMENT_EVENTS.MESSAGE_SENT,
      signalEmitted,
    }, { status: 201 });
  } catch (error) {
    console.error('[garage-sale-chat] message save error', {
      saleId: id,
      liveSessionId: liveContext.liveSessionId,
      actorId,
      operation: 'chat.write.failed',
      timestamp: new Date().toISOString(),
      errorName: error instanceof Error ? error.name : 'unknown',
      errorMessage: error instanceof Error ? error.message : 'unknown',
      prismaCode: getPrismaErrorCode(error),
    });
    return NextResponse.json({ error: 'Failed to save live chat message' }, { status: 500 });
  }
}
