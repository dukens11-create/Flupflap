import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { NotificationType } from '@prisma/client';
import { createNotifications } from '@/lib/notifications';
import { isSellerVerificationApproved } from '@/lib/seller-verification';
import { createShipmentRates, purchaseShipmentRate } from '@/lib/shipping';

function parsePositiveNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

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

    const verification = await prisma.sellerVerification.findUnique({
      where: { sellerId: session.user.id },
      select: {
        status: true,
        eligibleToListAt: true,
        adminFallbackStatus: true,
      },
    });
    if (!isSellerVerificationApproved(verification)) {
      return NextResponse.json({ error: 'Seller verification is required to create shipping labels.' }, { status: 403 });
    }

    const isJsonRequest = req.headers.get('content-type')?.includes('application/json');
    if (isJsonRequest) {
      const body = await req.json() as {
        action?: 'rates' | 'purchase';
        orderId?: string;
        weightOz?: number | string;
        lengthIn?: number | string;
        widthIn?: number | string;
        heightIn?: number | string;
        shipmentId?: string;
        rateId?: string;
      };

      if (!body?.orderId) {
        return NextResponse.json({ error: 'Order ID required.' }, { status: 400 });
      }

      const order = await prisma.order.findFirst({
        where: {
          id: body.orderId,
          isPickup: false,
          items: { some: { product: { sellerId: session.user.id } } },
        },
        select: {
          id: true,
          buyerId: true,
          status: true,
          trackingNumber: true,
          shippingCarrier: true,
          carrier: true,
          labelUrl: true,
          shipmentId: true,
          shippingName: true,
          shippingLine1: true,
          shippingLine2: true,
          shippingCity: true,
          shippingState: true,
          shippingPostalCode: true,
          shippingCountry: true,
        },
      });

      if (!order) {
        return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
      }
      if (order.status !== 'PAID') {
        return NextResponse.json({ error: 'Labels can only be created for paid shipping orders.' }, { status: 400 });
      }

      if (body.action === 'rates') {
        const weightOz = parsePositiveNumber(body.weightOz);
        const lengthIn = parsePositiveNumber(body.lengthIn);
        const widthIn = parsePositiveNumber(body.widthIn);
        const heightIn = parsePositiveNumber(body.heightIn);
        if (!weightOz || !lengthIn || !widthIn || !heightIn) {
          return NextResponse.json({ error: 'Package weight and dimensions must be greater than 0.' }, { status: 400 });
        }

        if (!order.shippingLine1 || !order.shippingCity || !order.shippingState || !order.shippingPostalCode) {
          return NextResponse.json({ error: 'Order is missing shipping address details.' }, { status: 400 });
        }

        const fromStreet1 = (process.env.SHIP_FROM_STREET1 ?? '').trim();
        const fromCity = (process.env.SHIP_FROM_CITY ?? '').trim();
        const fromState = (process.env.SHIP_FROM_STATE ?? '').trim();
        const fromZip = (process.env.SHIP_FROM_ZIP ?? '').trim();
        if (!fromStreet1 || !fromCity || !fromState || !fromZip) {
          return NextResponse.json(
            { error: 'Shipping origin is not configured. Set SHIP_FROM_STREET1, SHIP_FROM_CITY, SHIP_FROM_STATE, SHIP_FROM_ZIP.' },
            { status: 503 },
          );
        }

        const shipment = await createShipmentRates({
          toAddress: {
            name: order.shippingName ?? 'Buyer',
            street1: order.shippingLine1,
            street2: order.shippingLine2,
            city: order.shippingCity,
            state: order.shippingState,
            zip: order.shippingPostalCode,
            country: order.shippingCountry ?? 'US',
          },
          fromAddress: {
            name: (process.env.SHIP_FROM_NAME ?? 'FlupFlap Seller').trim(),
            street1: fromStreet1,
            city: fromCity,
            state: fromState,
            zip: fromZip,
            country: (process.env.SHIP_FROM_COUNTRY ?? 'US').trim(),
            phone: (process.env.SHIP_FROM_PHONE ?? '').trim() || undefined,
          },
          weightOz,
          lengthIn,
          widthIn,
          heightIn,
        });

        await prisma.order.update({
          where: { id: order.id },
          data: {
            shipmentId: shipment.shipmentId,
            shipmentStatus: 'RATE_QUOTED',
          },
        });

        return NextResponse.json(shipment);
      }

      if (body.action === 'purchase') {
        const shipmentId = (body.shipmentId ?? order.shipmentId ?? '').trim();
        const rateId = (body.rateId ?? '').trim();
        if (!shipmentId || !rateId) {
          return NextResponse.json({ error: 'Shipment and rate are required to purchase a label.' }, { status: 400 });
        }

        const purchased = await purchaseShipmentRate({ shipmentId, rateId });
        const carrier = purchased.carrier || order.carrier || order.shippingCarrier;

        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: 'SHIPPED',
            trackingNumber: purchased.trackingNumber || order.trackingNumber || null,
            carrier: carrier || null,
            shippingCarrier: carrier || null,
            shipmentId: purchased.shipmentId || shipmentId,
            shipmentStatus: purchased.shipmentStatus || 'LABEL_PURCHASED',
            labelUrl: purchased.labelUrl || null,
          },
        });

        if (purchased.trackingNumber) {
          await createNotifications([
            {
              userId: order.buyerId,
              type: NotificationType.SHIPPING,
              title: 'Your order has shipped',
              body: `Tracking is now available${carrier ? ` with ${carrier}` : ''}: ${purchased.trackingNumber}.`,
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
        }

        return NextResponse.json({
          ok: true,
          shipmentId: purchased.shipmentId || shipmentId,
          shipmentStatus: purchased.shipmentStatus || 'LABEL_PURCHASED',
          trackingNumber: purchased.trackingNumber || order.trackingNumber,
          carrier,
          labelUrl: purchased.labelUrl,
          trackingUrl: purchased.trackingUrl,
        });
      }

      return NextResponse.json({ error: 'Unsupported shipping action.' }, { status: 400 });
    }

    // Legacy fallback: manual mark shipped form submits
    const form = await req.formData();
    const orderId = form.get('orderId') as string;
    const trackingNumber = form.get('trackingNumber') as string;
    const shippingCarrier = form.get('shippingCarrier') as string;
    if (!orderId) {
      return NextResponse.json({ error: 'Order ID required.' }, { status: 400 });
    }

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
    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'SHIPPED',
        trackingNumber: trackingNumber || null,
        carrier: shippingCarrier || null,
        shippingCarrier: shippingCarrier || null,
        shipmentStatus: 'SHIPPED_MANUAL',
      },
    });

    return NextResponse.redirect(new URL('/seller', req.url));
  } catch (err: any) {
    console.error('[seller/ship]', err);
    return NextResponse.json({ error: err?.message || 'Failed to update order.' }, { status: 500 });
  }
}
