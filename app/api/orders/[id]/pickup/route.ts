/**
 * POST /api/orders/[id]/pickup
 *
 * Seller submits the buyer's pickup code to confirm the item handoff.
 * On success, the order status is updated to PICKED_UP.
 *
 * Request body (JSON): { code: string }
 *
 * Only the seller whose product is in the order can verify pickup.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const schema = z.object({ code: z.string().min(1).max(6) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Block restricted sellers
    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (dbUser?.sellerStatus === 'SUSPENDED' || dbUser?.sellerStatus === 'BANNED') {
      return NextResponse.json({ error: 'Your seller account is currently restricted.' }, { status: 403 });
    }

    const { id: orderId } = await params;

    // Verify seller owns at least one item in this order
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        isPickup: true,
        items: { some: { product: { sellerId: session.user.id } } },
      },
      include: { pickupConfirmation: true },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found or not a pickup order.' }, { status: 404 });
    }

    if (order.status === 'PICKED_UP') {
      return NextResponse.json({ error: 'This order has already been picked up.' }, { status: 400 });
    }

    if (!order.pickupConfirmation) {
      return NextResponse.json({ error: 'No pickup code found for this order.' }, { status: 400 });
    }

    if (order.pickupConfirmation.confirmedAt) {
      return NextResponse.json({ error: 'Pickup already confirmed.' }, { status: 400 });
    }

    const { code } = schema.parse(await req.json());

    // Case-insensitive comparison
    if (code.trim().toUpperCase() !== order.pickupConfirmation.code.toUpperCase()) {
      return NextResponse.json({ error: 'Incorrect pickup code.' }, { status: 400 });
    }

    // Mark pickup confirmed and order as PICKED_UP
    await prisma.$transaction([
      prisma.pickupConfirmation.update({
        where: { orderId },
        data: {
          confirmedAt: new Date(),
          confirmedBy: session.user.id,
        },
      }),
      prisma.order.update({
        where: { id: orderId },
        data: { status: 'PICKED_UP' },
      }),
    ]);

    return NextResponse.json({ ok: true, message: 'Pickup confirmed. Order marked as picked up.' });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
    }
    console.error('[orders/pickup POST]', err);
    return NextResponse.json({ error: 'Failed to confirm pickup.' }, { status: 500 });
  }
}
