import {
  SellerAdminFallbackStatus,
  SellerKycProvider,
  SellerPhoneVerificationStatus,
  SellerVerificationStatus,
} from '@prisma/client';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import {
  createPersonaInquiry,
  createStripeIdentitySession,
} from '@/lib/kyc/providers';
import { getDefaultSellerKycProvider } from '@/lib/seller-verification';

const schema = z.object({
  provider: z.enum([SellerKycProvider.STRIPE, SellerKycProvider.PERSONA]).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const form = await req.formData();
    const data = schema.parse(Object.fromEntries(form.entries()));
    const provider = data.provider ?? getDefaultSellerKycProvider();
    if (provider === SellerKycProvider.MANUAL) {
      return NextResponse.redirect(new URL('/seller?verification=manual_required', req.url));
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
    let providerAccountId: string | null = null;
    let providerInquiryId: string | null = null;
    let providerVerificationId: string | null = null;
    let verificationUrl: string | null = null;

    if (provider === SellerKycProvider.STRIPE) {
      const identitySession = await createStripeIdentitySession(session.user.id);
      providerVerificationId = identitySession.id;
      verificationUrl = identitySession.url ?? null;
      providerAccountId = user.stripeAccountId ?? null;
    }

    if (provider === SellerKycProvider.PERSONA) {
      const inquiry = await createPersonaInquiry(session.user.id);
      providerInquiryId = inquiry.data?.id ?? null;
      providerVerificationId = inquiry.data?.id ?? null;
      verificationUrl = inquiry.data?.attributes?.['inquiry-link'] ?? null;
    }

    await prisma.sellerVerification.upsert({
      where: { sellerId: session.user.id },
      update: {
        provider,
        providerStatus: 'pending',
        providerAccountId: providerAccountId ?? undefined,
        providerInquiryId: providerInquiryId ?? undefined,
        providerVerificationId: providerVerificationId ?? undefined,
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
        provider,
        providerStatus: 'pending',
        providerAccountId,
        providerInquiryId,
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

    const connectOnboardingUrl =
      provider === SellerKycProvider.STRIPE ? '/api/stripe/connect' : null;
    const redirectUrl = verificationUrl
      ?? (connectOnboardingUrl ? new URL(connectOnboardingUrl, req.url).toString() : null);

    if (redirectUrl) {
      return NextResponse.redirect(redirectUrl);
    }

    return NextResponse.redirect(new URL('/seller?verification=provider_started', req.url));
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid provider.' }, { status: 400 });
    }
    console.error('[seller/verification/initiate POST]', err);
    return NextResponse.json(
      { error: 'Unable to start seller verification right now.' },
      { status: 500 },
    );
  }
}
