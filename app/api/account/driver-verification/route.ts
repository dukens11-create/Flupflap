import { DriverVerificationStatus, NotificationType } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { isCloudinaryConfigured } from '@/lib/cloudinary';
import { prisma } from '@/lib/db';
import {
  buildDriverVerificationSummary,
  parseDateToIso,
  uploadDriverVerificationDocument,
} from '@/lib/driver-verification';
import { sendEmail } from '@/lib/email';
import { createNotifications } from '@/lib/notifications';
import { applyRateLimitAsync, sanitizeTextInput } from '@/lib/security';

const metadataSchema = z.object({
  rawText: z.string().max(12000).optional().default(''),
  correctedData: z
    .object({
      licenseNumber: z.string().max(40).optional().nullable(),
      driverName: z.string().max(140).optional().nullable(),
      dateOfBirth: z.string().max(20).optional().nullable(),
      expirationDate: z.string().max(20).optional().nullable(),
      issuingRegion: z.string().max(80).optional().nullable(),
      vehicleClass: z.string().max(40).optional().nullable(),
    })
    .optional()
    .nullable(),
  selfieChecks: z.record(z.string(), z.any()).optional().nullable(),
  documentChecks: z.record(z.string(), z.any()).optional().nullable(),
  livenessChecks: z.record(z.string(), z.any()).optional().nullable(),
});

function getDocumentUrl(kind: 'selfie' | 'front' | 'back', attemptId: string) {
  return `/api/account/driver-verification/documents/${kind}?attemptId=${attemptId}`;
}

function sanitizeRecord(
  record:
    | ({
      attempts: Array<{
        id: string;
        attemptNumber: number;
        status: DriverVerificationStatus;
        submittedAt: Date;
        validationResults: unknown;
      }>;
    } & Record<string, unknown>)
    | null,
) {
  if (!record) return null;

  return {
    ...record,
    attempts: record.attempts.map((attempt) => ({
      ...attempt,
      documentUrls: {
        selfie: getDocumentUrl('selfie', attempt.id),
        front: getDocumentUrl('front', attempt.id),
        back: getDocumentUrl('back', attempt.id),
      },
    })),
  };
}

