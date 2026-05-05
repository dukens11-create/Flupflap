/**
 * POST /api/account/phone/verify
 *
 * Verify the code sent to a phone number and save it as the user's verified
 * phone. Consumes the PhoneVerificationToken on success.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const MAX_ATTEMPTS = 5;

const schema = z.object({
  code: z.string().length(6, 'Code must be 6 digits').regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { code } = schema.parse(body);

    const record = await prisma.phoneVerificationToken.findUnique({
      where: { userId: session.user.id },
    });

    if (!record) {
      return NextResponse.json({ error: 'No verification pending. Please request a new code.' }, { status: 400 });
    }

    if (record.expiresAt < new Date()) {
      await prisma.phoneVerificationToken.delete({ where: { userId: session.user.id } }).catch(() => null);
      return NextResponse.json({ error: 'Code expired. Please request a new code.' }, { status: 400 });
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      await prisma.phoneVerificationToken.delete({ where: { userId: session.user.id } }).catch(() => null);
      return NextResponse.json({ error: 'Too many failed attempts. Please request a new code.' }, { status: 400 });
    }

    const match = await bcrypt.compare(code.trim(), record.codeHash);

    if (!match) {
      await prisma.phoneVerificationToken.update({
        where: { userId: session.user.id },
        data: { attempts: { increment: 1 } },
      });
      if (record.attempts + 1 >= MAX_ATTEMPTS) {
        await prisma.phoneVerificationToken.delete({ where: { userId: session.user.id } }).catch(() => null);
        return NextResponse.json({ error: 'Too many failed attempts. Please request a new code.' }, { status: 400 });
      }
      return NextResponse.json({ error: 'Invalid code. Please try again.' }, { status: 400 });
    }

    // Success: update user's phone and mark as verified
    await prisma.user.update({
      where: { id: session.user.id },
      data: { phone: record.phone, phoneVerified: true, phoneVerifiedAt: new Date() },
    });
    await prisma.phoneVerificationToken.delete({ where: { userId: session.user.id } }).catch(() => null);

    return NextResponse.json({ ok: true, message: 'Phone number verified and saved.' });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: err.errors[0]?.message || 'Invalid input.' }, { status: 400 });
    }
    console.error('[account/phone/verify]', err);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
