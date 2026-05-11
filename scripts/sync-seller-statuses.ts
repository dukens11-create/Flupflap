/**
 * sync-seller-statuses.ts
 *
 * Idempotent database cleanup and sync script that fixes old seller records
 * where `sellerStatus` and `kycStatus` are inconsistent with each other or
 * with the `SellerVerification` table.
 *
 * Rules applied (in order):
 * 1. Sellers with SellerVerification.status = APPROVED → kycStatus=APPROVED,
 *    sellerStatus=ACTIVE, verifiedSeller=true, approvedAt=verifiedAt (if null: eligibleToListAt)
 * 2. Sellers with SellerVerification.status = REJECTED → kycStatus=REJECTED
 * 3. Sellers with SellerVerification.status = PENDING  → kycStatus=PENDING_REVIEW
 * 4. Sellers with no SellerVerification record         → kycStatus=NOT_SUBMITTED
 * 5. Any seller still on sellerStatus=ACTIVE with no approved KYC is left as-is
 *    (they may be legacy sellers grandfathered in before KYC was required).
 *
 * Run in dry-run mode (default) to preview changes without writing:
 *   npx ts-node -P tsconfig.json scripts/sync-seller-statuses.ts
 *
 * Apply changes:
 *   npx ts-node -P tsconfig.json scripts/sync-seller-statuses.ts --confirm
 */

import { KycStatus, SellerStatus } from '@prisma/client';
import { prisma } from '../lib/db';

type SellerUpdate = {
  kycStatus?: KycStatus;
  sellerStatus?: SellerStatus;
  verifiedSeller?: boolean;
  approvedAt?: Date;
};

async function run() {
  const isDryRun = !process.argv.includes('--confirm');

  if (isDryRun) {
    console.log('[sync-seller-statuses] DRY RUN — pass --confirm to apply changes.');
  } else {
    console.log('[sync-seller-statuses] APPLY MODE — writing changes to the database.');
  }

  // Fetch all sellers with their SellerVerification record.
  const sellers = await prisma.user.findMany({
    where: { role: 'SELLER' },
    select: {
      id: true,
      email: true,
      sellerStatus: true,
      kycStatus: true,
      verifiedSeller: true,
      approvedAt: true,
      verificationSubmission: {
        select: {
          status: true,
          eligibleToListAt: true,
          verifiedAt: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`[sync-seller-statuses] Found ${sellers.length} seller account(s).`);

  let totalFixed = 0;

  for (const seller of sellers) {
    const kv = seller.verificationSubmission;
    const changes: SellerUpdate = {};

    if (kv?.status === 'APPROVED') {
      // KYC was approved — ensure all canonical fields are set.
      const approvedAt = kv.verifiedAt ?? kv.eligibleToListAt ?? new Date();
      if (seller.kycStatus !== 'APPROVED') changes.kycStatus = KycStatus.APPROVED;
      if (seller.sellerStatus !== 'ACTIVE') changes.sellerStatus = SellerStatus.ACTIVE;
      if (!seller.verifiedSeller) changes.verifiedSeller = true;
      if (!seller.approvedAt) changes.approvedAt = approvedAt;
    } else if (kv?.status === 'REJECTED') {
      if (seller.kycStatus !== 'REJECTED') changes.kycStatus = KycStatus.REJECTED;
    } else if (kv?.status === 'PENDING') {
      if (seller.kycStatus !== 'PENDING_REVIEW') changes.kycStatus = KycStatus.PENDING_REVIEW;
    } else {
      // No verification record at all.
      if (seller.kycStatus !== 'NOT_SUBMITTED') changes.kycStatus = KycStatus.NOT_SUBMITTED;
    }

    if (Object.keys(changes).length === 0) {
      continue;
    }

    totalFixed++;
    console.log(`[sync-seller-statuses] ${seller.email} — applying:`, changes);

    if (!isDryRun) {
      await prisma.user.update({
        where: { id: seller.id },
        data: changes,
      });
    }
  }

  if (totalFixed === 0) {
    console.log('[sync-seller-statuses] All seller records are already consistent. Nothing to fix.');
  } else if (isDryRun) {
    console.log(`[sync-seller-statuses] ${totalFixed} record(s) would be updated. Re-run with --confirm to apply.`);
  } else {
    console.log(`[sync-seller-statuses] ${totalFixed} record(s) updated successfully.`);
  }

  await prisma.$disconnect();
}

run().catch((err) => {
  console.error('[sync-seller-statuses] Failed:', err);
  process.exit(1);
});
