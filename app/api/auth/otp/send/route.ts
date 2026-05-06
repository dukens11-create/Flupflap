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

    // Non-seller accounts and sellers when SMS OTP is disabled both skip the
    // OTP challenge — let the normal signIn() call proceed directly.
    // Re-enable OTP by setting ENABLE_SMS_OTP=true once Twilio A2P is approved.
    if (user.role !== 'SELLER' || !isSmsOtpEnabled()) {
      return NextResponse.json({ step: 'signin' });
    }

    // Seller but no phone registered — route to phone setup flow.
    if (!user.phone) {
      return NextResponse.json({ step: 'add_phone' });
    }

    const result = await createAndSendOtp(user.id, user.phone);

    if (!result.ok) {
      if (result.error === 'rate_limited') {
        return NextResponse.json(
          { error: 'Please wait 60 seconds before requesting another code.' },
          { status: 429 },
        );
      }
      if (result.error === 'invalid_phone') {
        return NextResponse.json(
          { error: 'Your phone number on file appears to be invalid. Please update it in account settings.' },
          { status: 400 },
        );
      }
      console.error('[otp/send] OTP send failed for user', user.id);
      return NextResponse.json(
        { error: 'Failed to send verification code. Please try again.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ step: 'otp', maskedPhone: result.maskedPhone });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
