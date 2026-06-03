import test from 'node:test';
import assert from 'node:assert/strict';
import { notifySellersOfPaidOrder } from '@/lib/seller-purchase-notifications';

function createDeps() {
  const createdInApp: any[] = [];
  const sentEmails: any[] = [];
  const sentPushes: any[] = [];

  const dedupeKeys = new Set<string>();

  return {
    createdInApp,
    sentEmails,
    sentPushes,
    deps: {
      hasDedupeNotification: async (dedupeKey: string) => dedupeKeys.has(dedupeKey),
      createInAppNotification: async (input: any) => {
        createdInApp.push(input);
      },
      sendEmail: async (to: string, subject: string, html: string) => {
        sentEmails.push({ to, subject, html });
        return true;
      },
      sendPush: async (input: any) => {
        sentPushes.push(input);
        return true;
      },
    },
    markDuplicate: (dedupeKey: string) => {
      dedupeKeys.add(dedupeKey);
    },
  };
}

test('seller purchase notifications trigger all three channels for paid purchases and target the correct sellers', async () => {
  const { deps, createdInApp, sentEmails, sentPushes } = createDeps();
  const purchasedAt = new Date('2026-06-03T20:00:00.000Z');

  await notifySellersOfPaidOrder(
    {
      purchaseStatus: 'PAID',
      orderId: 'ord_123',
      purchasedAt,
      buyerName: 'Jane Buyer',
      sellers: [
        {
          sellerId: 'seller_a',
          sellerEmail: 'seller-a@example.com',
          sellerName: 'Seller A',
          itemCount: 2,
          itemTitles: ['Kente Dress', 'Ankara Bag'],
        },
        {
          sellerId: 'seller_b',
          sellerEmail: 'seller-b@example.com',
          sellerName: 'Seller B',
          itemCount: 1,
          itemTitles: ['Wood Carving'],
        },
      ],
    },
    deps as any,
  );

  assert.equal(createdInApp.length, 2);
  assert.equal(sentEmails.length, 2);
  assert.equal(sentPushes.length, 2);

  assert.deepEqual(createdInApp.map((entry) => entry.userId).sort(), ['seller_a', 'seller_b']);
  assert.deepEqual(sentPushes.map((entry) => entry.userId).sort(), ['seller_a', 'seller_b']);
  assert.deepEqual(sentEmails.map((entry) => entry.to).sort(), ['seller-a@example.com', 'seller-b@example.com']);

  assert.match(createdInApp[0].dedupeKey, /^seller-purchase:ord_123:seller_/);
  assert.equal(createdInApp[0].data.orderId, 'ord_123');
  assert.equal(createdInApp[0].data.purchasedAt, purchasedAt.toISOString());
});

test('seller purchase notifications are not sent for failed or cancelled payments', async () => {
  const failed = createDeps();
  const cancelled = createDeps();

  await notifySellersOfPaidOrder(
    {
      purchaseStatus: 'FAILED',
      orderId: 'ord_failed',
      purchasedAt: new Date('2026-06-03T20:00:00.000Z'),
      buyerName: 'Jane Buyer',
      sellers: [{
        sellerId: 'seller_1',
        sellerEmail: 'seller@example.com',
        sellerName: 'Seller',
        itemCount: 1,
        itemTitles: ['Item'],
      }],
    },
    failed.deps as any,
  );

  await notifySellersOfPaidOrder(
    {
      purchaseStatus: 'CANCELLED',
      orderId: 'ord_cancelled',
      purchasedAt: new Date('2026-06-03T20:00:00.000Z'),
      buyerName: 'Jane Buyer',
      sellers: [{
        sellerId: 'seller_1',
        sellerEmail: 'seller@example.com',
        sellerName: 'Seller',
        itemCount: 1,
        itemTitles: ['Item'],
      }],
    },
    cancelled.deps as any,
  );

  assert.equal(failed.createdInApp.length, 0);
  assert.equal(failed.sentEmails.length, 0);
  assert.equal(failed.sentPushes.length, 0);
  assert.equal(cancelled.createdInApp.length, 0);
  assert.equal(cancelled.sentEmails.length, 0);
  assert.equal(cancelled.sentPushes.length, 0);
});

test('seller purchase notifications skip duplicate events based on dedupe key', async () => {
  const { deps, createdInApp, sentEmails, sentPushes, markDuplicate } = createDeps();
  markDuplicate('seller-purchase:ord_dupe:seller_dup');

  await notifySellersOfPaidOrder(
    {
      purchaseStatus: 'PAID',
      orderId: 'ord_dupe',
      purchasedAt: new Date('2026-06-03T20:00:00.000Z'),
      buyerName: 'Jane Buyer',
      sellers: [{
        sellerId: 'seller_dup',
        sellerEmail: 'seller-dup@example.com',
        sellerName: 'Seller Duplicate',
        itemCount: 1,
        itemTitles: ['Item'],
      }],
    },
    deps as any,
  );

  assert.equal(createdInApp.length, 0);
  assert.equal(sentEmails.length, 0);
  assert.equal(sentPushes.length, 0);
});
