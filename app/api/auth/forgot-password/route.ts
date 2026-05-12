import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import crypto from 'crypto';
import { sendEmail } from '@/lib/email';
import { passwordResetEmail } from '@/lib/email-templates';
import { getSiteUrl } from '@/lib/seo';
import { applyRateLimit } from '@/lib/security';
import { logError, logWarn } from '@/lib/logger';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  try {
    const limit = applyRateLimit({
      request: req,
      key: 'auth:forgot-password',
      windowMs: 10 * 60 * 1000,
      max: 12,
    });
    if (limit.limited) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait before trying again.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }
    const body = await req.json();
    const { email } = schema.parse(body);
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    // Always respond with success to prevent user enumeration
    if (!user) {
      return NextResponse.json({ ok: true });
    }

    // Generate a secure token valid for 1 hour
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Remove any existing tokens for this email
    await prisma.verificationToken.deleteMany({
      where: { identifier: `password-reset:${normalizedEmail}` },
    });

    await prisma.verificationToken.create({
      data: {
        identifier: `password-reset:${normalizedEmail}`,
        token,
        expires,
      },
    });

    const resetUrl = new URL('/reset-password', getSiteUrl());
    resetUrl.searchParams.set('token', token);
    resetUrl.searchParams.set('email', normalizedEmail);

    const { subject, html } = passwordResetEmail(resetUrl.toString());
    const sent = await sendEmail(normalizedEmail, subject, html);
    if (!sent) {
      const emailHash = crypto.createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 12);
      logWarn('Password reset email delivery failed', {
        tag: 'api/auth/forgot-password',
        emailHash,
      });
      return NextResponse.json(
        { error: 'Unable to send reset email right now. Please try again shortly.' },
        { status: 503 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
    }
    logError('Forgot password failed', err, { tag: 'api/auth/forgot-password' });
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
