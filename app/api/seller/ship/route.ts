import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { z, ZodError } from 'zod';
import {
  buildCarrierTrackingUrl,
  buildInternalShippingLabelUrl,
  getShippingProvider,
  inferDeliveryStatus,
  mapDeliveryStatusToOrderStatus,
  normalizeCarrierName,
  refreshCarrierTracking,
} from '@/lib/shipping';

const schema = z.object({
  orderId: z.string().min(1, 'Order ID required.'),
  trackingNumber: z.string().trim().max(100).optional().or(z.literal('')),
  shippingCarrier: z.string().trim().min(1, 'Carrier is required.').max(80),
  deliveryStatus: z.string().trim().optional().or(z.literal('')),
});

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
    const parsed = schema.parse({
      orderId: form.get('orderId'),
      trackingNumber: form.get('trackingNumber'),
      shippingCarrier: form.get('shippingCarrier'),
      deliveryStatus: form.get('deliveryStatus'),
    });
    const orderId = parsed.orderId;
    const trackingNumber = parsed.trackingNumber?.trim() || null;
    const shippingCarrier = normalizeCarrierName(parsed.shippingCarrier);
    const fallbackStatus = inferDeliveryStatus({
      deliveryStatus: parsed.deliveryStatus,
      trackingNumber,
    });

    // Verify the order has items belonging to this seller
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        items: { some: { product: { sellerId: session.user.id } } },
      },
    });

    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

    let deliveryStatus = fallbackStatus;
    let deliveryStatusDetail: string | null = null;
    let shippingExternalTrackingUrl = buildCarrierTrackingUrl(shippingCarrier, trackingNumber);
    let shippingProviderShipmentId: string | null = order.shippingProviderShipmentId;
    let shippingLastSyncedAt: Date | null = null;
    const shippingProvider = getShippingProvider();

    if (trackingNumber) {
      const trackingUpdate = await refreshCarrierTracking({
        carrier: shippingCarrier,
        trackingNumber,
      });
      if (trackingUpdate) {
        deliveryStatus = trackingUpdate.deliveryStatus;
        deliveryStatusDetail = trackingUpdate.deliveryStatusDetail;
        shippingExternalTrackingUrl = trackingUpdate.externalTrackingUrl;
        shippingProviderShipmentId = trackingUpdate.providerShipmentId ?? null;
        shippingLastSyncedAt = trackingUpdate.syncedAt;
      }
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: mapDeliveryStatusToOrderStatus(deliveryStatus),
        trackingNumber,
        shippingCarrier,
        shippingProvider: shippingProvider.label,
        shippingLabelUrl: buildInternalShippingLabelUrl(orderId),
        shippingLabelFormat: 'INTERNAL_PRINT',
        deliveryStatus,
        deliveryStatusDetail,
        deliveryStatusUpdatedAt: new Date(),
        shippingExternalTrackingUrl,
        shippingProviderShipmentId,
        shippingLastSyncedAt,
      },
    });

    return NextResponse.redirect(new URL('/seller?shipping=updated', req.url));
  } catch (err: any) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Invalid shipping data.' }, { status: 400 });
    }
    console.error('[seller/ship]', err);
    return NextResponse.json({ error: 'Failed to update order.' }, { status: 500 });
  }
}
