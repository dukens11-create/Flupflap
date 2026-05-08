import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { mapDeliveryStatusToOrderStatus, refreshCarrierTracking } from '@/lib/shipping';

function buildRedirectUrl(reqUrl: string, redirectTo: string, shipping: string) {
  const safePath = redirectTo.startsWith('/') ? redirectTo : '/orders';
  const url = new URL(safePath, reqUrl);
  url.searchParams.set('shipping', shipping);
  return url;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const form = await req.formData();
    const redirectTo = String(form.get('redirectTo') || `/orders/${id}`);

    const order = await prisma.order.findFirst({
      where: {
        id,
        ...(session.user.role === 'ADMIN'
          ? {}
          : session.user.role === 'SELLER'
            ? { items: { some: { product: { sellerId: session.user.id } } } }
            : { buyerId: session.user.id }),
      },
      select: {
        id: true,
        trackingNumber: true,
        shippingCarrier: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    if (!order.trackingNumber || !order.shippingCarrier) {
      return NextResponse.redirect(buildRedirectUrl(req.url, redirectTo, 'missing_tracking'));
    }

    const trackingUpdate = await refreshCarrierTracking({
      carrier: order.shippingCarrier,
      trackingNumber: order.trackingNumber,
    });

    if (!trackingUpdate) {
      return NextResponse.redirect(buildRedirectUrl(req.url, redirectTo, 'refresh_unavailable'));
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: mapDeliveryStatusToOrderStatus(trackingUpdate.deliveryStatus),
        deliveryStatus: trackingUpdate.deliveryStatus,
        deliveryStatusDetail: trackingUpdate.deliveryStatusDetail,
        deliveryStatusUpdatedAt: trackingUpdate.syncedAt,
        shippingExternalTrackingUrl: trackingUpdate.externalTrackingUrl,
        shippingProviderShipmentId: trackingUpdate.providerShipmentId,
        shippingLastSyncedAt: trackingUpdate.syncedAt,
      },
    });

    return NextResponse.redirect(buildRedirectUrl(req.url, redirectTo, 'refreshed'));
  } catch (err) {
    console.error('[orders/shipment/refresh]', err);
    return NextResponse.json({ error: 'Failed to refresh shipment tracking.' }, { status: 500 });
  }
}
