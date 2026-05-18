import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { stripe } from '@/lib/stripe';

const GARAGE_SALE_METADATA_TYPE = 'garage_sale_listing';

export function isGarageSaleCheckoutSession(cs: Stripe.Checkout.Session): boolean {
  return cs.metadata?.type === GARAGE_SALE_METADATA_TYPE;
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
  if (sale.paymentStatus === 'PAID') {
    return { processed: false, saleId, sellerId: sale.sellerId, reason: 'already_paid' };
  }

  const sellerId = sale.sellerId;
  const paymentIntentId = cs.payment_intent ? String(cs.payment_intent) : null;
  const receiptUrl = await getReceiptUrl(paymentIntentId);
  const paidAmountCents = typeof cs.amount_total === 'number' ? cs.amount_total : sale.totalPaidCents;
  const now = new Date();

  await prisma.$transaction([
    prisma.garageSale.update({
      where: { id: saleId },
      data: {
        status: 'APPROVED',
        paymentStatus: 'PAID',
        stripePaymentId: paymentIntentId,
        paidAt: now,
        activatedAt: now,
        isFeatured: sale.listingType === 'FEATURED',
        totalPaidCents: paidAmountCents,
      },
    }),
    prisma.garageSalePayment.upsert({
      where: { stripeCheckoutId: cs.id },
      update: {
        status: 'PAID',
        amountCents: paidAmountCents,
        stripePaymentId: paymentIntentId,
        stripeReceiptUrl: receiptUrl,
      },
      create: {
        saleId,
        sellerId,
        amountCents: paidAmountCents,
        status: 'PAID',
        stripeCheckoutId: cs.id,
        stripePaymentId: paymentIntentId,
        stripeReceiptUrl: receiptUrl,
      },
    }),
  ]);

  return { processed: true, saleId, sellerId };
}

export async function failGarageSaleCheckoutSession(cs: Stripe.Checkout.Session): Promise<void> {
  const saleId = cs.metadata?.saleId;
  if (!saleId) return;
  await prisma.$transaction([
    prisma.garageSale.updateMany({
      where: { id: saleId, paymentStatus: 'PENDING' },
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
  if (!checkoutSessionId || !saleId || !sellerId) return { synced: false, reason: 'missing_inputs' };

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
