import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { extractStripeResourceId, stripe } from '@/lib/stripe';
import { logInfo, logWarn } from '@/lib/logger';

const GARAGE_SALE_CHECKOUT_TYPE = 'garage_sale_listing';

export function isGarageSaleCheckoutSession(cs: Stripe.Checkout.Session): boolean {
  return cs.metadata?.type === GARAGE_SALE_CHECKOUT_TYPE;
}

async function getReceiptUrl(paymentIntentId: string | null): Promise<string | null> {
  if (!paymentIntentId) return null;
  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
    if (typeof intent.latest_charge === 'string') return null;
    return intent.latest_charge?.receipt_url ?? null;
  } catch {
    return null;
  }
}

function buildGarageSaleActivationData(
  sale: Awaited<ReturnType<typeof prisma.garageSale.findUniqueOrThrow>>,
  now: Date,
  totalPaidCents: number,
  stripePaymentId: string | null,
) {
  const shouldActivateListing = shouldActivateGarageSaleListing(sale);

  return {
    paymentStatus: 'PAID' as const,
    stripePaymentId,
    paidAt: sale.paidAt ?? now,
    activatedAt: shouldActivateListing ? now : sale.activatedAt,
    totalPaidCents,
    ...(shouldActivateListing ? {
      status: sale.isSpam ? 'PENDING' as const : 'APPROVED' as const,
      isArchived: false,
      archivedAt: null,
      isFeatured: sale.isSpam ? false : sale.listingType === 'FEATURED',
    } : {}),
  };
}

function shouldActivateGarageSaleListing(
  sale: Awaited<ReturnType<typeof prisma.garageSale.findUniqueOrThrow>>,
) {
  const isPaymentNotFullyApplied = sale.paymentStatus !== 'PAID' || !sale.activatedAt;
  const listingCanStillGoLive = sale.status !== 'REJECTED' && sale.status !== 'EXPIRED' && !sale.isArchived;
  return isPaymentNotFullyApplied && listingCanStillGoLive;
}

