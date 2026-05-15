import {
  SellerAdminFallbackStatus,
  SellerKycProvider,
  SellerPhoneVerificationStatus,
  SellerVerificationStatus,
  NotificationType,
  KycStatus,
  SellerStatus,
} from '@prisma/client';
import { prisma } from '@/lib/db';
import { appUrl, getCurrentStripeMode, stripe } from '@/lib/stripe';
import { createNotification } from '@/lib/notifications';

export type SellerKycChecks = {
  governmentIdVerified: boolean;
  selfieVerified: boolean;
  addressVerified: boolean;
  phoneVerified: boolean;
};

const DEFAULT_PROVIDER_REJECTION_REASON = 'Provider verification failed.';

function determinePhoneVerificationStatus(phone: string | null | undefined, phoneVerified: boolean) {
  if (phoneVerified) return SellerPhoneVerificationStatus.VERIFIED;
  return phone ? SellerPhoneVerificationStatus.PENDING : SellerPhoneVerificationStatus.NOT_STARTED;
}

function resolveVerificationStatus(
  initialStatus: SellerVerificationStatus,
  userPhoneVerified: boolean,
) {
  if (initialStatus === SellerVerificationStatus.APPROVED && !userPhoneVerified) {
    return SellerVerificationStatus.PENDING;
  }
  return initialStatus;
}

export function resolveAutomatedKycStatus(checks: SellerKycChecks): SellerVerificationStatus {
  // Identity verification (government ID + selfie) is the primary KYC gate.
  // Address and phone checks from Stripe Connect are supplementary and are not
  // required to unlock selling features.
  if (checks.governmentIdVerified && checks.selfieVerified) {
    return SellerVerificationStatus.APPROVED;
  }
  return SellerVerificationStatus.PENDING;
}

export async function createStripeIdentitySession(sellerId: string) {
  return stripe.identity.verificationSessions.create({
    type: 'document',
    metadata: { sellerId },
    options: {
      document: {
        require_live_capture: true,
        require_matching_selfie: true,
      },
    },
    return_url: `${appUrl}/seller?verification=provider_pending`,
  });
}

