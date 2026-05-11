import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import crypto from 'crypto';
import { sendEmail } from '@/lib/email';
import { passwordResetEmail } from '@/lib/email-templates';
import { getSiteUrl } from '@/lib/seo';

export async function POST(req: Request) {
  try {
    const { email } = await req.json() as { email?: string };
    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    // Always respond with success to prevent user enumeration
    if (!user) {
      return NextResponse.json({ ok: true });
    }

    // Generate a secure token valid for 1 hour
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Remove any existing tokens for this email
    await prisma.verificationToken.deleteMany({
      where: { identifier: `password-reset:${email.toLowerCase()}` },
    });

    await prisma.verificationToken.create({
      data: {
        identifier: `password-reset:${email.toLowerCase()}`,
        token,
        expires,
      },
    });

    const resetUrl = new URL('/reset-password', getSiteUrl());
    resetUrl.searchParams.set('token', token);
    resetUrl.searchParams.set('email', email);

    const { subject, html } = passwordResetEmail(resetUrl.toString());
    const sent = await sendEmail(email, subject, html);
    if (!sent) {
      console.warn('[forgot-password] Email delivery failed for', email);
      return NextResponse.json(
        { error: 'Unable to send reset email right now. Please try again shortly.' },
        { status: 503 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[forgot-password]', err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
