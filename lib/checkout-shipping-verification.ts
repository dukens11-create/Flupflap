import { createShipmentRates, type ShipmentRateQuote } from '@/lib/shipping';

export type ShippingAddressInput = {
  name?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
};

type SelectedShipmentGroupInput = {
  sellerId: string;
  shipmentId?: string;
  rateId: string;
  rateCents?: number;
  carrier?: string;
  service?: string;
};

export type ShippingRateInfoInput = {
  shipmentGroups: SelectedShipmentGroupInput[];
  totalRateCents?: number;
  buyerAddress?: ShippingAddressInput;
};

export type VerifiedShipmentGroup = {
  sellerId: string;
  shipmentId: string;
  rateId: string;
  rateCents: number;
  carrier: string;
  service: string;
  package: {
    weightOz: number;
    lengthIn: number;
    widthIn: number;
    heightIn: number;
  };
  itemSnapshot: {
    productId: string;
    quantity: number;
    weightOz: number;
    lengthIn: number;
    widthIn: number;
    heightIn: number;
  }[];
};

export type VerifiedShippingRateInfo = {
  shipmentGroups: VerifiedShipmentGroup[];
  totalRateCents: number;
  buyerAddress: ShippingAddressInput;
  verification: {
    verifiedAt: string;
    source: 'server_recalculated';
  };
};

type ProductForVerification = {
  id: string;
  sellerId: string;
  title: string;
  shippingMode?: string | null;
  shippingCents: number;
  weightOz: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  seller: {
    id: string;
    shopName?: string | null;
    shipFromName?: string | null;
    shipFromStreet?: string | null;
    shipFromCity?: string | null;
    shipFromState?: string | null;
    shipFromZip?: string | null;
    shipFromCountry?: string | null;
    shipFromPhone?: string | null;
  } | null;
};

type VerifyShippingRateParams = {
  items: { productId: string; quantity: number }[];
  pickupItemIds: string[];
  products: ProductForVerification[];
  shippingRateInfo?: ShippingRateInfoInput;
  createRates?: typeof createShipmentRates;
};

function isCalculatedShippingProduct(product: { shippingMode?: string | null; shippingCents: number }) {
  return product.shippingMode === 'CALCULATED' || (!product.shippingMode && product.shippingCents === 0);
}

function hasCompleteAddress(address?: ShippingAddressInput) {
  return !!(address?.street1 && address?.city && address?.state && address?.zip);
}

function normalizeBuyerAddress(address: ShippingAddressInput): ShippingAddressInput {
  return {
    name: address.name?.trim() || undefined,
    street1: address.street1.trim(),
    street2: address.street2?.trim() || undefined,
    city: address.city.trim(),
    state: address.state.trim(),
    zip: address.zip.trim(),
    country: address.country?.trim() || 'US',
  };
}

function normalizeFromAddress(seller: NonNullable<ProductForVerification['seller']>) {
  return {
    name: seller.shipFromName?.trim() || seller.shopName?.trim() || 'Seller Fulfillment',
    street1: seller.shipFromStreet?.trim() || '',
    city: seller.shipFromCity?.trim() || '',
    state: seller.shipFromState?.trim() || '',
    zip: seller.shipFromZip?.trim() || '',
    country: seller.shipFromCountry?.trim() || 'US',
    phone: seller.shipFromPhone?.trim() || undefined,
  };
}

function normalizeText(value: string | undefined) {
  return value?.trim().toLowerCase() || '';
}

