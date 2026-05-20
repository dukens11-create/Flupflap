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
import {
  buildOfferCheckoutIdempotencyKey,
  validateOfferCheckoutAccess,
} from '@/lib/offer-checkout';

const SHIPPING_LINE_ITEM_NAME = 'Shipping';

/**
 * Treat explicit CALCULATED mode or legacy zero-shipping products (without mode)
 * as live-rate items that must be quoted via Shippo before checkout.
 */
function isCalculatedShippingProduct(product: { shippingMode?: string | null; shippingCents: number }) {
  return product.shippingMode === 'CALCULATED' || (!product.shippingMode && product.shippingCents === 0);
}

function extractStripeErrorField(err: unknown, key: 'code' | 'type') {
  const value = (err as Record<'code' | 'type', unknown> | null)?.[key];
  return typeof value === 'string' ? value.toLowerCase() : '';
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Please sign in to checkout.' }, { status: 401 });
    }
    const buyerId = session.user.id;
    if (!buyerId) {
      return NextResponse.json({ error: 'Session expired. Please sign in again to checkout.' }, { status: 401 });
    }

    const body = await req.json() as {
      items: { productId: string; quantity: number }[];
      pickupItemIds?: string[];
      shippingRateInfo?: ShippingRateInfoInput;
      offerId?: string;
    };
    const { items, pickupItemIds = [], shippingRateInfo, offerId } = body;
    if (!items?.length) return NextResponse.json({ error: 'Cart is empty.' }, { status: 400 });

    const [settings, products] = await Promise.all([
      getMarketplaceSettings(),
      prisma.product.findMany({
      where: {
        id: { in: items.map(i => i.productId) },
        status: { in: ['APPROVED', 'ACTIVE'] },
        inventory: { gt: 0 },
      },
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

    if (!products.length) return NextResponse.json({ error: 'No valid products in cart.' }, { status: 400 });

    let offerPriceOverrides: Map<string, number> | undefined;
    let acceptedOffer: {
      id: string;
      idempotencyNonce: string;
    } | null = null;
    if (offerId) {
      if (items.length !== 1 || items[0]?.quantity !== 1) {
        return NextResponse.json({ error: 'Accepted-offer checkout supports a single listing quantity of 1.' }, { status: 400 });
      }

      const offer = await prisma.offer.findUnique({
        where: { id: offerId },
        select: {
          id: true,
          buyerId: true,
          productId: true,
          sellerId: true,
          amountCents: true,
          status: true,
          respondedAt: true,
          expiresAt: true,
          convertedOrderId: true,
          checkoutSessionId: true,
          checkoutSessionExpiresAt: true,
        },
      });
      const validatedOffer = validateOfferCheckoutAccess({
        offer: offer
          ? {
              buyerId: offer.buyerId,
              status: offer.status,
              respondedAt: offer.respondedAt,
              expiresAt: offer.expiresAt,
              convertedOrderId: offer.convertedOrderId,
            }
          : null,
        buyerId,
      });
      if (!validatedOffer.ok) {
        return NextResponse.json({ error: validatedOffer.message }, { status: 400 });
      }

      if (!offer || offer.productId !== items[0].productId) {
        return NextResponse.json({ error: 'Offer does not match checkout item.' }, { status: 400 });
      }

      const matchedProduct = products.find((product) => product.id === offer.productId);
      if (!matchedProduct || matchedProduct.inventory <= 0) {
        return NextResponse.json(
          { error: 'This accepted offer can no longer be checked out because the listing is unavailable.' },
          { status: 400 },
        );
      }

      if (offer.checkoutSessionId) {
        try {
          const existingSession = await stripe.checkout.sessions.retrieve(offer.checkoutSessionId);
          if (existingSession.payment_status === 'paid' || existingSession.status === 'complete') {
            return NextResponse.json({ error: 'This accepted offer has already been paid.' }, { status: 400 });
          }
          if (existingSession.status === 'open' && existingSession.url) {
            return NextResponse.json({ url: existingSession.url, warningCode: null });
          }
        } catch {
          // If Stripe session lookup fails (stale/deleted), proceed to create a fresh checkout session.
        }
      }

      offerPriceOverrides = new Map([[offer.productId, offer.amountCents]]);
      acceptedOffer = {
        id: offer.id,
        idempotencyNonce: offer.respondedAt?.toISOString() ?? 'initial',
      };
    }

    // Validate requested quantities do not exceed available inventory
    for (const product of products) {
      const reqItem = items.find(i => i.productId === product.id);
      if (reqItem && reqItem.quantity > product.inventory) {
        return NextResponse.json(
          { error: `Only ${product.inventory} unit${product.inventory === 1 ? '' : 's'} of "${product.title}" available.` },
          { status: 400 },
        );
      }
    }

    const pickupSet = new Set(pickupItemIds);
    const calculatedShippingProducts = products.filter(
      (product) => !pickupSet.has(product.id) && isCalculatedShippingProduct(product),
    );
    const requiresLiveShippingSelection = calculatedShippingProducts.length > 0;
    const missingPackageTitles = getMissingPackageProductTitles(calculatedShippingProducts);
    if (missingPackageTitles.length > 0) {
      return NextResponse.json(
        { error: `Some items cannot be shipped because seller package details are missing for: ${missingPackageTitles.join(', ')}. Please remove those items or contact the seller.` },
        { status: 400 },
      );
    }
    let validatedShippingRateInfo: VerifiedShippingRateInfo | undefined;
    if (requiresLiveShippingSelection) {
      try {
        validatedShippingRateInfo = await verifySelectedShippingRates({
          items,
          pickupItemIds,
          products,
          shippingRateInfo,
        });
      } catch (verificationErr) {
        const errorMessage = verificationErr instanceof Error
          ? verificationErr.message
          : 'Shipping rates changed. Please refresh shipping quotes and try again.';
        return NextResponse.json({ error: errorMessage }, { status: 400 });
      }
    }

    // When live shipping rates are provided, override shippingCents per item to 0.
    // The actual shipping cost is charged as a separate Stripe line item, so items
    // must have shippingCents=0 to avoid double-billing the buyer for shipping.
    const liveRatesByProductId = new Map<string, number>();
    if (validatedShippingRateInfo?.shipmentGroups?.length) {
      // Build a Map from sellerId → group for O(1) lookup per product
      const groupBySellerIdMap = new Map(validatedShippingRateInfo.shipmentGroups.map(g => [g.sellerId, g]));
      for (const product of products) {
        if (pickupSet.has(product.id)) continue;
        if (!isCalculatedShippingProduct(product)) continue;
        if (groupBySellerIdMap.has(product.sellerId)) liveRatesByProductId.set(product.id, 0);
      }
    }

    const { commissionItems, platformFeeCents } = buildCheckoutCommissionItems(
      products,
      items,
      pickupItemIds,
      settings.defaultSellerCommissionBps,
      liveRatesByProductId.size > 0 ? liveRatesByProductId : undefined,
      offerPriceOverrides,
    );
    const commissionItemsById = new Map(commissionItems.map((item) => [item.productId, item]));

    const lineItems = products.map(p => {
      const qty = items.find(i => i.productId === p.id)?.quantity ?? 1;
      const commissionItem = commissionItemsById.get(p.id);
      const unitAmount = commissionItem
        ? commissionItem.priceCents + commissionItem.shippingCents
        : p.priceCents + (pickupSet.has(p.id) ? 0 : p.shippingCents);
      return {
        price_data: {
          currency: 'usd',
          product_data: { name: p.title, images: [p.imageUrl] },
          unit_amount: unitAmount,
        },
        quantity: qty,
      };
    });
    const productSubtotalCents = lineItems.reduce(
      (sum, item) => sum + ((item.price_data.unit_amount ?? 0) * (item.quantity ?? 1)),
      0,
    );

    // Add live shipping as a separate line item if selected
    const shippingAmount = validatedShippingRateInfo?.totalRateCents ?? 0;
    for (const selectedRate of validatedShippingRateInfo?.shipmentGroups ?? []) {
      console.log("Selected shipping rate:", {
        sellerId: selectedRate.sellerId,
        shipmentId: selectedRate.shipmentId,
        rateId: selectedRate.rateId,
        carrier: selectedRate.carrier,
        service: selectedRate.service,
        rateCents: selectedRate.rateCents,
      });
    }
    console.log("Stripe shipping amount:", shippingAmount);
    if (validatedShippingRateInfo?.totalRateCents && validatedShippingRateInfo.totalRateCents > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: SHIPPING_LINE_ITEM_NAME, images: [] },
          unit_amount: validatedShippingRateInfo.totalRateCents,
        },
        quantity: 1,
      });
    }
    const checkoutSubtotalCents = lineItems.reduce(
      (sum, item) => sum + ((item.price_data.unit_amount ?? 0) * (item.quantity ?? 1)),
      0,
    );
    if (requiresLiveShippingSelection) {
      const expectedSubtotalCents = productSubtotalCents + shippingAmount;
      if (shippingAmount < 0) {
        console.error('[checkout/cart] shipping validation failed: invalid shipping amount', { shippingAmount });
        return NextResponse.json(
          { error: 'Unable to process checkout. Please refresh and try again.' },
          { status: 400 },
        );
      }
      if (shippingAmount > 0) {
        const hasShippingLine = lineItems.some(item => (
          item.price_data.product_data.name === SHIPPING_LINE_ITEM_NAME
          && item.price_data.unit_amount === shippingAmount
        ));
        if (!hasShippingLine) {
          console.error('[checkout/cart] shipping validation failed: missing shipping line');
          return NextResponse.json(
            { error: 'Unable to process checkout. Please refresh and try again.' },
            { status: 400 },
          );
        }
      }
      if (checkoutSubtotalCents !== expectedSubtotalCents) {
        console.error('[checkout/cart] shipping validation failed', {
          shippingAmount,
          checkoutSubtotalCents,
          expectedSubtotalCents,
        });
        return NextResponse.json(
          { error: 'Unable to process checkout. Please refresh and try again.' },
          { status: 400 },
        );
      }
    }

    // If ALL items are pickup, don't collect a shipping address from Stripe
    const allPickup = products.every(p => pickupSet.has(p.id));
    // If live shipping address was provided by buyer, skip Stripe address collection
    const hasLiveShippingAddress = !!(validatedShippingRateInfo?.buyerAddress?.street1);

    // Wire funds to the seller's connected account only when the entire cart
    // belongs to a single, fully-onboarded seller. Multi-seller carts have no
    // single destination, so those payments stay on the platform account.
    const uniqueSellerIds = new Set(products.map(p => p.sellerId));
    const isSingleSeller = uniqueSellerIds.size === 1;
    const seller = isSingleSeller ? products[0].seller : null;
    let sellerStripeId = seller
      && seller.stripeOnboardingComplete
      && isSellerVerificationApproved(seller.verificationSubmission)
      ? seller.stripeAccountId
      : null;
    let sellerReconnectRequired = false;

    if (seller && sellerStripeId) {
      const currentMode = getCurrentStripeMode();
      const hasModeMismatch = !!(
        seller.stripeAccountMode
        && currentMode
        && seller.stripeAccountMode !== currentMode
      );
      if (hasModeMismatch) {
        await prisma.user.update({
          where: { id: seller.id },
          data: { stripeAccountId: null, stripeAccountMode: null, stripeOnboardingComplete: false },
        });
        sellerStripeId = null;
        sellerReconnectRequired = true;
      } else {
        try {
          await stripe.accounts.retrieve(sellerStripeId);
        } catch (err) {
          const classified = classifyStripeError(err);
          if (classified.reason === 'stale_account') {
            await prisma.user.update({
              where: { id: seller.id },
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

    let checkoutCustomerId: string | undefined;
    if (hasLiveShippingAddress && validatedShippingRateInfo?.buyerAddress) {
      try {
        const address = validatedShippingRateInfo.buyerAddress;
        const shippingName = address.name?.trim() || 'Buyer';
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
        console.warn('[checkout/cart] unable to create Stripe customer from live shipping address', err);
      }
    }

    const requiresShippingAddressCollection = !allPickup && !checkoutCustomerId;
    const offerCheckoutIdempotencyKey = acceptedOffer
      ? buildOfferCheckoutIdempotencyKey({
          offerId: acceptedOffer.id,
          pickupItemIds,
          selectedRateIds: (validatedShippingRateInfo?.shipmentGroups ?? []).map((group) => group.rateId),
          nonce: acceptedOffer.idempotencyNonce,
        })
      : null;
    const createCheckoutSession = async (enableAutomaticTax: boolean) => stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      automatic_tax: { enabled: enableAutomaticTax },
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout/cancel`,
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
        buyerId,
        items: JSON.stringify(items),
        pickupItemIds: JSON.stringify(pickupItemIds),
        isPickup: allPickup ? 'true' : 'false',
        ...(acceptedOffer ? { offerId: acceptedOffer.id } : {}),
      },
    }, offerCheckoutIdempotencyKey ? { idempotencyKey: offerCheckoutIdempotencyKey } : undefined);

    const stripeSession = await (async () => {
      try {
        return await createCheckoutSession(true);
      } catch (err) {
        const classified = classifyStripeError(err);
        const stripeCode = extractStripeErrorField(err, 'code');
        const stripeType = extractStripeErrorField(err, 'type');
        const message = classified.message.toLowerCase();
        const knownTaxErrorCodes = new Set([
          'automatic_tax_not_supported',
          'automatic_tax_unsupported',
          'tax_calculation_failed',
          'tax_not_supported',
        ]);
        const hasTaxSignal = stripeCode.includes('tax') || stripeType.includes('tax') || message.includes('automatic_tax');
        const hasAvailabilitySignal = message.includes('unsupported')
          || message.includes('unavailable')
          || message.includes('cannot')
          || message.includes('address')
          || message.includes('location');
        const isTaxFailure = classified.reason === 'stripe_error'
          && (knownTaxErrorCodes.has(stripeCode) || (hasTaxSignal && hasAvailabilitySignal));
        if (!isTaxFailure) throw err;
        console.warn('[checkout/cart] automatic tax unavailable, retrying with tax disabled', {
          reason: classified.reason,
          statusCode: classified.statusCode,
          code: stripeCode,
          type: stripeType,
          message: classified.message,
        });
        return createCheckoutSession(false);
      }
    })();

    await prisma.checkoutSessionSnapshot.create({
      data: {
        stripeCheckoutId: stripeSession.id,
        buyerId,
        items,
        pickupItemIds,
        commissionItems,
        directToSellerId: sellerStripeId,
        shippingRateInfo: validatedShippingRateInfo ?? undefined,
      },
    });

    if (acceptedOffer) {
      await prisma.offer.update({
        where: { id: acceptedOffer.id },
        data: {
          checkoutSessionId: stripeSession.id,
          checkoutSessionExpiresAt: stripeSession.expires_at
            ? new Date(stripeSession.expires_at * 1000)
            : null,
        },
      });
    }

    return NextResponse.json({
      url: stripeSession.url,
      warningCode: sellerReconnectRequired ? 'seller_reconnect_required' : null,
    });
  } catch (err: any) {
    logError('Stripe cart checkout session failed', err, { tag: 'checkout/cart', action: 'createCheckoutSession' });
    const reason = classifyStripeError(err).reason;
    return checkoutErrorResponse(reason);
  }
}
