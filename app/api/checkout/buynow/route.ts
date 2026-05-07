import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { appUrl, classifyStripeError, getCurrentStripeMode, stripe } from '@/lib/stripe';
import { buildCheckoutCommissionItems, getMarketplaceSettings } from '@/lib/commission';
import { checkoutErrorResponse } from '@/lib/checkout-errors';

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
    let sellerStripeId = product.seller.stripeOnboardingComplete ? product.seller.stripeAccountId : null;
    const currentMode = getCurrentStripeMode();

    if (!sellerStripeId) {
      return NextResponse.json(
        { error: 'Seller payout account is not ready. Please try again later.', code: 'seller_reconnect_required' },
        { status: 503 },
      );
    }

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
      return checkoutErrorResponse('stale_account');
    }
    try {
      await stripe.accounts.retrieve(sellerStripeId);
    } catch (err) {
      const classified = classifyStripeError(err);
      if (classified.reason === 'stale_account') {
        await prisma.user.update({
          where: { id: product.seller.id },
          data: { stripeAccountId: null, stripeAccountMode: null, stripeOnboardingComplete: false },
        });
      } else {
        return checkoutErrorResponse(classified.reason);
      }
      return checkoutErrorResponse('stale_account');
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
      warningCode: null,
    });
  } catch (err: any) {
    console.error('[checkout/buynow]', err);
    const reason = classifyStripeError(err).reason;
    return checkoutErrorResponse(reason);
  }
}
