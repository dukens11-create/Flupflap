import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { appUrl, classifyStripeError, getCurrentStripeMode, stripe } from '@/lib/stripe';
import { buildCheckoutCommissionItems, getMarketplaceSettings } from '@/lib/commission';
import { checkoutErrorResponse } from '@/lib/checkout-errors';
import { isSellerVerificationApproved } from '@/lib/seller-verification';
import { hasStoredPackageDetails } from '@/lib/product-package';

function isCalculatedShippingProduct(product: { shippingMode?: string | null; shippingCents: number }) {
  return product.shippingMode === 'CALCULATED' || (!product.shippingMode && product.shippingCents === 0);
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

    if (!product || product.status !== 'APPROVED' || product.inventory <= 0) {
      return NextResponse.json({ error: 'Product not available.' }, { status: 400 });
    }

    // Validate pickup is actually available if requested
    const actualPickup = isPickup && product.pickupAvailable;
    if (!actualPickup && isCalculatedShippingProduct(product)) {
      if (!hasStoredPackageDetails(product)) {
        return NextResponse.json(
          { error: `Shipping unavailable. The seller must add shipping package details for "${product.title}".` },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: 'Shipping rate unavailable. Please check address or package details.' },
        { status: 400 },
      );
    }

    const { commissionItems, platformFeeCents, totalCents } = buildCheckoutCommissionItems(
      [product],
      [{ productId: product.id, quantity: 1 }],
      actualPickup ? [product.id] : [],
      settings.defaultSellerCommissionBps,
    );
    const [commissionItem] = commissionItems;

    // Wire funds to the seller's connected account when onboarding is complete,
    // keeping only the platform commission for the platform.
    const sellerVerified = isSellerVerificationApproved(product.seller.verificationSubmission);
    let sellerStripeId = sellerVerified && product.seller.stripeOnboardingComplete
      ? product.seller.stripeAccountId
      : null;
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
      } else {
        try {
          const sellerAccount = await stripe.accounts.retrieve(sellerStripeId);
          if (!sellerAccount.charges_enabled || !sellerAccount.payouts_enabled) {
            await prisma.user.update({
              where: { id: product.seller.id },
              data: { stripeOnboardingComplete: false },
            });
            sellerStripeId = null;
          }
        } catch (err: unknown) {
          const classified = classifyStripeError(err);
          if (classified.reason === 'stale_account') {
            await prisma.user.update({
              where: { id: product.seller.id },
              data: { stripeAccountId: null, stripeAccountMode: null, stripeOnboardingComplete: false },
            });
            sellerStripeId = null;
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
      warningCode: null,
    });
  } catch (err: unknown) {
    console.error('[checkout/buynow]', err);
    const reason = classifyStripeError(err).reason;
    return checkoutErrorResponse(reason);
  }
}
