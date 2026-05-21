import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { isGarageSalePubliclyVisible } from '@/lib/garage-sale-visibility';
import { applyRateLimitAsync } from '@/lib/security';
import { MAX_LIVE_GUESTS, LIVE_SIGNAL_EVENTS, GUEST_ID_PATTERN } from '@/lib/live-signaling';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const ACTIVE_STATUSES = ['accepted'];

function isValidGuestId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64 && GUEST_ID_PATTERN.test(value);
}

/** GET /api/garage-sales/[id]/guest-requests
 *  Seller: returns all pending + active requests for this sale.
 *  Buyer: returns just their own request status (requires guestId query param). */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const url = new URL(req.url);
  const guestId = url.searchParams.get('guestId');

  const sale = await prisma.garageSale.findUnique({
    where: { id },
    select: { id: true, sellerId: true, isLive: true, status: true, paymentStatus: true, isArchived: true, isSpam: true, startDate: true, endDate: true },
  });
  if (!sale || !isGarageSalePubliclyVisible(sale)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  const isSeller = userId === sale.sellerId;

  // Seller: return all pending/active requests
  if (isSeller) {
    const requests = await prisma.garageSaleGuestRequest.findMany({
      where: {
        saleId: id,
        status: { in: ['pending', 'accepted'] },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        guestId: true,
        guestName: true,
        viewerId: true,
        viewerAvatar: true,
        status: true,
        isMuted: true,
        createdAt: true,
      },
    });
    const activeCount = requests.filter((r) => ACTIVE_STATUSES.includes(r.status)).length;
    return NextResponse.json({ requests, activeCount, maxGuests: MAX_LIVE_GUESTS, isLive: sale.isLive });
  }

  // Buyer: return their own request (identified by guestId)
  if (!isValidGuestId(guestId)) {
    return NextResponse.json({ error: 'guestId is required' }, { status: 400 });
  }

  const request = await prisma.garageSaleGuestRequest.findFirst({
    where: { saleId: id, guestId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, isMuted: true, createdAt: true },
  });

  // Also return active guest count so buyer can check if room is full
  const activeCount = await prisma.garageSaleGuestRequest.count({
    where: { saleId: id, status: { in: ACTIVE_STATUSES } },
  });

  return NextResponse.json({ request, activeCount, maxGuests: MAX_LIVE_GUESTS, isLive: sale.isLive });
}

/** POST /api/garage-sales/[id]/guest-requests — buyer requests to join live */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;

  const sale = await prisma.garageSale.findUnique({
    where: { id },
    select: { id: true, sellerId: true, isLive: true, status: true, paymentStatus: true, isArchived: true, isSpam: true, startDate: true, endDate: true },
  });
  if (!sale || !isGarageSalePubliclyVisible(sale)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!sale.isLive) {
    return NextResponse.json({ error: 'Live session is not active' }, { status: 422 });
  }

  const session = await getServerSession(authOptions);
  if (session?.user?.id === sale.sellerId) {
    return NextResponse.json({ error: 'Seller cannot request to join their own live' }, { status: 403 });
  }

  // Rate-limit per IP / user to prevent request spam
  const limit = await applyRateLimitAsync({
    request: req,
    key: 'garage-sales:guest-requests',
    windowMs: 60 * 1000,
    max: 5,
    userId: session?.user?.id,
  });
  if (limit.limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { guestId, guestName, viewerId, viewerAvatar } = body as {
    guestId?: unknown;
    guestName?: unknown;
    viewerId?: unknown;
    viewerAvatar?: unknown;
  };

  if (!isValidGuestId(guestId)) {
    return NextResponse.json({ error: 'guestId must be a non-empty alphanumeric string (max 64 chars)' }, { status: 400 });
  }

  // Check if there's already an active or pending request from this guest
  const existing = await prisma.garageSaleGuestRequest.findFirst({
    where: { saleId: id, guestId, status: { in: ['pending', 'accepted'] } },
    select: { id: true, status: true },
  });
  if (existing) {
    return NextResponse.json({ request: existing, alreadyExists: true }, { status: 200 });
  }

  // Check if room is full
  const activeCount = await prisma.garageSaleGuestRequest.count({
    where: { saleId: id, status: { in: ACTIVE_STATUSES } },
  });
  if (activeCount >= MAX_LIVE_GUESTS) {
    return NextResponse.json({ error: 'Live guest room is full. Please wait.', roomFull: true }, { status: 422 });
  }

  const resolvedGuestName =
    typeof guestName === 'string' && guestName.trim().length > 0
      ? guestName.trim().slice(0, 50)
      : null;

  const request = await prisma.garageSaleGuestRequest.create({
    data: {
      saleId: id,
      guestId: guestId as string,
      guestName: resolvedGuestName,
      sellerId: sale.sellerId,
      viewerId: typeof viewerId === 'string' && viewerId.trim().length > 0 ? viewerId.trim().slice(0, 191) : (session?.user?.id ?? (guestId as string)),
      viewerAvatar: typeof viewerAvatar === 'string' && viewerAvatar.trim().length > 0 ? viewerAvatar.trim().slice(0, 500) : null,
      status: 'pending',
    },
    select: { id: true, guestId: true, guestName: true, viewerId: true, viewerAvatar: true, status: true, createdAt: true },
  });

  console.info(`[GuestRequest] ${LIVE_SIGNAL_EVENTS.REQUEST_JOIN_LIVE}`, {
    saleId: id,
    requestId: request.id,
    guestId: request.guestId,
  });

  return NextResponse.json({ request }, { status: 201 });
}
