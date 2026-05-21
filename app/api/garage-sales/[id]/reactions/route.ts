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

type Params = { params: Promise<{ id: string }> };
type ReactionDuplicateWhere =
  | { saleId: string; userId: string; createdAt?: { gte: Date } }
  | { saleId: string; guestId: string; createdAt?: { gte: Date } };

/** GET /api/garage-sales/[id]/reactions — get total like count + recent reactions */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;

  const sale = await prisma.garageSale.findUnique({
    where: { id },
    select: { status: true, paymentStatus: true, isArchived: true, isSpam: true, isLive: true, startDate: true, endDate: true, sellerId: true },
  });
  if (!sale || (!isGarageSalePubliclyVisible(sale) && sale.sellerId !== userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [totalLikes, recentReactions] = await Promise.all([
    prisma.garageSaleReaction.count({ where: { saleId: id } }),
    prisma.garageSaleReaction.findMany({
      where: { saleId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, type: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({ totalLikes, recentReactions, isLive: sale.isLive });
}

/** POST /api/garage-sales/[id]/reactions — buyer sends a like/heart reaction */
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
    key: 'garage-sales:reactions',
    windowMs: 60 * 1000,
    max: 60,
    userId: session?.user?.id,
  });
  if (limit.limited) {
    return NextResponse.json(
      { error: 'Too many reactions. Please wait before sending another.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const { type, guestId, liveSessionId, roomId } = body as {
    type?: string;
    guestId?: string;
    liveSessionId?: string | null;
    roomId?: string;
  };
  const reactionType = type === 'heart' ? 'heart' : 'like';
  const userId = session?.user?.id ?? null;
  const resolvedGuestId = !userId ? normalizeGuestId(guestId) : null;
  const actorId = getLiveEngagementActorId(userId, resolvedGuestId);
  const liveContext = resolveLiveEngagementContext(id, sale.liveStartedAt ?? null, { liveSessionId, roomId });

  console.info('[garage-sale-reactions] like event received', {
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
    const liveSessionCreatedAtFilter = sale.liveStartedAt ? { gte: sale.liveStartedAt } : undefined;
    let duplicateWhere: ReactionDuplicateWhere | null = null;

    if (userId) {
      duplicateWhere = { saleId: id, userId, createdAt: liveSessionCreatedAtFilter };
    } else if (resolvedGuestId) {
      duplicateWhere = { saleId: id, guestId: resolvedGuestId, createdAt: liveSessionCreatedAtFilter };
    }

    const existingReaction = duplicateWhere
      ? await prisma.garageSaleReaction.findFirst({
        where: duplicateWhere,
        orderBy: { createdAt: 'desc' },
        select: { id: true, type: true, createdAt: true },
      })
      : null;

    const reaction = existingReaction ?? await prisma.garageSaleReaction.create({
      data: {
        saleId: id,
        userId,
        guestId: resolvedGuestId,
        type: reactionType,
      },
      select: { id: true, type: true, createdAt: true },
    });

    const totalLikes = await prisma.garageSaleReaction.count({ where: { saleId: id } });

    await prisma.garageSaleLiveSignal.create({
      data: {
        saleId: id,
        sender: 'BUYER',
        kind: LIVE_ENGAGEMENT_SIGNAL_KINDS.LIKES_UPDATE,
        payload: {
          event: LIVE_ENGAGEMENT_EVENTS.LIKES_UPDATE,
          roomId: liveContext.roomId,
          liveSessionId: liveContext.liveSessionId,
          actorId,
          totalLikes,
          reactionId: reaction.id,
          deduplicated: Boolean(existingReaction),
        },
      },
    });

    console.info('[garage-sale-reactions] live_likes_update emitted', {
      saleId: id,
      liveSessionId: liveContext.liveSessionId,
      roomId: liveContext.roomId,
      totalLikes,
      actorId,
      deduplicated: Boolean(existingReaction),
    });

    return NextResponse.json({
      reaction,
      totalLikes,
      deduplicated: Boolean(existingReaction),
      roomId: liveContext.roomId,
      liveSessionId: liveContext.liveSessionId,
      event: LIVE_ENGAGEMENT_EVENTS.LIKES_UPDATE,
    }, { status: existingReaction ? 200 : 201 });
  } catch (error) {
    console.error('[garage-sale-reactions] like save error', {
      saleId: id,
      liveSessionId: liveContext.liveSessionId,
      actorId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ error: 'Failed to save live reaction' }, { status: 500 });
  }
}
