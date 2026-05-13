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
import { isSmsOtpEnabled, SELLER_OTP_FORCE_DISABLED } from '@/lib/feature-flags';
import { safeComparePassword } from '@/lib/password';
import { applyRateLimit } from '@/lib/security';
import { logError, logInfo, logWarn } from '@/lib/logger';

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
    const limit = applyRateLimit({
      request: req,
      key: 'auth:otp-setup-phone',
      windowMs: 10 * 60 * 1000,
      max: 20,
    });
    if (limit.limited) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait before trying again.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

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
      passwordOk = await safeComparePassword(password, user.password, 'otp/setup-phone');
    } else {
      await bcrypt.compare(password, timingAttackPreventionHash);
      passwordOk = false;
    }

    if (!user || !passwordOk) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    if (user.role !== 'SELLER') {
      logInfo('Rejected phone setup for non-seller role', {
        tag: 'api/auth/otp/setup-phone',
        userId: user.id,
        role: user.role,
      });
      return NextResponse.json({ error: 'Phone setup is only available for seller accounts.' }, { status: 400 });
    }

    if (SELLER_OTP_FORCE_DISABLED || !isSmsOtpEnabled()) {
      logWarn('Seller OTP bypassed due to feature flags', {
        tag: 'api/auth/otp/setup-phone',
        userId: user.id,
        role: user.role,
        reason: SELLER_OTP_FORCE_DISABLED
          ? 'SELLER_OTP_FORCE_DISABLED=true (pending Twilio A2P 10DLC approval)'
          : 'feature flag ENABLE_SMS_OTP=false',
      });
      return NextResponse.json({ step: 'signin' });
    }

    // Normalize to E.164 before saving and sending.
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      const digitsOnly = phone.replace(/\D/g, '');
      logWarn('Invalid phone entered for seller OTP setup', {
        tag: 'api/auth/otp/setup-phone',
        userId: user.id,
        digitsLength: digitsOnly.length,
        hadPlusPrefix: phone.trim().startsWith('+'),
      });
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
        logInfo('OTP blocked by resend cooldown after setup-phone', {
          tag: 'api/auth/otp/setup-phone',
          userId: user.id,
        });
        return NextResponse.json(
          { error: 'Please wait 60 seconds before requesting another code.' },
          { status: 429 },
        );
      }
      logError('OTP send failed after phone save', new Error('otp_send_failed_after_phone_save'), {
        tag: 'api/auth/otp/setup-phone',
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Failed to send verification code. Please check your phone number and try again.' },
        { status: 500 },
      );
    }

    logInfo('OTP send succeeded after phone setup', {
      tag: 'api/auth/otp/setup-phone',
      userId: user.id,
      maskedPhone: result.maskedPhone,
    });
    return NextResponse.json({ step: 'otp', maskedPhone: result.maskedPhone });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: err.errors[0]?.message || 'Invalid input.' }, { status: 400 });
    }
    logError('Unexpected setup-phone failure', err, {
      tag: 'api/auth/otp/setup-phone',
    });
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
