/**
 * lib/seller-kyc-stats.ts
 *
 * Shared KYC status counting helpers used by both the Admin Dashboard
 * (app/admin/page.tsx) and Seller Management (app/admin/sellers/page.tsx).
 *
 * A seller is considered "KYC Approved" if ANY of the following are true:
 *   - `kycStatus === 'APPROVED'`                    (canonical field, set by the new flow)
 *   - `verifiedSeller === true`                     (legacy flag, set before kycStatus existed)
 *   - `verificationSubmission.status === 'APPROVED'`(has an approved SellerVerification record
 *                                                    whose result wasn't yet back-filled to kycStatus)
 *
 * This prevents the regression where sellers approved before or during the
 * schema migration appear as "Not Submitted" because their `kycStatus` was
 * never back-filled.
 *
 * Run `scripts/sync-seller-statuses.ts --confirm` to back-fill `kycStatus`
 * from legacy fields so the OR conditions are no longer needed.
 */

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

// ─── Prisma WHERE fragments ────────────────────────────────────────────────────

/**
 * Matches sellers considered "KYC Approved".
 * Reads the canonical `kycStatus`, the legacy `verifiedSeller` flag, AND the
 * `SellerVerification.status` relation so that sellers approved via any path
 * are never silently miscounted.
 */
export const KYC_APPROVED_WHERE: Prisma.UserWhereInput = {
  OR: [
    { kycStatus: 'APPROVED' },
    { verifiedSeller: true },
    { verificationSubmission: { status: 'APPROVED' } },
  ],
};

// Shared exclusion guard reused by KYC_PENDING_REVIEW_WHERE and KYC_REJECTED_WHERE.
// Prevents sellers who are approved via any path from leaking into other buckets.
const KYC_APPROVED_EXCLUSION: Prisma.UserWhereInput = {
  verifiedSeller: false,
  NOT: { OR: [{ kycStatus: 'APPROVED' }, { verificationSubmission: { status: 'APPROVED' } }] },
};

/**
 * Matches sellers whose KYC is pending review.
 * Checks both `kycStatus` and the `SellerVerification` record for sellers
 * whose kycStatus wasn't yet back-filled after they submitted.
 * Explicitly excludes sellers considered approved via any path.
 */
export const KYC_PENDING_REVIEW_WHERE: Prisma.UserWhereInput = {
  ...KYC_APPROVED_EXCLUSION,
  OR: [
    { kycStatus: 'PENDING_REVIEW' },
    { verificationSubmission: { status: 'PENDING' } },
  ],
};

/**
 * Matches sellers whose KYC was rejected.
 * Checks both `kycStatus` and the `SellerVerification` record for sellers
 * whose kycStatus wasn't yet back-filled after rejection.
 * Explicitly excludes sellers considered approved via any path.
 */
export const KYC_REJECTED_WHERE: Prisma.UserWhereInput = {
  ...KYC_APPROVED_EXCLUSION,
  OR: [
    { kycStatus: 'REJECTED' },
    { verificationSubmission: { status: 'REJECTED' } },
  ],
};

/**
 * Matches sellers who have not submitted KYC.
 * A seller is "Not Submitted" only when they have NO SellerVerification record,
 * kycStatus is NOT_SUBMITTED, and verifiedSeller is false.
 * This ensures sellers with an approved/pending/rejected submission are never
 * miscounted as "Not Submitted" due to un-backfilled kycStatus.
 */
export const KYC_NOT_SUBMITTED_WHERE: Prisma.UserWhereInput = {
  kycStatus: 'NOT_SUBMITTED',
  verifiedSeller: false,
  // Prisma relation filter: only matches sellers with no SellerVerification record.
  verificationSubmission: { is: null },
};

// ─── Shared count function ─────────────────────────────────────────────────────

export interface SellerKycCounts {
  kycApprovedCount: number;
  kycPendingCount: number;
  kycRejectedCount: number;
  kycNotSubmittedCount: number;
}

/**
 * Returns KYC status counts for all sellers.  Uses the defensive OR conditions
 * above so the results are correct even before a `kycStatus` back-fill has run.
 */
export async function getSellerKycCounts(): Promise<SellerKycCounts> {
  const [kycApprovedCount, kycPendingCount, kycRejectedCount, kycNotSubmittedCount] =
    await Promise.all([
      prisma.user.count({ where: { role: 'SELLER', ...KYC_APPROVED_WHERE } }),
      prisma.user.count({ where: { role: 'SELLER', ...KYC_PENDING_REVIEW_WHERE } }),
      prisma.user.count({ where: { role: 'SELLER', ...KYC_REJECTED_WHERE } }),
      prisma.user.count({ where: { role: 'SELLER', ...KYC_NOT_SUBMITTED_WHERE } }),
    ]);

  return { kycApprovedCount, kycPendingCount, kycRejectedCount, kycNotSubmittedCount };
}

// ─── Status derivation helper ─────────────────────────────────────────────────

/**
 * Derives the effective canonical KYC status for a seller from potentially
 * multiple legacy and current fields — without touching the database.
 *
 * Priority order (highest to lowest):
 *   1. verifiedSeller = true                       → 'APPROVED'
 *   2. verificationSubmission.status = 'APPROVED'  → 'APPROVED'
 *   3. kycStatus = 'APPROVED'                      → 'APPROVED'
 *   4. kycStatus = 'PENDING_REVIEW'                → 'PENDING_REVIEW'
 *   5. kycStatus = 'REJECTED'                      → 'REJECTED'
 *   6. verificationSubmission.status = 'PENDING'   → 'PENDING_REVIEW'
 *   7. verificationSubmission.status = 'REJECTED'  → 'REJECTED'
 *   8. fallback                                    → 'NOT_SUBMITTED'
 *
 * Use this in application code when you need the display status for a seller
 * whose `kycStatus` may not yet have been back-filled.
 */
export function deriveEffectiveKycStatus(seller: {
  kycStatus?: string | null;
  verifiedSeller?: boolean | null;
  verificationSubmission?: { status: string } | null;
}): 'APPROVED' | 'PENDING_REVIEW' | 'REJECTED' | 'NOT_SUBMITTED' {
  // verifiedSeller takes priority: it is the legacy approval flag set before
  // the kycStatus field existed.  When true the seller is always APPROVED
  // regardless of the kycStatus value, which may not yet have been back-filled.
  if (seller.verifiedSeller) return 'APPROVED';

  // Check SellerVerification record — covers sellers approved via the
  // verification flow whose kycStatus wasn't yet back-filled.
  if (seller.verificationSubmission?.status === 'APPROVED') return 'APPROVED';

  switch (seller.kycStatus) {
    case 'APPROVED':
      return 'APPROVED';
    case 'PENDING_REVIEW':
      return 'PENDING_REVIEW';
    case 'REJECTED':
      return 'REJECTED';
  }

  // Fall back to verificationSubmission status for sellers whose kycStatus
  // was never synced from the submission record.
  if (seller.verificationSubmission?.status === 'PENDING') return 'PENDING_REVIEW';
  if (seller.verificationSubmission?.status === 'REJECTED') return 'REJECTED';

  return 'NOT_SUBMITTED';
}
