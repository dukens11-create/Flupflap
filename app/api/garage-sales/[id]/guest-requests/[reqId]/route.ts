import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { isGarageSalePubliclyVisible } from '@/lib/garage-sale-visibility';
import { MAX_LIVE_GUESTS, LIVE_SIGNAL_EVENTS } from '@/lib/live-signaling';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; reqId: string }> };

const ACTIVE_STATUSES = ['APPROVED', 'ACTIVE'];

type SellerAction = 'approve' | 'decline' | 'remove' | 'mute' | 'unmute';
type BuyerAction = 'end';
type GuestAction = SellerAction | BuyerAction;

const SELLER_ACTIONS: SellerAction[] = ['approve', 'decline', 'remove', 'mute', 'unmute'];
const BUYER_ACTIONS: BuyerAction[] = ['end'];
const ALL_ACTIONS: GuestAction[] = [...SELLER_ACTIONS, ...BUYER_ACTIONS];

function isGuestAction(value: unknown): value is GuestAction {
  return typeof value === 'string' && ALL_ACTIONS.includes(value as GuestAction);
}

/** PATCH /api/garage-sales/[id]/guest-requests/[reqId] — update a guest request status */
export async function PATCH(req: Request, { params }: Params) {
  const { id, reqId } = await params;

  const sale = await prisma.garageSale.findUnique({
    where: { id },
    select: { id: true, sellerId: true, isLive: true, status: true, paymentStatus: true, isArchived: true, isSpam: true, startDate: true, endDate: true },
  });
  if (!sale || !isGarageSalePubliclyVisible(sale)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const guestRequest = await prisma.garageSaleGuestRequest.findUnique({
    where: { id: reqId },
    select: { id: true, saleId: true, guestId: true, status: true, isMuted: true },
  });
  if (!guestRequest || guestRequest.saleId !== id) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  const isSeller = userId === sale.sellerId;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action, guestId } = body as { action?: unknown; guestId?: unknown };

  if (!isGuestAction(action)) {
    return NextResponse.json(
      { error: `action must be one of: ${ALL_ACTIONS.join(', ')}` },
      { status: 400 },
    );
  }

  // Seller actions
  if (SELLER_ACTIONS.includes(action as SellerAction)) {
    if (!isSeller) {
      return NextResponse.json({ error: 'Only the seller can perform this action' }, { status: 403 });
    }

    if (action === 'approve') {
      if (!['PENDING'].includes(guestRequest.status)) {
        return NextResponse.json({ error: 'Request is not in PENDING state' }, { status: 422 });
      }
      // Enforce max guest limit
      const activeCount = await prisma.garageSaleGuestRequest.count({
        where: { saleId: id, status: { in: ACTIVE_STATUSES }, id: { not: reqId } },
      });
      if (activeCount >= MAX_LIVE_GUESTS) {
        return NextResponse.json({ error: 'Live guest room is full', roomFull: true }, { status: 422 });
      }
      const updated = await prisma.garageSaleGuestRequest.update({
        where: { id: reqId },
        data: { status: 'APPROVED', updatedAt: new Date() },
        select: { id: true, guestId: true, guestName: true, status: true, isMuted: true },
      });
      console.info(`[GuestRequest] ${LIVE_SIGNAL_EVENTS.APPROVE_JOIN_REQUEST}`, { saleId: id, requestId: reqId });
      return NextResponse.json({ request: updated });
    }

    if (action === 'decline') {
      const updated = await prisma.garageSaleGuestRequest.update({
        where: { id: reqId },
        data: { status: 'DECLINED', updatedAt: new Date() },
        select: { id: true, status: true },
      });
      console.info(`[GuestRequest] ${LIVE_SIGNAL_EVENTS.DECLINE_JOIN_REQUEST}`, { saleId: id, requestId: reqId });
      return NextResponse.json({ request: updated });
    }

    if (action === 'remove') {
      const updated = await prisma.garageSaleGuestRequest.update({
        where: { id: reqId },
        data: { status: 'REMOVED', updatedAt: new Date() },
        select: { id: true, status: true },
      });
      console.info(`[GuestRequest] ${LIVE_SIGNAL_EVENTS.GUEST_REMOVED}`, { saleId: id, requestId: reqId });
      return NextResponse.json({ request: updated });
    }

    if (action === 'mute') {
      const updated = await prisma.garageSaleGuestRequest.update({
        where: { id: reqId },
        data: { isMuted: true, updatedAt: new Date() },
        select: { id: true, status: true, isMuted: true },
      });
      console.info(`[GuestRequest] ${LIVE_SIGNAL_EVENTS.GUEST_MUTED}`, { saleId: id, requestId: reqId, isMuted: true });
      return NextResponse.json({ request: updated });
    }

    if (action === 'unmute') {
      const updated = await prisma.garageSaleGuestRequest.update({
        where: { id: reqId },
        data: { isMuted: false, updatedAt: new Date() },
        select: { id: true, status: true, isMuted: true },
      });
      console.info(`[GuestRequest] ${LIVE_SIGNAL_EVENTS.GUEST_MUTED}`, { saleId: id, requestId: reqId, isMuted: false });
      return NextResponse.json({ request: updated });
    }
  }

  // Buyer action: end
  if (action === 'end') {
    // Validate guestId matches the request (no auth required — use guestId as ownership proof)
    const GUEST_ID_PATTERN = /^[a-zA-Z0-9_\-\.]+$/;
    const guestIdStr = typeof guestId === 'string' ? guestId : '';
    if (!guestIdStr || !GUEST_ID_PATTERN.test(guestIdStr) || guestRequest.guestId !== guestIdStr) {
      return NextResponse.json({ error: 'Invalid guestId' }, { status: 403 });
    }
    const updated = await prisma.garageSaleGuestRequest.update({
      where: { id: reqId },
      data: { status: 'ENDED', updatedAt: new Date() },
      select: { id: true, status: true },
    });
    console.info(`[GuestRequest] ${LIVE_SIGNAL_EVENTS.GUEST_LEFT_LIVE}`, { saleId: id, requestId: reqId });
    return NextResponse.json({ request: updated });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
