import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { isGarageSalePubliclyVisible } from '@/lib/garage-sale-visibility';
import { applyRateLimitAsync } from '@/lib/security';

export const dynamic = 'force-dynamic';

const DEFAULT_GUEST_NAME = 'Guest';

type Params = { params: Promise<{ id: string }> };

/** GET /api/garage-sales/[id]/chat — fetch recent messages (public) */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const url = new URL(req.url);
  const since = url.searchParams.get('since');

  const sale = await prisma.garageSale.findUnique({
    where: { id },
    select: { status: true, paymentStatus: true, isArchived: true, isSpam: true, isLive: true, startDate: true, endDate: true },
  });
  if (!sale || !isGarageSalePubliclyVisible(sale)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const messages = await prisma.garageSaleChat.findMany({
    where: {
      saleId: id,
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

  const { message, guestName } = body as { message?: string; guestName?: string };
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }
  if (message.trim().length > 500) {
    return NextResponse.json({ error: 'Message too long (max 500 chars)' }, { status: 400 });
  }

  const userId = session?.user?.id ?? null;
  let resolvedGuestName: string | null = null;
  if (!userId) {
    const trimmedName = typeof guestName === 'string' ? guestName.trim() : '';
    resolvedGuestName = trimmedName ? trimmedName.slice(0, 50) : DEFAULT_GUEST_NAME;
  }

  const msg = await prisma.garageSaleChat.create({
    data: {
      saleId: id,
      userId,
      guestName: resolvedGuestName,
      message: message.trim(),
    },
    select: { id: true, userId: true, guestName: true, message: true, createdAt: true },
  });

  return NextResponse.json(msg, { status: 201 });
}
