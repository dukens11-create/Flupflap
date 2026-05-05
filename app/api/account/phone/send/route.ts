/**
 * POST /api/account/phone/send
 *
 * Send a verification code to a phone number the user wants to add/update.
 * Stores a PhoneVerificationToken (with bcrypt-hashed code) and sends the
 * plaintext code by SMS (or logs it to the console in development).
 *
 * Rate limit: 60 seconds between requests.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { sendSms } from '@/lib/twilio';
import { normalizePhone } from '@/lib/phone';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';

const EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

const schema = z.object({
  phone: z
    .string()
    .min(7, 'Please enter a valid phone number')
    .max(20)
    .regex(/^\+?[\d\s\-().]+$/, 'Invalid phone number format'),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { phone } = schema.parse(body);

    // Normalize to E.164 before storing and sending.
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: 'Invalid phone number. Please include your country code (e.g. +1 for US/Canada).' },
        { status: 400 },
      );
    }

    // Enforce resend cooldown
    const existing = await prisma.phoneVerificationToken.findUnique({
      where: { userId: session.user.id },
    });
    if (existing) {
      const secondsSince = (Date.now() - existing.createdAt.getTime()) / 1000;
      if (secondsSince < RESEND_COOLDOWN_SECONDS) {
        return NextResponse.json(
          { error: 'Please wait 60 seconds before requesting another code.' },
          { status: 429 },
        );
      }
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const codeHash = await bcrypt.hash(code, 8);
    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000);

    await prisma.phoneVerificationToken.upsert({
      where: { userId: session.user.id },
      update: { phone: normalizedPhone, codeHash, expiresAt, attempts: 0, createdAt: new Date() },
      create: { userId: session.user.id, phone: normalizedPhone, codeHash, expiresAt },
    });

    try {
      await sendSms(
        normalizedPhone,
        `Your FlupFlap phone verification code is: ${code}. It expires in ${EXPIRY_MINUTES} minutes.`,
      );
    } catch (err) {
      console.error('[account/phone/send] SMS send failed', {
        userId: session.user.id,
        error: (err as any)?.message,
      });
      await prisma.phoneVerificationToken.delete({ where: { userId: session.user.id } }).catch(() => null);
      return NextResponse.json({ error: 'Failed to send verification code. Please try again.' }, { status: 500 });
    }

    const digits = normalizedPhone.replace(/\D/g, '');
    const maskedPhone = digits.length >= 4 ? `***-***-${digits.slice(-4)}` : '****';

    return NextResponse.json({ ok: true, maskedPhone });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: err.errors[0]?.message || 'Invalid input.' }, { status: 400 });
    }
    console.error('[account/phone/send]', err);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
