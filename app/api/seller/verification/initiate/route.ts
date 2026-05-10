import {
  SellerAdminFallbackStatus,
  SellerKycProvider,
  SellerPhoneVerificationStatus,
  SellerVerificationStatus,
} from '@prisma/client';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import {
  createStripeIdentitySession,
} from '@/lib/kyc/providers';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        phone: true,
        stripeAccountId: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: 'Seller not found.' }, { status: 404 });
    }

    const now = new Date();
    const identitySession = await createStripeIdentitySession(session.user.id);
    const providerVerificationId = identitySession.id;
    const verificationUrl = identitySession.url ?? null;
    const providerAccountId = user.stripeAccountId ?? null;

    await prisma.sellerVerification.upsert({
      where: { sellerId: session.user.id },
      update: {
        provider: SellerKycProvider.STRIPE,
        providerStatus: 'pending',
        providerAccountId: providerAccountId ?? undefined,
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

    if (verificationUrl) {
      return NextResponse.json({ sessionUrl: verificationUrl });
    }

    console.error('[seller/verification/initiate POST] Stripe Identity returned no hosted URL', {
      sellerId: session.user.id,
      stripeVerificationSessionId: providerVerificationId,
      stripeVerificationStatus: identitySession.status,
      stripeLastErrorCode: identitySession.last_error?.code ?? null,
    });
    return NextResponse.json(
      { error: 'Stripe Identity failed to generate a hosted verification URL.' },
      { status: 500 },
    );
  } catch (err: any) {
    console.error('[seller/verification/initiate POST]', err);
    return NextResponse.json(
      { error: 'Unable to start seller verification right now.' },
      { status: 500 },
    );
  }
}
