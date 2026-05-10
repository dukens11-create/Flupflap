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
import { isCloudinaryConfigured } from '@/lib/cloudinary';
import { normalizePhone } from '@/lib/phone';
import { uploadSellerVerificationDocument } from '@/lib/seller-verification';

const schema = z.object({
  phoneNumber: z.string().min(7).max(20),
  street: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  zipCode: z.string().trim().min(2).max(20),
  country: z.string().trim().min(2).max(100),
});

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 10 * 1024 * 1024;

function getOptionalFile(form: FormData, name: string) {
  const value = form.get(name);
  if (!(value instanceof File) || value.size === 0) return null;
  return value;
}

function validateUpload(file: File, label: string) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `${label} must be a JPEG, PNG, WebP, or GIF image.`;
  }

  if (file.size > MAX_BYTES) {
    return `${label} must be 10 MB or smaller.`;
  }

  return null;
}

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
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!isCloudinaryConfigured()) {
      return NextResponse.json(
        { error: 'Seller verification uploads are not configured on this server.' },
        { status: 503 },
      );
    }

    const form = await req.formData();
    const raw = Object.fromEntries(
      [...form.entries()]
        .filter(([, value]) => !(value instanceof File))
        .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]),
    );
    const data = schema.parse(raw);
    const normalizedPhone = normalizePhone(data.phoneNumber);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: 'Enter a valid phone number including country code.' },
        { status: 400 },
      );
    }

    const [user, existingVerification] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { phone: true, phoneVerified: true, phoneVerifiedAt: true },
      }),
      prisma.sellerVerification.findUnique({ where: { sellerId: session.user.id } }),
    ]);

    const frontFile = getOptionalFile(form, 'governmentIdFront');
    const backFile = getOptionalFile(form, 'governmentIdBack');
    const selfieFile = getOptionalFile(form, 'selfieImage');
    const phoneMatchesExisting = user?.phone === normalizedPhone;
    const phoneMatchesVerifiedSubmission =
      existingVerification?.phoneNumber === normalizedPhone
      && existingVerification.phoneVerificationStatus === 'VERIFIED';
    const shouldKeepPhoneVerified = (phoneMatchesExisting && Boolean(user?.phoneVerified))
      || phoneMatchesVerifiedSubmission;

    if (!frontFile && !existingVerification?.governmentIdFrontPublicId) {
      return NextResponse.json(
        { error: 'Government ID front image is required.' },
        { status: 400 },
      );
    }
    if (!backFile && !existingVerification?.governmentIdBackPublicId) {
      return NextResponse.json(
        { error: 'Government ID back image is required.' },
        { status: 400 },
      );
    }
    if (!selfieFile && !existingVerification?.selfieImagePublicId) {
      return NextResponse.json(
        { error: 'Selfie / face verification image is required.' },
        { status: 400 },
      );
    }

    for (const [file, label] of [
      [frontFile, 'Government ID front image'],
      [backFile, 'Government ID back image'],
      [selfieFile, 'Selfie / face verification image'],
    ] as const) {
      if (!file) continue;
      const validationError = validateUpload(file, label);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }
    }

    const [frontUpload, backUpload, selfieUpload] = await Promise.all([
      frontFile
        ? uploadSellerVerificationDocument(frontFile, `${session.user.id}-government-id-front`)
        : Promise.resolve(null),
      backFile
        ? uploadSellerVerificationDocument(backFile, `${session.user.id}-government-id-back`)
        : Promise.resolve(null),
      selfieFile
        ? uploadSellerVerificationDocument(selfieFile, `${session.user.id}-selfie`)
        : Promise.resolve(null),
    ]);

    const phoneVerificationStatus: SellerPhoneVerificationStatus = shouldKeepPhoneVerified
      ? 'VERIFIED'
      : 'PENDING';
    const now = new Date();

    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.user.id },
        data: {
          phone: normalizedPhone,
          phoneVerified: shouldKeepPhoneVerified,
          phoneVerifiedAt: shouldKeepPhoneVerified ? user?.phoneVerifiedAt ?? null : null,
        },
      }),
      prisma.sellerVerification.upsert({
        where: { sellerId: session.user.id },
        update: {
          provider: SellerKycProvider.MANUAL,
          providerStatus: 'manual_review',
          providerReviewedAt: null,
          status: SellerVerificationStatus.PENDING,
          rejectionReason: null,
          governmentIdVerified: true,
          selfieVerified: true,
          addressVerified: true,
          phoneVerified: shouldKeepPhoneVerified,
          phoneNumber: normalizedPhone,
          phoneVerificationStatus,
          street: data.street,
          city: data.city,
          state: data.state,
          zipCode: data.zipCode,
          country: data.country,
          governmentIdFrontPublicId:
            frontUpload?.publicId ??
            existingVerification?.governmentIdFrontPublicId ??
            '',
          governmentIdFrontFormat:
            frontUpload?.format ?? existingVerification?.governmentIdFrontFormat ?? null,
          governmentIdBackPublicId:
            backUpload?.publicId ?? existingVerification?.governmentIdBackPublicId ?? '',
          governmentIdBackFormat:
            backUpload?.format ?? existingVerification?.governmentIdBackFormat ?? null,
          selfieImagePublicId:
            selfieUpload?.publicId ?? existingVerification?.selfieImagePublicId ?? '',
          selfieImageFormat:
            selfieUpload?.format ?? existingVerification?.selfieImageFormat ?? null,
          kycStartedAt: existingVerification?.kycStartedAt ?? now,
          eligibleToListAt: null,
          adminFallbackStatus: SellerAdminFallbackStatus.PENDING_REVIEW,
          adminFallbackReason: null,
          webhookLastEventId: null,
          webhookLastReceivedAt: null,
          reviewedAt: null,
          reviewedById: null,
        },
        create: {
          sellerId: session.user.id,
          provider: SellerKycProvider.MANUAL,
          providerStatus: 'manual_review',
          status: SellerVerificationStatus.PENDING,
          rejectionReason: null,
          governmentIdVerified: true,
          selfieVerified: true,
          addressVerified: true,
          phoneVerified: shouldKeepPhoneVerified,
          phoneNumber: normalizedPhone,
          phoneVerificationStatus,
          street: data.street,
          city: data.city,
          state: data.state,
          zipCode: data.zipCode,
          country: data.country,
          governmentIdFrontPublicId: frontUpload?.publicId ?? '',
          governmentIdFrontFormat: frontUpload?.format ?? null,
          governmentIdBackPublicId: backUpload?.publicId ?? '',
          governmentIdBackFormat: backUpload?.format ?? null,
          selfieImagePublicId: selfieUpload?.publicId ?? '',
          selfieImageFormat: selfieUpload?.format ?? null,
          kycStartedAt: now,
          providerReviewedAt: null,
          eligibleToListAt: null,
          adminFallbackStatus: SellerAdminFallbackStatus.PENDING_REVIEW,
          adminFallbackReason: null,
        },
      }),
    ]);

    return NextResponse.redirect(new URL('/seller?verification=submitted', req.url));
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json(
        { error: err.errors[0]?.message ?? 'Invalid input.' },
        { status: 400 },
      );
    }

    console.error('[seller/verification POST]', err);
    return NextResponse.json(
      { error: 'Failed to submit seller verification.' },
      { status: 500 },
    );
  }
}
