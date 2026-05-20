import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { appUrl, classifyStripeError, getCurrentStripeMode, stripe } from '@/lib/stripe';
import { buildCheckoutCommissionItems, getMarketplaceSettings } from '@/lib/commission';
import { checkoutErrorResponse } from '@/lib/checkout-errors';
import { isSellerVerificationApproved } from '@/lib/seller-verification';
import { getMissingPackageProductTitles } from '@/lib/product-package';
import { logError } from '@/lib/logger';
import {
  verifySelectedShippingRates,
  type ShippingRateInfoInput,
  type VerifiedShippingRateInfo,
} from '@/lib/checkout-shipping-verification';

const SHIPPING_LINE_ITEM_NAME = 'Shipping';
const DEFAULT_BUYER_NAME = 'Buyer';

type StripeLineItem = {
  price_data: { currency: string; product_data: { name: string; images: string[] }; unit_amount: number };
  quantity: number;
};

function isCalculatedShippingProduct(product: { shippingMode?: string | null; shippingCents: number }) {
  return product.shippingMode === 'CALCULATED' || (!product.shippingMode && product.shippingCents === 0);
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Please sign in to purchase.' }, { status: 401 });
    }

    const body = await req.json() as {
      productId: string;
      isPickup?: boolean;
      shippingRateInfo?: ShippingRateInfoInput;
    };
    const { productId, isPickup = false, shippingRateInfo } = body;
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
            shipFromName: true,
            shipFromStreet: true,
            shipFromCity: true,
            shipFromState: true,
            shipFromZip: true,
            shipFromCountry: true,
            shipFromPhone: true,
            shopName: true,
          },
        },
      },
    }),
    ]);

    if (!product || (product.status !== 'APPROVED' && product.status !== 'ACTIVE') || product.inventory <= 0) {
      return NextResponse.json({ error: 'Product not available.' }, { status: 400 });
    }

    // Validate pickup is actually available if requested
    const actualPickup = isPickup && product.pickupAvailable;
    const items = [{ productId: product.id, quantity: 1 }];
    const pickupItemIds = actualPickup ? [product.id] : [];

    // Handle calculated shipping
    let validatedShippingRateInfo: VerifiedShippingRateInfo | undefined;
    if (!actualPickup && isCalculatedShippingProduct(product)) {
      // Check package details are present on the product
      const missingPackageTitles = getMissingPackageProductTitles([product]);
      if (missingPackageTitles.length > 0) {
        return NextResponse.json(
          { error: `Shipping unavailable. The seller must add shipping package details for "${product.title}".` },
          { status: 400 },
        );
      }
      // Require client to supply shipping context (address + selected rate)
      if (!shippingRateInfo?.shipmentGroups?.length || !shippingRateInfo?.buyerAddress) {
        return NextResponse.json(
          { error: 'A shipping address and rate are required for this listing. Please provide shipping rate info.' },
          { status: 400 },
        );
      }
      // Server-side rate revalidation — never trust client-supplied totals
      try {
        validatedShippingRateInfo = await verifySelectedShippingRates({
          items,
          pickupItemIds,
          products: [product],
          shippingRateInfo,
        });
      } catch (verificationErr) {
        const errorMessage = verificationErr instanceof Error
          ? verificationErr.message
          : 'Shipping rates changed. Please refresh shipping quotes and try again.';
        return NextResponse.json({ error: errorMessage }, { status: 400 });
      }
    }

    // When live shipping rates are verified, set shippingCents to 0 on the item
    // to avoid double-billing. The actual cost is charged as a separate line item.
    const liveRatesByProductId = new Map<string, number>();
    if (validatedShippingRateInfo?.shipmentGroups?.length) {
      liveRatesByProductId.set(product.id, 0);
    }

    const { commissionItems, platformFeeCents, totalCents } = buildCheckoutCommissionItems(
      [product],
      items,
      pickupItemIds,
      settings.defaultSellerCommissionBps,
      liveRatesByProductId.size > 0 ? liveRatesByProductId : undefined,
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

    // Build line items: product cost + separate shipping line item for calculated shipping
    const shippingAmount = validatedShippingRateInfo?.totalRateCents ?? 0;
    const lineItems: StripeLineItem[] = [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: product.title, images: [product.imageUrl] },
          unit_amount: totalCents,
        },
        quantity: 1,
      },
    ];
    if (shippingAmount > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: SHIPPING_LINE_ITEM_NAME, images: [] },
          unit_amount: shippingAmount,
        },
        quantity: 1,
      });
    }

    // If buyer address was already captured via live shipping, create a Stripe customer
    // so we don't ask for the address a second time on the Stripe-hosted page.
    let checkoutCustomerId: string | undefined;
    const hasLiveShippingAddress = !!(validatedShippingRateInfo?.buyerAddress?.street1);
    if (hasLiveShippingAddress && validatedShippingRateInfo?.buyerAddress) {
      try {
        const address = validatedShippingRateInfo.buyerAddress;
        const shippingName = address.name?.trim() || DEFAULT_BUYER_NAME;
        const customer = await stripe.customers.create({
          name: shippingName,
          email: session.user.email || undefined,
          address: {
            line1: address.street1,
            line2: address.street2 || undefined,
            city: address.city,
            state: address.state,
            postal_code: address.zip,
            country: address.country || 'US',
          },
          shipping: {
            name: shippingName,
            address: {
              line1: address.street1,
              line2: address.street2 || undefined,
              city: address.city,
              state: address.state,
              postal_code: address.zip,
              country: address.country || 'US',
            },
          },
        });
        checkoutCustomerId = customer.id;
      } catch (err) {
        logError(
          '[checkout/buynow] unable to create Stripe customer from live shipping address',
          err,
          { tag: 'checkout/buynow', action: 'createStripeCustomer' },
        );
      }
    }

    const requiresShippingAddressCollection = !actualPickup && !checkoutCustomerId;

    const stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/products/${product.id}`,
      // Don't collect shipping address for pickup orders or when we already have it
      ...(requiresShippingAddressCollection
        ? { shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB', 'AU'] } }
        : {}),
      ...(checkoutCustomerId ? { customer: checkoutCustomerId } : {}),
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
        items: JSON.stringify(items),
        pickupItemIds: JSON.stringify(pickupItemIds),
        isPickup: actualPickup ? 'true' : 'false',
      },
    });

    await prisma.checkoutSessionSnapshot.create({
      data: {
        stripeCheckoutId: stripeSession.id,
        buyerId: session.user.id,
        items,
        pickupItemIds,
        commissionItems: [commissionItem],
        directToSellerId: sellerStripeId,
        shippingRateInfo: validatedShippingRateInfo ?? undefined,
      },
    });

    return NextResponse.json({
      url: stripeSession.url,
      warningCode: null,
    });
  } catch (err: unknown) {
    logError('Stripe buy-now checkout session failed', err, { tag: 'checkout/buynow', action: 'createCheckoutSession' });
    const reason = classifyStripeError(err).reason;
    return checkoutErrorResponse(reason);
  }
}
