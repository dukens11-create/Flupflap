import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createShipmentRates } from '@/lib/shipping';
import { getMissingPackageProductTitles } from '@/lib/product-package';

const OUNCES_PER_POUND = 16;

type BuyerAddress = {
  name?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
};

type CartItem = {
  productId: string;
  quantity: number;
};

type SellerShipGroup = {
  sellerId: string;
  sellerName: string;
  shipmentId: string;
  rates: {
    id: string;
    carrier: string;
    service: string;
    rate: string;
    currency: string;
    deliveryDays: number | null;
  }[];
};

function resolveFromAddress(seller: {
  shipFromName?: string | null;
  shipFromStreet?: string | null;
  shipFromCity?: string | null;
  shipFromState?: string | null;
  shipFromZip?: string | null;
  shipFromCountry?: string | null;
  shipFromPhone?: string | null;
  shopName?: string | null;
}) {
  const name = seller.shipFromName?.trim() || seller.shopName?.trim() || 'Seller Fulfillment';
  const street1 = seller.shipFromStreet?.trim() || '';
  const city = seller.shipFromCity?.trim() || '';
  const state = seller.shipFromState?.trim() || '';
  const zip = seller.shipFromZip?.trim() || '';
  const country = seller.shipFromCountry?.trim() || 'US';
  const phone = seller.shipFromPhone?.trim() || undefined;

  return { name, street1, city, state, zip, country, phone };
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Please sign in to calculate shipping.' }, { status: 401 });
    }

    const body = await req.json() as {
      items: CartItem[];
      buyerAddress: BuyerAddress;
    };

    const { items, buyerAddress } = body;
    if (!items?.length) {
      return NextResponse.json({ error: 'No items provided.' }, { status: 400 });
    }

    if (!buyerAddress?.street1 || !buyerAddress?.city || !buyerAddress?.state || !buyerAddress?.zip) {
      return NextResponse.json({ error: 'Please provide a complete shipping address.' }, { status: 400 });
    }
    console.log("Shippo token exists:", !!process.env.SHIPPO_API_TOKEN);
    const buyerAddressForLog = {
      ...buyerAddress,
      street1: '[redacted]',
      street2: buyerAddress.street2 ? '[redacted]' : '[not provided]',
      zip: '[redacted]',
    };
    console.log("Ship-to address:", buyerAddressForLog);

    // Load products with their seller shipping profile and dimensions
    const products = await prisma.product.findMany({
      where: {
        id: { in: items.map(i => i.productId) },
        status: 'APPROVED',
        inventory: { gt: 0 },
      },
      select: {
        id: true,
        title: true,
        weightOz: true,
        weightUnit: true,
        lengthIn: true,
        widthIn: true,
        heightIn: true,
        shippingMode: true,
        shippingCents: true,
        sellerId: true,
        seller: {
          select: {
            id: true,
            shopName: true,
            shipFromName: true,
            shipFromStreet: true,
            shipFromCity: true,
            shipFromState: true,
            shipFromZip: true,
            shipFromCountry: true,
            shipFromPhone: true,
          },
        },
      },
    });

    if (!products.length) {
      return NextResponse.json({ error: 'No valid products found in cart.' }, { status: 400 });
    }

    // Group products by sellerId
    const sellerGroups = new Map<string, typeof products>();
    for (const product of products) {
      const group = sellerGroups.get(product.sellerId) ?? [];
      group.push(product);
      sellerGroups.set(product.sellerId, group);
    }

    const groups: SellerShipGroup[] = [];
    const errors: string[] = [];

    // Build a Map of productId → quantity to avoid O(n²) lookup in the loop below
    const quantityByProductId = new Map(items.map(i => [i.productId, i.quantity]));

    for (const [sellerId, sellerProducts] of sellerGroups) {
      const seller = sellerProducts[0].seller;
      const fromAddress = resolveFromAddress(seller);
      const sellerAddress = {
        ...fromAddress,
        street1: '[redacted]',
        zip: '[redacted]',
      };
      console.log("Ship-from address:", sellerAddress);

      // Validate that we have a ship-from address
      if (!fromAddress.street1 || !fromAddress.city || !fromAddress.state || !fromAddress.zip) {
        errors.push(
          `Shipping rate unavailable. Please check address or package details. Seller "${seller.shopName || 'Unknown'}" has not configured a ship-from address.`,
        );
        continue;
      }

      const missingPackageTitles = getMissingPackageProductTitles(sellerProducts);
      if (missingPackageTitles.length > 0) {
        errors.push(
          `Shipping unavailable. Seller "${seller.shopName || 'this seller'}" must add shipping package details for: ${missingPackageTitles.join(', ')}.`,
        );
        continue;
      }

      // Aggregate package dimensions across products (sum weights, use max dimensions)
      const totalWeightOz = sellerProducts.reduce((sum, p) => {
        const qty = quantityByProductId.get(p.id) ?? 1;
        return sum + (p.weightOz ?? 0) * qty;
      }, 0);
      // Use explicit reduce with 0-fallback to avoid Math.max() returning -Infinity on empty arrays
      const maxLength = sellerProducts.reduce((m, p) => Math.max(m, p.lengthIn ?? 0), 0);
      const maxWidth = sellerProducts.reduce((m, p) => Math.max(m, p.widthIn ?? 0), 0);
      const maxHeight = sellerProducts.reduce((m, p) => Math.max(m, p.heightIn ?? 0), 0);

      const parcel = {
        weightOz: totalWeightOz,
        lengthIn: maxLength,
        widthIn: maxWidth,
        heightIn: maxHeight,
      };
      console.log("Package:", parcel);

      // Skip if no package dimensions available
      if (!totalWeightOz || !maxLength || !maxWidth || !maxHeight) {
        errors.push(
          `Shipping rate unavailable. Please check address or package details. Some products from "${seller.shopName || 'this seller'}" are missing package dimensions.`,
        );
        continue;
      }

      try {
        const result = await createShipmentRates({
          toAddress: {
            name: buyerAddress.name || session.user.name || 'Buyer',
            street1: buyerAddress.street1,
            street2: buyerAddress.street2,
            city: buyerAddress.city,
            state: buyerAddress.state,
            zip: buyerAddress.zip,
            country: buyerAddress.country || 'US',
          },
          fromAddress,
          weightOz: totalWeightOz,
          weightUnit: totalWeightOz >= OUNCES_PER_POUND ? 'lb' : 'oz',
          lengthIn: maxLength,
          widthIn: maxWidth,
          heightIn: maxHeight,
        });
        const rates = result.rates.map((rate) => ({
          id: rate.id,
          carrier: rate.carrier,
          service: rate.service,
          rate: rate.rate,
          deliveryDays: rate.deliveryDays,
        }));
        console.log("Shippo rates:", rates);
        if (!rates.length) {
          throw new Error('No supported shipping rates returned.');
        }

        groups.push({
          sellerId,
          sellerName: seller.shopName || 'Seller',
          shipmentId: result.shipmentId,
          rates: result.rates,
        });
      } catch (err: any) {
        console.error(`[checkout/rates] Shippo error for seller ${sellerId}:`, err?.message ?? err, {
          sellerCountry: fromAddress.country,
          sellerState: fromAddress.state,
          buyerState: buyerAddress.state,
          buyerCountry: buyerAddress.country || 'US',
          parcel,
        });
        errors.push(
          `Shipping rate unavailable. Please check address or package details. Seller "${seller.shopName || 'a seller'}" could not be quoted.`,
        );
      }
    }

    if (!groups.length && errors.length > 0) {
      console.error('[checkout/rates] all seller groups failed:', errors);
      return NextResponse.json(
        { error: errors.join(' ') },
        { status: 503 },
      );
    }

    // Validate that all calculated-shipping products have a corresponding rate group
    const groupSellerIds = new Set(groups.map(g => g.sellerId));
    const uncoveredProducts = products.filter(
      p => !groupSellerIds.has(p.sellerId) && (p.shippingMode === 'CALCULATED' || (!p.shippingMode && p.shippingCents === 0)),
    );
    const uncoveredWarnings = uncoveredProducts.map(
      p => `Product "${p.title}" has no shipping rates available.`,
    );

    const warnings = [
      ...errors,
      ...uncoveredWarnings,
    ];

    return NextResponse.json({
      groups,
      warnings: warnings.length ? warnings : undefined,
    });
  } catch (err: any) {
    console.error('[checkout/rates]', err);
    return NextResponse.json(
      { error: 'Shipping rate unavailable. Please check address or package details.' },
      { status: 500 },
    );
  }
}
