import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { appUrl, extractStripeResourceId, getCurrentStripeMode, stripe } from '@/lib/stripe';
import { calculateCommissionCents, calculateSellerNetCents, getMarketplaceSettings, resolveCommissionForSeller } from '@/lib/commission';
import type { CheckoutCommissionItem } from '@/lib/commission';
import crypto from 'crypto';
import Stripe from 'stripe';
import { expirePromotions } from '@/lib/promotions';
import { NotificationType, SellerKycProvider, SellerVerificationStatus } from '@prisma/client';
import {
  applyAutomatedKycResult,
  stripeKycChecksFromAccount,
} from '@/lib/kyc/providers';
import { isSellerVerificationApproved } from '@/lib/seller-verification';
import { createNotification, createNotifications, type CreateNotificationInput } from '@/lib/notifications';
import { purchaseShipmentRate, buildTrackingUrl } from '@/lib/shipping';
import { sendEmail } from '@/lib/email';
import { logError, logInfo, logWarn } from '@/lib/logger';
import {
  confirmGarageSalePayment,
  failGarageSaleCheckoutSession,
  finalizeGarageSaleCheckoutSession,
  isGarageSaleCheckoutSession,
} from '@/lib/garage-sale-payment-sync';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const CHECKOUT_COMPLETION_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);

/** Generate a cryptographically secure 6-digit pickup confirmation code. */
function generatePickupCode(): string {
  // crypto.randomInt is CSPRNG; range [100000, 1000000) gives 900,000
  // possible codes. Access is gated behind seller authentication and order
  // ownership, making brute force impractical.
  return String(crypto.randomInt(100000, 1000000));
}

async function markGarageSaleCheckoutAsFailed(cs: Stripe.Checkout.Session, reason: 'FAILED' | 'PENDING' = 'FAILED') {
  const checkoutContext = await resolveGarageSaleCheckoutContext(cs.id);
  const saleId = cs.metadata?.saleId ?? checkoutContext?.saleId;
  if (!saleId) return;

  await prisma.$transaction([
    prisma.garageSale.updateMany({
      where: { id: saleId, paymentStatus: 'PENDING' },
      data: {
        paymentStatus: reason,
        status: 'HIDDEN',
        isFeatured: false,
      },
    }),
    prisma.garageSalePayment.updateMany({
      where: { stripeCheckoutId: cs.id, status: 'PENDING' },
      data: { status: reason },
    }),
  ]);
}

async function resolveGarageSaleCheckoutContext(checkoutId: string) {
  const payment = await prisma.garageSalePayment.findUnique({
    where: { stripeCheckoutId: checkoutId },
    select: { saleId: true, sellerId: true },
  });
  if (payment) {
    return payment;
  }

  const sale = await prisma.garageSale.findUnique({
    where: { stripeCheckoutId: checkoutId },
    select: { id: true, sellerId: true },
  });
  if (!sale) {
    return null;
  }

  return { saleId: sale.id, sellerId: sale.sellerId };
}

async function finalizeGarageSaleCheckout(cs: Stripe.Checkout.Session) {
  const checkoutContext = await resolveGarageSaleCheckoutContext(cs.id);
  const saleId: string | undefined = cs.metadata?.saleId ?? checkoutContext?.saleId;
  const sellerId: string | undefined = cs.metadata?.sellerId ?? checkoutContext?.sellerId;
  if (!saleId || !sellerId) {
    return new NextResponse('Missing garage sale metadata', { status: 400 });
  }

  const sale = await prisma.garageSale.findUnique({ where: { id: saleId } });
  if (!sale) return new NextResponse('Garage sale not found', { status: 404 });

  if (cs.payment_status !== 'paid') {
    await markGarageSaleCheckoutAsFailed(cs, 'PENDING');
    return new NextResponse('ok', { status: 200 });
  }

  const paymentIntentId = typeof cs.payment_intent === 'string' ? cs.payment_intent : cs.payment_intent?.id ?? null;

  let receiptUrl: string | null = null;
  if (cs.payment_intent) {
    try {
      const intent = await stripe.paymentIntents.retrieve(String(cs.payment_intent), { expand: ['latest_charge'] });
      if (typeof intent.latest_charge !== 'string') {
        receiptUrl = intent.latest_charge?.receipt_url ?? null;
      }
    } catch {
      // Non-fatal
    }
  }

  await confirmGarageSalePayment({
    saleId,
    sellerId,
    amountCents: typeof cs.amount_total === 'number' ? cs.amount_total : sale.totalPaidCents,
    stripeCheckoutId: cs.id,
    stripePaymentId: paymentIntentId,
    stripeReceiptUrl: receiptUrl,
    source: 'checkout_session',
  });

  return new NextResponse('ok', { status: 200 });
}

