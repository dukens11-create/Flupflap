/**
 * lib/seller-kyc-stats.ts
 *
 * Shared KYC status counting helpers used by both the Admin Dashboard
 * (app/admin/page.tsx) and Seller Management (app/admin/sellers/page.tsx).
 *
 * A seller is considered "KYC Approved" if EITHER:
 *   - `kycStatus === 'APPROVED'`  (canonical field, set by the new flow)
 *   - `verifiedSeller === true`   (legacy field, set before kycStatus existed)
 *
 * This prevents the regression where sellers approved before the schema
 * migration appear as "Not Submitted" because their `kycStatus` was never
 * back-filled.
 *
 * Run `scripts/sync-seller-statuses.ts --confirm` to back-fill `kycStatus`
 * from legacy fields so the OR conditions are no longer needed.
 */

import { prisma } from '@/lib/db';

// ─── Prisma WHERE fragments ────────────────────────────────────────────────────

/**
 * Matches sellers considered "KYC Approved".
 * Reads both the canonical `kycStatus` and the legacy `verifiedSeller` flag so
 * that previously-approved sellers are never silently miscounted.
 */
export const KYC_APPROVED_WHERE = {
  OR: [{ kycStatus: 'APPROVED' }, { verifiedSeller: true }],
} as const;

/**
 * Matches sellers whose KYC is pending review.
 * Excludes sellers already considered approved via the legacy flag.
 */
export const KYC_PENDING_REVIEW_WHERE = {
  kycStatus: 'PENDING_REVIEW' as const,
  verifiedSeller: false,
};

/**
 * Matches sellers whose KYC was rejected.
 * Excludes sellers already considered approved via the legacy flag.
 */
export const KYC_REJECTED_WHERE = {
  kycStatus: 'REJECTED' as const,
  verifiedSeller: false,
};

/**
 * Matches sellers who have not submitted KYC.
 * Excludes any seller where `verifiedSeller = true` so legacy-approved sellers
 * are never counted as "Not Submitted".
 */
export const KYC_NOT_SUBMITTED_WHERE = {
  kycStatus: 'NOT_SUBMITTED' as const,
  verifiedSeller: false,
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
 *   1. verifiedSeller = true  → 'APPROVED'
 *   2. kycStatus !== null     → use kycStatus as-is
 *   3. fallback               → 'NOT_SUBMITTED'
 *
 * Use this in application code when you need the display status for a seller
 * whose `kycStatus` may not yet have been back-filled.
 */
export function deriveEffectiveKycStatus(seller: {
  kycStatus?: string | null;
  verifiedSeller?: boolean | null;
}): 'APPROVED' | 'PENDING_REVIEW' | 'REJECTED' | 'NOT_SUBMITTED' {
  // verifiedSeller takes priority: it is the legacy approval flag set before
  // the kycStatus field existed.  When true the seller is always APPROVED
  // regardless of the kycStatus value, which may not yet have been back-filled.
  if (seller.verifiedSeller) return 'APPROVED';
  switch (seller.kycStatus) {
    case 'APPROVED':
      return 'APPROVED';
    case 'PENDING_REVIEW':
      return 'PENDING_REVIEW';
    case 'REJECTED':
      return 'REJECTED';
    default:
      return 'NOT_SUBMITTED';
  }
}
