import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { stripe, appUrl } from '@/lib/stripe';
import { PROMOTION_PACKAGES } from '@/lib/promotions';

// Re-export so other modules can import from this route as before
export { PROMOTION_PACKAGES };

export type PromotionAction = 'new' | 'renew' | 'change';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Block restricted sellers
    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (dbUser?.sellerStatus === 'SUSPENDED' || dbUser?.sellerStatus === 'BANNED') {
      return NextResponse.json({ error: 'Your seller account is currently restricted.' }, { status: 403 });
    }

    const { productId, durationDays, action } = await req.json() as {
      productId: string;
      durationDays: number;
      action?: PromotionAction;
    };

    const promotionAction: PromotionAction = action ?? 'new';

    const priceCents = PROMOTION_PACKAGES[durationDays];
    if (!priceCents) {
      const validDays = Object.keys(PROMOTION_PACKAGES).join(', ');
      return NextResponse.json({ error: `Invalid promotion duration. Choose one of: ${validDays} days.` }, { status: 400 });
    }

    // Verify the product exists, is owned by this seller, and is APPROVED
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.sellerId !== session.user.id) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    }
    if (product.status !== 'APPROVED') {
      return NextResponse.json({ error: 'Only approved products can be promoted.' }, { status: 400 });
    }

    const now = new Date();

    // Find any current active promotion for this product
    const activePromotion = await prisma.promotion.findFirst({
      where: {
        productId,
        sellerId: session.user.id,
        status: 'ACTIVE',
        expiresAt: { gt: now },
      },
    });

    // Validate action vs current state
    if (promotionAction === 'new' && activePromotion) {
      return NextResponse.json({ error: 'This product already has an active promotion. Use renew or change instead.' }, { status: 400 });
    }
    if (promotionAction === 'change' && !activePromotion) {
      return NextResponse.json({ error: 'No active promotion found to change.' }, { status: 400 });
    }

    // Determine history link and scheduled start for this promotion
    let renewedFromId: string | null = null;
    let scheduledStartAt: Date | null = null;
    let replacePromotionId: string | null = null;

    if (promotionAction === 'renew') {
      // Find the most recent promotion (active or expired) for history tracking
      const lastPromo = await prisma.promotion.findFirst({
        where: { productId, sellerId: session.user.id, status: { in: ['ACTIVE', 'EXPIRED'] } },
        orderBy: { createdAt: 'desc' },
      });
      if (lastPromo) {
        renewedFromId = lastPromo.id;
        // If renewing before expiry, schedule new promotion to start when current ends
        if (lastPromo.status === 'ACTIVE' && lastPromo.expiresAt && lastPromo.expiresAt > now) {
          scheduledStartAt = lastPromo.expiresAt;
        }
      }
    }

    if (promotionAction === 'change') {
      // renewedFromId: persisted in the DB Promotion record to preserve the history
      // chain (who was this promotion changed from?).
      // replacePromotionId: ephemeral Stripe metadata only — the webhook uses it to
      // expire the old active promotion upon payment confirmation. It is never stored
      // in the new promotion record itself.
      // Both reference the same promotion ID because the old active promotion serves
      // both roles simultaneously.
      renewedFromId = activePromotion!.id;
      replacePromotionId = activePromotion!.id;
    }

    // Create the pending promotion record
    const promotion = await prisma.promotion.create({
      data: {
        productId,
        sellerId: session.user.id,
        status: 'PENDING_PAYMENT',
        durationDays,
        priceCents,
        renewedFromId,
        scheduledStartAt,
      },
    });

    // Build human-readable description for the Stripe line item
    const actionLabel =
      promotionAction === 'renew' ? 'Renew promotion for' :
      promotionAction === 'change' ? 'Change promotion duration for' :
      'Promote listing';

    // Create a Stripe Checkout session for the promotion fee
    const stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${actionLabel} "${product.title}" — ${durationDays} day${durationDays !== 1 ? 's' : ''}`,
              description: `Featured placement on FlupFlap Marketplace for ${durationDays} day${durationDays !== 1 ? 's' : ''}`,
            },
            unit_amount: priceCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/seller/promote/${productId}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/seller/promote/${productId}`,
      metadata: {
        type: 'promotion',
        promotionId: promotion.id,
        promotionAction,
        replacePromotionId: replacePromotionId ?? '',
        sellerId: session.user.id,
        productId,
        durationDays: String(durationDays),
      },
    });

    // Attach the Stripe checkout session ID to the promotion record
    await prisma.promotion.update({
      where: { id: promotion.id },
      data: { stripeCheckoutId: stripeSession.id },
    });

    return NextResponse.json({ url: stripeSession.url });
  } catch (err: any) {
    console.error('[seller/promote POST]', err);
    return NextResponse.json({ error: 'Failed to create promotion checkout.' }, { status: 500 });
  }
}
