import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import {
  getSignedDriverVerificationDocumentUrl,
  type DriverVerificationDocumentKind,
} from '@/lib/driver-verification';

function isDocumentKind(value: string): value is DriverVerificationDocumentKind {
  return value === 'selfie' || value === 'front' || value === 'back';
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { kind } = await params;
  if (!isDocumentKind(kind)) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  const url = new URL(req.url);
  const attemptId = url.searchParams.get('attemptId');
  const targetUserId = session.user.role === 'ADMIN' ? url.searchParams.get('userId') : session.user.id;

  if (!attemptId || !targetUserId) {
    return NextResponse.json({ error: 'Attempt ID is required.' }, { status: 400 });
  }

  const verification = await prisma.driverVerification.findUnique({
    where: { userId: targetUserId },
    select: {
      userId: true,
      attempts: {
        where: { id: attemptId },
        select: {
          id: true,
          selfieImagePublicId: true,
          selfieImageFormat: true,
          licenseFrontPublicId: true,
          licenseFrontFormat: true,
          licenseBackPublicId: true,
          licenseBackFormat: true,
        },
      },
    },
  });

  const attempt = verification?.attempts[0];
  if (!verification || !attempt) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  if (session.user.role !== 'ADMIN' && verification.userId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const document =
    kind === 'selfie'
      ? { publicId: attempt.selfieImagePublicId, format: attempt.selfieImageFormat }
      : kind === 'front'
        ? { publicId: attempt.licenseFrontPublicId, format: attempt.licenseFrontFormat }
        : { publicId: attempt.licenseBackPublicId, format: attempt.licenseBackFormat };

  if (!document.publicId) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  if (session.user.role === 'ADMIN') {
    await prisma.adminAccessLog.create({
      data: {
        adminId: session.user.id,
        targetId: verification.userId,
        action: 'view_driver_verification_document',
        notes: `${kind}:${attemptId}`,
      },
    }).catch((error) => {
      console.error('[driver-verification document] failed to log admin access', error);
    });
  }

  try {
    return NextResponse.redirect(getSignedDriverVerificationDocumentUrl(document.publicId, document.format));
  } catch (error) {
    console.error('[driver-verification document] failed to sign URL', error);
    return NextResponse.json(
      { error: 'Unable to open this secure verification document right now.' },
      { status: 500 },
    );
  }
}
