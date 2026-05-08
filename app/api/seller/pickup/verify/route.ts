/**
 * POST /api/seller/pickup/verify
 *
 * Called by the seller to confirm that a buyer has physically picked up an order.
 * The buyer shows their 6-digit pickup code; the seller enters it here.
 *
 * Request body:
 *   { orderId: string; code: string }
 *
 * On success the order status is updated to PICKED_UP and the confirmation
 * timestamp and seller ID are recorded for audit purposes.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { NotificationType } from '@prisma/client';
import { createNotifications } from '@/lib/notifications';
import { z } from 'zod';
import crypto from 'crypto';

/** Constant-time string comparison to prevent timing side-channels. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

// Pickup codes allow more attempts than login OTP (10 vs 5) because:
// - The seller must be authenticated and must own a product in the order.
// - The code only protects a specific in-person handoff, not a full session.
// - Sellers may legitimately mistype digits at pickup, needing a few retries.
const MAX_PICKUP_ATTEMPTS = 10;

const schema = z.object({
  orderId: z.string().min(1),
  code: z.string().length(6, 'Pickup code must be 6 digits').regex(/^\d{6}$/, 'Pickup code must be 6 digits'),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Seller account required.' }, { status: 403 });
    }

    // Check seller is not restricted
    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!dbUser || dbUser.sellerStatus !== 'ACTIVE') {
      return NextResponse.json({ error: 'Your account is restricted.' }, { status: 403 });
    }

    const body = await req.json();
    const { orderId, code } = schema.parse(body);

    // Find the order, verify it belongs to this seller, is a pickup order, and
    // is in a state where pickup can be confirmed.
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        isPickup: true,
        items: { some: { product: { sellerId: session.user.id } } },
      },
      select: {
        id: true,
        buyerId: true,
        status: true,
        pickupCode: true,
        pickupCodeAttempts: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    if (order.status === 'PICKED_UP') {
      return NextResponse.json({ error: 'This order has already been confirmed as picked up.' }, { status: 400 });
    }

    if (!['PAID', 'READY_FOR_PICKUP'].includes(order.status)) {
      return NextResponse.json({ error: 'This order is not eligible for pickup confirmation.' }, { status: 400 });
    }

    if (!order.pickupCode) {
      return NextResponse.json({ error: 'No pickup code on record for this order.' }, { status: 400 });
    }

    // Enforce attempt limit to prevent brute-forcing the 6-digit code space.
    if (order.pickupCodeAttempts >= MAX_PICKUP_ATTEMPTS) {
      return NextResponse.json(
        { error: 'Maximum verification attempts reached. Please contact support.' },
        { status: 400 },
      );
    }

    // Use constant-time comparison to prevent timing side-channels.
    if (!safeEqual(code.trim(), order.pickupCode)) {
      await prisma.order.update({
        where: { id: orderId },
        data: { pickupCodeAttempts: { increment: 1 } },
      });
      return NextResponse.json({ error: 'Invalid pickup code. Please check the code with the buyer.' }, { status: 400 });
    }

    // Code matches — mark order as picked up
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'PICKED_UP',
        pickupConfirmedAt: new Date(),
        pickupConfirmedById: session.user.id,
      },
    });

    await createNotifications([
      {
        userId: order.buyerId,
        type: NotificationType.SHIPPING,
        title: 'Pickup confirmed',
        body: 'The seller confirmed your pickup handoff.',
        link: `/orders/${order.id}`,
        data: { orderId: order.id },
      },
      {
        userId: order.buyerId,
        type: NotificationType.ORDER_UPDATE,
        title: 'Order status updated',
        body: 'Your order moved to Picked Up.',
        link: `/orders/${order.id}`,
        data: { orderId: order.id, status: 'PICKED_UP' },
      },
    ]);

    return NextResponse.json({ ok: true, message: 'Pickup confirmed. Order marked as picked up.' });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: err.errors[0]?.message || 'Invalid input.' }, { status: 400 });
    }
    console.error('[seller/pickup/verify]', err);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
