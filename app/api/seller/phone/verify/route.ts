import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { SellerPhoneVerificationStatus } from '@prisma/client';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { verifyFirebasePhoneIdToken } from '@/lib/firebase/server';
import { normalizePhone } from '@/lib/phone';
import { sanitizeTextInput } from '@/lib/security';
import { sessionHasRole } from '@/lib/user-roles';

const schema = z.object({
  phone: z.string().max(20),
  firebaseIdToken: z.string().min(1),
});

export async function POST(req: Request) {
  let sellerId: string | null = null;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !sessionHasRole(session.user, 'SELLER') || !session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    sellerId = session.user.id;

    const body = await req.json();
    const data = schema.parse(body);
    const sanitizedPhone = sanitizeTextInput(data.phone, 20);
    const normalizedSubmittedPhone = normalizePhone(sanitizedPhone);
    if (!normalizedSubmittedPhone) {
      return NextResponse.json(
        { error: 'Invalid phone number. Please include your country code (e.g. +1 for US/Canada).' },
        { status: 400 },
      );
    }

    const firebasePhone = await verifyFirebasePhoneIdToken(data.firebaseIdToken);
    if (!firebasePhone?.phoneNumber) {
      return NextResponse.json(
        { error: 'Phone verification has expired. Please request and verify a new OTP.' },
        { status: 400 },
      );
    }

    const normalizedFirebasePhone = normalizePhone(firebasePhone.phoneNumber);
    if (!normalizedFirebasePhone || normalizedFirebasePhone !== normalizedSubmittedPhone) {
      return NextResponse.json(
        { error: 'The verified phone number does not match the number entered.' },
        { status: 400 },
      );
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: session.user.id },
        data: {
          phone: normalizedFirebasePhone,
          phoneVerified: true,
          phoneVerifiedAt: now,
        },
      });

      const verification = await tx.sellerVerification.findUnique({
        where: { sellerId: session.user.id },
        select: { sellerId: true },
      });

      if (verification) {
        await tx.sellerVerification.update({
          where: { sellerId: session.user.id },
          data: {
            phoneNumber: normalizedFirebasePhone,
            phoneVerified: true,
            phoneVerificationStatus: SellerPhoneVerificationStatus.VERIFIED,
          },
        });
      }
    });

    return NextResponse.json({ ok: true, phoneNumber: normalizedFirebasePhone });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
    }
    console.error('[seller/phone/verify] unexpected error', {
      sellerId,
      err,
    });
    return NextResponse.json({ error: 'Unable to verify phone number right now.' }, { status: 500 });
  }
}
