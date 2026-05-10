import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function GET() {
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
}

export async function POST(req: Request) {
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
}
