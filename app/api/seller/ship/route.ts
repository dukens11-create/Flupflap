import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { NotificationType } from '@prisma/client';
import { createNotifications } from '@/lib/notifications';
import { appUrl } from '@/lib/stripe';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Block restricted sellers from marking orders shipped
    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (dbUser?.sellerStatus === 'SUSPENDED' || dbUser?.sellerStatus === 'BANNED') {
      return NextResponse.json({ error: 'Your seller account is currently restricted.' }, { status: 403 });
    }

    const form = await req.formData();
    const orderId = form.get('orderId') as string;
    const trackingNumber = form.get('trackingNumber') as string;
    const shippingCarrier = form.get('shippingCarrier') as string;

    if (!orderId) return NextResponse.json({ error: 'Order ID required.' }, { status: 400 });

    // Verify the order has items belonging to this seller
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        items: { some: { product: { sellerId: session.user.id } } },
      },
      select: {
        id: true,
        buyerId: true,
      },
    });

    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'SHIPPED',
        trackingNumber: trackingNumber || null,
        shippingCarrier: shippingCarrier || null,
      },
    });

    await createNotifications([
      {
        userId: order.buyerId,
        type: NotificationType.SHIPPING,
        title: 'Your order has shipped',
        body: trackingNumber
          ? `Tracking is now available${shippingCarrier ? ` with ${shippingCarrier}` : ''}: ${trackingNumber}.`
          : 'The seller marked your order as shipped.',
        link: `/orders/${order.id}`,
        data: { orderId: order.id },
      },
      {
        userId: order.buyerId,
        type: NotificationType.ORDER_UPDATE,
        title: 'Order status updated',
        body: 'Your order moved to Shipped.',
        link: `/orders/${order.id}`,
        data: { orderId: order.id, status: 'SHIPPED' },
      },
    ]);

    return NextResponse.redirect(new URL('/seller', req.url));
  } catch (err: any) {
    console.error('[seller/ship]', err);
    return NextResponse.json({ error: 'Failed to update order.' }, { status: 500 });
  }
}
