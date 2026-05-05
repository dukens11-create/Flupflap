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
    const timingAttackPreventionHash =
      '$2b$08$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
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

    // Save phone (unverified); it will be marked verified on successful OTP login.
    await prisma.user.update({
      where: { id: user.id },
      data: { phone, phoneVerified: false },
    });

    const result = await createAndSendOtp(user.id, phone);

    if (!result.ok) {
      if (result.error === 'rate_limited') {
        return NextResponse.json(
          { error: 'Please wait 60 seconds before requesting another code.' },
          { status: 429 },
        );
      }
      return NextResponse.json(
        { error: 'Failed to send verification code. Please try again.' },
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
