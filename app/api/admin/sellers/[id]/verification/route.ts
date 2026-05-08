import { SellerVerificationStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

const schema = z
  .object({
    status: z.enum([SellerVerificationStatus.APPROVED, SellerVerificationStatus.REJECTED]),
    rejectionReason: z.string().trim().max(1000).optional(),
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
      status: true,
      rejectionReason: true,
      phoneNumber: true,
      phoneVerificationStatus: true,
      street: true,
      city: true,
      state: true,
      zipCode: true,
      country: true,
      createdAt: true,
      updatedAt: true,
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
      select: { id: true, role: true },
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
      select: { sellerId: true },
    });
    if (!verification) {
      return NextResponse.json({ error: 'Verification submission not found.' }, { status: 404 });
    }

    await prisma.sellerVerification.update({
      where: { sellerId: id },
      data: {
        status: data.status,
        rejectionReason:
          data.status === SellerVerificationStatus.REJECTED
            ? data.rejectionReason ?? null
            : null,
        reviewedAt: new Date(),
        reviewedById: session.user.id,
      },
    });

    return NextResponse.redirect(new URL('/admin/sellers?verification=updated', req.url));
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json(
        { error: err.errors[0]?.message ?? 'Invalid input.' },
        { status: 400 },
      );
    }

    console.error('[admin/sellers/verification POST]', err);
    return NextResponse.json(
      { error: 'Failed to update seller verification.' },
      { status: 500 },
    );
  }
}
