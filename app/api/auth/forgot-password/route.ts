import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

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

    // In production, send an email with the reset link.
    // For now, the reset link is: /reset-password?token=<token>&email=<email>
    // TODO: integrate with an email provider (e.g. Resend, SendGrid, Nodemailer)
    console.log(
      `[forgot-password] Reset link for ${email}: /reset-password?token=${token}&email=${encodeURIComponent(email)}`
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[forgot-password]', err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
