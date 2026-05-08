import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import {
  getSignedSellerVerificationDocumentUrl,
  type SellerVerificationDocumentKind,
} from '@/lib/seller-verification';

function isDocumentKind(value: string): value is SellerVerificationDocumentKind {
  return value === 'front' || value === 'back' || value === 'selfie';
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !['SELLER', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { kind } = await params;
  if (!isDocumentKind(kind)) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  const sellerId = session.user.role === 'ADMIN'
    ? new URL(req.url).searchParams.get('sellerId')
    : session.user.id;

  if (session.user.role === 'ADMIN' && !sellerId) {
    return NextResponse.json({ error: 'Seller ID is required.' }, { status: 400 });
  }

  if (session.user.role === 'ADMIN') {
    const seller = await prisma.user.findUnique({
      where: { id: sellerId },
      select: { id: true, role: true },
    });
    if (!seller || seller.role !== 'SELLER') {
      return NextResponse.json({ error: 'Seller not found.' }, { status: 404 });
    }
  }

  const verification = await prisma.sellerVerification.findUnique({
    where: { sellerId },
    select: {
      governmentIdFrontPublicId: true,
      governmentIdFrontFormat: true,
      governmentIdBackPublicId: true,
      governmentIdBackFormat: true,
      selfieImagePublicId: true,
      selfieImageFormat: true,
    },
  });

  if (!verification) {
    return NextResponse.json({ error: 'Verification submission not found.' }, { status: 404 });
  }

  const document =
    kind === 'front'
      ? {
          publicId: verification.governmentIdFrontPublicId,
          format: verification.governmentIdFrontFormat,
        }
      : kind === 'back'
        ? {
            publicId: verification.governmentIdBackPublicId,
            format: verification.governmentIdBackFormat,
          }
        : {
            publicId: verification.selfieImagePublicId,
            format: verification.selfieImageFormat,
          };

  if (!document.publicId) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  if (session.user.role === 'ADMIN') {
    await prisma.adminAccessLog.create({
      data: {
        adminId: session.user.id,
        targetId: sellerId,
        action: 'view_seller_verification_document',
        notes: kind,
      },
    });
  }

  return NextResponse.redirect(
    getSignedSellerVerificationDocumentUrl(document.publicId, document.format),
  );
}
