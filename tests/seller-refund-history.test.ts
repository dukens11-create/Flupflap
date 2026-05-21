import test from 'node:test';
import assert from 'node:assert/strict';
import { recordSellerRefundHistory } from '@/lib/seller-refund-history';

test('recordSellerRefundHistory uses stripe refund id as default source key and uppercases currency', async () => {
  let capturedArgs: unknown;
  const mockDb = {
    sellerRefundHistory: {
      upsert: async (args: unknown) => {
        capturedArgs = args;
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

  const payload = capturedArgs as { where: { sourceKey: string }; create: { currency: string } };
  assert.equal(payload.where.sourceKey, 'stripe_refund:re_123');
  assert.equal(payload.create.currency, 'USD');
});

test('recordSellerRefundHistory builds deterministic source key when stripe refund id is unavailable', async () => {
  let capturedArgs: unknown;
  const mockDb = {
    sellerRefundHistory: {
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
  assert.equal(payload.where.sourceKey, 'garage_sale_cancel_payment_refund:sale:sale_1:pi_123:299');
});
