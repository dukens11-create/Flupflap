import type {
  ProductStatus,
  ReportStatus,
  SellerAdminFallbackStatus,
  SellerPhoneVerificationStatus,
  SellerStatus,
  SellerVerificationStatus,
} from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;

export const SELLER_REVIEW_THRESHOLD = 45;
export const SELLER_HIGH_RISK_THRESHOLD = 60;

export type SellerRiskFactor = {
  label: string;
  impact: number;
};

export type SellerRiskAssessment = {
  score: number;
  band: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiresReview: boolean;
  factors: SellerRiskFactor[];
  metrics: {
    accountAgeDays: number;
    flaggedListingsCount: number;
    moderationCount: number;
    openReportsCount: number;
    recentListingsCount: number;
  };
};

export type SellerRiskInput = {
  createdAt: Date;
  image?: string | null;
  phone?: string | null;
  phoneVerified: boolean;
  sellerStatus: SellerStatus;
  products: Array<{
    createdAt: Date;
    status: ProductStatus;
  }>;
  reports: Array<{
    createdAt: Date;
    reason: string;
    status: ReportStatus;
  }>;
  moderationLogs: Array<{
    action: string;
    createdAt: Date;
    reasonCategory?: string | null;
  }>;
  verification?:
    | {
      adminFallbackStatus: SellerAdminFallbackStatus;
      addressVerified: boolean;
      city?: string | null;
      country?: string | null;
      governmentIdVerified: boolean;
      phoneNumber?: string | null;
      phoneVerificationStatus: SellerPhoneVerificationStatus;
      phoneVerified: boolean;
      rejectionReason?: string | null;
      selfieVerified: boolean;
      state?: string | null;
      status: SellerVerificationStatus;
      street?: string | null;
      zipCode?: string | null;
    }
    | null;
};

function pushFactor(factors: SellerRiskFactor[], label: string, impact: number) {
  if (!impact) return;
  factors.push({ label, impact });
}

export function sellerRiskBand(score: number): SellerRiskAssessment['band'] {
  if (score >= 75) return 'CRITICAL';
  if (score >= SELLER_HIGH_RISK_THRESHOLD) return 'HIGH';
  if (score >= 35) return 'MEDIUM';
  return 'LOW';
}

