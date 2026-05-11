import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createShipmentRates } from '@/lib/shipping';

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

/** Fallback to env-var ship-from address when seller profile is incomplete. */
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
  const name = seller.shipFromName?.trim() || seller.shopName?.trim() || (process.env.SHIP_FROM_NAME ?? 'Seller Fulfillment').trim();
  const street1 = seller.shipFromStreet?.trim() || (process.env.SHIP_FROM_STREET1 ?? '').trim();
  const city = seller.shipFromCity?.trim() || (process.env.SHIP_FROM_CITY ?? '').trim();
  const state = seller.shipFromState?.trim() || (process.env.SHIP_FROM_STATE ?? '').trim();
  const zip = seller.shipFromZip?.trim() || (process.env.SHIP_FROM_ZIP ?? '').trim();
  const country = seller.shipFromCountry?.trim() || (process.env.SHIP_FROM_COUNTRY ?? 'US').trim();
  const phone = seller.shipFromPhone?.trim() || (process.env.SHIP_FROM_PHONE ?? '').trim() || undefined;

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

      // Validate that we have a ship-from address
      if (!fromAddress.street1 || !fromAddress.city || !fromAddress.state || !fromAddress.zip) {
        errors.push(
          `Seller "${seller.shopName || 'Unknown'}" has not configured a ship-from address.`,
        );
        continue;
      }

      // Aggregate package dimensions across products (sum weights, use max dimensions)
      const totalWeightOz = sellerProducts.reduce((sum, p) => {
        const qty = quantityByProductId.get(p.id) ?? 1;
        return sum + (p.weightOz ?? 0) * qty;
      }, 0);
      const maxLength = Math.max(...sellerProducts.map(p => p.lengthIn ?? 0));
      const maxWidth = Math.max(...sellerProducts.map(p => p.widthIn ?? 0));
      const maxHeight = Math.max(...sellerProducts.map(p => p.heightIn ?? 0));

      // Skip if no package dimensions available
      if (!totalWeightOz || !maxLength || !maxWidth || !maxHeight) {
        errors.push(
          `Some products from "${seller.shopName || 'this seller'}" are missing package dimensions.`,
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
          lengthIn: maxLength,
          widthIn: maxWidth,
          heightIn: maxHeight,
        });

        groups.push({
          sellerId,
          sellerName: seller.shopName || 'Seller',
          shipmentId: result.shipmentId,
          rates: result.rates,
        });
      } catch (err: any) {
        console.error(`[checkout/rates] EasyPost error for seller ${sellerId}:`, err?.message ?? err);
        errors.push(
          `Shipping rate unavailable for "${seller.shopName || 'a seller'}". Please try again.`,
        );
      }
    }

    if (!groups.length && errors.length > 0) {
      return NextResponse.json(
        { error: 'Shipping rate unavailable. Please try again.', details: errors },
        { status: 503 },
      );
    }

    return NextResponse.json({ groups, warnings: errors.length ? errors : undefined });
  } catch (err: any) {
    console.error('[checkout/rates]', err);
    return NextResponse.json(
      { error: 'Shipping rate unavailable. Please try again.' },
      { status: 500 },
    );
  }
}
