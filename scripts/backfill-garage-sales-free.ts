/**
 * Backfill script: activate garage sales that are stuck in payment-pending / hidden state.
 *
 * Garage sales were previously gated behind a Stripe checkout. Any listing that was
 * created before the free-listing change and whose paymentStatus is still PENDING (and
 * status is HIDDEN) will never become publicly visible without this repair.
 *
 * Safe to run multiple times — uses idempotent update with a strict filter.
 *
 * Usage (dry-run):  npx tsx scripts/backfill-garage-sales-free.ts
 * Usage (apply):    npx tsx scripts/backfill-garage-sales-free.ts --confirm
 */

import { isDatabaseConfigured, prisma } from '../lib/db';

async function run() {
  const confirm = process.argv.includes('--confirm');

  if (!isDatabaseConfigured()) {
    console.log('[backfill-garage-sales-free] DATABASE_URL is not configured. Set it before running this repair.');
    return;
  }

  const now = new Date();

  // Find garage sales that are stuck in payment-pending / hidden state and not yet expired.
  const stuck = await prisma.garageSale.findMany({
    where: {
      paymentStatus: 'PENDING',
      status: 'HIDDEN',
      isArchived: false,
      endDate: { gte: now },
    },
    select: { id: true, sellerId: true, title: true, endDate: true },
  });

  console.log(`[backfill-garage-sales-free] Found ${stuck.length} stuck garage sale(s).`);

  if (stuck.length === 0) {
    console.log('[backfill-garage-sales-free] Nothing to backfill.');
    return;
  }

  for (const sale of stuck) {
    console.log(`  - ${sale.id} | seller=${sale.sellerId} | "${sale.title}" | ends=${sale.endDate.toISOString()}`);
  }

  if (!confirm) {
    console.log('\n[backfill-garage-sales-free] Dry-run complete. Pass --confirm to apply changes.');
    return;
  }

  const saleIds = stuck.map((s) => s.id);

  // Activate listings
  const updated = await prisma.garageSale.updateMany({
    where: {
      id: { in: saleIds },
      paymentStatus: 'PENDING',
      status: 'HIDDEN',
    },
    data: {
      paymentStatus: 'PAID',
      status: 'APPROVED',
      paidAt: now,
      activatedAt: now,
    },
  });

  console.log(`[backfill-garage-sales-free] Updated ${updated.count} garage sale(s) to PAID/APPROVED.`);

  // Create $0 payment records for sales that don't already have one
  let paymentCount = 0;
  for (const sale of stuck) {
    const existing = await prisma.garageSalePayment.findFirst({
      where: { saleId: sale.id },
      select: { id: true },
    });
    if (!existing) {
      await prisma.garageSalePayment.create({
        data: {
          saleId: sale.id,
          sellerId: sale.sellerId,
          amountCents: 0,
          status: 'PAID',
        },
      });
      paymentCount += 1;
    }
  }

  console.log(`[backfill-garage-sales-free] Created ${paymentCount} payment record(s).`);
  console.log('[backfill-garage-sales-free] Backfill complete.');
}

run().catch((err) => {
  console.error('[backfill-garage-sales-free] Fatal error:', err);
  process.exit(1);
});
