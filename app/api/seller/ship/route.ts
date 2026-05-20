import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { NotificationType } from '@prisma/client';
import { createNotifications } from '@/lib/notifications';
import { isSellerVerificationApproved } from '@/lib/seller-verification';
import { buildTrackingUrl, createShipmentRates, findPurchasedShipmentRate, purchaseShipmentRate } from '@/lib/shipping';
import {
  buildShippingPurchaseIdempotencyKey,
  classifyShippingPurchaseError,
  hasActivePurchasedLabel,
} from '@/lib/shipping-purchase';
import { allSellersShipped, distinctSellerIds, isShipmentShipped } from '@/lib/order-shipment';

function parsePositiveNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

const MAX_LABEL_PURCHASE_ERROR_MESSAGE_LENGTH = 500;

type PurchasedLabelFields = {
  shipmentId: string | null;
  shipmentStatus: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  shippingService: string | null;
  labelUrl: string | null;
  trackingUrl: string | null;
};

function toPurchasedLabelResponse(record: PurchasedLabelFields & { shippingCarrier?: string | null }) {
  const carrier = record.carrier ?? record.shippingCarrier ?? null;
  const trackingUrl = record.trackingUrl ?? buildTrackingUrl(carrier, record.trackingNumber);
  return {
    ok: true,
    shipmentId: record.shipmentId,
    shipmentStatus: record.shipmentStatus ?? 'LABEL_PURCHASED',
    trackingNumber: record.trackingNumber,
    carrier,
    service: record.shippingService,
    labelUrl: record.labelUrl,
    trackingUrl,
  };
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const sellerId = session.user.id;
    if (!sellerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Block restricted sellers from marking orders shipped
    const dbUser = await prisma.user.findUnique({ where: { id: sellerId } });
    if (dbUser?.sellerStatus === 'SUSPENDED' || dbUser?.sellerStatus === 'BANNED' || dbUser?.sellerStatus === 'RESTRICTED') {
      return NextResponse.json({ error: 'Your seller account is currently restricted.' }, { status: 403 });
    }

    const isJsonRequest = req.headers.get('content-type')?.includes('application/json');
    if (isJsonRequest) {
      const verification = await prisma.sellerVerification.findUnique({
        where: { sellerId },
        select: {
          status: true,
          eligibleToListAt: true,
          adminFallbackStatus: true,
        },
      });
      if (!isSellerVerificationApproved(verification)) {
        return NextResponse.json({ error: 'Seller verification is required to create shipping labels.' }, { status: 403 });
      }

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
          items: { some: { product: { sellerId } } },
        },
        select: {
          id: true,
          buyerId: true,
          status: true,
          trackingNumber: true,
          shippingCarrier: true,
          shippingService: true,
          carrier: true,
          trackingUrl: true,
          labelUrl: true,
          shipmentId: true,
          shipmentStatus: true,
          labelPurchaseIdempotencyKey: true,
          labelProviderTransactionId: true,
          labelPurchasedAt: true,
          labelPurchaseLastError: true,
          shippingName: true,
          shippingLine1: true,
          shippingLine2: true,
          shippingCity: true,
          shippingState: true,
          shippingPostalCode: true,
          shippingCountry: true,
          items: {
            select: {
              product: { select: { sellerId: true } },
            },
          },
        },
      });

      if (!order) {
        return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
      }
      if (body.action === 'rates') {
        if (order.status !== 'PAID') {
          return NextResponse.json({ error: 'Labels can only be created for paid shipping orders.' }, { status: 400 });
        }
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

        const fromStreet1 = (dbUser?.shipFromStreet ?? '').trim();
        const fromCity = (dbUser?.shipFromCity ?? '').trim();
        const fromState = (dbUser?.shipFromState ?? '').trim();
        const fromZip = (dbUser?.shipFromZip ?? '').trim();
        const fromName = (dbUser?.shipFromName ?? dbUser?.shopName ?? 'Seller Fulfillment').trim();
        const fromCountry = (dbUser?.shipFromCountry ?? 'US').trim();
        const fromPhone = (dbUser?.shipFromPhone ?? '').trim() || undefined;

        if (!fromStreet1 || !fromCity || !fromState || !fromZip) {
          const missing: string[] = [];
          if (!fromStreet1) missing.push('street');
          if (!fromCity) missing.push('city');
          if (!fromState) missing.push('state');
          if (!fromZip) missing.push('ZIP');
          return NextResponse.json(
            { error: `Ship-from address is incomplete. Missing: ${missing.join(', ')}.` },
            { status: 422 },
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
            name: fromName,
            street1: fromStreet1,
            city: fromCity,
            state: fromState,
            zip: fromZip,
            country: fromCountry,
            phone: fromPhone,
          },
          weightValue: weightOz,
          lengthIn,
          widthIn,
          heightIn,
        });

        // Store per-seller shipment quote in OrderShipment; also keep the
        // global order field updated for backward-compatible single-seller reads.
        await Promise.all([
          prisma.orderShipment.upsert({
            where: { orderId_sellerId: { orderId: order.id, sellerId } },
            create: {
              orderId: order.id,
              sellerId,
              shipmentId: shipment.shipmentId,
              shipmentStatus: 'RATE_QUOTED',
            },
            update: {
              shipmentId: shipment.shipmentId,
              shipmentStatus: 'RATE_QUOTED',
              // Reset any previous purchase error when re-quoting rates.
              labelPurchaseLastError: null,
            },
          }),
          prisma.order.update({
            where: { id: order.id },
            data: {
              shipmentId: shipment.shipmentId,
              shipmentStatus: 'RATE_QUOTED',
            },
          }),
        ]);

        return NextResponse.json(shipment);
      }

      if (body.action === 'purchase') {
        if (order.status !== 'PAID' && order.status !== 'SHIPPED') {
          return NextResponse.json({ error: 'Labels can only be purchased for paid shipping orders.' }, { status: 400 });
        }
        const shipmentId = (body.shipmentId ?? '').trim();
        const rateId = (body.rateId ?? '').trim();
        if (!shipmentId || !rateId) {
          return NextResponse.json({ error: 'Shipment and rate are required to purchase a label.' }, { status: 400 });
        }

        // Look up the per-seller OrderShipment record (created during rates action).
        // Use it for shipmentId validation and as the idempotency / lock anchor.
        const existingShipment = await prisma.orderShipment.findUnique({
          where: { orderId_sellerId: { orderId: order.id, sellerId } },
        });

        // Validate the shipmentId against the per-seller record first; fall back
        // to the global order field for backward compatibility with single-seller
        // orders where no OrderShipment was created by the rates action.
        const expectedShipmentId = existingShipment?.shipmentId ?? order.shipmentId;
        if (expectedShipmentId && expectedShipmentId !== shipmentId) {
          return NextResponse.json({ error: 'Shipment mismatch for this order. Refresh rates and retry.' }, { status: 409 });
        }

        // If this seller already has an active purchased label, return it immediately.
        if (existingShipment && isShipmentShipped(existingShipment) &&
            (existingShipment.labelUrl || existingShipment.trackingNumber)) {
          return NextResponse.json(toPurchasedLabelResponse(existingShipment));
        }
        // Backward compat: single-seller orders where no per-seller record exists yet.
        if (!existingShipment && hasActivePurchasedLabel(order)) {
          return NextResponse.json(toPurchasedLabelResponse(order));
        }

        const idempotencyKey = buildShippingPurchaseIdempotencyKey({
          orderId: order.id,
          shipmentId,
          rateId,
        });

        // Detect in-progress purchase for the same idempotency key.
        if (existingShipment?.shipmentStatus === 'PENDING_PURCHASE' &&
            existingShipment.labelPurchaseIdempotencyKey === idempotencyKey) {
          return NextResponse.json(
            { error: 'A label purchase is already in progress for this shipment. Please retry in a moment.' },
            { status: 409 },
          );
        }

        // Soft lock: mark PENDING_PURCHASE in the per-seller record. Idempotency
        // key protection at the Shippo level prevents duplicate charges.
        await prisma.orderShipment.upsert({
          where: { orderId_sellerId: { orderId: order.id, sellerId } },
          create: {
            orderId: order.id,
            sellerId,
            shipmentId,
            shipmentStatus: 'PENDING_PURCHASE',
            labelPurchaseIdempotencyKey: idempotencyKey,
            labelPurchaseLastError: null,
          },
          update: {
            shipmentId,
            shipmentStatus: 'PENDING_PURCHASE',
            labelPurchaseIdempotencyKey: idempotencyKey,
            labelPurchaseLastError: null,
          },
        });

        // Also update the global order record for backward-compatible consumers.
        await prisma.order.updateMany({
          where: {
            id: order.id,
            OR: [
              { shipmentStatus: null },
              { shipmentStatus: { notIn: ['PENDING_PURCHASE', 'LABEL_PURCHASED', 'PURCHASED'] } },
            ],
            labelUrl: null,
            trackingNumber: null,
          },
          data: {
            shipmentStatus: 'PENDING_PURCHASE',
            shipmentId,
            labelPurchaseIdempotencyKey: idempotencyKey,
            labelPurchaseLastError: null,
          },
        });

        let purchased: Awaited<ReturnType<typeof purchaseShipmentRate>> | null = null;
        try {
          purchased = await purchaseShipmentRate({
            shipmentId,
            rateId,
            idempotencyKey,
          });
        } catch (purchaseErr) {
          const classified = classifyShippingPurchaseError(purchaseErr);
          if (classified.unknownOutcome) {
            try {
              purchased = await findPurchasedShipmentRate({ shipmentId, rateId });
            } catch {
              // Best effort reconciliation only.
            }
          }

          if (!purchased) {
            const errorStatus = classified.retryable ? 'PURCHASE_RETRYABLE_FAILURE' : 'PURCHASE_FAILED';
            const errorMsg = classified.message.slice(0, MAX_LABEL_PURCHASE_ERROR_MESSAGE_LENGTH);
            await Promise.all([
              prisma.orderShipment.update({
                where: { orderId_sellerId: { orderId: order.id, sellerId } },
                data: { shipmentStatus: errorStatus, labelPurchaseLastError: errorMsg },
              }),
              prisma.order.update({
                where: { id: order.id },
                data: { shipmentStatus: errorStatus, labelPurchaseLastError: errorMsg },
              }),
            ]);
            return NextResponse.json(
              { error: classified.message, retryable: classified.retryable },
              { status: classified.retryable ? 502 : 400 },
            );
          }
        }

        const carrier = purchased.carrier;
        const trackingUrl = purchased.trackingUrl ?? buildTrackingUrl(carrier, purchased.trackingNumber);

        // Persist the result in the per-seller OrderShipment record.
        await prisma.orderShipment.upsert({
          where: { orderId_sellerId: { orderId: order.id, sellerId } },
          create: {
            orderId: order.id,
            sellerId,
            shipmentId: purchased.shipmentId || shipmentId,
            shipmentStatus: purchased.shipmentStatus || 'LABEL_PURCHASED',
            trackingNumber: purchased.trackingNumber ?? null,
            carrier: carrier ?? null,
            shippingService: purchased.service ?? null,
            labelUrl: purchased.labelUrl ?? null,
            trackingUrl: trackingUrl ?? null,
            labelPurchaseIdempotencyKey: idempotencyKey,
            labelProviderTransactionId: purchased.providerTransactionId ?? null,
            labelPurchasedAt: new Date(),
            labelPurchaseLastError: null,
          },
          update: {
            shipmentId: purchased.shipmentId || shipmentId,
            shipmentStatus: purchased.shipmentStatus || 'LABEL_PURCHASED',
            trackingNumber: purchased.trackingNumber ?? null,
            carrier: carrier ?? null,
            shippingService: purchased.service ?? null,
            labelUrl: purchased.labelUrl ?? null,
            trackingUrl: trackingUrl ?? null,
            labelPurchaseIdempotencyKey: idempotencyKey,
            labelProviderTransactionId: purchased.providerTransactionId ?? null,
            labelPurchasedAt: new Date(),
            labelPurchaseLastError: null,
          },
        });

        // Determine if all sellers in this order have now shipped so we can
        // transition the order status to SHIPPED correctly for multi-seller orders.
        const allSellerIds = distinctSellerIds(order.items);
        const shippedShipments = await prisma.orderShipment.findMany({
          where: { orderId: order.id, sellerId: { in: allSellerIds } },
          select: { sellerId: true, shipmentStatus: true, labelUrl: true, trackingNumber: true },
        });
        const shippedSellerIds = shippedShipments
          .filter((s) => isShipmentShipped(s))
          .map((s) => s.sellerId);
        const orderIsFullyShipped = allSellersShipped(allSellerIds, shippedSellerIds);

        // Update the global order record. Sync tracking fields so existing API
        // consumers and the mobile client continue to work.
        await prisma.order.update({
          where: { id: order.id },
          data: {
            ...(orderIsFullyShipped ? { status: 'SHIPPED' } : {}),
            trackingNumber: purchased.trackingNumber || order.trackingNumber || null,
            carrier: carrier || null,
            // Keep legacy field in sync for existing consumers while `carrier`
            // becomes the canonical shipment carrier field.
            shippingCarrier: carrier || order.shippingCarrier || null,
            shippingService: purchased.service ?? null,
            shipmentId: purchased.shipmentId || shipmentId,
            shipmentStatus: purchased.shipmentStatus || 'LABEL_PURCHASED',
            labelUrl: purchased.labelUrl || null,
            trackingUrl: trackingUrl ?? null,
            labelPurchaseIdempotencyKey: idempotencyKey,
            labelProviderTransactionId: purchased.providerTransactionId,
            labelPurchasedAt: new Date(),
            labelPurchaseLastError: null,
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
              body: orderIsFullyShipped ? 'Your order has fully shipped.' : 'Part of your order has shipped.',
              link: `/orders/${order.id}`,
              data: { orderId: order.id, status: orderIsFullyShipped ? 'SHIPPED' : 'PAID' },
            },
          ]);
        }

        return NextResponse.json({
          ok: true,
          shipmentId: purchased.shipmentId || shipmentId,
          shipmentStatus: purchased.shipmentStatus || 'LABEL_PURCHASED',
          trackingNumber: purchased.trackingNumber || order.trackingNumber,
          carrier,
          service: purchased.service,
          labelUrl: purchased.labelUrl,
          trackingUrl,
        });
      }

      return NextResponse.json({ error: 'Unsupported shipping action.' }, { status: 400 });
    }

    // Legacy fallback for existing HTML form submits that still post `trackingNumber`
    // + `shippingCarrier` directly to this endpoint (non-JSON request path).
    const form = await req.formData();
    const orderId = form.get('orderId') as string;
    const trackingNumber = form.get('trackingNumber') as string;
    // Legacy field name `shippingCarrier` maps to canonical `carrier`.
    const shippingCarrier = form.get('shippingCarrier') as string;
    if (!orderId) {
      return NextResponse.json({ error: 'Order ID required.' }, { status: 400 });
    }

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        items: { some: { product: { sellerId } } },
      },
      select: {
        id: true,
        buyerId: true,
        status: true,
        items: {
          select: {
            product: { select: { sellerId: true } },
          },
        },
      },
    });
    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }
    if (order.status !== 'PAID') {
      return NextResponse.json({ error: 'Shipping can only be recorded for paid orders.' }, { status: 400 });
    }

    // Create/update per-seller shipment record for manual tracking entry.
    await prisma.orderShipment.upsert({
      where: { orderId_sellerId: { orderId: order.id, sellerId } },
      create: {
        orderId: order.id,
        sellerId,
        trackingNumber: trackingNumber || null,
        carrier: shippingCarrier || null,
        shipmentStatus: 'SHIPPED_MANUAL',
      },
      update: {
        trackingNumber: trackingNumber || null,
        carrier: shippingCarrier || null,
        shipmentStatus: 'SHIPPED_MANUAL',
      },
    });

    // Determine whether all sellers in the order have now shipped.
    const allSellerIds = distinctSellerIds(order.items);
    const shippedShipments = await prisma.orderShipment.findMany({
      where: { orderId: order.id, sellerId: { in: allSellerIds } },
      select: { sellerId: true, shipmentStatus: true, labelUrl: true, trackingNumber: true },
    });
    const shippedSellerIds = shippedShipments
      .filter((s) => isShipmentShipped(s))
      .map((s) => s.sellerId);
    const orderIsFullyShipped = allSellersShipped(allSellerIds, shippedSellerIds);

    await prisma.order.update({
      where: { id: orderId },
      data: {
        ...(orderIsFullyShipped ? { status: 'SHIPPED' } : {}),
        trackingNumber: trackingNumber || null,
        carrier: shippingCarrier || null,
        // Legacy compatibility mirror.
        shippingCarrier: shippingCarrier || null,
        shipmentStatus: 'SHIPPED_MANUAL',
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
        body: orderIsFullyShipped ? 'Your order has fully shipped.' : 'Part of your order has shipped.',
        link: `/orders/${order.id}`,
        data: { orderId: order.id, status: orderIsFullyShipped ? 'SHIPPED' : 'PAID' },
      },
    ]);

    return NextResponse.redirect(new URL('/seller', req.url));
  } catch (err: any) {
    console.error('[seller/ship]', err);
    return NextResponse.json({ error: err?.message || 'Failed to update order.' }, { status: 500 });
  }
}