function rateToCents(rate: ShipmentRateQuote) {
  const parsed = Number(rate.rate);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

export async function verifySelectedShippingRates(params: VerifyShippingRateParams): Promise<VerifiedShippingRateInfo | undefined> {
  const pickupSet = new Set(params.pickupItemIds);
  const calculatedProducts = params.products.filter(
    (product) => !pickupSet.has(product.id) && isCalculatedShippingProduct(product),
  );

  if (!calculatedProducts.length) {
    return undefined;
  }

  const inputRateInfo = params.shippingRateInfo;
  if (!inputRateInfo?.shipmentGroups?.length) {
    throw new Error('Shipping rates changed. Please refresh shipping quotes and try again.');
  }

  const buyerAddressInput = inputRateInfo.buyerAddress;
  if (!buyerAddressInput || !hasCompleteAddress(buyerAddressInput)) {
    throw new Error('Please provide a complete shipping address before checkout.');
  }

  const buyerAddress = normalizeBuyerAddress(buyerAddressInput);
  const quantitiesByProductId = new Map(params.items.map((item) => [item.productId, item.quantity]));
  const selectedBySeller = new Map(inputRateInfo.shipmentGroups.map((group) => [group.sellerId, group]));

  const productsBySeller = new Map<string, ProductForVerification[]>();
  for (const product of calculatedProducts) {
    const grouped = productsBySeller.get(product.sellerId) ?? [];
    grouped.push(product);
    productsBySeller.set(product.sellerId, grouped);
  }

  const createRates = params.createRates ?? createShipmentRates;
  const verifiedGroups: VerifiedShipmentGroup[] = [];

  for (const [sellerId, sellerProducts] of productsBySeller) {
    const selected = selectedBySeller.get(sellerId);
    if (!selected?.rateId) {
      throw new Error('Shipping rates changed. Please refresh shipping quotes and try again.');
    }

    const seller = sellerProducts[0]?.seller;
    if (!seller) {
      throw new Error('Shipping rates changed. Please refresh shipping quotes and try again.');
    }

    const fromAddress = normalizeFromAddress(seller);
    if (!fromAddress.street1 || !fromAddress.city || !fromAddress.state || !fromAddress.zip) {
      throw new Error('Some items cannot be shipped because seller shipping details are incomplete. Please remove those items or contact the seller.');
    }

    const itemSnapshot = sellerProducts.map((product) => ({
      productId: product.id,
      quantity: quantitiesByProductId.get(product.id) ?? 1,
      weightOz: product.weightOz ?? 0,
      lengthIn: product.lengthIn ?? 0,
      widthIn: product.widthIn ?? 0,
      heightIn: product.heightIn ?? 0,
    }));

    const weightOz = itemSnapshot.reduce((sum, item) => sum + (item.weightOz * item.quantity), 0);
    const lengthIn = itemSnapshot.reduce((max, item) => Math.max(max, item.lengthIn), 0);
    const widthIn = itemSnapshot.reduce((max, item) => Math.max(max, item.widthIn), 0);
    const heightIn = itemSnapshot.reduce((max, item) => Math.max(max, item.heightIn), 0);

    if (!weightOz || !lengthIn || !widthIn || !heightIn) {
      throw new Error(
        `Some items cannot be shipped because seller package details are missing for "${seller.shopName || 'Seller'}". Please remove those items or contact the seller.`,
      );
    }

    const serverQuote = await createRates({
      toAddress: {
        name: buyerAddress.name || 'Buyer',
        street1: buyerAddress.street1,
        street2: buyerAddress.street2,
        city: buyerAddress.city,
        state: buyerAddress.state,
        zip: buyerAddress.zip,
        country: buyerAddress.country || 'US',
      },
      fromAddress,
      weightValue: weightOz,
      weightUnit: 'oz',
      lengthIn,
      widthIn,
      heightIn,
    });

    const canonicalRate = serverQuote.rates.find((rate) => rate.id === selected.rateId);
    if (!canonicalRate) {
      throw new Error('Selected shipping rate expired or is unavailable. Please refresh shipping quotes.');
    }

    const canonicalRateCents = rateToCents(canonicalRate);
    if (!canonicalRateCents) {
      throw new Error('Selected shipping rate is invalid. Please refresh shipping quotes.');
    }

    if (typeof selected.rateCents === 'number' && selected.rateCents !== canonicalRateCents) {
      throw new Error('Shipping rates changed. Please refresh shipping quotes and try again.');
    }

    if (selected.carrier && normalizeText(selected.carrier) !== normalizeText(canonicalRate.carrier)) {
      throw new Error('Shipping rates changed. Please refresh shipping quotes and try again.');
    }
    if (selected.service && normalizeText(selected.service) !== normalizeText(canonicalRate.service)) {
      throw new Error('Shipping rates changed. Please refresh shipping quotes and try again.');
    }

    verifiedGroups.push({
      sellerId,
      shipmentId: serverQuote.shipmentId,
      rateId: canonicalRate.id,
      rateCents: canonicalRateCents,
      carrier: canonicalRate.carrier,
      service: canonicalRate.service,
      package: {
        weightOz,
        lengthIn,
        widthIn,
        heightIn,
      },
      itemSnapshot,
    });
  }

  const totalRateCents = verifiedGroups.reduce((sum, group) => sum + group.rateCents, 0);
  if (totalRateCents < 0) {
    throw new Error('Shipping rate unavailable. Please refresh shipping quotes.');
  }

  return {
    shipmentGroups: verifiedGroups,
    totalRateCents,
    buyerAddress,
    verification: {
      verifiedAt: new Date().toISOString(),
      source: 'server_recalculated',
    },
  };
}
