import test from 'node:test';
import assert from 'node:assert/strict';
import { verifySelectedShippingRates, type ShippingRateInfoInput } from '@/lib/checkout-shipping-verification';

const baseProducts = [
  {
    id: 'prod_1',
    sellerId: 'seller_1',
    title: 'Item 1',
    shippingMode: 'CALCULATED',
    shippingCents: 0,
    weightOz: 16,
    lengthIn: 10,
    widthIn: 8,
    heightIn: 4,
    seller: {
      id: 'seller_1',
      shopName: 'Seller One',
      shipFromName: 'Warehouse',
      shipFromStreet: '1 Main',
      shipFromCity: 'Austin',
      shipFromState: 'TX',
      shipFromZip: '78701',
      shipFromCountry: 'US',
      shipFromPhone: '5551112222',
    },
  },
];

const baseItems = [{ productId: 'prod_1', quantity: 2 }];
const pickupItemIds: string[] = [];
const buyerAddress = {
  name: 'Buyer',
  street1: '123 Buyer St',
  city: 'Dallas',
  state: 'TX',
  zip: '75201',
  country: 'US',
};

function createSelectedGroup(rateId = 'rate_ok', rateCents = 500): ShippingRateInfoInput {
  return {
    shipmentGroups: [
      {
        sellerId: 'seller_1',
        shipmentId: 'client_shipment_old',
        rateId,
        rateCents,
        carrier: 'USPS',
        service: 'Priority Mail',
      },
    ],
    totalRateCents: 1,
    buyerAddress,
  };
}

test('accepts valid selected shipping rate and uses server verified total', async () => {
  const verified = await verifySelectedShippingRates({
    items: baseItems,
    pickupItemIds,
    products: baseProducts,
    shippingRateInfo: createSelectedGroup('rate_ok', 500),
    createRates: async () => ({
      shipmentId: 'server_shipment_new',
      rates: [
        { id: 'rate_ok', carrier: 'USPS', service: 'Priority Mail', rate: '5.00', currency: 'USD', deliveryDays: 2 },
      ],
    }),
  });

  assert.ok(verified);
  assert.equal(verified?.totalRateCents, 500);
  assert.equal(verified?.shipmentGroups[0]?.shipmentId, 'server_shipment_new');
});

test('rejects manipulated client rateCents mismatch', async () => {
  await assert.rejects(
    verifySelectedShippingRates({
      items: baseItems,
      pickupItemIds,
      products: baseProducts,
      shippingRateInfo: createSelectedGroup('rate_ok', 100),
      createRates: async () => ({
        shipmentId: 'server_shipment_new',
        rates: [
          { id: 'rate_ok', carrier: 'USPS', service: 'Priority Mail', rate: '5.00', currency: 'USD', deliveryDays: 2 },
        ],
      }),
    }),
    /Shipping rates changed/,
  );
});

test('rejects stale or invalid selected rate id', async () => {
  await assert.rejects(
    verifySelectedShippingRates({
      items: baseItems,
      pickupItemIds,
      products: baseProducts,
      shippingRateInfo: createSelectedGroup('stale_rate_id', 500),
      createRates: async () => ({
        shipmentId: 'server_shipment_new',
        rates: [
          { id: 'rate_ok', carrier: 'USPS', service: 'Priority Mail', rate: '5.00', currency: 'USD', deliveryDays: 2 },
        ],
      }),
    }),
    /expired or is unavailable/,
  );
});

test('ignores manipulated client totalRateCents and returns canonical server total', async () => {
  const verified = await verifySelectedShippingRates({
    items: baseItems,
    pickupItemIds,
    products: baseProducts,
    shippingRateInfo: {
      ...createSelectedGroup('rate_ok', 500),
      totalRateCents: 1,
    },
    createRates: async () => ({
      shipmentId: 'server_shipment_new',
      rates: [
        { id: 'rate_ok', carrier: 'USPS', service: 'Priority Mail', rate: '5.00', currency: 'USD', deliveryDays: 2 },
      ],
    }),
  });

  assert.equal(verified?.totalRateCents, 500);
});
