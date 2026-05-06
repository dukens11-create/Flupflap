import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { platformFee, sellerPayout } from '@/lib/money';
import crypto from 'crypto';
import Stripe from 'stripe';

/** Generate a cryptographically secure 6-digit pickup confirmation code. */
function generatePickupCode(): string {
  // crypto.randomInt is CSPRNG; range [100000, 1000000) gives 900,000
  // possible codes. Access is gated behind seller authentication and order
  // ownership, making brute force impractical.
  return String(crypto.randomInt(100000, 1000000));
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

  // Mark seller onboarding complete when Stripe confirms the connected account
  // is fully set up and payouts are enabled.
  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account;
    if (account.payouts_enabled) {
      await prisma.user.updateMany({
        where: { stripeAccountId: account.id },
        data: { stripeOnboardingComplete: true },
      });
    }
    return new NextResponse('ok', { status: 200 });
  }

  if (event.type === 'checkout.session.completed') {
    const cs = event.data.object as any;

    // Handle promotion payments separately from product purchases
    if (cs.metadata?.type === 'promotion') {
      const promotionId: string = cs.metadata?.promotionId;
      const promotionAction: string = cs.metadata?.promotionAction ?? 'new';
      const replacePromotionId: string = cs.metadata?.replacePromotionId ?? '';

      if (!promotionId) return new NextResponse('Missing promotionId', { status: 400 });

      // Avoid duplicate processing
      const promo = await prisma.promotion.findUnique({ where: { id: promotionId } });
      if (!promo || promo.status === 'ACTIVE') return new NextResponse('Already processed', { status: 200 });

      const now = new Date();

      // For 'change': expire the old active promotion before activating the new one.
      // Verify ownership before expiring: the old promotion must belong to the same
      // seller and product as the new promotion to prevent a malicious actor from
      // expiring another seller's promotion via crafted metadata.
      if (promotionAction === 'change' && replacePromotionId) {
        await prisma.promotion.updateMany({
          where: {
            id: replacePromotionId,
            sellerId: promo.sellerId,
            productId: promo.productId,
          },
          data: { status: 'EXPIRED' },
        });
      }

      // Determine when the new promotion starts:
      // - Pre-expiry renew: scheduledStartAt is set to the old promotion's expiresAt
      // - All other cases (new, change, post-expiry renew): start immediately
      const startsAt =
        promo.scheduledStartAt && promo.scheduledStartAt > now
          ? promo.scheduledStartAt
          : now;
      const expiresAt = new Date(startsAt.getTime() + promo.durationDays * 24 * 60 * 60 * 1000);

      await prisma.promotion.update({
        where: { id: promotionId },
        data: { status: 'ACTIVE', startsAt, expiresAt },
      });

      return new NextResponse('ok', { status: 200 });
    }
    const buyerId: string = cs.metadata?.buyerId;
    const rawItems: string = cs.metadata?.items ?? '[]';
    const items: { productId: string; quantity: number }[] = JSON.parse(rawItems);
    const rawPickupIds: string = cs.metadata?.pickupItemIds ?? '[]';
    const pickupItemIds: string[] = JSON.parse(rawPickupIds);
    const isPickupOrder: boolean = cs.metadata?.isPickup === 'true';

    if (!buyerId || !items.length) {
      return new NextResponse('Missing metadata', { status: 400 });
    }

    // Avoid duplicate processing
    const existing = await prisma.order.findUnique({ where: { stripeCheckoutId: cs.id } });
    if (existing) return new NextResponse('Already processed', { status: 200 });

    const pickupSet = new Set(pickupItemIds);

    const products = await prisma.product.findMany({
      where: { id: { in: items.map(i => i.productId) } },
    });

    const totalCents = products.reduce((sum, p) => {
      const qty = items.find(i => i.productId === p.id)?.quantity ?? 1;
      const isPickup = pickupSet.has(p.id);
      return sum + (p.priceCents + (isPickup ? 0 : p.shippingCents)) * qty;
    }, 0);

    const shipping = cs.shipping_details ?? {};

    // Gather pickup location from first pickup product for order record
    const firstPickupProduct = products.find(p => pickupSet.has(p.id));

    const order = await prisma.order.create({
      data: {
        buyerId,
        totalCents,
        subtotalCents: products.reduce((s, p) => {
          const qty = items.find(i => i.productId === p.id)?.quantity ?? 1;
          return s + p.priceCents * qty;
        }, 0),
        shippingCents: products.reduce((s, p) => {
          const qty = items.find(i => i.productId === p.id)?.quantity ?? 1;
          if (pickupSet.has(p.id)) return s; // no shipping for pickup
          return s + p.shippingCents * qty;
        }, 0),
        platformFeeCents: platformFee(totalCents),
        sellerPayoutCents: sellerPayout(totalCents),
        status: 'PAID',
        stripeCheckoutId: cs.id,
        stripePaymentIntentId: cs.payment_intent ?? null,
        isPickup: isPickupOrder,
        pickupCode: isPickupOrder ? generatePickupCode() : null,
        pickupCity: isPickupOrder ? (firstPickupProduct?.pickupCity ?? null) : null,
        pickupState: isPickupOrder ? (firstPickupProduct?.pickupState ?? null) : null,
        shippingName: shipping?.name ?? null,
        shippingLine1: shipping?.address?.line1 ?? null,
        shippingLine2: shipping?.address?.line2 ?? null,
        shippingCity: shipping?.address?.city ?? null,
        shippingState: shipping?.address?.state ?? null,
        shippingPostalCode: shipping?.address?.postal_code ?? null,
        shippingCountry: shipping?.address?.country ?? null,
        items: {
          create: products.map(p => ({
            productId: p.id,
            priceCents: p.priceCents,
            quantity: items.find(i => i.productId === p.id)?.quantity ?? 1,
          })),
        },
      },
    });

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
