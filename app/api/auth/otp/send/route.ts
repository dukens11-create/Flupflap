/**
 * POST /api/auth/otp/send
 *
 * Step 1 of seller login: validate email + password and, if the user is a
 * SELLER, send a one-time code to their registered phone.
 *
 * Request body:
 *   { email: string; password: string }
 *
 * Response (200):
 *   { step: 'otp';    maskedPhone: string }   — seller; OTP sent
 *   { step: 'signin' }                        — non-seller; call signIn() directly
 *
 * Errors:
 *   401 — invalid credentials
 *   400 — validation error (e.g. seller has no phone on file)
 *   429 — resend rate-limited
 *   500 — SMS delivery failed
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createAndSendOtp } from '@/lib/otp';
import { isSmsOtpEnabled } from '@/lib/feature-flags';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = schema.parse(body);

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Always run bcrypt compare to prevent timing attacks that could reveal
    // whether an email address is registered in the system.
    const timingAttackPreventionHash = '$2b$08$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
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
      console.info('[otp/send] OTP skipped: non-seller role', {
        userId: user.id,
        role: user.role,
      });
      return NextResponse.json({ step: 'signin', reason: 'non_seller' });
    }

    if (!isSmsOtpEnabled()) {
      console.warn('[otp/send] OTP skipped: feature flag disabled', {
        userId: user.id,
        role: user.role,
        enableSmsOtp: process.env.ENABLE_SMS_OTP ?? '(unset)',
      });
      return NextResponse.json({ step: 'signin', reason: 'otp_disabled' });
    }

    // Seller but no phone registered — route to phone setup flow.
    if (!user.phone) {
      console.info('[otp/send] Seller requires phone setup before OTP', {
        userId: user.id,
        role: user.role,
      });
      return NextResponse.json({ step: 'add_phone', reason: 'missing_phone' });
    }

    const result = await createAndSendOtp(user.id, user.phone);

    if (!result.ok) {
      if (result.error === 'rate_limited') {
        console.info('[otp/send] OTP blocked by resend cooldown', { userId: user.id });
        return NextResponse.json(
          { error: 'Please wait 60 seconds before requesting another code.' },
          { status: 429 },
        );
      }
      if (result.error === 'invalid_phone') {
        console.warn('[otp/send] OTP blocked: invalid normalized phone', { userId: user.id });
        return NextResponse.json(
          { error: 'Your phone number on file appears to be invalid. Please update it in account settings.' },
          { status: 400 },
        );
      }
      console.error('[otp/send] OTP send failed after Twilio attempt', { userId: user.id });
      return NextResponse.json(
        { error: 'Failed to send verification code. Please verify your phone number and try again.' },
        { status: 500 },
      );
    }

    console.info('[otp/send] OTP send succeeded', {
      userId: user.id,
      maskedPhone: result.maskedPhone,
    });
    return NextResponse.json({ step: 'otp', maskedPhone: result.maskedPhone });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
    }
    console.error('[otp/send] Unexpected server error', {
      error: err?.message ?? 'unknown_error',
    });
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
