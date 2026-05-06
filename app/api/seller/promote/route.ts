import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { stripe, appUrl } from '@/lib/stripe';

// Promotion packages available to sellers (duration → price in cents)
export const PROMOTION_PACKAGES: Record<number, number> = {
  7: 499,   // $4.99 for 7 days
  14: 799,  // $7.99 for 14 days
  30: 1499, // $14.99 for 30 days
};

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

    const { productId, durationDays } = await req.json() as { productId: string; durationDays: number };

    const priceCents = PROMOTION_PACKAGES[durationDays];
    if (!priceCents) {
      return NextResponse.json({ error: 'Invalid promotion duration. Choose 7, 14, or 30 days.' }, { status: 400 });
    }

    // Verify the product exists, is owned by this seller, and is APPROVED
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.sellerId !== session.user.id) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    }
    if (product.status !== 'APPROVED') {
      return NextResponse.json({ error: 'Only approved products can be promoted.' }, { status: 400 });
    }

    // Check if there is already an active promotion for this product
    const now = new Date();
    const activePromotion = await prisma.promotion.findFirst({
      where: {
        productId,
        status: 'ACTIVE',
        expiresAt: { gt: now },
      },
    });
    if (activePromotion) {
      return NextResponse.json({ error: 'This product already has an active promotion.' }, { status: 400 });
    }

    // Create a pending promotion record before the Stripe session so we have an ID to pass as metadata
    const promotion = await prisma.promotion.create({
      data: {
        productId,
        sellerId: session.user.id,
        status: 'PENDING_PAYMENT',
        durationDays,
        priceCents,
      },
    });

    // Create a Stripe Checkout session for the promotion fee
    const stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Promote "${product.title}" for ${durationDays} day${durationDays !== 1 ? 's' : ''}`,
              description: `Featured placement on FlupFlap Marketplace for ${durationDays} days`,
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
