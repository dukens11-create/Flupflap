/**
 * POST /api/auth/otp/setup-phone
 *
 * Called during seller login when the seller has no phone on file.
 * Validates credentials, saves the provided phone, and sends an OTP to it.
 * After calling this endpoint the seller should be redirected to the normal
 * OTP step so they can complete sign-in.
 *
 * Request body:
 *   { email: string; password: string; phone: string }
 *
 * Response (200):
 *   { step: 'otp'; maskedPhone: string }
 *
 * Errors:
 *   400 — validation error or not a seller account
 *   401 — invalid credentials
 *   429 — resend rate-limited
 *   500 — SMS delivery failed
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createAndSendOtp } from '@/lib/otp';
import { normalizePhone } from '@/lib/phone';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  phone: z
    .string()
    .min(7, 'Please enter a valid phone number')
    .max(20)
    .regex(/^\+?[\d\s\-().]+$/, 'Invalid phone number format'),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, phone } = schema.parse(body);

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Always run bcrypt.compare even when the user is not found.  This ensures
    // both branches take roughly the same time, preventing timing side-channels
    // that could reveal whether an email address is registered in the system.
    // The goal is a CONSTANT (not random) execution time on the failure path.
    // This is a pre-computed bcrypt hash (cost 8) used solely for timing parity.
    const timingAttackPreventionHash =
      '$2b$08$/q5WhRImkX8WonE9ckvfMOUqkcgRD24wzjyJpBuDu3UnZ.XYRudFu';
    let passwordOk: boolean;
    if (user) {
      passwordOk = await bcrypt.compare(password, user.password);
    } else {
      await bcrypt.compare(password, timingAttackPreventionHash);
      passwordOk = false;
    }

    if (!user || !passwordOk) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    if (user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Phone setup is only available for seller accounts.' }, { status: 400 });
    }

    // Normalize to E.164 before saving and sending.
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: 'Invalid phone number. Please include your country code (e.g. +1 for US/Canada).' },
        { status: 400 },
      );
    }

    // Save phone (unverified); it will be marked verified on successful OTP login.
    await prisma.user.update({
      where: { id: user.id },
      data: { phone: normalizedPhone, phoneVerified: false },
    });

    const result = await createAndSendOtp(user.id, normalizedPhone);

    if (!result.ok) {
      if (result.error === 'rate_limited') {
        return NextResponse.json(
          { error: 'Please wait 60 seconds before requesting another code.' },
          { status: 429 },
        );
      }
      console.error('[setup-phone] OTP send failed for user', user.id);
      return NextResponse.json(
        { error: 'Failed to send verification code. Please check your phone number and try again.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ step: 'otp', maskedPhone: result.maskedPhone });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: err.errors[0]?.message || 'Invalid input.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
