/**
 * POST /api/orders/[id]/complete
 *
 * Allows the buyer (or an admin) to mark a SHIPPED order as DELIVERED once
 * they have received their package.  This completes the delivery lifecycle:
 *   PAID → SHIPPED → DELIVERED
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { NotificationType } from '@prisma/client';
import { createNotifications } from '@/lib/notifications';
import { sessionHasRole } from '@/lib/user-roles';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const order = await prisma.order.findFirst({
      where: {
        id,
        isPickup: false,
        // Buyers can only complete their own orders; admins can complete any.
        ...(!sessionHasRole(session.user, 'ADMIN') && { buyerId: session.user.id }),
      },
      select: {
        id: true,
        status: true,
        items: {
          select: { product: { select: { sellerId: true } } },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    if (order.status !== 'SHIPPED') {
      return NextResponse.json(
        { error: 'Only shipped orders can be marked as delivered.' },
        { status: 400 },
      );
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'DELIVERED' },
    });

    // Notify each seller that their order has been confirmed as delivered.
    const sellerIds = Array.from(
      new Set(order.items.map((i) => i.product.sellerId)),
    );

    await createNotifications(
      sellerIds.map((sellerId) => ({
        userId: sellerId,
        type: NotificationType.ORDER_UPDATE,
        title: 'Order delivered',
        body: 'The buyer confirmed they received their order.',
        link: '/seller',
        data: { orderId: order.id, status: 'DELIVERED' },
      })),
    );

    return NextResponse.json({ ok: true, status: 'DELIVERED' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error.';
    console.error('[orders/complete]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
