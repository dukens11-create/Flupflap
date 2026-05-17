import {
  SellerAdminFallbackStatus,
  SellerPhoneVerificationStatus,
  SellerVerificationStatus,
  NotificationType,
  KycStatus,
  SellerStatus,
} from '@prisma/client';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createNotification } from '@/lib/notifications';

const schema = z
  .object({
      status: z.enum([SellerVerificationStatus.APPROVED, SellerVerificationStatus.REJECTED]),
      rejectionReason: z.string().trim().max(1000).optional(),
      adminFallbackReason: z.string().trim().max(1000).optional(),
    })
  .superRefine((data, ctx) => {
    if (data.status === SellerVerificationStatus.REJECTED && !data.rejectionReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rejectionReason'],
        message: 'A rejection reason is required.',
      });
    }
  });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const verification = await prisma.sellerVerification.findUnique({
    where: { sellerId: id },
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
        reviewedBy: { select: { name: true, email: true } },
      },
  });

  if (!verification) {
    return NextResponse.json({ error: 'Verification submission not found.' }, { status: 404 });
  }

  return NextResponse.json(verification);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const seller = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, phone: true, phoneVerified: true },
    });

    if (!seller || seller.role !== 'SELLER') {
      return NextResponse.json({ error: 'Seller not found.' }, { status: 404 });
    }

    const form = await req.formData();
    const raw = Object.fromEntries(
      [...form.entries()].map(([key, value]) => [
        key,
        value === '' ? undefined : typeof value === 'string' ? value.trim() : value,
      ]),
    );
    const data = schema.parse(raw);

    const verification = await prisma.sellerVerification.findUnique({
      where: { sellerId: id },
      select: { sellerId: true, phoneVerified: true, phoneNumber: true },
    });
    if (!verification) {
      return NextResponse.json({ error: 'Verification submission not found.' }, { status: 404 });
    }

    if (data.status === SellerVerificationStatus.APPROVED && !seller.phoneVerified) {
      const errUrl = new URL('/admin/sellers', req.url);
      errUrl.searchParams.set('error', 'Seller phone verification is required before approval.');
      return NextResponse.redirect(errUrl, 302);
    }

    // Sync phone verification onto the SellerVerification record if the seller
    // has verified their phone since the submission was created.
    if (seller.phoneVerified && !verification.phoneVerified) {
      await prisma.sellerVerification.update({
        where: { sellerId: id },
        data: {
          phoneVerified: true,
          phoneNumber: seller.phone ?? verification.phoneNumber,
          phoneVerificationStatus: SellerPhoneVerificationStatus.VERIFIED,
        },
      });
    }

    // Perform the two core state-transition writes inside a single transaction
    // so they either both succeed or both roll back. This prevents partial
    // approval state (e.g. SellerVerification marked APPROVED but
    // User.kycStatus still NOT_SUBMITTED) after a mid-flight DB error.
    const now = new Date();
    const isApproved = data.status === SellerVerificationStatus.APPROVED;

    // If admins do not provide a separate internal fallback note for
    // rejections, reuse rejectionReason so dashboard context stays aligned.
    const adminFallbackReason =
      data.adminFallbackReason ??
      (data.status === SellerVerificationStatus.REJECTED ? data.rejectionReason : null);

    await prisma.$transaction(async (tx) => {
      await tx.sellerVerification.update({
        where: { sellerId: id },
        data: {
          status: data.status,
          rejectionReason: isApproved ? null : data.rejectionReason,
          adminFallbackStatus: isApproved
            ? SellerAdminFallbackStatus.APPROVED
            : SellerAdminFallbackStatus.REJECTED,
          adminFallbackReason,
          eligibleToListAt: isApproved ? now : null,
          reviewedAt: now,
          reviewedById: session.user.id,
        },
      });

      // Sync canonical kycStatus, sellerStatus, verifiedSeller, and approvedAt
      // onto the User record so all dashboard counts use a single source of truth.
      await tx.user.update({
        where: { id },
        data: isApproved
          ? {
              kycStatus: KycStatus.APPROVED,
              sellerStatus: SellerStatus.ACTIVE,
              verifiedSeller: true,
              approvedAt: now,
            }
          : {
              kycStatus: KycStatus.REJECTED,
            },
      });
    });

    // Send the seller a notification of the admin's decision. This is done
    // outside the transaction so a notification failure never rolls back the
    // approval itself — the approval state is the source of truth.
    try {
      await createNotification({
        userId: id,
        type: NotificationType.PAYOUT,
        title: isApproved
          ? 'Identity verification approved ✓'
          : 'Identity verification rejected',
        body: isApproved
          ? 'An admin has approved your identity verification. You can now list items on FlupFlap once your subscription is active.'
          : `Your identity verification was rejected: ${data.rejectionReason}. Please re-submit your documents from your seller dashboard.`,
        link: '/seller',
      });
    } catch (notifyErr) {
      console.error('[admin/sellers/verification POST] notification create failed:', notifyErr);
    }

    return NextResponse.redirect(new URL('/admin/sellers?verification=updated', req.url));
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      const errUrl = new URL('/admin/sellers', req.url);
      errUrl.searchParams.set('error', err.errors[0]?.message ?? 'Invalid input.');
      return NextResponse.redirect(errUrl, 302);
    }

    console.error('[admin/sellers/verification POST]', err);
    const errUrl = new URL('/admin/sellers', req.url);
    errUrl.searchParams.set('error', 'Failed to update seller verification. Please try again.');
    return NextResponse.redirect(errUrl, 302);
  }
}