export async function createPersonaInquiry(sellerId: string) {
  const apiKey = (process.env.PERSONA_API_KEY ?? '').trim();
  const templateId = (process.env.PERSONA_TEMPLATE_ID ?? '').trim();
  if (!apiKey || !templateId) {
    throw new Error('Persona KYC is not configured.');
  }
  if (!apiKey.startsWith('persona_')) {
    throw new Error('PERSONA_API_KEY is invalid.');
  }
  if (apiKey.length < 20) {
    throw new Error('PERSONA_API_KEY is invalid.');
  }
  if (!templateId.startsWith('itmpl_')) {
    throw new Error('PERSONA_TEMPLATE_ID is invalid.');
  }

  const response = await fetch('https://withpersona.com/api/v1/inquiries', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      data: {
        type: 'inquiry',
        attributes: {
          'template-id': templateId,
          'redirect-uri': `${appUrl}/seller?verification=provider_pending`,
        },
      },
      meta: {
        'reference-id': sellerId,
      },
    }),
    cache: 'no-store',
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Persona inquiry creation failed (${response.status}): ${text.slice(0, 500)}`);
  }
  return response.json() as Promise<{
    data?: {
      id?: string;
      attributes?: {
        status?: string;
        'inquiry-link'?: string;
      };
    };
  }>;
}

export async function applyAutomatedKycResult(input: {
  sellerId: string;
  provider: SellerKycProvider;
  providerStatus: string;
  checks: SellerKycChecks;
  providerAccountId?: string | null;
  providerInquiryId?: string | null;
  providerVerificationId?: string | null;
  webhookEventId?: string | null;
  forcedStatus?: SellerVerificationStatus;
  rejectionReason?: string | null;
}) {
  const status = input.forcedStatus ?? resolveAutomatedKycStatus(input.checks);
  const now = new Date();
  const [seller, existingVerification] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.sellerId },
      select: { phone: true, phoneVerified: true },
    }),
    prisma.sellerVerification.findUnique({
      where: { sellerId: input.sellerId },
      select: { status: true },
    }),
  ]);
  const userPhoneVerified = Boolean(seller?.phone && seller.phoneVerified);
  const combinedPhoneVerified = Boolean(input.checks.phoneVerified || userPhoneVerified);
  const resolvedStatus = resolveVerificationStatus(status, userPhoneVerified);

  await prisma.sellerVerification.upsert({
    where: { sellerId: input.sellerId },
    update: {
      provider: input.provider,
      providerStatus: input.providerStatus,
      providerAccountId: input.providerAccountId ?? undefined,
      providerInquiryId: input.providerInquiryId ?? undefined,
      providerVerificationId: input.providerVerificationId ?? undefined,
      status: resolvedStatus,
      rejectionReason:
        resolvedStatus === 'REJECTED'
          ? input.rejectionReason ?? DEFAULT_PROVIDER_REJECTION_REASON
          : null,
      governmentIdVerified: input.checks.governmentIdVerified,
      selfieVerified: input.checks.selfieVerified,
      addressVerified: input.checks.addressVerified,
      phoneVerified: combinedPhoneVerified,
      phoneVerificationStatus: determinePhoneVerificationStatus(seller?.phone, combinedPhoneVerified),
      providerReviewedAt: now,
      eligibleToListAt: resolvedStatus === 'APPROVED' ? now : null,
      verifiedAt: resolvedStatus === 'APPROVED' ? now : null,
      adminFallbackStatus:
        resolvedStatus === 'APPROVED'
          ? SellerAdminFallbackStatus.NOT_REQUIRED
          : SellerAdminFallbackStatus.PENDING_REVIEW,
      adminFallbackReason: null,
      webhookLastEventId: input.webhookEventId ?? undefined,
      webhookLastReceivedAt: now,
    },
    create: {
      sellerId: input.sellerId,
      provider: input.provider,
      providerStatus: input.providerStatus,
      providerAccountId: input.providerAccountId ?? null,
      providerInquiryId: input.providerInquiryId ?? null,
      providerVerificationId: input.providerVerificationId ?? null,
      status: resolvedStatus,
      rejectionReason:
        resolvedStatus === 'REJECTED'
          ? input.rejectionReason ?? DEFAULT_PROVIDER_REJECTION_REASON
          : null,
      governmentIdVerified: input.checks.governmentIdVerified,
      selfieVerified: input.checks.selfieVerified,
      addressVerified: input.checks.addressVerified,
      phoneVerified: combinedPhoneVerified,
      phoneNumber: seller?.phone ?? '',
      phoneVerificationStatus: determinePhoneVerificationStatus(seller?.phone, combinedPhoneVerified),
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: '',
      governmentIdFrontPublicId: '',
      governmentIdBackPublicId: '',
      selfieImagePublicId: '',
      kycStartedAt: now,
      providerReviewedAt: now,
      eligibleToListAt: resolvedStatus === 'APPROVED' ? now : null,
      verifiedAt: resolvedStatus === 'APPROVED' ? now : null,
      adminFallbackStatus:
        resolvedStatus === 'APPROVED'
          ? SellerAdminFallbackStatus.NOT_REQUIRED
          : SellerAdminFallbackStatus.PENDING_REVIEW,
      webhookLastEventId: input.webhookEventId ?? null,
      webhookLastReceivedAt: now,
    },
  });

  // Notify the seller when their verification status changes to a terminal state.
  const previousStatus = existingVerification?.status ?? null;

  // Sync canonical kycStatus (and sellerStatus on approval) onto the User record
  // so dashboard counts stay consistent with the SellerVerification table.
  if (previousStatus !== resolvedStatus) {
    if (resolvedStatus === SellerVerificationStatus.APPROVED) {
      await prisma.user.update({
        where: { id: input.sellerId },
        data: {
          kycStatus: KycStatus.APPROVED,
          sellerStatus: SellerStatus.ACTIVE,
          verifiedSeller: true,
          approvedAt: now,
        },
      });
    } else if (resolvedStatus === SellerVerificationStatus.REJECTED) {
      await prisma.user.update({
        where: { id: input.sellerId },
        data: { kycStatus: KycStatus.REJECTED },
      });
    } else if (resolvedStatus === SellerVerificationStatus.PENDING) {
      await prisma.user.update({
        where: { id: input.sellerId },
        data: { kycStatus: KycStatus.PENDING_REVIEW },
      });
    }
  }

  if (previousStatus !== resolvedStatus) {
    if (resolvedStatus === SellerVerificationStatus.APPROVED) {
      // Use a stable dedupeKey so repeated webhooks for the same approval don't
      // stack up multiple notifications; the upsert resets readAt each time.
      await createNotification({
        userId: input.sellerId,
        type: NotificationType.PAYOUT,
        title: 'Identity verification approved ✓',
        body: 'Your identity has been verified. You can now list and sell on FlupFlap once your subscription is active.',
        link: '/seller',
        dedupeKey: `kyc-approved:${input.sellerId}`,
      });
    } else if (resolvedStatus === SellerVerificationStatus.REJECTED) {
      const reason = input.rejectionReason ?? DEFAULT_PROVIDER_REJECTION_REASON;
      // Use the webhookEventId as the dedupeKey to prevent duplicate notifications
      // from the same Stripe event being retried. When no event ID is available
      // (rare edge case), skip deduplication so the seller always receives the notice.
      await createNotification({
        userId: input.sellerId,
        type: NotificationType.PAYOUT,
        title: 'Identity verification requires attention',
        body: `Your identity verification was not approved: ${reason}. Please re-submit your documents from your seller dashboard.`,
        link: '/seller',
        dedupeKey: input.webhookEventId ? `kyc-rejected:${input.sellerId}:${input.webhookEventId}` : undefined,
      });
    }
  }
}

export function stripeKycChecksFromAccount(account: {
  payouts_enabled?: boolean | null;
  requirements?: {
    currently_due?: string[] | null;
    past_due?: string[] | null;
  } | null;
}) {
  const due = new Set([
    ...(account.requirements?.currently_due ?? []),
    ...(account.requirements?.past_due ?? []),
  ]);
  const addressVerified = ![...due].some(
    (field) => field.includes('address') || field.includes('city') || field.includes('postal_code'),
  );
  const phoneVerified = ![...due].some((field) => field.includes('phone'));
  return {
    addressVerified,
    phoneVerified,
    payoutsEnabled: Boolean(account.payouts_enabled),
  };
}

export function getStripeMode() {
  return getCurrentStripeMode();
}
