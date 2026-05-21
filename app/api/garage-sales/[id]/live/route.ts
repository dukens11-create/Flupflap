import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import {
  getGarageSaleLiveControlsBlockMessage,
  getGarageSaleVisibilityBlockReason,
  isGarageSalePubliclyVisible,
} from '@/lib/garage-sale-visibility';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** POST /api/garage-sales/[id]/live — start or end a live session (owner only) */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sale = await prisma.garageSale.findUnique({
    where: { id },
    select: {
      id: true,
      sellerId: true,
      status: true,
      isLive: true,
      paymentStatus: true,
      isArchived: true,
      isSpam: true,
      startDate: true,
      endDate: true,
    },
  });
  if (!sale) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (sale.sellerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = (body as { action?: string })?.action;
  if (action !== 'start' && action !== 'end' && action !== 'restart') {
    return NextResponse.json({ error: 'action must be "start", "end", or "restart"' }, { status: 400 });
  }

  const visibilityBlockReason = getGarageSaleVisibilityBlockReason(sale);

  if (action === 'start' && visibilityBlockReason !== null) {
    return NextResponse.json({ error: getGarageSaleLiveControlsBlockMessage(sale, visibilityBlockReason) }, { status: 422 });
  }

  const now = new Date();

  if (action === 'restart') {
    if (!sale.isLive) {
      return NextResponse.json({ error: 'Live session is not active' }, { status: 422 });
    }
    // Clear all stale signals and reset liveStartedAt so buyer signal polling
    // starts fresh and old ANSWER/ICE signals are not applied to the new peer.
    // Also end any active guest requests since the stream is restarting.
    const restarted = (await prisma.$transaction([
      prisma.garageSaleLiveSignal.deleteMany({ where: { saleId: id } }),
      prisma.garageSaleGuestRequest.updateMany({
        where: { saleId: id, status: { in: ['PENDING', 'APPROVED', 'ACTIVE'] } },
        data: { status: 'ENDED', updatedAt: now },
      }),
      prisma.garageSale.update({
        where: { id },
        data: { liveStartedAt: now },
        select: { id: true, isLive: true, liveStartedAt: true },
      }),
    ]))[2];
    return NextResponse.json(restarted);
  }

  const updated = action === 'start'
    ? (await prisma.$transaction([
      prisma.garageSaleLiveSignal.deleteMany({ where: { saleId: id } }),
      prisma.garageSaleGuestRequest.deleteMany({ where: { saleId: id } }),
      prisma.garageSale.update({
        where: { id },
        data: { isLive: true, liveStartedAt: now },
        select: { id: true, isLive: true, liveStartedAt: true },
      }),
    ]))[2]
    : await prisma.$transaction(async (tx) => {
      await tx.garageSaleLiveSignal.deleteMany({ where: { saleId: id } });
      await tx.garageSaleGuestRequest.updateMany({
        where: { saleId: id, status: { in: ['PENDING', 'APPROVED', 'ACTIVE'] } },
        data: { status: 'ENDED', updatedAt: now },
      });
      return tx.garageSale.update({
        where: { id },
        data: { isLive: false, liveStartedAt: null },
        select: { id: true, isLive: true, liveStartedAt: true },
      });
    });

  return NextResponse.json(updated);
}

/** GET /api/garage-sales/[id]/live — poll live status (public) */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;

  const sale = await prisma.garageSale.findUnique({
    where: { id },
    select: { id: true, isLive: true, liveStartedAt: true, status: true, paymentStatus: true, isArchived: true, isSpam: true, startDate: true, endDate: true },
  });
  if (!sale) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!isGarageSalePubliclyVisible(sale)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ id: sale.id, isLive: sale.isLive, liveStartedAt: sale.liveStartedAt });
}