async function finalizeGarageSaleFromPaymentIntent(intent: Stripe.PaymentIntent) {
  if (intent.metadata?.type !== 'garage_sale_listing') {
    return new NextResponse('ok', { status: 200 });
  }

  const saleId = intent.metadata?.saleId;
  const sellerId = intent.metadata?.sellerId;
  if (!saleId || !sellerId) {
    try {
      const sessions = await stripe.checkout.sessions.list({
        payment_intent: intent.id,
        limit: 1,
      });
      const checkoutSession = sessions.data[0];
      if (checkoutSession && checkoutSession.metadata?.type === 'garage_sale_listing') {
        return finalizeGarageSaleCheckout(checkoutSession);
      }
      if (!checkoutSession) {
        logWarn('No checkout session found for successful garage sale payment intent', {
          tag: 'stripe/webhook',
          paymentIntentId: intent.id,
        });
      }
    } catch (error) {
      logWarn('Unable to list checkout sessions by payment intent for garage sale', {
        tag: 'stripe/webhook',
        paymentIntentId: intent.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return new NextResponse('ok', { status: 200 });
  }

  const sale = await prisma.garageSale.findUnique({ where: { id: saleId } });
  if (!sale) {
    return new NextResponse('ok', { status: 200 });
  }

  let receiptUrl: string | null = null;
  if (typeof intent.latest_charge !== 'string') {
    receiptUrl = intent.latest_charge?.receipt_url ?? null;
  } else {
    try {
      const expandedIntent = await stripe.paymentIntents.retrieve(intent.id, { expand: ['latest_charge'] });
      if (typeof expandedIntent.latest_charge !== 'string') {
        receiptUrl = expandedIntent.latest_charge?.receipt_url ?? null;
      }
    } catch (error) {
      logWarn('Unable to retrieve expanded payment intent charge for garage sale receipt', {
        tag: 'stripe/webhook',
        paymentIntentId: intent.id,
        message: error instanceof Error ? error.message : String(error),
      });
      // Non-fatal
    }
  }

  const amountPaidCents = intent.amount_received;
  if (amountPaidCents <= 0) {
    logWarn('Garage sale payment intent succeeded with non-positive amount_received', {
      tag: 'stripe/webhook',
      paymentIntentId: intent.id,
      saleId,
      amountReceived: amountPaidCents,
    });
    return new NextResponse('ok', { status: 200 });
  }
  await confirmGarageSalePayment({
    saleId,
    sellerId,
    amountCents: amountPaidCents,
    stripePaymentId: intent.id,
    stripeReceiptUrl: receiptUrl,
    source: 'payment_intent',
  });

  return new NextResponse('ok', { status: 200 });
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
    logWarn('Stripe webhook signature verification failed', { tag: 'stripe/webhook', message: err.message });
    return new NextResponse(`Webhook error: ${err.message}`, { status: 400 });
  }

  if (
    event.type === 'payment_intent.succeeded'
    || CHECKOUT_COMPLETION_EVENTS.has(event.type)
    || event.type === 'checkout.session.expired'
    || event.type === 'checkout.session.async_payment_failed'
  ) {
    logInfo('Stripe webhook received for garage sale payment flow', {
      tag: 'stripe/webhook',
      eventType: event.type,
      eventId: event.id,
    });
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

      const payoutRequirementsDue = [
        ...(account.requirements?.currently_due ?? []),
        ...(account.requirements?.past_due ?? []),
      ];

      if (account.payouts_enabled) {
        await createNotification({
          userId: seller.id,
          type: NotificationType.PAYOUT,
          title: 'Payouts are ready',
          body: 'Your Stripe payout account is active and ready to receive marketplace earnings.',
          link: '/seller',
          dedupeKey: `payouts-ready:${account.id}:${currentStripeMode}`,
        });
      } else if (payoutRequirementsDue.length > 0) {
        await createNotification({
          userId: seller.id,
          type: NotificationType.PAYOUT,
          title: 'Payout account needs attention',
          body: 'Stripe needs additional information before payouts can continue.',
          link: '/seller',
          dedupeKey: `payouts-action-required:${account.id}:${currentStripeMode}`,
        });
      }
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
          governmentIdVerified: true,
          selfieVerified: true,
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
    const hadPassedIdentityChecks =
      Boolean(existingVerification?.governmentIdVerified)
      && Boolean(existingVerification?.selfieVerified);
    const identityChecksVerified = hadPassedIdentityChecks || isVerified;
    const checks = {
      governmentIdVerified: identityChecksVerified,
      selfieVerified: identityChecksVerified,
      addressVerified: existingVerification?.addressVerified ?? false,
      phoneVerified: existingVerification?.phoneVerified ?? false,
    };

    let forcedStatus: SellerVerificationStatus | undefined;
    let rejectionReason: string | null = null;
    if (event.type === 'identity.verification_session.verified') {
      // Stripe has confirmed the identity — mark the seller as approved immediately.
      forcedStatus = SellerVerificationStatus.APPROVED;
    } else if (event.type === 'identity.verification_session.requires_input' && !hadPassedIdentityChecks) {
      forcedStatus = SellerVerificationStatus.REJECTED;
      rejectionReason =
        sessionObject.last_error?.reason
        ?? sessionObject.last_error?.code
        ?? 'Identity verification requires additional input.';
    } else if (event.type === 'identity.verification_session.canceled' && !hadPassedIdentityChecks) {
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

  if (event.type === 'checkout.session.expired') {
    const cs = event.data.object as Stripe.Checkout.Session;
    if (isGarageSaleCheckoutSession(cs)) {
      logWarn('Garage sale checkout failed', {
        tag: 'stripe/webhook',
        action: 'garageSaleCheckoutFailed',
        eventType: 'checkout.session.expired',
        stripeCheckoutId: cs.id,
        saleId: cs.metadata?.saleId,
      });
      await failGarageSaleCheckoutSession(cs);
      await markGarageSaleCheckoutAsFailed(cs, 'FAILED');
    }
    return new NextResponse('ok', { status: 200 });
  }

  if (event.type === 'checkout.session.async_payment_failed') {
    const cs = event.data.object as Stripe.Checkout.Session;
    if (isGarageSaleCheckoutSession(cs)) {
      logWarn('Garage sale checkout async payment failed', {
        tag: 'stripe/webhook',
        action: 'garageSaleCheckoutAsyncPaymentFailed',
        eventType: 'checkout.session.async_payment_failed',
        stripeCheckoutId: cs.id,
        saleId: cs.metadata?.saleId,
      });
      await failGarageSaleCheckoutSession(cs);
    }
    return new NextResponse('ok', { status: 200 });
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent;
    if (intent.metadata?.type === 'garage_sale_listing') {
      return finalizeGarageSaleFromPaymentIntent(intent);
    }
    return new NextResponse('ok', { status: 200 });
  }
  // ── Checkout completion: garage sales, subscriptions, promotions, orders ────
  if (CHECKOUT_COMPLETION_EVENTS.has(event.type)) {
    const cs = event.data.object as Stripe.Checkout.Session;
    // Keep promotion statuses fresh on all successful checkout completions
    // so stale boosts are cleaned even when there are no promotion-only requests.
    try {
      await expirePromotions();
    } catch (err) {
      logError('Promotion expiry failed during checkout webhook', err, {
        tag: 'stripe/webhook',
        action: 'expirePromotions',
        eventType: event.type,
      });
    }

    if (isGarageSaleCheckoutSession(cs)) {
      const finalized = await finalizeGarageSaleCheckoutSession(cs);
      if (!finalized.processed && finalized.reason === 'missing_sale_id') {
        return finalizeGarageSaleCheckout(cs);
      }
      return new NextResponse('ok', { status: 200 });
    }

    // Handle seller subscription enrollment
    if (cs.metadata?.type === 'seller_subscription') {
      const sellerId = cs.metadata?.sellerId;
      if (!sellerId) return new NextResponse('Missing sellerId', { status: 400 });

      // Retrieve the Stripe subscription to get period details
      const subscriptionId = extractStripeResourceId(cs.subscription);
      let periodEnd: Date | null = null;
      if (subscriptionId) {
        try {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          periodEnd = new Date((sub as any).current_period_end * 1000);
        } catch {
          // Non-fatal — status will be synced via customer.subscription.updated
        }
      }

      const now = new Date();
      const settings = await getMarketplaceSettings();
      const expiry = settings.freePromotionEnabled
        ? new Date(now.getTime() + settings.freePromotionDurationDays * MILLISECONDS_PER_DAY)
        : null;
      const updatedRows = await prisma.$executeRaw`
        WITH target AS (
          SELECT "id"
          FROM "User"
          WHERE "id" = ${sellerId}
          FOR UPDATE
        )
        UPDATE "User" u
        SET
          "subscriptionStatus" = 'ACTIVE',
          "subscriptionId" = CASE
            WHEN ${subscriptionId}::text IS NULL THEN u."subscriptionId"
            ELSE ${subscriptionId}
          END,
          "subscriptionCurrentPeriodEnd" = CASE
            WHEN ${periodEnd}::timestamptz IS NULL THEN u."subscriptionCurrentPeriodEnd"
            ELSE ${periodEnd}
          END,
          "freePromotionStart" = CASE
            WHEN ${settings.freePromotionEnabled}::boolean = true THEN COALESCE(u."freePromotionStart", ${now})
            ELSE u."freePromotionStart"
          END,
          "freePromotionEnd" = CASE
            WHEN ${expiry}::timestamptz IS NULL THEN u."freePromotionEnd"
            ELSE COALESCE(u."freePromotionEnd", ${expiry})
          END,
          "freePromotionGrantedAt" = CASE
            WHEN ${settings.freePromotionEnabled}::boolean = true THEN COALESCE(u."freePromotionGrantedAt", ${now})
            ELSE u."freePromotionGrantedAt"
          END,
          "freePromotionExpiresAt" = CASE
            WHEN ${expiry}::timestamptz IS NULL THEN u."freePromotionExpiresAt"
            ELSE COALESCE(u."freePromotionExpiresAt", ${expiry})
          END
        FROM target
        WHERE u."id" = target."id"
      `;
      if (updatedRows === 0) return new NextResponse('Seller not found', { status: 404 });

      return new NextResponse('ok', { status: 200 });
    }

    // Handle promotion payments separately from product purchases
    if (cs.metadata?.type === 'promotion') {
      const promotionId = cs.metadata?.promotionId;
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
      await prisma.product.update({
        where: { id: promo.productId },
        data: { isPromoted: true, promotionStart: now, promotionEnd: expiresAt },
      });

      return new NextResponse('ok', { status: 200 });
    }
    // Guard: only create a marketplace order when Stripe has confirmed payment.
    // For async payment methods (bank debit etc.) `checkout.session.completed`
    // fires with payment_status='unpaid'; the follow-up
    // `checkout.session.async_payment_succeeded` event will have status='paid'.
    if (cs.payment_status !== 'paid') {
      return new NextResponse('ok', { status: 200 });
    }

    const metadataBuyerId = cs.metadata?.buyerId;
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
    // An order is only treated as a pure-pickup order when every item in the
    // cart was designated for pickup.  Mixed carts (some pickup, some shipped)
    // are handled as shipping orders so that labels can still be purchased for
    // the non-pickup items; the pickup products simply have shippingCents = 0.
    const isPickupOrder = items.length > 0 && pickupItemIds.length === items.length;

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
              verificationSubmission: {
                select: {
                  status: true,
                  eligibleToListAt: true,
                  adminFallbackStatus: true,
                },
              },
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

    // Extract live shipping rate info stored during checkout
    const shippingRateInfo = snapshot?.shippingRateInfo as {
      shipmentGroups?: {
        sellerId: string;
        shipmentId: string;
        rateId: string;
        rateCents: number;
        carrier: string;
        service: string;
        package?: { weightOz: number; lengthIn: number; widthIn: number; heightIn: number };
        itemSnapshot?: {
          productId: string;
          quantity: number;
          weightOz: number;
          lengthIn: number;
          widthIn: number;
          heightIn: number;
        }[];
      }[];
      totalRateCents?: number;
      buyerAddress?: { name?: string; street1: string; street2?: string; city: string; state: string; zip: string; country?: string };
      verification?: { verifiedAt: string; source: string };
    } | null ?? null;

    const liveShippingCents = shippingRateInfo?.totalRateCents ?? 0;
    const taxCents = typeof cs.total_details?.amount_tax === 'number'
      ? cs.total_details.amount_tax
      : 0;

    const subtotalCents = orderItems.reduce((sum, item) => sum + item.lineSubtotalCents, 0);
    // Use live shipping total if available, otherwise fall back to flat shipping on items
    const shippingTotalCents = liveShippingCents > 0
      ? liveShippingCents
      : orderItems.reduce((sum, item) => sum + item.shippingCents * item.quantity, 0);
    const platformFeeCents = orderItems.reduce((sum, item) => sum + item.commissionFeeCents, 0);
    const totalCents = subtotalCents + shippingTotalCents + taxCents;

    const shipping = cs.shipping_details ?? {};

    // Use live buyer address if Stripe didn't collect one
    const liveAddress = shippingRateInfo?.buyerAddress;

    // Gather pickup location from first pickup product for order record
    const firstPickupProduct = products.find(p => pickupSet.has(p.id));
    const firstSelectedShippingRate = shippingRateInfo?.shipmentGroups?.[0];

    const order = await prisma.order.create({
      data: {
        buyerId,
        totalCents,
        subtotalCents,
        shippingCents: shippingTotalCents,
        taxCents,
        platformFeeCents,
        sellerPayoutCents: totalCents - platformFeeCents,
        status: 'PAID',
        stripeCheckoutId: cs.id,
        stripePaymentIntentId: extractStripeResourceId(cs.payment_intent),
        isPickup: isPickupOrder,
        pickupCode: isPickupOrder ? generatePickupCode() : null,
        pickupCity: isPickupOrder ? (firstPickupProduct?.pickupCity ?? null) : null,
        pickupState: isPickupOrder ? (firstPickupProduct?.pickupState ?? null) : null,
        selectedShipmentId: firstSelectedShippingRate?.shipmentId ?? null,
        selectedRateId: firstSelectedShippingRate?.rateId ?? null,
        // Keep both fields in sync: `carrier` is canonical and `shippingCarrier` is legacy.
        carrier: firstSelectedShippingRate?.carrier ?? null,
        shippingCarrier: firstSelectedShippingRate?.carrier ?? null,
        shippingService: firstSelectedShippingRate?.service ?? null,
        shippingName: shipping?.name ?? liveAddress?.name ?? null,
        shippingLine1: shipping?.address?.line1 ?? liveAddress?.street1 ?? null,
        shippingLine2: shipping?.address?.line2 ?? liveAddress?.street2 ?? null,
        shippingCity: shipping?.address?.city ?? liveAddress?.city ?? null,
        shippingState: shipping?.address?.state ?? liveAddress?.state ?? null,
        shippingPostalCode: shipping?.address?.postal_code ?? liveAddress?.zip ?? null,
        shippingCountry: shipping?.address?.country ?? liveAddress?.country ?? null,
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

    const buyerNotifications: CreateNotificationInput[] = [
      {
        userId: buyerId,
        type: NotificationType.ORDER_UPDATE,
        title: 'Order confirmed',
        body: isPickupOrder
          ? 'Your order is paid. Your pickup details are ready in the order view.'
          : 'Your order is paid and the seller has been notified.',
        link: `/orders/${order.id}`,
        data: { orderId: order.id, status: order.status },
      },
    ];

    if (isPickupOrder && order.pickupCode) {
      buyerNotifications.push({
        userId: buyerId,
        type: NotificationType.SHIPPING,
        title: 'Pickup details ready',
        body: `Your pickup code is ${order.pickupCode}. Show it to the seller at handoff.`,
        link: `/orders/${order.id}`,
        data: { orderId: order.id, pickupCode: order.pickupCode },
      });
    }

    const sellerOrderGroups = orderItems.reduce<Map<string, { sellerId: string; itemCount: number; payoutCents: number }>>(
      (groups, item) => {
        const sellerId = item.product.seller.id;
        const existing = groups.get(sellerId);
        const payoutCents = item.sellerNetCents + (item.shippingCents * item.quantity);

        if (existing) {
          existing.itemCount += item.quantity;
          existing.payoutCents += payoutCents;
        } else {
          groups.set(sellerId, {
            sellerId,
            itemCount: item.quantity,
            payoutCents,
          });
        }

        return groups;
      },
      new Map(),
    );

    const sellerNotifications: CreateNotificationInput[] = Array.from(sellerOrderGroups.values()).flatMap(
      ({ sellerId, itemCount, payoutCents }) => {
        const notifications: CreateNotificationInput[] = [
          {
            userId: sellerId,
            type: NotificationType.ORDER_UPDATE,
            title: 'New paid order',
            body: `${itemCount} item${itemCount === 1 ? '' : 's'} from your listings were purchased.`,
            link: '/seller',
            data: { orderId: order.id },
          },
        ];

        if (payoutCents > 0) {
          notifications.push({
            userId: sellerId,
            type: NotificationType.PAYOUT,
            title: 'Seller payout pending',
            body: `$${(payoutCents / 100).toFixed(2)} will move through Stripe for this sale.`,
            link: '/seller',
            data: { orderId: order.id, sellerNetCents: payoutCents },
          });
        }

        return notifications;
      },
    );

    await createNotifications([...buyerNotifications, ...sellerNotifications]);

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
            const sellerStripeAccountId = item.product.seller.stripeAccountId;
            const payoutEligibleSeller = item.product.seller.stripeOnboardingComplete
              && !!sellerStripeAccountId
              && isSellerVerificationApproved(item.product.seller.verificationSubmission);
            if (!payoutEligibleSeller) continue;
            const shippingPayoutCents = item.shippingCents * item.quantity;
            const transferAmount = item.sellerNetCents + shippingPayoutCents;
            if (transferAmount <= 0) continue;

            const existingTransfer = sellerTransfers.get(item.product.seller.id);
            if (existingTransfer) {
              existingTransfer.amount += transferAmount;
            } else {
              sellerTransfers.set(item.product.seller.id, {
                destination: sellerStripeAccountId,
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
        logError('Stripe transfer creation failed', err, { tag: 'stripe/webhook', action: 'createTransfer' });
      }
    }

    // Decrement inventory, track soldQty, and mark delistedAt if qty reaches 0
    for (const item of orderItems) {
      const activePromotion = await prisma.promotion.findFirst({
        where: {
          productId: item.product.id,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
        },
      });
      if (activePromotion) {
        await prisma.promotion.update({
          where: { id: activePromotion.id },
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
          soldQty: { increment: item.quantity },
          ...(newInventory <= 0 ? { delistedAt: new Date() } : {}),
        },
      });
    }

    if (snapshot) {
      await prisma.checkoutSessionSnapshot.delete({
        where: { stripeCheckoutId: snapshot.stripeCheckoutId },
      });
    }

    // Auto-purchase shipping labels when live rate info was captured at checkout
    if (!isPickupOrder && shippingRateInfo?.shipmentGroups?.length) {
      // Find the buyer's email for tracking notification
      const buyer = await prisma.user.findUnique({
        where: { id: buyerId },
        select: { email: true, name: true },
      });

      // Collect all purchased label results; only persist the first valid one to the order record
      // (the Order schema stores a single label/tracking for backward compatibility).
      const purchasedLabels: Array<{ sellerId: string; result: Awaited<ReturnType<typeof purchaseShipmentRate>>; group: typeof shippingRateInfo.shipmentGroups[number] }> = [];

      for (const group of shippingRateInfo.shipmentGroups) {
        if (!group.shipmentId || !group.rateId) continue;
        try {
          const result = await purchaseShipmentRate({
            shipmentId: group.shipmentId,
            rateId: group.rateId,
          });
          purchasedLabels.push({ sellerId: group.sellerId, result, group });
        } catch (labelErr: any) {
          console.error('[webhook] auto-label purchase failed for shipment', group.shipmentId, labelErr?.message ?? labelErr);
          logError('Auto-label purchase failed', labelErr, { tag: 'stripe/webhook', action: 'autoLabelPurchase', shipmentId: group.shipmentId });
          // Non-fatal: the order is created; seller can still manually purchase a label
        }
      }

      // Persist the first successfully purchased label to the order
      if (purchasedLabels.length > 0) {
        const primary = purchasedLabels[0];
        await prisma.order.update({
          where: { id: order.id },
          data: {
            labelUrl: primary.result.labelUrl ?? undefined,
            trackingNumber: primary.result.trackingNumber ?? undefined,
            carrier: primary.result.carrier ?? undefined,
            // Keep legacy field mirrored for backwards-compatible consumers.
            shippingCarrier: primary.result.carrier ?? undefined,
            shippingService: primary.result.service ?? primary.group.service ?? undefined,
            trackingUrl: primary.result.trackingUrl ?? buildTrackingUrl(primary.result.carrier, primary.result.trackingNumber),
            shipmentId: primary.result.shipmentId ?? undefined,
            shipmentStatus: primary.result.shipmentStatus ?? 'LABEL_PURCHASED',
            status: 'SHIPPED',
          },
        });
      }

      // Send a single tracking notification/email aggregating all labels
      if (purchasedLabels.length > 0) {
        const trackingSummary = purchasedLabels
          .map(l => `${l.result.carrier ?? l.group.carrier}: ${l.result.trackingNumber ?? 'N/A'}`)
          .join('; ');

        await createNotification({
          userId: buyerId,
          type: NotificationType.SHIPPING,
          title: 'Your order has shipped!',
          body: trackingSummary,
          link: `/orders/${order.id}`,
          data: { orderId: order.id, trackingSummary },
        });

        // Notify each seller with their label URL
        for (const { sellerId, result, group } of purchasedLabels) {
          await createNotification({
            userId: sellerId,
            type: NotificationType.SHIPPING,
            title: 'Shipping label ready',
            body: `Label created for order ${order.id}. Carrier: ${result.carrier ?? group.carrier}.`,
            link: '/seller',
            data: { orderId: order.id, labelUrl: result.labelUrl },
          });
        }

        // Email tracking info to buyer
        if (buyer?.email) {
          const trackingLines = purchasedLabels.map(l => {
            const trackingUrl = l.result.trackingUrl ?? buildTrackingUrl(l.result.carrier, l.result.trackingNumber);
            return l.result.trackingNumber
              ? `<li>${l.result.carrier ?? l.group.carrier}: <strong>${l.result.trackingNumber}</strong>${trackingUrl ? ` (<a href="${trackingUrl}">Track</a>)` : ''}</li>`
              : `<li>${l.result.carrier ?? l.group.carrier}: label created</li>`;
          }).join('\n');
          await sendEmail(
            buyer.email,
            'Your FlupFlap order has shipped!',
            `<p>Hi ${buyer.name ?? 'there'},</p>
<p>Great news! Your order has been shipped.</p>
<ul>${trackingLines}</ul>
<p><a href="${appUrl}/orders/${order.id}">View your order</a></p>
<p>— The FlupFlap team</p>`,
          );
        }
      }
    }
  }

  return new NextResponse('ok', { status: 200 });
}
