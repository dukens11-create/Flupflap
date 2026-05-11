import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { stripe, appUrl } from '@/lib/stripe';
import { SELLER_SUBSCRIPTION_PRICE_CENTS, isSubscriptionActive } from '@/lib/subscription';

/** GET /api/seller/subscription — return current subscription status for the signed-in seller */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'SELLER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      subscriptionStatus: true,
      subscriptionId: true,
      subscriptionCurrentPeriodEnd: true,
    },
  });

  return NextResponse.json({
    subscriptionStatus: user?.subscriptionStatus ?? null,
    subscriptionId: user?.subscriptionId ?? null,
    subscriptionCurrentPeriodEnd: user?.subscriptionCurrentPeriodEnd ?? null,
    active: isSubscriptionActive(user ?? {}),
  });
}

/** POST /api/seller/subscription — create a Stripe Checkout session to enroll in the subscription */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    // Block restricted sellers
    if (dbUser.sellerStatus === 'SUSPENDED' || dbUser.sellerStatus === 'BANNED' || dbUser.sellerStatus === 'RESTRICTED') {
      return NextResponse.json({ error: 'Your seller account is currently restricted.' }, { status: 403 });
    }

    // Already active — no need to re-subscribe
    if (isSubscriptionActive(dbUser)) {
      return NextResponse.json({ error: 'Subscription is already active.' }, { status: 400 });
    }

    // Reuse existing Stripe customer or create a new one
    let stripeCustomerId = dbUser.stripeCustomerId ?? undefined;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: dbUser.email,
        name: dbUser.name,
        metadata: { userId: dbUser.id },
      });
      stripeCustomerId = customer.id;
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { stripeCustomerId },
      });
    }

    // Create a Stripe Checkout session for the recurring subscription
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: stripeCustomerId,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'FlupFlap Seller Subscription',
              description: 'Required monthly plan to sell on FlupFlap. Includes unlimited listings and buyer access.',
            },
            unit_amount: SELLER_SUBSCRIPTION_PRICE_CENTS,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/seller?subscribed=1`,
      cancel_url: `${appUrl}/seller`,
      metadata: {
        type: 'seller_subscription',
        sellerId: dbUser.id,
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err: any) {
    console.error('[seller/subscription POST]', err);
    return NextResponse.json({ error: 'Failed to create subscription checkout.' }, { status: 500 });
  }
}
