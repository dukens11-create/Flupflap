/**
 * POST /api/auth/otp/send
 *
 * Step 1 of seller login: validate email + password and return the next client
 * step for the Firebase phone-auth flow.
 *
 * Request body:
 *   { email: string; password: string }
 *
 * Response (200):
 *   { step: 'otp'; phone: string; maskedPhone: string } — seller with phone
 *   { step: 'signin' }                                   — non-seller; call signIn() directly
 *
 * Errors:
 *   401 — invalid credentials
 *   400 — validation error (e.g. seller has no phone on file)
 *   429 — too many requests
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { normalizePhone } from '@/lib/phone';
import { safeComparePassword } from '@/lib/password';
import { applyRateLimit } from '@/lib/security';
import { logError, logInfo, logWarn } from '@/lib/logger';

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `***-***-${digits.slice(-4)}`;
}

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const limit = applyRateLimit({
      request: req,
      key: 'auth:otp-send',
      windowMs: 10 * 60 * 1000,
      max: 25,
    });
    if (limit.limited) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait before trying again.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

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
      passwordOk = await safeComparePassword(password, user.password, 'otp/send');
    } else {
      await bcrypt.compare(password, timingAttackPreventionHash);
      passwordOk = false;
    }

    if (!user || !passwordOk) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    if (user.role !== 'SELLER') {
      logInfo('OTP skipped for non-seller role', {
        tag: 'api/auth/otp/send',
        userId: user.id,
        role: user.role,
      });
      return NextResponse.json({ step: 'signin' });
    }

    // Seller but no phone registered — route to phone setup flow.
    if (!user.phone) {
      logInfo('Seller requires phone setup before OTP', {
        tag: 'api/auth/otp/send',
        userId: user.id,
        role: user.role,
      });
      return NextResponse.json({ step: 'add_phone' });
    }

    const normalizedPhone = normalizePhone(user.phone);
    if (!normalizedPhone) {
      logWarn('Seller phone on file is invalid for Firebase login', {
        tag: 'api/auth/otp/send',
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Your phone number on file appears to be invalid. Please update it in account settings.' },
        { status: 400 },
      );
    }

    logInfo('Seller login prepared for Firebase OTP', {
      tag: 'api/auth/otp/send',
      userId: user.id,
      maskedPhone: maskPhone(normalizedPhone),
    });
    return NextResponse.json({
      step: 'otp',
      phone: normalizedPhone,
      maskedPhone: maskPhone(normalizedPhone),
    });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
    }
    logError('Unexpected OTP send failure', err, {
      tag: 'api/auth/otp/send',
    });
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