export function buildSellerRiskAssessment(
  input: SellerRiskInput,
  now = new Date(),
): SellerRiskAssessment {
  const factors: SellerRiskFactor[] = [];
  const accountAgeDays = Math.max(
    0,
    Math.floor((now.getTime() - input.createdAt.getTime()) / DAY_MS),
  );
  const recentListingsCount = input.products.filter((product) => (
    now.getTime() - product.createdAt.getTime() <= 7 * DAY_MS
  )).length;
  const flaggedListingsCount = input.products.filter((product) => (
    product.status === 'REJECTED' || product.status === 'HIDDEN'
  )).length;
  const openReportsCount = input.reports.filter((report) => report.status === 'OPEN').length;
  const scamReportCount = input.reports.filter((report) => report.reason === 'scam_fraud').length;
  const moderationCount = input.moderationLogs.length;

  pushFactor(
    factors,
    input.sellerStatus === 'BANNED'
      ? 'Seller account is currently banned'
      : 'Seller account is currently suspended',
    input.sellerStatus === 'BANNED' ? 40 : input.sellerStatus === 'SUSPENDED' ? 25 : 0,
  );

  const fraudModerationCount = input.moderationLogs.filter((log) => (
    log.reasonCategory === 'fraud'
  )).length;
  if (fraudModerationCount > 0) {
    pushFactor(
      factors,
      `${fraudModerationCount} prior fraud-related moderation action${fraudModerationCount === 1 ? '' : 's'}`,
      Math.min(24, 14 + (fraudModerationCount - 1) * 5),
    );
  } else if (moderationCount > 0) {
    pushFactor(
      factors,
      `${moderationCount} prior moderation action${moderationCount === 1 ? '' : 's'}`,
      Math.min(16, 8 + (moderationCount - 1) * 2),
    );
  } else {
    pushFactor(factors, 'No moderation history', -5);
  }

  if (!input.verification) {
    pushFactor(factors, 'No verification submission on file', 28);
  } else {
    const unverifiedChecks = [
      input.verification.governmentIdVerified ? null : 'government ID',
      input.verification.selfieVerified ? null : 'selfie',
      input.verification.addressVerified ? null : 'address',
      input.verification.phoneVerified ? null : 'phone',
    ].filter(Boolean) as string[];

    if (input.verification.status === 'REJECTED') {
      pushFactor(factors, 'Verification was manually rejected', 28);
    } else if (input.verification.status === 'PENDING') {
      pushFactor(factors, 'Verification is still pending review', 22);
    } else if (input.verification.status === 'APPROVED') {
      pushFactor(factors, 'Verification is approved', -14);
    }

    if (input.verification.adminFallbackStatus === 'REJECTED') {
      pushFactor(factors, 'Admin fallback review previously rejected the submission', 12);
    } else if (input.verification.adminFallbackStatus === 'APPROVED') {
      pushFactor(factors, 'Admin fallback already approved this seller', -6);
    }

    if (unverifiedChecks.length > 0) {
      pushFactor(
        factors,
        `${unverifiedChecks.join(', ')} ${unverifiedChecks.length === 1 ? 'check is' : 'checks are'} incomplete`,
        Math.min(16, unverifiedChecks.length * 4),
      );
    } else {
      pushFactor(factors, 'All verification checks are complete', -10);
    }

    if (input.verification.phoneVerificationStatus !== 'VERIFIED') {
      pushFactor(factors, 'Phone verification is not complete', 8);
    }

    const missingProfileFields = [
      input.verification.phoneNumber,
      input.verification.street,
      input.verification.city,
      input.verification.state,
      input.verification.zipCode,
      input.verification.country,
    ].filter((value) => !value).length;

    if (missingProfileFields > 0) {
      pushFactor(
        factors,
        'Verification profile is missing contact or address fields',
        Math.min(12, missingProfileFields * 2),
      );
    }

    if (input.verification.rejectionReason) {
      pushFactor(factors, 'Admin left a rejection reason on the current submission', 6);
    }
  }

  if (!input.phoneVerified) {
    pushFactor(factors, 'Account phone is not verified', 10);
  }

  if (!input.phone) {
    pushFactor(factors, 'Account phone number is missing', 6);
  }

  if (!input.image) {
    pushFactor(factors, 'Profile photo is missing', 4);
  }

  if (accountAgeDays < 7) {
    pushFactor(factors, 'Account is less than a week old', 12);
  } else if (accountAgeDays < 30) {
    pushFactor(factors, 'Account is less than 30 days old', 6);
  } else if (accountAgeDays >= 180) {
    pushFactor(factors, 'Account is more than 6 months old', -6);
  }

  if (recentListingsCount >= 8) {
    pushFactor(factors, 'High listing velocity in the last 7 days', 12);
  } else if (recentListingsCount >= 4) {
    pushFactor(factors, 'Several new listings were posted in the last 7 days', 6);
  }

  if (flaggedListingsCount > 0) {
    pushFactor(
      factors,
      `${flaggedListingsCount} listing${flaggedListingsCount === 1 ? '' : 's'} hidden or rejected`,
      Math.min(18, 8 + (flaggedListingsCount - 1) * 3),
    );
  }

  if (openReportsCount > 0) {
    pushFactor(
      factors,
      `${openReportsCount} open seller report${openReportsCount === 1 ? '' : 's'}`,
      Math.min(22, 14 + (openReportsCount - 1) * 4),
    );
  } else {
    pushFactor(factors, 'No open seller reports', -6);
  }

  if (scamReportCount > 0) {
    pushFactor(
      factors,
      `${scamReportCount} scam / fraud report${scamReportCount === 1 ? '' : 's'} on seller listings`,
      Math.min(16, 8 + (scamReportCount - 1) * 3),
    );
  }

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(25 + factors.reduce((sum, factor) => sum + factor.impact, 0)),
    ),
  );
  const band = sellerRiskBand(score);
  const requiresReview =
    score >= SELLER_REVIEW_THRESHOLD
    || input.sellerStatus !== 'ACTIVE'
    || openReportsCount > 0
    || input.verification?.status === 'PENDING'
    || input.verification?.status === 'REJECTED';

  return {
    score,
    band,
    requiresReview,
    factors: [...factors].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)),
    metrics: {
      accountAgeDays,
      flaggedListingsCount,
      moderationCount,
      openReportsCount,
      recentListingsCount,
    },
  };
}
