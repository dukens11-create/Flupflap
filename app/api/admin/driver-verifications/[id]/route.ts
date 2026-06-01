import { DriverVerificationStatus, NotificationType } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { DRIVER_REJECTION_REASONS } from '@/lib/driver-verification';
import { sendEmail } from '@/lib/email';
import { createNotification } from '@/lib/notifications';
import { sanitizeTextInput } from '@/lib/security';

const decisionSchema = z
  .object({
    status: z.enum([
      DriverVerificationStatus.APPROVED,
      DriverVerificationStatus.REJECTED,
      DriverVerificationStatus.REVIEW,
    ]),
    rejectionReason: z.string().trim().max(200).optional(),
    adminNotes: z.string().trim().max(1000).optional(),
    approvalDeadline: z.string().trim().max(40).optional(),
    requestAdditionalDocuments: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      (data.status === DriverVerificationStatus.REJECTED || data.status === DriverVerificationStatus.REVIEW) &&
      !data.rejectionReason
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rejectionReason'],
        message: 'A rejection or review reason is required.',
      });
    }
  });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = decisionSchema.parse(await req.json());
    if (
      body.rejectionReason &&
      !DRIVER_REJECTION_REASONS.includes(body.rejectionReason as (typeof DRIVER_REJECTION_REASONS)[number]) &&
      body.rejectionReason.length < 3
    ) {
      return NextResponse.json({ error: 'Please choose a valid review reason.' }, { status: 400 });
    }

    const verification = await prisma.driverVerification.findUnique({
      where: { userId: id },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        latestAttempt: {
          select: { id: true },
        },
      },
    });

    if (!verification) {
      return NextResponse.json({ error: 'Driver verification not found.' }, { status: 404 });
    }

    const now = new Date();
    const approvalDeadline = body.approvalDeadline ? new Date(body.approvalDeadline) : null;
    const reviewed = await prisma.$transaction(async (tx) => {
      const updated = await tx.driverVerification.update({
        where: { userId: id },
        data: {
          status: body.status,
          rejectionReason:
            body.status === DriverVerificationStatus.APPROVED ? null : body.rejectionReason ?? null,
          adminNotes: body.adminNotes ? sanitizeTextInput(body.adminNotes, 1000) : null,
          requestAdditionalDocuments: Boolean(body.requestAdditionalDocuments || body.status === DriverVerificationStatus.REVIEW),
          approvalDeadline,
          reviewedAt: now,
          reviewedById: session.user.id,
          approvedAt: body.status === DriverVerificationStatus.APPROVED ? now : null,
          verifiedAt: body.status === DriverVerificationStatus.APPROVED ? now : null,
        },
      });

      if (verification.latestAttemptId) {
        await tx.driverVerificationAttempt.update({
          where: { id: verification.latestAttemptId },
          data: { status: body.status, reviewedAt: now },
        });
      }

      return updated;
    });

    const title =
      body.status === DriverVerificationStatus.APPROVED
        ? 'Driver verification approved'
        : body.status === DriverVerificationStatus.REJECTED
          ? 'Driver verification rejected'
          : 'Driver verification needs more information';
    const message =
      body.status === DriverVerificationStatus.APPROVED
        ? 'Your driver verification has been approved. Your verified badge is now active.'
        : body.status === DriverVerificationStatus.REJECTED
          ? `Your driver verification was rejected: ${body.rejectionReason}. You can upload a new attempt from your account.`
          : `Your driver verification needs manual review: ${body.rejectionReason}. Please upload new documents if requested.`;

    await createNotification({
      userId: verification.user.id,
      type: NotificationType.MESSAGE,
      title,
      body: message,
      link: '/account/driver-verification',
      data: {
        status: body.status,
        rejectionReason: body.rejectionReason ?? null,
        adminNotes: body.adminNotes ?? null,
      },
      dedupeKey: `driver-verification-review:${verification.user.id}:${reviewed.updatedAt.toISOString()}`,
    }).catch((error) => {
      console.error('[admin/driver-verifications PATCH] failed to create notification', error);
    });

    await sendEmail(
      verification.user.email,
      title,
      `<p>Hello ${sanitizeTextInput(verification.user.name ?? 'there', 120)},</p><p>${sanitizeTextInput(message, 500)}</p><p>Review your status here: <a href="/account/driver-verification">Driver verification</a>.</p>${body.adminNotes ? `<p><strong>Admin notes:</strong> ${sanitizeTextInput(body.adminNotes, 1000)}</p>` : ''}`,
    ).catch((error) => {
      console.error('[admin/driver-verifications PATCH] failed to send email', error);
    });

    return NextResponse.json({ ok: true, verification: reviewed });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid review input.' }, { status: 400 });
    }

    console.error('[admin/driver-verifications PATCH]', error);
    return NextResponse.json({ error: 'Failed to update driver verification.' }, { status: 500 });
  }
}