function ensureImageFile(file: File | null, label: string) {
  if (!file || file.size === 0) {
    throw new Error(`${label} image is required.`);
  }
  if (!file.type.startsWith('image/')) {
    throw new Error(`${label} must be an image.`);
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error(`${label} must be smaller than 12MB.`);
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const verification = await prisma.driverVerification.findUnique({
    where: { userId: session.user.id },
    include: {
      attempts: {
        orderBy: { submittedAt: 'desc' },
        take: 5,
      },
      reviewedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return NextResponse.json({
    verificationStatus: verification?.status ?? null,
    verification: sanitizeRecord(verification),
    storageConfigured: isCloudinaryConfigured(),
  });
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isCloudinaryConfigured()) {
      return NextResponse.json(
        {
          error:
            'Secure document storage is not configured yet. Please add Cloudinary credentials before enabling driver verification submissions.',
        },
        { status: 503 },
      );
    }

    const rateLimit = await applyRateLimitAsync({
      request: req,
      key: 'driver-verification-submit',
      windowMs: 15 * 60 * 1000,
      max: 5,
      userId: session.user.id,
    });
    if (rateLimit.limited) {
      return NextResponse.json(
        {
          error: 'Too many verification attempts. Please wait a few minutes before trying again.',
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    const form = await req.formData();
    const selfieImage = form.get('selfieImage');
    const licenseFrontImage = form.get('licenseFrontImage');
    const licenseBackImage = form.get('licenseBackImage');
    const metadataEntry = form.get('metadata');

    if (!(selfieImage instanceof File) || !(licenseFrontImage instanceof File) || !(licenseBackImage instanceof File)) {
      return NextResponse.json({ error: 'Selfie, license front, and license back images are required.' }, { status: 400 });
    }

    ensureImageFile(selfieImage, 'Selfie');
    ensureImageFile(licenseFrontImage, 'License front');
    ensureImageFile(licenseBackImage, 'License back');

    const parsedMetadata = metadataSchema.parse(
      typeof metadataEntry === 'string' && metadataEntry.trim().length > 0
        ? JSON.parse(metadataEntry)
        : {},
    );

    const summary = buildDriverVerificationSummary({
      rawText: parsedMetadata.rawText,
      correctedData: parsedMetadata.correctedData,
      providedName: session.user.name ?? null,
    });

    const existing = await prisma.driverVerification.findUnique({
      where: { userId: session.user.id },
      select: { id: true, attempts: { select: { id: true } } },
    });

    const attemptNumber = (existing?.attempts.length ?? 0) + 1;
    const uploadPrefix = `${session.user.id}-${Date.now()}-${attemptNumber}`;

    const [selfieUpload, frontUpload, backUpload] = await Promise.all([
      uploadDriverVerificationDocument(selfieImage, `${uploadPrefix}-selfie`),
      uploadDriverVerificationDocument(licenseFrontImage, `${uploadPrefix}-front`),
      uploadDriverVerificationDocument(licenseBackImage, `${uploadPrefix}-back`),
    ]);

    const initialStatus = summary.validation.requiresManualReview
      ? DriverVerificationStatus.REVIEW
      : DriverVerificationStatus.PENDING;
    const now = new Date();
    const approvalDeadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const expirationIso = parseDateToIso(summary.finalData.expirationDate);
    const verificationExpiresAt = expirationIso
      ? new Date(`${expirationIso}T00:00:00.000Z`)
      : null;

    const persisted = await prisma.$transaction(async (tx) => {
      const verification = await tx.driverVerification.upsert({
        where: { userId: session.user.id },
        update: {
          status: initialStatus,
          licenseNumber: summary.finalData.licenseNumber,
          driverName: summary.finalData.driverName,
          dateOfBirth: summary.finalData.dateOfBirth,
          expirationDate: summary.finalData.expirationDate,
          issuingRegion: summary.finalData.issuingRegion,
          vehicleClass: summary.finalData.vehicleClass,
          rejectionReason: null,
          adminNotes: null,
          requestAdditionalDocuments: summary.validation.requiresManualReview,
          approvalDeadline,
          submittedAt: now,
          reviewedAt: null,
          approvedAt: null,
          verifiedAt: null,
          verificationExpiresAt,
          reviewedById: null,
        },
        create: {
          userId: session.user.id,
          status: initialStatus,
          licenseNumber: summary.finalData.licenseNumber,
          driverName: summary.finalData.driverName,
          dateOfBirth: summary.finalData.dateOfBirth,
          expirationDate: summary.finalData.expirationDate,
          issuingRegion: summary.finalData.issuingRegion,
          vehicleClass: summary.finalData.vehicleClass,
          approvalDeadline,
          submittedAt: now,
          verificationExpiresAt,
          requestAdditionalDocuments: summary.validation.requiresManualReview,
        },
        select: { id: true },
      });

      const attempt = await tx.driverVerificationAttempt.create({
        data: {
          verificationId: verification.id,
          attemptNumber,
          status: initialStatus,
          selfieImagePublicId: selfieUpload.publicId,
          selfieImageFormat: selfieUpload.format,
          licenseFrontPublicId: frontUpload.publicId,
          licenseFrontFormat: frontUpload.format,
          licenseBackPublicId: backUpload.publicId,
          licenseBackFormat: backUpload.format,
          ocrRawText: summary.rawText,
          extractedData: summary.extractedData,
          correctedData: summary.correctedData,
          confidenceScores: summary.confidence,
          validationResults: summary.validation,
          suspiciousFlags: summary.validation.suspiciousFlags,
          selfieChecks: parsedMetadata.selfieChecks ?? undefined,
          documentChecks: parsedMetadata.documentChecks ?? undefined,
          livenessChecks: parsedMetadata.livenessChecks ?? undefined,
          submittedAt: now,
        },
        select: { id: true },
      });

      await tx.driverVerification.update({
        where: { id: verification.id },
        data: { latestAttemptId: attempt.id },
      });

      return { verificationId: verification.id, attemptId: attempt.id };
    });

    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', deletedAt: null },
      select: { id: true, email: true, name: true },
    });

    if (admins.length > 0) {
      await createNotifications(
        admins.map((admin) => ({
          userId: admin.id,
          type: NotificationType.MESSAGE,
          title: 'New driver verification submission',
          body: `${session.user.name ?? 'A user'} submitted attempt #${attemptNumber} for driver verification review.`,
          link: `/admin/driver-verifications?userId=${session.user.id}`,
          data: {
            verificationId: persisted.verificationId,
            attemptId: persisted.attemptId,
            submittedByUserId: session.user.id,
            status: initialStatus,
          },
          dedupeKey: `driver-verification:${persisted.attemptId}:admin:${admin.id}`,
        })),
      ).catch((error) => {
        console.error('[account/driver-verification POST] failed to notify admins', error);
      });

      await Promise.all(
        admins
          .filter((admin) => admin.email)
          .map((admin) =>
            sendEmail(
              admin.email!,
              'New driver verification submission',
              `<p>Hello ${admin.name ?? 'admin'},</p><p>${sanitizeTextInput(session.user.name ?? 'A user', 120)} submitted driver verification attempt #${attemptNumber}.</p><p>Review it here: <a href="/admin/driver-verifications?userId=${session.user.id}">Driver verification queue</a>.</p>`,
            ),
          ),
      ).catch((error) => {
        console.error('[account/driver-verification POST] failed to email admins', error);
      });
    }

    return NextResponse.json({
      ok: true,
      status: initialStatus,
      validation: summary.validation,
      attemptId: persisted.attemptId,
      message:
        initialStatus === DriverVerificationStatus.REVIEW
          ? 'Verification submitted for manual review. We flagged a few fields for closer inspection.'
          : 'Verification submitted successfully. We will notify you when it is reviewed.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid verification data.' }, { status: 400 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('[account/driver-verification POST]', error);
    return NextResponse.json({ error: 'Failed to submit driver verification.' }, { status: 500 });
  }
}
