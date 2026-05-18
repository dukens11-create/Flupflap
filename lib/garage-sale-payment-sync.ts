import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { extractStripeResourceId, stripe } from '@/lib/stripe';
import { logError, logInfo, logWarn } from '@/lib/logger';

const GARAGE_SALE_CHECKOUT_TYPE = 'garage_sale_listing';

export function isGarageSaleCheckoutSession(cs: Stripe.Checkout.Session): boolean {
  return cs.metadata?.type === GARAGE_SALE_CHECKOUT_TYPE;
}

function isGarageSalePaymentIntent(intent: Stripe.PaymentIntent): boolean {
  return intent.metadata?.type === GARAGE_SALE_CHECKOUT_TYPE;
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

type GarageSaleSyncResult = {
  processed: boolean;
  saleId?: string;
  sellerId?: string;
  reason?: 'missing_sale_id' | 'not_paid' | 'sale_not_found' | 'already_paid' | 'not_garage_sale_payment';
};

function buildPaidSaleUpdate(params: {
  sale: {
    listingType: 'STANDARD' | 'FEATURED';
    paidAt: Date | null;
    activatedAt: Date | null;
  };
  now: Date;
  amountCents: number;
  paymentIntentId: string | null;
}) {
  const { sale, now, amountCents, paymentIntentId } = params;
  return {
    status: 'APPROVED' as const,
    paymentStatus: 'PAID' as const,
    stripePaymentId: paymentIntentId,
    paidAt: sale.paidAt ?? now,
    activatedAt: sale.activatedAt ?? now,
    isArchived: false,
    archivedAt: null,
    isFeatured: sale.listingType === 'FEATURED',
    totalPaidCents: amountCents,
  };
}

function needsPaidStateRepair(params: {
  sale: {
    status: string;
    paymentStatus: string;
    isArchived: boolean;
    archivedAt: Date | null;
    paidAt: Date | null;
    activatedAt: Date | null;
    stripePaymentId: string | null;
    totalPaidCents: number;
    listingType: 'STANDARD' | 'FEATURED';
    isFeatured: boolean;
  };
  expectedAmountCents: number;
  paymentIntentId: string | null;
}) {
  const { sale, expectedAmountCents, paymentIntentId } = params;
  return (
    sale.paymentStatus !== 'PAID'
    || sale.status !== 'APPROVED'
    || sale.isArchived
    || sale.archivedAt !== null
    || sale.paidAt === null
    || sale.activatedAt === null
    || sale.totalPaidCents !== expectedAmountCents
    || sale.isFeatured !== (sale.listingType === 'FEATURED')
    || (paymentIntentId !== null && sale.stripePaymentId !== paymentIntentId)
  );
}

export async function finalizeGarageSaleCheckoutSession(cs: Stripe.Checkout.Session): Promise<GarageSaleSyncResult> {
  const saleId = cs.metadata?.saleId;
  if (!saleId) {
    logWarn('Garage sale checkout missing saleId metadata', {
      tag: 'garage-sale/payment-sync',
      action: 'finalizeCheckoutSession',
      stripeCheckoutId: cs.id,
    });
    return { processed: false, reason: 'missing_sale_id' };
  }
  if (cs.payment_status !== 'paid') {
    logWarn('Garage sale checkout not marked paid', {
      tag: 'garage-sale/payment-sync',
      action: 'finalizeCheckoutSession',
      saleId,
      stripeCheckoutId: cs.id,
      paymentStatus: cs.payment_status,
    });
    return { processed: false, saleId, reason: 'not_paid' };
  }

  const sale = await prisma.garageSale.findUnique({
    where: { id: saleId },
    select: {
      id: true,
      sellerId: true,
      listingType: true,
      status: true,
      paymentStatus: true,
      isArchived: true,
      archivedAt: true,
      paidAt: true,
      activatedAt: true,
      stripePaymentId: true,
      totalPaidCents: true,
      isFeatured: true,
    },
  });
  if (!sale) {
    logWarn('Garage sale checkout sale not found', {
      tag: 'garage-sale/payment-sync',
      action: 'finalizeCheckoutSession',
      saleId,
      stripeCheckoutId: cs.id,
    });
    return { processed: false, saleId, reason: 'sale_not_found' };
  }

  const paymentIntentId = extractStripeResourceId(cs.payment_intent);
  const receiptUrl = await getReceiptUrl(paymentIntentId);
  const existingPayment = await prisma.garageSalePayment.findUnique({
    where: { stripeCheckoutId: cs.id },
    select: { amountCents: true },
  });
  const usedSaleAmountFallback = typeof cs.amount_total !== 'number' && existingPayment?.amountCents == null;
  const finalAmountCents = typeof cs.amount_total === 'number'
    ? cs.amount_total
    : existingPayment?.amountCents ?? sale.totalPaidCents;
  if (usedSaleAmountFallback) {
    logWarn('Garage sale checkout amount missing; falling back to sale totalPaidCents', {
      tag: 'garage-sale/payment-sync',
      action: 'finalizeCheckoutSession',
      saleId,
      stripeCheckoutId: cs.id,
      fallbackAmountCents: sale.totalPaidCents,
    });
  }
  const requiresStateUpdate = needsPaidStateRepair({
    sale,
    expectedAmountCents: finalAmountCents,
    paymentIntentId,
  });
  const now = new Date();

  await prisma.$transaction([
    ...(requiresStateUpdate
      ? [prisma.garageSale.update({
        where: { id: saleId },
        data: buildPaidSaleUpdate({
          sale,
          now,
          amountCents: finalAmountCents,
          paymentIntentId,
        }),
      })]
      : []),
    prisma.garageSalePayment.upsert({
      where: { stripeCheckoutId: cs.id },
      update: {
        status: 'PAID',
        amountCents: finalAmountCents,
        stripePaymentId: paymentIntentId,
        stripeReceiptUrl: receiptUrl,
      },
      create: {
        saleId,
        sellerId: sale.sellerId,
        amountCents: finalAmountCents,
        status: 'PAID',
        stripeCheckoutId: cs.id,
        stripePaymentId: paymentIntentId,
        stripeReceiptUrl: receiptUrl,
      },
    }),
  ]);

  if (requiresStateUpdate) {
    logInfo('Garage sale payment confirmed', {
      tag: 'garage-sale/payment-sync',
      action: 'finalizeCheckoutSession',
      saleId,
      sellerId: sale.sellerId,
      stripeCheckoutId: cs.id,
      stripePaymentId: paymentIntentId,
    });
    logInfo('Garage sale listing activated', {
      tag: 'garage-sale/payment-sync',
      action: 'activateListing',
      saleId,
      sellerId: sale.sellerId,
    });
    return { processed: true, saleId, sellerId: sale.sellerId };
  }

  logInfo('Garage sale checkout already finalized (idempotent noop)', {
    tag: 'garage-sale/payment-sync',
    action: 'finalizeCheckoutSession',
    saleId,
    sellerId: sale.sellerId,
    stripeCheckoutId: cs.id,
  });
  return { processed: false, saleId, sellerId: sale.sellerId, reason: 'already_paid' };
}

export async function finalizeGarageSalePaymentIntent(intent: Stripe.PaymentIntent): Promise<GarageSaleSyncResult> {
  if (!isGarageSalePaymentIntent(intent)) {
    return { processed: false, reason: 'not_garage_sale_payment' };
  }

  const saleId = intent.metadata?.saleId;
  if (!saleId) {
    logWarn('Garage sale payment intent missing saleId metadata', {
      tag: 'garage-sale/payment-sync',
      action: 'finalizePaymentIntent',
      stripePaymentId: intent.id,
    });
    return { processed: false, reason: 'missing_sale_id' };
  }

  if (intent.status !== 'succeeded') {
    return { processed: false, saleId, reason: 'not_paid' };
  }

  const sale = await prisma.garageSale.findUnique({
    where: { id: saleId },
    select: {
      id: true,
      sellerId: true,
      listingType: true,
      status: true,
      paymentStatus: true,
      isArchived: true,
      archivedAt: true,
      paidAt: true,
      activatedAt: true,
      stripePaymentId: true,
      totalPaidCents: true,
      isFeatured: true,
      stripeCheckoutId: true,
    },
  });

  if (!sale) {
    return { processed: false, saleId, reason: 'sale_not_found' };
  }

  const amountCents = intent.amount_received > 0
    ? intent.amount_received
    : intent.amount > 0
      ? intent.amount
      : sale.totalPaidCents;
  if (amountCents <= 0) {
    logWarn('Garage sale payment intent had non-positive amount', {
      tag: 'garage-sale/payment-sync',
      action: 'finalizePaymentIntent',
      saleId,
      stripePaymentId: intent.id,
      amountReceived: intent.amount_received,
      amount: intent.amount,
    });
    return { processed: false, saleId, sellerId: sale.sellerId, reason: 'not_paid' };
  }
  const receiptUrl = await getReceiptUrl(intent.id);
  const requiresStateUpdate = needsPaidStateRepair({
    sale,
    expectedAmountCents: amountCents,
    paymentIntentId: intent.id,
  });
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      if (requiresStateUpdate) {
        await tx.garageSale.update({
          where: { id: saleId },
          data: buildPaidSaleUpdate({
            sale,
            now,
            amountCents,
            paymentIntentId: intent.id,
          }),
        });
      }

      const existingPayment = await tx.garageSalePayment.findFirst({
        where: {
          OR: [
            { stripePaymentId: intent.id },
            ...(sale.stripeCheckoutId ? [{ stripeCheckoutId: sale.stripeCheckoutId }] : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existingPayment) {
        await tx.garageSalePayment.update({
          where: { id: existingPayment.id },
          data: {
            status: 'PAID',
            amountCents,
            stripePaymentId: intent.id,
            stripeReceiptUrl: receiptUrl,
          },
        });
      } else {
        await tx.garageSalePayment.create({
          data: {
            saleId,
            sellerId: sale.sellerId,
            amountCents,
            status: 'PAID',
            stripePaymentId: intent.id,
            stripeReceiptUrl: receiptUrl,
          },
        });
      }
    });
  } catch (err) {
    logError('Garage sale payment intent finalization failed', err, {
      tag: 'garage-sale/payment-sync',
      action: 'finalizePaymentIntent',
      saleId,
      stripePaymentId: intent.id,
    });
    throw err;
  }

  if (requiresStateUpdate) {
    logInfo('Garage sale payment confirmed', {
      tag: 'garage-sale/payment-sync',
      action: 'finalizePaymentIntent',
      saleId,
      sellerId: sale.sellerId,
      stripePaymentId: intent.id,
    });
    logInfo('Garage sale listing activated', {
      tag: 'garage-sale/payment-sync',
      action: 'activateListing',
      saleId,
      sellerId: sale.sellerId,
    });
    return { processed: true, saleId, sellerId: sale.sellerId };
  }

  return { processed: false, saleId, sellerId: sale.sellerId, reason: 'already_paid' };
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
