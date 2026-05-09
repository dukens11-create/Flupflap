import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import crypto from 'crypto';
import { sendEmail } from '@/lib/email';
import { passwordResetEmail } from '@/lib/email-templates';

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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const resetUrl = `${appUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

    const { subject, html } = passwordResetEmail(resetUrl);
    const sent = await sendEmail(email, subject, html);
    if (!sent) {
      console.warn('[forgot-password] Email delivery failed for', email);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[forgot-password]', err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
