import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { deriveGarageSaleLifecycle } from '@/lib/garage-sale-lifecycle';
import { getGarageSaleLiveControlsBlockMessage } from '@/lib/garage-sale-visibility';

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
  if (action !== 'start' && action !== 'end') {
    return NextResponse.json({ error: 'action must be "start" or "end"' }, { status: 400 });
  }

  const lifecycle = deriveGarageSaleLifecycle(sale);

  if (action === 'start' && !lifecycle.sellerCanGoLive) {
    const error = lifecycle.state === 'UPCOMING'
      ? 'Live controls unlock when your sale start time arrives.'
      : getGarageSaleLiveControlsBlockMessage(sale);
    return NextResponse.json({ error }, { status: 422 });
  }

  const now = new Date();
  const updated = action === 'start'
    ? (await prisma.$transaction([
      prisma.garageSaleLiveSignal.deleteMany({ where: { saleId: id } }),
      prisma.garageSale.update({
        where: { id },
        data: { isLive: true, liveStartedAt: now },
        select: { id: true, isLive: true, liveStartedAt: true },
      }),
    ]))[1]
    : await prisma.garageSale.update({
      where: { id },
      data: { isLive: false, liveStartedAt: null },
      select: { id: true, isLive: true, liveStartedAt: true },
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
  const lifecycle = deriveGarageSaleLifecycle(sale);
  if (!lifecycle.publiclyVisible) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ id: sale.id, isLive: sale.isLive, liveStartedAt: sale.liveStartedAt });
}
