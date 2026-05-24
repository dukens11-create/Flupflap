import test from 'node:test';
import assert from 'node:assert/strict';
import { getSellerRefundsData } from '@/lib/seller-refunds';

test('getSellerRefundsData returns refund history and requests when queries succeed', async () => {
  const now = new Date('2026-05-22T00:00:00.000Z');
  const mockDb = {
    refundRequest: {
      findMany: async () => [{
        id: 'refund_request_1',
        status: 'REQUESTED',
        reason: 'Damaged package',
        details: null,
        requestedAmountCents: 1200,
        approvedAmountCents: null,
        sellerResponse: null,
        adminNotes: null,
        createdAt: now,
        order: {
          id: 'order_1',
          status: 'PAID',
          totalCents: 2200,
          buyer: { name: 'Buyer', email: 'buyer@example.com' },
          items: [{
            quantity: 1,
            product: { title: 'Ankara Dress' },
          }],
        },
      }],
    },
    sellerRefundHistory: {
      findMany: async () => [{
        id: 'history_1',
        sellerId: 'seller_1',
        orderId: 'order_1',
        saleId: null,
        refundType: 'admin_order_refund',
        sourceLabel: 'Order refund',
        sourceKey: 'history_key_1',
        stripePaymentIntentId: null,
        stripeRefundId: null,
        amountCents: 1200,
        currency: 'USD',
        status: 'succeeded',
        reason: 'Damaged package',
        refundedAt: now,
        resolvedAt: now,
        createdAt: now,
        updatedAt: now,
      }],
    },
    order: {
      findMany: async () => [{
        id: 'order_1',
        status: 'REFUNDED',
        items: [{
          quantity: 1,
          product: { title: 'Ankara Dress' },
        }],
      }],
    },
  } as any;

  const result = await getSellerRefundsData('seller_1', mockDb);

  assert.equal(result.refundRequestsFetchFailed, false);
  assert.equal(result.refundHistoryFetchFailed, false);
  assert.equal(result.refundHistoryFetchError, null);
  assert.equal(result.refundRequests.length, 1);
  assert.equal(result.refundHistory.length, 1);
  assert.equal(result.refundRequests[0].order.items[0].product.title, 'Ankara Dress');
  assert.equal(result.refundHistory[0].order?.items[0].product.title, 'Ankara Dress');
});

test('getSellerRefundsData keeps empty history as an intentional empty state', async () => {
  const mockDb = {
    refundRequest: {
      findMany: async () => [],
    },
    sellerRefundHistory: {
      findMany: async () => [],
    },
    order: {
      findMany: async () => [],
    },
  } as any;

  const result = await getSellerRefundsData('seller_1', mockDb);

  assert.equal(result.refundRequestsFetchFailed, false);
  assert.equal(result.refundHistoryFetchFailed, false);
  assert.equal(result.refundHistoryFetchError, null);
  assert.deepEqual(result.refundRequests, []);
  assert.deepEqual(result.refundHistory, []);
});

test('getSellerRefundsData derives history from refund requests when history query fails', async () => {
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const errorCalls: unknown[][] = [];
  const warnCalls: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    errorCalls.push(args);
  };
  console.warn = (...args: unknown[]) => {
    warnCalls.push(args);
  };

  try {
    const now = new Date('2026-05-22T00:00:00.000Z');
    const mockDb = {
      refundRequest: {
        findMany: async () => [{
          id: 'refund_request_2',
          status: 'SELLER_REVIEW',
          reason: 'Missing item',
          details: null,
          requestedAmountCents: 900,
          approvedAmountCents: null,
          sellerResponse: null,
          adminNotes: null,
          createdAt: now,
          order: {
            id: 'order_2',
            status: 'SHIPPED',
            totalCents: 2500,
            buyer: { name: null, email: 'buyer2@example.com' },
            items: [{
              quantity: 1,
              product: { title: 'Beaded Purse' },
            }],
          },
        }],
      },
      sellerRefundHistory: {
        findMany: async () => {
          throw new Error('temporary database timeout');
        },
      },
    } as any;

    const result = await getSellerRefundsData('seller_1', mockDb);
    assert.equal(result.refundRequestsFetchFailed, false);
    assert.equal(result.refundHistoryFetchFailed, false);
    assert.equal(result.refundHistoryFetchError, 'Refund history query failed due to a backend or network error.');
    assert.equal(result.refundRequests.length, 1);
    assert.equal(result.refundHistory.length, 1);
    assert.equal(result.refundHistory[0].sourceKey, 'refund_request:refund_request_2');
    assert.equal(result.refundHistory[0].status, 'SELLER_REVIEW');
    assert.equal(errorCalls.length, 1);
    assert.equal(warnCalls.length, 1);
  } finally {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  }
});

test('getSellerRefundsData treats missing refund delegates as a friendly fallback state', async () => {
  const originalConsoleError = console.error;
  const errorCalls: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    errorCalls.push(args);
  };

  try {
    const result = await getSellerRefundsData('seller_1', {
      order: {
        findMany: async () => [],
      },
    } as any);

    assert.equal(result.refundRequestsFetchFailed, true);
    assert.equal(result.refundHistoryFetchFailed, true);
    assert.equal(result.refundHistoryFetchError, 'Refund history query failed due to a backend or network error.');
    assert.deepEqual(result.refundRequests, []);
    assert.deepEqual(result.refundHistory, []);
    assert.equal(errorCalls.length, 2);
  } finally {
    console.error = originalConsoleError;
  }
});

test('getSellerRefundsData keeps refund history visible when order lookup is unavailable', async () => {
  const originalConsoleError = console.error;
  const errorCalls: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    errorCalls.push(args);
  };

  try {
    const now = new Date('2026-05-22T00:00:00.000Z');
    const result = await getSellerRefundsData('seller_1', {
      refundRequest: {
        findMany: async () => [],
      },
      sellerRefundHistory: {
        findMany: async () => [{
          id: 'history_2',
          sellerId: 'seller_1',
          orderId: 'order_2',
          saleId: null,
          refundType: 'admin_order_refund',
          sourceLabel: 'Order refund',
          sourceKey: 'history_key_2',
          stripePaymentIntentId: null,
          stripeRefundId: null,
          amountCents: 900,
          currency: 'USD',
          status: 'pending',
          reason: 'Missing item',
          refundedAt: null,
          resolvedAt: null,
          createdAt: now,
          updatedAt: now,
        }],
      },
    } as any);

    assert.equal(result.refundRequestsFetchFailed, false);
    assert.equal(result.refundHistoryFetchFailed, false);
    assert.equal(result.refundHistoryFetchError, null);
    assert.equal(result.refundHistory.length, 1);
    assert.equal(result.refundHistory[0].order, null);
    assert.equal(errorCalls.length, 1);
  } finally {
    console.error = originalConsoleError;
  }
});
