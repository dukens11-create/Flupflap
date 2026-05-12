import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { logError } from '@/lib/logger';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const verification = await prisma.sellerVerification.findUnique({
      where: { sellerId: session.user.id },
      select: {
        provider: true,
        providerStatus: true,
        providerAccountId: true,
        providerInquiryId: true,
        providerVerificationId: true,
        status: true,
        rejectionReason: true,
        governmentIdVerified: true,
        selfieVerified: true,
        addressVerified: true,
        phoneVerified: true,
        phoneNumber: true,
        phoneVerificationStatus: true,
        street: true,
        city: true,
        state: true,
        zipCode: true,
        country: true,
        createdAt: true,
        updatedAt: true,
        kycStartedAt: true,
        providerReviewedAt: true,
        eligibleToListAt: true,
        adminFallbackStatus: true,
        adminFallbackReason: true,
        reviewedAt: true,
      },
    });

    return NextResponse.json({
      verificationStatus: verification?.status ?? null,
      verification,
    });
  } catch (err) {
    logError('Failed to fetch seller verification state', err, { tag: 'seller/verification/GET' });
    return NextResponse.json({ error: 'Unable to load verification details right now.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(
      {
        error: 'Manual verification uploads are no longer supported. Start Stripe Identity hosted verification instead.',
        startUrl: '/api/seller/verification/initiate',
      },
      { status: 410 },
    );
  } catch (err) {
    logError('Failed to handle seller verification request', err, { tag: 'seller/verification/POST', requestUrl: req.url });
    return NextResponse.json({ error: 'Unable to process verification request right now.' }, { status: 500 });
  }
}
