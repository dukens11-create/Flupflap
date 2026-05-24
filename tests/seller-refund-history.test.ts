import test from 'node:test';
import assert from 'node:assert/strict';
import { isSchemaNotInitializedError } from '@/lib/db-errors';
import {
  getSellerRefundHistoryWriteErrorMessage,
  getSellerRefundHistoryWriteErrorStatus,
  recordSellerRefundHistory,
  SELLER_REFUND_HISTORY_SCHEMA_INIT_ERROR,
  SELLER_REFUND_HISTORY_WRITE_ERROR,
} from '@/lib/seller-refund-history';

test('recordSellerRefundHistory uses stripe refund id as default source key and uppercases currency', async () => {
  let capturedUpsertArgs: unknown;
  let capturedFindUniqueArgs: unknown;
  const mockDb = {
    sellerRefundHistory: {
      findUnique: async (args: unknown) => {
        capturedFindUniqueArgs = args;
        return null;
      },
      upsert: async (args: unknown) => {
        capturedUpsertArgs = args;
        return args;
      },
    },
  } as any;

  await recordSellerRefundHistory({
    sellerId: 'seller_1',
    refundType: 'admin_order_refund',
    stripeRefundId: 're_123',
    currency: 'usd',
    status: 'succeeded',
  }, mockDb);

  const findUniquePayload = capturedFindUniqueArgs as { where: { stripeRefundId: string } };
  assert.equal(findUniquePayload.where.stripeRefundId, 're_123');
  const payload = capturedUpsertArgs as { where: { sourceKey: string }; create: { currency: string } };
  assert.equal(payload.where.sourceKey, 'stripe_refund:re_123');
  assert.equal(payload.create.currency, 'USD');
});

test('recordSellerRefundHistory builds deterministic source key when stripe refund id is unavailable', async () => {
  let capturedArgs: unknown;
  const mockDb = {
    sellerRefundHistory: {
      findUnique: async () => null,
      upsert: async (args: unknown) => {
        capturedArgs = args;
        return args;
      },
    },
  } as any;

  await recordSellerRefundHistory({
    sellerId: 'seller_2',
    saleId: 'sale_1',
    refundType: 'garage_sale_cancel_payment_refund',
    stripePaymentIntentId: 'pi_123',
    amountCents: 299,
    status: 'succeeded',
  }, mockDb);

  const payload = capturedArgs as { where: { sourceKey: string } };
  assert.equal(payload.where.sourceKey, 'garage_sale_cancel_payment_refund:sale:sale_1:pi_123:299:no_reason:no_time');
});

test('recordSellerRefundHistory gives explicit sourceKey priority over stripe refund key', async () => {
  let capturedArgs: unknown;
  const mockDb = {
    sellerRefundHistory: {
      findUnique: async () => null,
      upsert: async (args: unknown) => {
        capturedArgs = args;
        return args;
      },
    },
  } as any;

  await recordSellerRefundHistory({
    sellerId: 'seller_3',
    refundType: 'admin_order_refund',
    sourceKey: 'manual_source_key',
    stripeRefundId: 're_999',
    status: 'succeeded',
  }, mockDb);

  const payload = capturedArgs as { where: { sourceKey: string } };
  assert.equal(payload.where.sourceKey, 'manual_source_key');
});

test('recordSellerRefundHistory updates an existing row when stripe refund id already exists', async () => {
  let capturedUpdateArgs: unknown;
  let upsertCalled = false;
  const mockDb = {
    sellerRefundHistory: {
      findUnique: async () => ({ id: 'history_1' }),
      update: async (args: unknown) => {
        capturedUpdateArgs = args;
        return args;
      },
      upsert: async () => {
        upsertCalled = true;
        return null;
      },
    },
  } as any;

  await recordSellerRefundHistory({
    sellerId: 'seller_4',
    orderId: 'order_4',
    refundType: 'admin_order_refund',
    stripeRefundId: 're_existing',
    currency: 'usd',
    status: 'succeeded',
    reason: 'Updated refund status',
  }, mockDb);

  assert.equal(upsertCalled, false);
  const payload = capturedUpdateArgs as { where: { id: string }; data: { currency: string; status: string } };
  assert.equal(payload.where.id, 'history_1');
  assert.equal(payload.data.currency, 'USD');
  assert.equal(payload.data.status, 'succeeded');
});

test('seller refund history write errors expose schema-aware messages and statuses', () => {
  const schemaError = {
    code: 'P2021',
    message: 'The table `public.SellerRefundHistory` does not exist in the current database.',
  };

  assert.equal(getSellerRefundHistoryWriteErrorMessage(schemaError), SELLER_REFUND_HISTORY_SCHEMA_INIT_ERROR);
  assert.equal(getSellerRefundHistoryWriteErrorStatus(schemaError), 503);
  assert.equal(getSellerRefundHistoryWriteErrorMessage(new Error('temporary database timeout')), SELLER_REFUND_HISTORY_WRITE_ERROR);
  assert.equal(getSellerRefundHistoryWriteErrorStatus(new Error('temporary database timeout')), 500);
});

test('isSchemaNotInitializedError recognizes missing tables and columns but ignores other Prisma errors', () => {
  assert.equal(isSchemaNotInitializedError({ code: 'P2021' }), true);
  assert.equal(isSchemaNotInitializedError({ code: 'P2022' }), true);
  assert.equal(isSchemaNotInitializedError({ code: 'P2002', message: 'Unique constraint failed' }), false);
  assert.equal(isSchemaNotInitializedError({ message: 'relation "SellerRefundHistory" does not exist' }), true);
});
