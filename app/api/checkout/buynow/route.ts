import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { appUrl, classifyStripeError, getCurrentStripeMode, modeFromStripeLivemode, stripe, type StripeErrorReason } from '@/lib/stripe';
import { buildCheckoutCommissionItems, getMarketplaceSettings } from '@/lib/commission';

function checkoutErrorResponse(reason: StripeErrorReason) {
  if (reason === 'stale_account') {
    return NextResponse.json(
      { error: 'Seller payout account needs reconnection. Please try again shortly.', code: 'seller_reconnect_required' },
      { status: 503 },
    );
  }
  if (reason === 'invalid_key' || reason === 'platform_incomplete') {
    return NextResponse.json(
      { error: 'Payments are temporarily unavailable due to platform Stripe configuration.', code: 'platform_incomplete' },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { error: 'Checkout is temporarily unavailable. Please try again later.', code: 'stripe_unavailable' },
    { status: 503 },
  );
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Please sign in to purchase.' }, { status: 401 });
    }

    const { productId, isPickup = false } = await req.json() as { productId: string; isPickup?: boolean };
    const [settings, product] = await Promise.all([
      getMarketplaceSettings(),
      prisma.product.findUnique({
      where: { id: productId },
      include: {
        seller: {
          select: {
            id: true,
            stripeAccountId: true,
            stripeAccountMode: true,
            stripeOnboardingComplete: true,
            sellerPlan: { select: { code: true, commissionRateBps: true } },
          },
        },
      },
    }),
    ]);

    if (!product || product.status !== 'APPROVED' || product.inventory <= 0) {
      return NextResponse.json({ error: 'Product not available.' }, { status: 400 });
    }

    // Validate pickup is actually available if requested
    const actualPickup = isPickup && product.pickupAvailable;
    const { commissionItems, platformFeeCents, totalCents } = buildCheckoutCommissionItems(
      [product],
      [{ productId: product.id, quantity: 1 }],
      actualPickup ? [product.id] : [],
      settings.defaultSellerCommissionBps,
    );
    const [commissionItem] = commissionItems;

    // Wire funds to the seller's connected account when onboarding is complete,
    // keeping only the platform commission for the platform.
    let sellerStripeId = product.seller.stripeOnboardingComplete && product.seller.stripeAccountId
      ? product.seller.stripeAccountId
      : null;
    let sellerReconnectRequired = false;
    const currentMode = getCurrentStripeMode();

    if (sellerStripeId) {
      const hasModeMismatch = !!(
        product.seller.stripeAccountMode
        && currentMode
        && product.seller.stripeAccountMode !== currentMode
      );
      if (hasModeMismatch) {
        await prisma.user.update({
          where: { id: product.seller.id },
          data: { stripeAccountId: null, stripeAccountMode: null, stripeOnboardingComplete: false },
        });
        sellerStripeId = null;
        sellerReconnectRequired = true;
      } else {
        try {
          const connectedAccount = await stripe.accounts.retrieve(sellerStripeId);
          const resolvedMode = modeFromStripeLivemode(connectedAccount.livemode);
          if (product.seller.stripeAccountMode !== resolvedMode) {
            await prisma.user.update({
              where: { id: product.seller.id },
              data: { stripeAccountMode: resolvedMode },
            });
          }
        } catch (err) {
          const classified = classifyStripeError(err);
          if (classified.reason === 'stale_account') {
            await prisma.user.update({
              where: { id: product.seller.id },
              data: { stripeAccountId: null, stripeAccountMode: null, stripeOnboardingComplete: false },
            });
            sellerStripeId = null;
            sellerReconnectRequired = true;
          } else {
            return checkoutErrorResponse(classified.reason);
          }
        }
      }
    }

    const stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: product.title, images: [product.imageUrl] },
            unit_amount: totalCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/products/${product.id}`,
      // Don't collect shipping address for pure pickup orders
      ...(actualPickup
        ? {}
        : {
            shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB', 'AU'] },
          }),
      // Split the payment: platform keeps the fee, seller receives the rest.
      ...(sellerStripeId
        ? {
            payment_intent_data: {
              application_fee_amount: platformFeeCents,
              transfer_data: { destination: sellerStripeId },
            },
          }
        : {}),
      metadata: {
        buyerId: session.user.id,
        items: JSON.stringify([{ productId: product.id, quantity: 1 }]),
        pickupItemIds: actualPickup ? JSON.stringify([product.id]) : JSON.stringify([]),
        isPickup: actualPickup ? 'true' : 'false',
      },
    });

    await prisma.checkoutSessionSnapshot.create({
      data: {
        stripeCheckoutId: stripeSession.id,
        buyerId: session.user.id,
        items: [{ productId: product.id, quantity: 1 }],
        pickupItemIds: actualPickup ? [product.id] : [],
        commissionItems: [commissionItem],
        directToSellerId: sellerStripeId,
      },
    });

    return NextResponse.json({
      url: stripeSession.url,
      warningCode: sellerReconnectRequired ? 'seller_reconnect_required' : null,
    });
  } catch (err: any) {
    console.error('[checkout/buynow]', err);
    const reason = classifyStripeError(err).reason;
    return checkoutErrorResponse(reason);
  }
}
