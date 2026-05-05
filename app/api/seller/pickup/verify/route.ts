/**
 * POST /api/seller/pickup/verify
 *
 * Seller submits the buyer's 6-digit pickup code to confirm the item handoff.
 * On success:
 *   - Verifies the code against the stored bcrypt hash.
 *   - Transitions the order status to PICKED_UP.
 *   - Records a PickupEvent for the audit trail.
 *   - Sets pickupConfirmedAt.
 *
 * Body: { orderId: string; code: string }
 *
 * Errors:
 *   400 — invalid input or wrong code
 *   403 — not a seller or seller is restricted
 *   404 — order not found or not a pickup order for this seller
 *   409 — order already picked up
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { verifyPickupCode } from '@/lib/pickup';
import { z, ZodError } from 'zod';

const schema = z.object({
  orderId: z.string().min(1),
  code: z.string().length(6),
});

export async function POST(req: Request) {
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

    const body = await req.json();
    const { orderId, code } = schema.parse(body);

    // Find the order; confirm it belongs to this seller and is a pickup order
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        fulfillmentType: 'PICKUP',
        items: { some: { product: { sellerId: session.user.id } } },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    if (order.status === 'PICKED_UP') {
      return NextResponse.json({ error: 'This order has already been picked up.' }, { status: 409 });
    }

    if (!order.pickupCodeHash) {
      return NextResponse.json({ error: 'No pickup code associated with this order.' }, { status: 400 });
    }

    const valid = await verifyPickupCode(code, order.pickupCodeHash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid pickup code. Please ask the buyer to check their order details.' }, { status: 400 });
    }

    // Mark order as picked up
    await prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'PICKED_UP',
          pickupConfirmedAt: new Date(),
        },
      }),
      prisma.pickupEvent.create({
        data: {
          orderId,
          actorId: session.user.id,
          eventType: 'CODE_VERIFIED',
          notes: 'Seller verified pickup code; order marked as picked up.',
        },
      }),
    ]);

    return NextResponse.json({ ok: true, message: 'Pickup confirmed.' });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: 'Please enter a valid 6-digit code.' }, { status: 400 });
    }
    console.error('[seller/pickup/verify]', err);
    return NextResponse.json({ error: 'Failed to verify pickup code.' }, { status: 500 });
  }
}
