import test from 'node:test';
import assert from 'node:assert/strict';
import { recordSellerRefundHistory } from '@/lib/seller-refund-history';

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

test('recordSellerRefundHistory gracefully skips writes when SellerRefundHistory table is missing', async () => {
  const mockDb = {
    sellerRefundHistory: {
      findUnique: async () => {
        const missingTableError = new Error('The table `public.SellerRefundHistory` does not exist in the current database.') as Error & { code?: string };
        missingTableError.code = 'P2021';
        throw missingTableError;
      },
      upsert: async () => {
        throw new Error('should not reach upsert when table is missing');
      },
    },
  } as any;

  await assert.doesNotReject(async () => {
    const result = await recordSellerRefundHistory({
      sellerId: 'seller_4',
      refundType: 'admin_order_refund',
      stripeRefundId: 're_missing_table',
      status: 'succeeded',
    }, mockDb);
    assert.equal(result, null);
  });
});