export async function confirmGarageSalePayment(params: {
  saleId: string;
  sellerId?: string | null;
  amountCents: number;
  stripeCheckoutId?: string | null;
  stripePaymentId?: string | null;
  stripeReceiptUrl?: string | null;
  source: 'checkout_session' | 'payment_intent' | 'seller_sync';
}) {
  const { saleId, sellerId, amountCents, stripeCheckoutId, stripePaymentId, stripeReceiptUrl, source } = params;
  const sale = await prisma.garageSale.findUnique({ where: { id: saleId } });
  if (!sale) {
    logWarn('Garage sale payment confirmation skipped because listing was not found', {
      tag: 'garage-sale-payment-sync',
      saleId,
      source,
    });
    return { processed: false, reason: 'sale_not_found' as const };
  }

  const resolvedSellerId = sellerId ?? sale.sellerId;
  const now = new Date();
  const activationData = buildGarageSaleActivationData(sale, now, amountCents, stripePaymentId ?? sale.stripePaymentId ?? null);
  const paymentSelector = stripeCheckoutId
    ? { stripeCheckoutId }
    : stripePaymentId
      ? { stripePaymentId }
      : null;
  const existingPayment = paymentSelector
    ? await prisma.garageSalePayment.findFirst({
      where: paymentSelector,
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    })
    : await prisma.garageSalePayment.findFirst({
      where: { saleId },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

  await prisma.$transaction([
    prisma.garageSale.update({
      where: { id: saleId },
      data: activationData,
    }),
    existingPayment
      ? prisma.garageSalePayment.update({
        where: { id: existingPayment.id },
        data: {
          status: 'PAID',
          amountCents,
          stripeCheckoutId: stripeCheckoutId ?? undefined,
          stripePaymentId: stripePaymentId ?? undefined,
          stripeReceiptUrl: stripeReceiptUrl ?? undefined,
        },
      })
      : prisma.garageSalePayment.create({
        data: {
          saleId,
          sellerId: resolvedSellerId,
          amountCents,
          status: 'PAID',
          stripeCheckoutId: stripeCheckoutId ?? null,
          stripePaymentId: stripePaymentId ?? null,
          stripeReceiptUrl: stripeReceiptUrl ?? null,
        },
      }),
  ]);

  logInfo('Garage sale payment confirmed and listing reconciled', {
    tag: 'garage-sale-payment-sync',
    saleId,
    sellerId: resolvedSellerId,
    source,
    listingStatus: activationData.status ?? sale.status,
    paymentStatus: activationData.paymentStatus,
  });

  return { processed: true, saleId, sellerId: resolvedSellerId };
}

export async function finalizeGarageSaleCheckoutSession(cs: Stripe.Checkout.Session): Promise<{
  processed: boolean;
  saleId?: string;
  sellerId?: string;
  reason?: 'missing_sale_id' | 'not_paid' | 'sale_not_found' | 'already_paid';
}> {
  const saleId = cs.metadata?.saleId;
  if (!saleId) {
    return { processed: false, reason: 'missing_sale_id' };
  }
  if (cs.payment_status !== 'paid') {
    return { processed: false, saleId, reason: 'not_paid' };
  }

  const sale = await prisma.garageSale.findUnique({ where: { id: saleId } });
  if (!sale) {
    return { processed: false, saleId, reason: 'sale_not_found' };
  }

  const paymentIntentId = extractStripeResourceId(cs.payment_intent);
  const receiptUrl = await getReceiptUrl(paymentIntentId);
  const existingPayment = await prisma.garageSalePayment.findUnique({
    where: { stripeCheckoutId: cs.id },
    select: { amountCents: true },
  });
  const finalAmountCents = typeof cs.amount_total === 'number'
    ? cs.amount_total
    : existingPayment?.amountCents ?? sale.totalPaidCents;

  if (sale.paymentStatus === 'PAID' && !shouldActivateGarageSaleListing(sale)) {
    // Reconcile the payment row even when the sale is already marked paid so
    // checkout-session retries can repair stale history or receipt metadata.
    await confirmGarageSalePayment({
      saleId,
      sellerId: sale.sellerId,
      amountCents: finalAmountCents,
      stripeCheckoutId: cs.id,
      stripePaymentId: paymentIntentId,
      stripeReceiptUrl: receiptUrl,
      source: 'checkout_session',
    });
    return { processed: false, saleId, sellerId: sale.sellerId, reason: 'already_paid' };
  }

  return confirmGarageSalePayment({
    saleId,
    sellerId: sale.sellerId,
    amountCents: finalAmountCents,
    stripeCheckoutId: cs.id,
    stripePaymentId: paymentIntentId,
    stripeReceiptUrl: receiptUrl,
    source: 'checkout_session',
  });
}

export async function failGarageSaleCheckoutSession(cs: Stripe.Checkout.Session): Promise<void> {
  const saleId = cs.metadata?.saleId;
  if (!saleId) return;
  const sale = await prisma.garageSale.findUnique({
    where: { id: saleId },
    select: { stripeCheckoutId: true },
  });
  if (!sale || sale.stripeCheckoutId !== cs.id) return;
  await prisma.$transaction([
    prisma.garageSale.updateMany({
      where: { id: saleId, stripeCheckoutId: cs.id, paymentStatus: 'PENDING' },
      data: { paymentStatus: 'FAILED', status: 'HIDDEN', isFeatured: false },
    }),
    prisma.garageSalePayment.updateMany({
      where: { stripeCheckoutId: cs.id, status: 'PENDING' },
      data: { status: 'FAILED' },
    }),
  ]);
}

export async function syncGarageSaleCheckoutSessionForSeller(params: {
  checkoutSessionId: string;
  saleId: string;
  sellerId: string;
}): Promise<{ synced: boolean; reason?: string }> {
  const { checkoutSessionId, saleId, sellerId } = params;
  if (!checkoutSessionId || !saleId || !sellerId) return { synced: false, reason: 'invalid_inputs' };

  const sale = await prisma.garageSale.findUnique({
    where: { id: saleId },
    select: { sellerId: true },
  });
  if (!sale || sale.sellerId !== sellerId) return { synced: false, reason: 'forbidden' };

  let checkoutSession: Stripe.Checkout.Session;
  try {
    checkoutSession = await stripe.checkout.sessions.retrieve(checkoutSessionId);
  } catch {
    return { synced: false, reason: 'session_not_found' };
  }

  if (!isGarageSaleCheckoutSession(checkoutSession)) return { synced: false, reason: 'not_garage_sale_checkout' };
  if (checkoutSession.metadata?.saleId !== saleId) return { synced: false, reason: 'sale_mismatch' };
  if (checkoutSession.payment_status !== 'paid') return { synced: false, reason: 'payment_not_paid' };

  const result = await finalizeGarageSaleCheckoutSession(checkoutSession);
  return { synced: result.processed, reason: result.reason };
}
