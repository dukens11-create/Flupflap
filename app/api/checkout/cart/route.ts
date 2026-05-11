import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { appUrl, classifyStripeError, getCurrentStripeMode, stripe } from '@/lib/stripe';
import { buildCheckoutCommissionItems, getMarketplaceSettings } from '@/lib/commission';
import { checkoutErrorResponse } from '@/lib/checkout-errors';
import { isSellerVerificationApproved } from '@/lib/seller-verification';

type ShipmentGroup = {
  sellerId: string;
  shipmentId: string;
  rateId: string;
  rateCents: number;
  carrier: string;
  service: string;
};

type ShippingRateInfo = {
  shipmentGroups: ShipmentGroup[];
  totalRateCents: number;
  buyerAddress?: {
    name?: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country?: string;
  };
};

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Please sign in to checkout.' }, { status: 401 });
    }

    const body = await req.json() as {
      items: { productId: string; quantity: number }[];
      pickupItemIds?: string[];
      shippingRateInfo?: ShippingRateInfo;
      buyerAddress?: ShippingRateInfo['buyerAddress'];
    };
    const { items, pickupItemIds = [], shippingRateInfo } = body;
    if (!items?.length) return NextResponse.json({ error: 'Cart is empty.' }, { status: 400 });

    const [settings, products] = await Promise.all([
      getMarketplaceSettings(),
      prisma.product.findMany({
      where: {
        id: { in: items.map(i => i.productId) },
        status: 'APPROVED',
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
          },
        },
      },
    }),
    ]);

    if (!products.length) return NextResponse.json({ error: 'No valid products in cart.' }, { status: 400 });

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

    // When live shipping rates are provided, override shippingCents per item to 0.
    // The actual shipping cost is charged as a separate Stripe line item, so items
    // must have shippingCents=0 to avoid double-billing the buyer for shipping.
    const liveRatesByProductId = new Map<string, number>();
    if (shippingRateInfo?.shipmentGroups?.length) {
      // Build a Map from sellerId → group for O(1) lookup per product
      const groupBySellerIdMap = new Map(shippingRateInfo.shipmentGroups.map(g => [g.sellerId, g]));
      for (const product of products) {
        if (pickupSet.has(product.id)) continue;
        if (groupBySellerIdMap.has(product.sellerId)) liveRatesByProductId.set(product.id, 0);
      }
    }

    const { commissionItems, platformFeeCents } = buildCheckoutCommissionItems(
      products,
      items,
      pickupItemIds,
      settings.defaultSellerCommissionBps,
      liveRatesByProductId.size > 0 ? liveRatesByProductId : undefined,
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

    // Add live shipping as a separate line item if selected
    if (shippingRateInfo?.totalRateCents && shippingRateInfo.totalRateCents > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Shipping', images: [] },
          unit_amount: shippingRateInfo.totalRateCents,
        },
        quantity: 1,
      });
    }

    // If ALL items are pickup, don't collect a shipping address from Stripe
    const allPickup = products.every(p => pickupSet.has(p.id));
    // If live shipping address was provided by buyer, skip Stripe address collection
    const hasLiveShippingAddress = !!(shippingRateInfo?.buyerAddress?.street1);

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

    const stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout/cancel`,
      ...(allPickup || hasLiveShippingAddress
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
        items: JSON.stringify(items),
        pickupItemIds: JSON.stringify(pickupItemIds),
        isPickup: allPickup ? 'true' : 'false',
      },
    });

    await prisma.checkoutSessionSnapshot.create({
      data: {
        stripeCheckoutId: stripeSession.id,
        buyerId: session.user.id,
        items,
        pickupItemIds,
        commissionItems,
        directToSellerId: sellerStripeId,
        shippingRateInfo: shippingRateInfo ?? undefined,
      },
    });

    return NextResponse.json({
      url: stripeSession.url,
      warningCode: sellerReconnectRequired ? 'seller_reconnect_required' : null,
    });
  } catch (err: any) {
    console.error('[checkout/cart]', err);
    const reason = classifyStripeError(err).reason;
    return checkoutErrorResponse(reason);
  }
}
