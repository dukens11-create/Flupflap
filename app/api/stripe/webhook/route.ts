import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { getCurrentStripeMode, stripe } from '@/lib/stripe';
import { calculateCommissionCents, calculateSellerNetCents, getMarketplaceSettings, resolveCommissionForSeller } from '@/lib/commission';
import type { CheckoutCommissionItem } from '@/lib/commission';
import crypto from 'crypto';
import Stripe from 'stripe';
import { expirePromotions } from '@/lib/promotions';
import { SellerKycProvider, SellerVerificationStatus } from '@prisma/client';
import {
  applyAutomatedKycResult,
  stripeKycChecksFromAccount,
} from '@/lib/kyc/providers';
import { revalidateProductsCache } from '@/lib/cache-tags';

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
    const currentStripeMode = getCurrentStripeMode();
    if (account.payouts_enabled) {
      await prisma.user.updateMany({
        where: { stripeAccountId: account.id },
        data: {
          stripeOnboardingComplete: true,
          stripeAccountMode: currentStripeMode,
        },
      });
    }

    const seller = await prisma.user.findFirst({
      where: { stripeAccountId: account.id, role: 'SELLER' },
      select: { id: true, phone: true },
    });
    if (seller) {
      const existingVerification = await prisma.sellerVerification.findUnique({
        where: { sellerId: seller.id },
        select: {
          governmentIdVerified: true,
          selfieVerified: true,
          providerVerificationId: true,
          providerInquiryId: true,
        },
      });
      const accountChecks = stripeKycChecksFromAccount(account);
      // account.updated does not evaluate document/selfie checks; those are synced
      // from identity.verification_session.* webhook events and preserved here.
      await applyAutomatedKycResult({
        sellerId: seller.id,
        provider: SellerKycProvider.STRIPE,
        providerStatus: accountChecks.payoutsEnabled ? 'verified' : 'pending',
        providerAccountId: account.id,
        providerInquiryId: existingVerification?.providerInquiryId ?? null,
        providerVerificationId: existingVerification?.providerVerificationId ?? null,
        webhookEventId: event.id,
        checks: {
          governmentIdVerified: existingVerification?.governmentIdVerified ?? false,
          selfieVerified: existingVerification?.selfieVerified ?? false,
          addressVerified: accountChecks.addressVerified,
          phoneVerified: accountChecks.phoneVerified,
        },
      });
    }

    return new NextResponse('ok', { status: 200 });
  }

  if (
    event.type === 'identity.verification_session.verified'
    || event.type === 'identity.verification_session.requires_input'
    || event.type === 'identity.verification_session.canceled'
    || event.type === 'identity.verification_session.processing'
  ) {
    const sessionObject = event.data.object as Stripe.Identity.VerificationSession;
    const metadataSellerId = sessionObject.metadata?.sellerId;

    let sellerId: string | null = metadataSellerId ?? null;
    if (!sellerId) {
      const bySessionId = await prisma.sellerVerification.findFirst({
        where: { providerVerificationId: sessionObject.id },
        select: { sellerId: true },
      });
      sellerId = bySessionId?.sellerId ?? null;
    }
    if (!sellerId) {
      return new NextResponse('ok', { status: 200 });
    }

    const [existingVerification, seller] = await Promise.all([
      prisma.sellerVerification.findUnique({
        where: { sellerId },
        select: {
          providerAccountId: true,
          providerInquiryId: true,
          addressVerified: true,
          phoneVerified: true,
          rejectionReason: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: sellerId },
        select: { stripeAccountId: true },
      }),
    ]);

    const isVerified = event.type === 'identity.verification_session.verified';
    const checks = {
      governmentIdVerified: isVerified,
      selfieVerified: isVerified,
      addressVerified: existingVerification?.addressVerified ?? false,
      phoneVerified: existingVerification?.phoneVerified ?? false,
    };

    let forcedStatus: SellerVerificationStatus | undefined;
    let rejectionReason: string | null = null;
    if (event.type === 'identity.verification_session.requires_input') {
      forcedStatus = SellerVerificationStatus.REJECTED;
      rejectionReason =
        sessionObject.last_error?.reason
        ?? sessionObject.last_error?.code
        ?? 'Identity verification requires additional input.';
    } else if (event.type === 'identity.verification_session.canceled') {
      forcedStatus = SellerVerificationStatus.REJECTED;
      rejectionReason = 'Seller canceled identity verification.';
    }

    await applyAutomatedKycResult({
      sellerId,
      provider: SellerKycProvider.STRIPE,
      providerStatus: sessionObject.status,
      providerAccountId: existingVerification?.providerAccountId ?? seller?.stripeAccountId ?? null,
      providerInquiryId: existingVerification?.providerInquiryId ?? null,
      providerVerificationId: sessionObject.id,
      webhookEventId: event.id,
      checks,
      forcedStatus,
      rejectionReason,
    });

    return new NextResponse('ok', { status: 200 });
  }

  // ── Seller subscription: keep status in sync across renewals / cancellations ──
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as any;
    const customerId: string = sub.customer;

    const statusMap: Record<string, string> = {
      active: 'ACTIVE',
      past_due: 'PAST_DUE',
      unpaid: 'PAST_DUE',
      canceled: 'CANCELLED',
      incomplete: 'INACTIVE',
      incomplete_expired: 'INACTIVE',
      trialing: 'ACTIVE',
      paused: 'INACTIVE',
    };
    const newStatus = statusMap[sub.status as string] ?? 'INACTIVE';
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

    await prisma.user.updateMany({
      where: { stripeCustomerId: customerId },
      data: {
        subscriptionStatus: newStatus,
        subscriptionId: sub.id,
        ...(periodEnd ? { subscriptionCurrentPeriodEnd: periodEnd } : {}),
      },
    });

    return new NextResponse('ok', { status: 200 });
  }

  // ── Seller subscription: mark PAST_DUE on failed invoice payment ─────────────
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as any;
    const customerId: string = invoice.customer;
    if (invoice.subscription) {
      await prisma.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: { subscriptionStatus: 'PAST_DUE' },
      });
    }
    return new NextResponse('ok', { status: 200 });
  }

  // ── Seller subscription: mark ACTIVE on successful invoice payment ────────────
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as any;
    const customerId: string = invoice.customer;
    if (invoice.subscription) {
      // Retrieve updated subscription period
      let periodEnd: Date | null = null;
      try {
        const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
        periodEnd = new Date((sub as any).current_period_end * 1000);
      } catch {
        // Non-fatal
      }
      await prisma.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: {
          subscriptionStatus: 'ACTIVE',
          ...(periodEnd ? { subscriptionCurrentPeriodEnd: periodEnd } : {}),
        },
      });
    }
    return new NextResponse('ok', { status: 200 });
  }

  // ── Stripe Connect: seller onboarding ────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    await expirePromotions();
    const cs = event.data.object as any;

    // Handle seller subscription enrollment
    if (cs.metadata?.type === 'seller_subscription') {
      const sellerId: string = cs.metadata?.sellerId;
      if (!sellerId) return new NextResponse('Missing sellerId', { status: 400 });

      // Retrieve the Stripe subscription to get period details
      const subscriptionId: string | null = cs.subscription ?? null;
      let periodEnd: Date | null = null;
      if (subscriptionId) {
        try {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          periodEnd = new Date((sub as any).current_period_end * 1000);
        } catch {
          // Non-fatal — status will be synced via customer.subscription.updated
        }
      }

      await prisma.user.update({
        where: { id: sellerId },
        data: {
          subscriptionStatus: 'ACTIVE',
          subscriptionId: subscriptionId ?? undefined,
          subscriptionCurrentPeriodEnd: periodEnd ?? undefined,
        },
      });

      return new NextResponse('ok', { status: 200 });
    }

    // Handle promotion payments separately from product purchases
    if (cs.metadata?.type === 'promotion') {
      const promotionId: string = cs.metadata?.promotionId;
      if (!promotionId) return new NextResponse('Missing promotionId', { status: 400 });

      // Avoid duplicate processing
      const promo = await prisma.promotion.findUnique({ where: { id: promotionId } });
      if (!promo || promo.status === 'ACTIVE') return new NextResponse('Already processed', { status: 200 });

      const now = new Date();
      const expiresAt = new Date(now.getTime() + promo.durationDays * 24 * 60 * 60 * 1000);
      await prisma.promotion.update({
        where: { id: promotionId },
        data: { status: 'ACTIVE', startsAt: now, expiresAt },
      });

      revalidateProductsCache(promo.productId);
      return new NextResponse('ok', { status: 200 });
    }
    const metadataBuyerId: string = cs.metadata?.buyerId;
    const rawItems: string = cs.metadata?.items ?? '[]';
    const metadataItems: { productId: string; quantity: number }[] = JSON.parse(rawItems);
    const rawPickupIds: string = cs.metadata?.pickupItemIds ?? '[]';
    const metadataPickupItemIds: string[] = JSON.parse(rawPickupIds);

    // Avoid duplicate processing
    const existing = await prisma.order.findUnique({ where: { stripeCheckoutId: cs.id } });
    if (existing) return new NextResponse('Already processed', { status: 200 });

    const snapshot = await prisma.checkoutSessionSnapshot.findUnique({
      where: { stripeCheckoutId: cs.id },
    });
    const buyerId = snapshot?.buyerId ?? metadataBuyerId;
    const items = (snapshot?.items as { productId: string; quantity: number }[] | null) ?? metadataItems;
    const pickupItemIds = (snapshot?.pickupItemIds as string[] | null) ?? metadataPickupItemIds;
    const isPickupOrder = pickupItemIds.length > 0;

    if (!buyerId || !items.length) {
      return new NextResponse('Missing metadata', { status: 400 });
    }
    const pickupSet = new Set(pickupItemIds);

    const [settings, products] = await Promise.all([
      getMarketplaceSettings(),
      prisma.product.findMany({
        where: { id: { in: items.map(i => i.productId) } },
        include: {
          seller: {
            select: {
              id: true,
              stripeAccountId: true,
              stripeOnboardingComplete: true,
              sellerPlan: { select: { code: true, commissionRateBps: true } },
            },
          },
        },
      }),
    ]);
    const snapshotCommissionItems = (snapshot?.commissionItems as CheckoutCommissionItem[] | null) ?? [];
    const commissionItemsByProductId = new Map<string, CheckoutCommissionItem>(
      snapshotCommissionItems.map((item) => [item.productId, item]),
    );
    const productsById = new Map(products.map((product) => [product.id, product]));

    if (products.length !== items.length) {
      return new NextResponse('Missing products', { status: 400 });
    }

    const orderItems = items.map((item) => {
      const product = productsById.get(item.productId);
      if (!product) {
        throw new Error(`Missing product for checkout item ${item.productId}`);
      }

      const fallbackCommission = resolveCommissionForSeller({
        seller: product.seller,
        defaultSellerCommissionBps: settings.defaultSellerCommissionBps,
      });
      const snapshotCommission = commissionItemsByProductId.get(product.id);
      const quantity = snapshotCommission?.quantity ?? item.quantity;
      const priceCents = snapshotCommission?.priceCents ?? product.priceCents;
      const shippingCents = snapshotCommission?.shippingCents ?? (pickupSet.has(product.id) ? 0 : product.shippingCents);
      const lineSubtotalCents = snapshotCommission?.lineSubtotalCents ?? (priceCents * quantity);
      const commissionRateBps = snapshotCommission?.commissionRateBps ?? fallbackCommission.commissionRateBps;
      const commissionFeeCents = snapshotCommission?.commissionFeeCents ?? calculateCommissionCents(lineSubtotalCents, commissionRateBps);

      return {
        product,
        quantity,
        priceCents,
        shippingCents,
        lineSubtotalCents,
        commissionRateBps,
        commissionFeeCents,
        sellerNetCents: snapshotCommission?.sellerNetCents ?? calculateSellerNetCents(lineSubtotalCents, commissionRateBps),
        commissionSource: snapshotCommission?.commissionSource ?? fallbackCommission.commissionSource,
        commissionPlanCode: snapshotCommission?.commissionPlanCode ?? fallbackCommission.commissionPlanCode,
      };
    });

    const subtotalCents = orderItems.reduce((sum, item) => sum + item.lineSubtotalCents, 0);
    const shippingTotalCents = orderItems.reduce((sum, item) => sum + item.shippingCents * item.quantity, 0);
    const platformFeeCents = orderItems.reduce((sum, item) => sum + item.commissionFeeCents, 0);
    const totalCents = subtotalCents + shippingTotalCents;

    const shipping = cs.shipping_details ?? {};

    // Gather pickup location from first pickup product for order record
    const firstPickupProduct = products.find(p => pickupSet.has(p.id));

    const order = await prisma.order.create({
      data: {
        buyerId,
        totalCents,
        subtotalCents,
        shippingCents: shippingTotalCents,
        platformFeeCents,
        sellerPayoutCents: totalCents - platformFeeCents,
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
          create: orderItems.map(item => ({
            productId: item.product.id,
            priceCents: item.priceCents,
            shippingCents: item.shippingCents,
            quantity: item.quantity,
            lineSubtotalCents: item.lineSubtotalCents,
            commissionRateBps: item.commissionRateBps,
            commissionFeeCents: item.commissionFeeCents,
            sellerNetCents: item.sellerNetCents,
            commissionSource: item.commissionSource,
            commissionPlanCode: item.commissionPlanCode,
          })),
        },
      },
    });

    // Single-seller checkouts that used payment_intent_data.transfer_data were
    // already split automatically by Stripe, so only platform-held payments need
    // manual post-payment transfers here.
    if (!snapshot?.directToSellerId && cs.payment_intent) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(String(cs.payment_intent), {
          expand: ['latest_charge'],
        });
        const sourceChargeId = typeof paymentIntent.latest_charge === 'string'
          ? paymentIntent.latest_charge
          : paymentIntent.latest_charge?.id;

        if (sourceChargeId) {
          const sellerTransfers = new Map<string, { destination: string; amount: number; sellerId: string }>();

          for (const item of orderItems) {
            if (!item.product.seller.stripeOnboardingComplete || !item.product.seller.stripeAccountId) continue;
            const shippingPayoutCents = item.shippingCents * item.quantity;
            const transferAmount = item.sellerNetCents + shippingPayoutCents;
            if (transferAmount <= 0) continue;

            const existingTransfer = sellerTransfers.get(item.product.seller.id);
            if (existingTransfer) {
              existingTransfer.amount += transferAmount;
            } else {
              sellerTransfers.set(item.product.seller.id, {
                destination: item.product.seller.stripeAccountId,
                amount: transferAmount,
                sellerId: item.product.seller.id,
              });
            }
          }

          for (const transfer of sellerTransfers.values()) {
            await stripe.transfers.create({
              amount: transfer.amount,
              currency: 'usd',
              destination: transfer.destination,
              source_transaction: sourceChargeId,
              transfer_group: `order_${order.id}`,
              metadata: {
                orderId: order.id,
                sellerId: transfer.sellerId,
                stripeCheckoutId: cs.id,
              },
            });
          }
        }
      } catch (err) {
        console.error('[webhook] transfer creation failed:', err);
      }
    }

    const activePromotions = await prisma.promotion.findMany({
      where: {
        productId: { in: orderItems.map((item) => item.product.id) },
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: 'desc' },
      select: { id: true, productId: true },
    });
    const activePromotionByProductId = new Map<string, string>();
    for (const promotion of activePromotions) {
      // `activePromotions` is ordered by latest expiry first so the first row for a
      // product is the currently most relevant active promotion we want to update.
      if (!activePromotionByProductId.has(promotion.productId)) {
        activePromotionByProductId.set(promotion.productId, promotion.id);
      }
    }

    // Decrement inventory and mark as SOLD if qty reaches 0
    for (const item of orderItems) {
      const activePromotionId = activePromotionByProductId.get(item.product.id);
      if (activePromotionId) {
        await prisma.promotion.update({
          where: { id: activePromotionId },
          data: {
            saleCount: { increment: item.quantity },
            saleAmountCents: { increment: item.lineSubtotalCents },
          },
        });
      }
      const newInventory = Math.max(0, item.product.inventory - item.quantity);
      await prisma.product.update({
        where: { id: item.product.id },
        data: {
          inventory: newInventory,
          status: newInventory <= 0 ? 'SOLD' : undefined,
        },
      });
      revalidateProductsCache(item.product.id);
    }

    if (snapshot) {
      await prisma.checkoutSessionSnapshot.delete({
        where: { stripeCheckoutId: snapshot.stripeCheckoutId },
      });
    }
  }

  return new NextResponse('ok', { status: 200 });
}
