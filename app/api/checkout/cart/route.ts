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
      return NextResponse.json({ error: 'Please sign in to checkout.' }, { status: 401 });
    }

    const body = await req.json() as {
      items: { productId: string; quantity: number }[];
      pickupItemIds?: string[];
    };
    const { items, pickupItemIds = [] } = body;
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
            sellerPlan: { select: { code: true, commissionRateBps: true } },
          },
        },
      },
    }),
    ]);

    if (!products.length) return NextResponse.json({ error: 'No valid products in cart.' }, { status: 400 });

    const pickupSet = new Set(pickupItemIds);
    const { commissionItems, platformFeeCents } = buildCheckoutCommissionItems(
      products,
      items,
      pickupItemIds,
      settings.defaultSellerCommissionBps,
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

    // If ALL items are pickup, don't collect a shipping address from Stripe
    const allPickup = products.every(p => pickupSet.has(p.id));

    // Wire funds to the seller's connected account only when the entire cart
    // belongs to a single, fully-onboarded seller. Multi-seller carts have no
    // single destination, so those payments stay on the platform account.
    const uniqueSellerIds = new Set(products.map(p => p.sellerId));
    const isSingleSeller = uniqueSellerIds.size === 1;
    let sellerStripeId = isSingleSeller
      && products[0].seller.stripeOnboardingComplete
      && products[0].seller.stripeAccountId
      ? products[0].seller.stripeAccountId
      : null;
    let sellerReconnectRequired = false;

    if (isSingleSeller && sellerStripeId) {
      const seller = products[0].seller;
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
          const connectedAccount = await stripe.accounts.retrieve(sellerStripeId);
          const resolvedMode = modeFromStripeLivemode(connectedAccount.livemode);
          if (seller.stripeAccountMode !== resolvedMode) {
            await prisma.user.update({
              where: { id: seller.id },
              data: { stripeAccountMode: resolvedMode },
            });
          }
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
      ...(allPickup
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
