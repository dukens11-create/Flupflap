import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { buildCheckoutCommissionItems, getMarketplaceSettings } from '@/lib/commission';
import { classifyStripeError, stripe } from '@/lib/stripe';

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
    country: string;
  };
};

function isCalculatedShippingProduct(product: { shippingMode?: string | null; shippingCents: number }) {
  return product.shippingMode === 'CALCULATED' || (!product.shippingMode && product.shippingCents === 0);
}

function hasCompleteAddress(address?: ShippingRateInfo['buyerAddress']) {
  return !!(address?.street1 && address?.city && address?.state && address?.zip && address?.country);
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 });
    }

    const body = await req.json() as {
      items: { productId: string; quantity: number }[];
      pickupItemIds?: string[];
      shippingRateInfo?: ShippingRateInfo;
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
          status: 'APPROVED',
          inventory: { gt: 0 },
        },
        include: {
          seller: {
            select: {
              id: true,
              stripeAccountId: true,
              stripeOnboardingComplete: true,
              sellerPlan: { select: { code: true, commissionRateBps: true } },
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
    const calculatedSellerIds = new Set(calculatedShippingProducts.map(product => product.sellerId));
    const selectedShipmentGroups = shippingRateInfo?.shipmentGroups ?? [];
    const selectedBySeller = new Map(selectedShipmentGroups.map((group) => [group.sellerId, group]));

    if (calculatedSellerIds.size > 0 && !hasCompleteAddress(shippingRateInfo?.buyerAddress)) {
      return NextResponse.json({ error: 'Please provide a complete shipping address.' }, { status: 400 });
    }

    for (const sellerId of calculatedSellerIds) {
      const selectedRate = selectedBySeller.get(sellerId);
      if (!selectedRate || !selectedRate.shipmentId || !selectedRate.rateId || selectedRate.rateCents <= 0) {
        return NextResponse.json(
          { error: 'Please select a valid shipping method for every seller before checkout.' },
          { status: 400 },
        );
      }
    }

    const selectedCalculatedGroups = selectedShipmentGroups.filter(group => calculatedSellerIds.has(group.sellerId));
    const shippingAmount = selectedCalculatedGroups.reduce((sum, group) => sum + group.rateCents, 0);
    if (calculatedSellerIds.size > 0 && shippingAmount <= 0) {
      return NextResponse.json(
        { error: 'Shipping not selected' },
        { status: 400 },
      );
    }

    const liveRatesByProductId = new Map<string, number>();
    if (selectedCalculatedGroups.length) {
      const selectedSellerIds = new Set(selectedCalculatedGroups.map(group => group.sellerId));
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
            line1: shippingRateInfo?.buyerAddress?.street1,
            line2: shippingRateInfo?.buyerAddress?.street2,
            city: shippingRateInfo?.buyerAddress?.city,
            state: shippingRateInfo?.buyerAddress?.state,
            postal_code: shippingRateInfo?.buyerAddress?.zip,
            country: shippingRateInfo?.buyerAddress?.country || 'US',
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
