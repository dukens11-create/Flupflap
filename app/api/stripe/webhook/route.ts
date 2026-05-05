import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { platformFee, sellerPayout } from '@/lib/money';
import crypto from 'crypto';

/** Generate a 6-digit alphanumeric pickup code. */
function generatePickupCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // unambiguous chars
  let code = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = (await headers()).get('stripe-signature') ?? '';
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? '';

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err: any) {
    console.error('[webhook] signature error:', err.message);
    return new NextResponse(`Webhook error: ${err.message}`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const cs = event.data.object as any;
    const buyerId: string = cs.metadata?.buyerId;
    const rawItems: string = cs.metadata?.items ?? '[]';
    const items: { productId: string; quantity: number; isPickup?: boolean }[] = JSON.parse(rawItems);

    if (!buyerId || !items.length) {
      return new NextResponse('Missing metadata', { status: 400 });
    }

    // Avoid duplicate processing
    const existing = await prisma.order.findUnique({ where: { stripeCheckoutId: cs.id } });
    if (existing) return new NextResponse('Already processed', { status: 200 });

    const products = await prisma.product.findMany({
      where: { id: { in: items.map(i => i.productId) } },
    });

    // Determine if this is a pickup order (any item marked as pickup).
    // MVP limitation: mixed pickup/ship carts and multi-location pickup are not
    // fully validated here — both are documented in DEPLOYMENT.md.
    const isPickup = items.some(i => i.isPickup);

    const subtotalCents = products.reduce((s, p) => {
      const qty = items.find(i => i.productId === p.id)?.quantity ?? 1;
      return s + p.priceCents * qty;
    }, 0);

    const shippingCents = isPickup ? 0 : products.reduce((s, p) => {
      const qty = items.find(i => i.productId === p.id)?.quantity ?? 1;
      return s + p.shippingCents * qty;
    }, 0);

    const totalCents = subtotalCents + shippingCents;

    const shipping = cs.shipping_details ?? {};

    // For pickup orders, use the product's pickup location
    const pickupProduct = isPickup ? products.find(p => {
      const item = items.find(i => i.productId === p.id);
      return item?.isPickup;
    }) : null;

    const order = await prisma.order.create({
      data: {
        buyerId,
        totalCents,
        subtotalCents,
        shippingCents,
        platformFeeCents: platformFee(totalCents),
        sellerPayoutCents: sellerPayout(totalCents),
        status: 'PAID',
        stripeCheckoutId: cs.id,
        stripePaymentIntentId: cs.payment_intent ?? null,
        isPickup,
        pickupCity: isPickup ? (pickupProduct?.pickupCity ?? null) : null,
        pickupState: isPickup ? (pickupProduct?.pickupState ?? null) : null,
        ...(!isPickup && {
          shippingName: shipping?.name ?? null,
          shippingLine1: shipping?.address?.line1 ?? null,
          shippingLine2: shipping?.address?.line2 ?? null,
          shippingCity: shipping?.address?.city ?? null,
          shippingState: shipping?.address?.state ?? null,
          shippingPostalCode: shipping?.address?.postal_code ?? null,
          shippingCountry: shipping?.address?.country ?? null,
        }),
        items: {
          create: products.map(p => ({
            productId: p.id,
            priceCents: p.priceCents,
            quantity: items.find(i => i.productId === p.id)?.quantity ?? 1,
          })),
        },
      },
    });

    // Generate pickup confirmation code for pickup orders
    if (isPickup) {
      await prisma.pickupConfirmation.create({
        data: {
          orderId: order.id,
          code: generatePickupCode(),
        },
      });
    }

    // Decrement inventory and mark as SOLD if qty reaches 0
    for (const p of products) {
      const qty = items.find(i => i.productId === p.id)?.quantity ?? 1;
      const newInventory = Math.max(0, p.inventory - qty);
      await prisma.product.update({
        where: { id: p.id },
        data: {
          inventory: newInventory,
          status: newInventory <= 0 ? 'SOLD' : undefined,
        },
      });
    }
  }

  return new NextResponse('ok', { status: 200 });
}
