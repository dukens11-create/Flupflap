import {
  SellerAdminFallbackStatus,
  SellerKycProvider,
  SellerPhoneVerificationStatus,
  SellerVerificationStatus,
  KycStatus,
} from '@prisma/client';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import {
  createStripeIdentitySession,
} from '@/lib/kyc/providers';
import { classifyStripeError } from '@/lib/stripe';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'SELLER' || !session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [user, existingVerification] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          phone: true,
          stripeAccountId: true,
        },
      }),
      prisma.sellerVerification.findUnique({
        where: { sellerId: session.user.id },
        select: {
          status: true,
          eligibleToListAt: true,
          adminFallbackStatus: true,
          kycStartedAt: true,
        },
      }),
    ]);
    if (!user) {
      return NextResponse.json({ error: 'Seller not found.' }, { status: 404 });
    }
    if (
      existingVerification?.status === SellerVerificationStatus.APPROVED
      && (existingVerification.eligibleToListAt || existingVerification.adminFallbackStatus === SellerAdminFallbackStatus.APPROVED)
    ) {
      return NextResponse.json(
        {
          error: 'Your identity is already verified. No additional submission is needed.',
          code: 'SELLER_ALREADY_VERIFIED',
        },
        { status: 409 },
      );
    }

    const now = existingVerification?.kycStartedAt ?? new Date();
    const identitySession = await createStripeIdentitySession(session.user.id);
    const providerVerificationId = identitySession.id;
    const verificationUrl = identitySession.url ?? null;
    const providerAccountId = user.stripeAccountId ?? null;

    await prisma.sellerVerification.upsert({
      where: { sellerId: session.user.id },
      update: {
        provider: SellerKycProvider.STRIPE,
        providerStatus: 'pending',
        providerAccountId,
        providerVerificationId,
        status: SellerVerificationStatus.PENDING,
        rejectionReason: null,
        adminFallbackStatus: SellerAdminFallbackStatus.PENDING_REVIEW,
        adminFallbackReason: null,
        eligibleToListAt: null,
        kycStartedAt: now,
        phoneNumber: user.phone ?? '',
        phoneVerificationStatus: user.phone
          ? SellerPhoneVerificationStatus.PENDING
          : SellerPhoneVerificationStatus.NOT_STARTED,
      },
      create: {
        sellerId: session.user.id,
        provider: SellerKycProvider.STRIPE,
        providerStatus: 'pending',
        providerAccountId,
        providerVerificationId,
        status: SellerVerificationStatus.PENDING,
        phoneNumber: user.phone ?? '',
        phoneVerificationStatus: user.phone
          ? SellerPhoneVerificationStatus.PENDING
          : SellerPhoneVerificationStatus.NOT_STARTED,
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: '',
        governmentIdFrontPublicId: '',
        governmentIdBackPublicId: '',
        selfieImagePublicId: '',
        rejectionReason: null,
        adminFallbackStatus: SellerAdminFallbackStatus.PENDING_REVIEW,
        kycStartedAt: now,
      },
    });

    // Sync canonical kycStatus on the User record so dashboard counts are consistent.
    await prisma.user.update({
      where: { id: session.user.id },
      data: { kycStatus: KycStatus.PENDING_REVIEW },
    });

    if (verificationUrl) {
      return NextResponse.json({
        sessionUrl: verificationUrl,
        verificationSessionId: providerVerificationId,
        verificationStatus: identitySession.status,
      });
    }

    console.error('[seller/verification/initiate POST] Stripe Identity returned no hosted URL', {
      sellerId: session.user.id,
      stripeVerificationSessionId: providerVerificationId,
      stripeVerificationStatus: identitySession.status,
      stripeLastErrorCode: identitySession.last_error?.code ?? null,
    });
    return NextResponse.json(
      {
        error: 'Stripe Identity failed to generate a hosted verification URL.',
        code: 'STRIPE_IDENTITY_URL_MISSING',
      },
      { status: 500 },
    );
  } catch (err: any) {
    const classified = classifyStripeError(err);
    console.error('[seller/verification/initiate POST]', {
      reason: classified.reason,
      message: classified.message,
      code: classified.code,
      statusCode: classified.statusCode,
    });
    const statusCode = typeof classified.statusCode === 'number' && classified.statusCode > 0
      ? classified.statusCode
      : 500;
    return NextResponse.json(
      {
        error: 'Unable to start seller verification right now.',
        code: 'STRIPE_IDENTITY_SESSION_FAILED',
        reason: classified.reason,
      },
      { status: statusCode },
    );
  }
}
