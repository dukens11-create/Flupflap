import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { buildCheckoutCommissionItems, getMarketplaceSettings } from '@/lib/commission';
import { classifyStripeError, stripe } from '@/lib/stripe';
import { getMissingPackageProductTitles } from '@/lib/product-package';
import {
  verifySelectedShippingRates,
  type ShippingRateInfoInput,
  type VerifiedShippingRateInfo,
} from '@/lib/checkout-shipping-verification';

function isCalculatedShippingProduct(product: { shippingMode?: string | null; shippingCents: number }) {
  return product.shippingMode === 'CALCULATED' || (!product.shippingMode && product.shippingCents === 0);
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 });
    }
    const userId = session.user.id;
    if (!userId) {
      return NextResponse.json({ error: 'Session expired. Please sign in again.' }, { status: 401 });
    }

    const body = await req.json() as {
      items: { productId: string; quantity: number }[];
      pickupItemIds?: string[];
      shippingRateInfo?: ShippingRateInfoInput;
    };
    const { items, pickupItemIds = [], shippingRateInfo } = body;

    if (!items?.length) {
      return NextResponse.json({ error: 'Cart is empty.' }, { status: 400 });
    }

    const [settings, products] = await Promise.all([
      getMarketplaceSettings(),
      prisma.product.findMany({
        where: {
          id: { in: items.map(item => item.productId) },
          status: { in: ['APPROVED', 'ACTIVE'] },
          inventory: { gt: 0 },
        },
        include: {
          seller: {
            select: {
              id: true,
              stripeAccountId: true,
              stripeOnboardingComplete: true,
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

    if (!products.length) {
      return NextResponse.json({ error: 'No valid products in cart.' }, { status: 400 });
    }

    for (const product of products) {
      const reqItem = items.find(item => item.productId === product.id);
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
    const missingPackageTitles = getMissingPackageProductTitles(calculatedShippingProducts);
    if (missingPackageTitles.length > 0) {
      return NextResponse.json(
        { error: `Shipping unavailable. The seller must add shipping package details for: ${missingPackageTitles.join(', ')}.` },
        { status: 400 },
      );
    }

    let verifiedShippingRateInfo: VerifiedShippingRateInfo | undefined;
    if (calculatedShippingProducts.length > 0) {
      try {
        verifiedShippingRateInfo = await verifySelectedShippingRates({
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

    const shippingAmount = verifiedShippingRateInfo?.totalRateCents ?? 0;
    if (calculatedShippingProducts.length > 0 && shippingAmount <= 0) {
      return NextResponse.json(
        { error: 'Shipping rate unavailable. Please refresh shipping quotes.' },
        { status: 400 },
      );
    }

    const liveRatesByProductId = new Map<string, number>();
    if (verifiedShippingRateInfo?.shipmentGroups?.length) {
      const selectedSellerIds = new Set(verifiedShippingRateInfo.shipmentGroups.map(group => group.sellerId));
      for (const product of products) {
        if (pickupSet.has(product.id)) continue;
        if (!isCalculatedShippingProduct(product)) continue;
        if (selectedSellerIds.has(product.sellerId)) {
          liveRatesByProductId.set(product.id, 0);
        }
      }
    }

    const { commissionItems } = buildCheckoutCommissionItems(
      products,
      items,
      pickupItemIds,
      settings.defaultSellerCommissionBps,
      liveRatesByProductId.size > 0 ? liveRatesByProductId : undefined,
    );
    const commissionItemsById = new Map(commissionItems.map((item) => [item.productId, item]));
    const lineItems = products.map((product) => {
      const quantity = items.find(item => item.productId === product.id)?.quantity ?? 1;
      const commissionItem = commissionItemsById.get(product.id);
      const unitAmount = commissionItem
        ? commissionItem.priceCents + commissionItem.shippingCents
        : product.priceCents + (pickupSet.has(product.id) ? 0 : product.shippingCents);

      return {
        amount: unitAmount * quantity,
        quantity,
        reference: `product:${product.id}`,
        tax_behavior: 'exclusive' as const,
      };
    });

    if (shippingAmount > 0) {
      lineItems.push({
        amount: shippingAmount,
        quantity: 1,
        reference: 'shipping',
        tax_behavior: 'exclusive' as const,
      });
    }

    const subtotalCents = lineItems.reduce((sum, item) => sum + item.amount, 0);

    try {
      const calculation = await stripe.tax.calculations.create({
        currency: 'usd',
        line_items: lineItems,
        customer_details: {
          address_source: 'shipping',
          address: {
            line1: verifiedShippingRateInfo?.buyerAddress?.street1,
            line2: verifiedShippingRateInfo?.buyerAddress?.street2,
            city: verifiedShippingRateInfo?.buyerAddress?.city,
            state: verifiedShippingRateInfo?.buyerAddress?.state,
            postal_code: verifiedShippingRateInfo?.buyerAddress?.zip,
            country: verifiedShippingRateInfo?.buyerAddress?.country || 'US',
          },
        },
      });

      return NextResponse.json({
        taxCents: calculation.tax_amount_exclusive,
        totalCents: calculation.amount_total,
        taxFallbackApplied: false,
      });
    } catch (taxErr) {
      console.warn('[checkout/summary] stripe tax unavailable, falling back to tax=0', {
        reason: classifyStripeError(taxErr).reason,
        statusCode: (taxErr as { statusCode?: unknown })?.statusCode,
        type: (taxErr as { type?: unknown })?.type,
        code: (taxErr as { code?: unknown })?.code,
        message: taxErr instanceof Error ? taxErr.message : String(taxErr),
      });
      return NextResponse.json({
        taxCents: 0,
        totalCents: subtotalCents,
        taxFallbackApplied: true,
      });
    }
  } catch (err) {
    console.error('[checkout/summary]', err);
    return NextResponse.json(
      { error: classifyStripeError(err).message || 'Unable to calculate the final total.' },
      { status: 500 },
    );
  }
}
