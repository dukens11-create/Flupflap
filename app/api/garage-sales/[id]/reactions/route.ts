import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { isGarageSalePubliclyVisible } from '@/lib/garage-sale-visibility';
import { applyRateLimitAsync } from '@/lib/security';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** GET /api/garage-sales/[id]/reactions — get total like count + recent reactions */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;

  const sale = await prisma.garageSale.findUnique({
    where: { id },
    select: { status: true, paymentStatus: true, isArchived: true, isSpam: true, isLive: true, startDate: true, endDate: true },
  });
  if (!sale || !isGarageSalePubliclyVisible(sale)) {
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
    select: { status: true, paymentStatus: true, isArchived: true, isSpam: true, isLive: true, startDate: true, endDate: true },
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

  const { type, guestId } = body as { type?: string; guestId?: string };
  const reactionType = type === 'heart' ? 'heart' : 'like';

  const userId = session?.user?.id ?? null;
  const resolvedGuestId = !userId && typeof guestId === 'string' && guestId.trim() ? guestId.trim().slice(0, 64) : null;

  const reaction = await prisma.garageSaleReaction.create({
    data: {
      saleId: id,
      userId,
      guestId: resolvedGuestId,
      type: reactionType,
    },
    select: { id: true, type: true, createdAt: true },
  });

  const totalLikes = await prisma.garageSaleReaction.count({ where: { saleId: id } });

  return NextResponse.json({ reaction, totalLikes }, { status: 201 });
}
