/**
 * P1-6 Regression tests: buy-now with calculated shipping.
 *
 * These tests cover the verifySelectedShippingRates pipeline as it is used by
 * the buy-now endpoint (/api/checkout/buynow). They mirror the kind of
 * validation the endpoint performs server-side and guard against:
 *  - Success: valid shipping context passes and produces a verified total
 *  - Failure: missing address or rate context is rejected
 *  - Security: tampered client shipping amount does not affect the charged total
 *  - Non-regression: fixed-shipping products skip the live-rate pipeline entirely
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifySelectedShippingRates,
  type ShippingRateInfoInput,
} from '@/lib/checkout-shipping-verification';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const calculatedProduct = {
  id: 'prod_calc_1',
  sellerId: 'seller_1',
  title: 'Handmade Pottery',
  shippingMode: 'CALCULATED' as const,
  shippingCents: 0,
  weightOz: 24,
  lengthIn: 12,
  widthIn: 10,
  heightIn: 6,
  seller: {
    id: 'seller_1',
    shopName: 'Clay Studio',
    shipFromName: 'Clay Studio Fulfillment',
    shipFromStreet: '10 Market St',
    shipFromCity: 'Austin',
    shipFromState: 'TX',
    shipFromZip: '78701',
    shipFromCountry: 'US',
    shipFromPhone: '5121234567',
  },
};

const fixedShippingProduct = {
  id: 'prod_fixed_1',
  sellerId: 'seller_2',
  title: 'Woven Basket',
  shippingMode: 'FIXED' as const,
  shippingCents: 699,
  weightOz: 8,
  lengthIn: 10,
  widthIn: 8,
  heightIn: 4,
  seller: {
    id: 'seller_2',
    shopName: 'Basket World',
    shipFromName: null,
    shipFromStreet: '2 Commerce Ave',
    shipFromCity: 'Houston',
    shipFromState: 'TX',
    shipFromZip: '77001',
    shipFromCountry: 'US',
    shipFromPhone: null,
  },
};

const buyerAddress = {
  name: 'Jane Buyer',
  street1: '500 Elm Street',
  city: 'Dallas',
  state: 'TX',
  zip: '75201',
  country: 'US',
};

function makeShippingRateInfo(rateId = 'rate_usps_1', rateCents = 850): ShippingRateInfoInput {
  return {
    shipmentGroups: [
      {
        sellerId: 'seller_1',
        shipmentId: 'old_client_shipment',
        rateId,
        rateCents,
        carrier: 'USPS',
        service: 'Priority Mail',
      },
    ],
    totalRateCents: rateCents,
    buyerAddress,
  };
}

const mockCreateRatesSuccess = async () => ({
  shipmentId: 'server_shipment_new',
  rates: [
    {
      id: 'rate_usps_1',
      carrier: 'USPS',
      service: 'Priority Mail',
      rate: '8.50',
      currency: 'USD',
      deliveryDays: 3,
    },
  ],
});

// ---------------------------------------------------------------------------
// Success: valid buy-now calculated shipping path
// ---------------------------------------------------------------------------

test('P1-6 success: buy-now with calculated shipping verifies server-side total', async () => {
  const verified = await verifySelectedShippingRates({
    items: [{ productId: 'prod_calc_1', quantity: 1 }],
    pickupItemIds: [],
    products: [calculatedProduct],
    shippingRateInfo: makeShippingRateInfo('rate_usps_1', 850),
    createRates: mockCreateRatesSuccess,
  });

  assert.ok(verified, 'should return verified shipping info');
  // Server-recalculated total, not client-supplied
  assert.equal(verified.totalRateCents, 850, 'server-verified total must be 850 cents');
  assert.equal(verified.shipmentGroups[0].shipmentId, 'server_shipment_new',
    'shipment ID must come from server re-quote, not client');
  assert.equal(verified.verification.source, 'server_recalculated');
});

// ---------------------------------------------------------------------------
// Failure: missing buyer address is rejected
// ---------------------------------------------------------------------------

test('P1-6 failure: missing buyer address for calculated shipping is rejected', async () => {
  // Omit buyerAddress to verify the server rejects requests without a shipping destination.
  // carrier/service/shipmentId are optional fields in ShippingRateInfoInput so this is valid.
  const noAddressInfo: ShippingRateInfoInput = {
    shipmentGroups: [
      {
        sellerId: 'seller_1',
        rateId: 'rate_usps_1',
        rateCents: 850,
        carrier: 'USPS',
        service: 'Priority Mail',
      },
    ],
    totalRateCents: 850,
    // buyerAddress intentionally omitted
  };

  await assert.rejects(
    verifySelectedShippingRates({
      items: [{ productId: 'prod_calc_1', quantity: 1 }],
      pickupItemIds: [],
      products: [calculatedProduct],
      shippingRateInfo: noAddressInfo,
      createRates: mockCreateRatesSuccess,
    }),
    /shipping address/i,
    'must reject when buyer address is missing',
  );
});

// ---------------------------------------------------------------------------
// Failure: incomplete buyer address (missing zip) is rejected
// ---------------------------------------------------------------------------

test('P1-6 failure: incomplete buyer address (missing zip) is rejected', async () => {
  const incompleteAddress = {
    name: 'Jane',
    street1: '500 Elm St',
    city: 'Dallas',
    state: 'TX',
    zip: '',   // intentionally blank to simulate missing zip
    country: 'US',
  };
  const badAddressInfo: ShippingRateInfoInput = {
    shipmentGroups: [{
      sellerId: 'seller_1',
      rateId: 'rate_usps_1',
      rateCents: 850,
      carrier: 'USPS',
      service: 'Priority Mail',
    }],
    totalRateCents: 850,
    buyerAddress: incompleteAddress,
  };

  await assert.rejects(
    verifySelectedShippingRates({
      items: [{ productId: 'prod_calc_1', quantity: 1 }],
      pickupItemIds: [],
      products: [calculatedProduct],
      shippingRateInfo: badAddressInfo,
      createRates: mockCreateRatesSuccess,
    }),
    /shipping address/i,
    'must reject when buyer address is incomplete',
  );
});

// ---------------------------------------------------------------------------
// Failure: missing shipment groups is rejected
// ---------------------------------------------------------------------------

test('P1-6 failure: missing shipment groups for calculated shipping is rejected', async () => {
  const noGroupsInfo: ShippingRateInfoInput = {
    shipmentGroups: [],
    totalRateCents: 0,
    buyerAddress,
  };

  await assert.rejects(
    verifySelectedShippingRates({
      items: [{ productId: 'prod_calc_1', quantity: 1 }],
      pickupItemIds: [],
      products: [calculatedProduct],
      shippingRateInfo: noGroupsInfo,
      createRates: mockCreateRatesSuccess,
    }),
    /shipping rates/i,
    'must reject when shipment groups are empty',
  );
});

// ---------------------------------------------------------------------------
// Security: tampered client shipping amount does not affect charged total
// ---------------------------------------------------------------------------

test('P1-6 security: tampered client rateCents is rejected when it differs from server rate', async () => {
  // Client sends 1 cent but server returns 850 cents
  const tamperedInfo = makeShippingRateInfo('rate_usps_1', 1);

  await assert.rejects(
    verifySelectedShippingRates({
      items: [{ productId: 'prod_calc_1', quantity: 1 }],
      pickupItemIds: [],
      products: [calculatedProduct],
      shippingRateInfo: tamperedInfo,
      createRates: mockCreateRatesSuccess,
    }),
    /Shipping rates changed/,
    'must reject when client rateCents does not match server-calculated rate',
  );
});

test('P1-6 security: manipulated client totalRateCents is ignored; server canonical total is used', async () => {
  // Client sends wrong totalRateCents but correct rateCents per group
  const info: ShippingRateInfoInput = {
    ...makeShippingRateInfo('rate_usps_1', 850),
    totalRateCents: 1, // manipulated total
  };

  const verified = await verifySelectedShippingRates({
    items: [{ productId: 'prod_calc_1', quantity: 1 }],
    pickupItemIds: [],
    products: [calculatedProduct],
    shippingRateInfo: info,
    createRates: mockCreateRatesSuccess,
  });

  assert.equal(verified?.totalRateCents, 850,
    'must use server-computed total, not client-supplied totalRateCents');
});

test('P1-6 security: stale or unknown rate ID is rejected', async () => {
  const staleInfo = makeShippingRateInfo('rate_expired_xyz', 850);

  await assert.rejects(
    verifySelectedShippingRates({
      items: [{ productId: 'prod_calc_1', quantity: 1 }],
      pickupItemIds: [],
      products: [calculatedProduct],
      shippingRateInfo: staleInfo,
      createRates: mockCreateRatesSuccess,
    }),
    /expired or is unavailable/,
    'must reject stale rate IDs not in the fresh server quote',
  );
});

// ---------------------------------------------------------------------------
// Non-regression: fixed-shipping products skip live-rate pipeline
// ---------------------------------------------------------------------------

test('P1-6 non-regression: fixed-shipping product returns undefined (no live pipeline)', async () => {
  const verified = await verifySelectedShippingRates({
    items: [{ productId: 'prod_fixed_1', quantity: 1 }],
    pickupItemIds: [],
    products: [fixedShippingProduct],
    // No shippingRateInfo needed for fixed shipping
    shippingRateInfo: undefined,
    createRates: async () => {
      throw new Error('createRates must not be called for fixed shipping products');
    },
  });

  assert.equal(verified, undefined,
    'fixed-shipping products must not trigger the live-rate pipeline');
});

// ---------------------------------------------------------------------------
// Non-regression: pickup items are excluded from calculated shipping
// ---------------------------------------------------------------------------

test('P1-6 non-regression: pickup items bypass shipping rate pipeline', async () => {
  const verified = await verifySelectedShippingRates({
    items: [{ productId: 'prod_calc_1', quantity: 1 }],
    pickupItemIds: ['prod_calc_1'], // item marked as pickup
    products: [calculatedProduct],
    shippingRateInfo: undefined,
    createRates: async () => {
      throw new Error('createRates must not be called for pickup items');
    },
  });

  assert.equal(verified, undefined,
    'pickup items must not trigger the live-rate pipeline even if product is CALCULATED');
});
