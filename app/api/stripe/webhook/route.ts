import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { platformFee, sellerPayout } from '@/lib/money';
import { generatePickupCode, hashPickupCode } from '@/lib/pickup';

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
    const items: { productId: string; quantity: number }[] = JSON.parse(rawItems);
    const fulfillmentType: 'SHIPPING' | 'PICKUP' = cs.metadata?.fulfillmentType === 'PICKUP'
      ? 'PICKUP'
      : 'SHIPPING';

    if (!buyerId || !items.length) {
      return new NextResponse('Missing metadata', { status: 400 });
    }

    // Avoid duplicate processing
    const existing = await prisma.order.findUnique({ where: { stripeCheckoutId: cs.id } });
    if (existing) return new NextResponse('Already processed', { status: 200 });

    const products = await prisma.product.findMany({
      where: { id: { in: items.map(i => i.productId) } },
    });

    // Pre-build a quantity map to avoid repeated O(n) lookups
    const qtyMap = new Map(items.map(i => [i.productId, i.quantity]));
    const getQty = (productId: string) => {
      const qty = qtyMap.get(productId);
      if (qty === undefined) {
        console.warn('[webhook] Product %s not found in items map — defaulting qty to 1', productId);
        return 1;
      }
      return qty;
    };

    const subtotalCents = products.reduce((sum, p) => sum + p.priceCents * getQty(p.id), 0);

    // For pickup orders, no shipping cost is charged
    const shippingCents = fulfillmentType === 'PICKUP' ? 0 : products.reduce((s, p) => {
      return s + p.shippingCents * getQty(p.id);
    }, 0);

    const totalCents = subtotalCents + shippingCents;

    const shipping = cs.shipping_details ?? {};

    // For pickup orders, generate a 6-digit code
    let pickupCode: string | null = null;
    let pickupCodeHash: string | null = null;
    if (fulfillmentType === 'PICKUP') {
      pickupCode = generatePickupCode();
      pickupCodeHash = await hashPickupCode(pickupCode);
    }

    const order = await prisma.order.create({
      data: {
        buyerId,
        totalCents,
        subtotalCents,
        shippingCents,
        platformFeeCents: platformFee(totalCents),
        sellerPayoutCents: sellerPayout(totalCents),
        status: fulfillmentType === 'PICKUP' ? 'READY_FOR_PICKUP' : 'PAID',
        fulfillmentType,
        stripeCheckoutId: cs.id,
        stripePaymentIntentId: cs.payment_intent ?? null,
        shippingName: shipping?.name ?? null,
        shippingLine1: shipping?.address?.line1 ?? null,
        shippingLine2: shipping?.address?.line2 ?? null,
        shippingCity: shipping?.address?.city ?? null,
        shippingState: shipping?.address?.state ?? null,
        shippingPostalCode: shipping?.address?.postal_code ?? null,
        shippingCountry: shipping?.address?.country ?? null,
        pickupCode,
        pickupCodeHash,
        items: {
          create: products.map(p => ({
            productId: p.id,
            priceCents: p.priceCents,
            quantity: getQty(p.id),
          })),
        },
      },
    });

    // Decrement inventory and mark as SOLD if qty reaches 0
    for (const p of products) {
      const qty = getQty(p.id);
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
