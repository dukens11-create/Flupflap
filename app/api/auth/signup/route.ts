import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getMarketplaceSettings } from '@/lib/commission';
import { SellerStatus } from '@prisma/client';
import { applyRateLimit, sanitizeTextInput } from '@/lib/security';
import { logError } from '@/lib/logger';
import { normalizePhone } from '@/lib/phone';
import { verifyFirebasePhoneIdToken } from '@/lib/firebase/server';
import { safeComparePassword } from '@/lib/password';

const schema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['CUSTOMER', 'SELLER']).default('CUSTOMER'),
  phone: z.string().max(20).optional(),
  firebaseIdToken: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  try {
    const limit = applyRateLimit({
      request: req,
      key: 'auth:signup',
      windowMs: 10 * 60 * 1000,
      max: 12,
    });
    if (limit.limited) {
      return NextResponse.json(
        { error: 'Too many signup attempts. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

    const body = await req.json();
    const data = schema.parse(body);
    const sanitizedName = sanitizeTextInput(data.name, 80);
    const sanitizedPhone = data.phone ? sanitizeTextInput(data.phone, 20) : undefined;
    let verifiedPhone: string | null = null;

    if (!sanitizedName) {
      return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
    }

    if (data.role === 'SELLER' && !sanitizedPhone?.trim()) {
      return NextResponse.json(
        { error: 'A mobile phone number is required for seller accounts.' },
        { status: 400 },
      );
    }
    if (data.role === 'SELLER') {
      const firebaseIdToken = data.firebaseIdToken;
      if (!firebaseIdToken) {
        return NextResponse.json(
          { error: 'Please verify your phone number with OTP before creating a seller account.' },
          { status: 400 },
        );
      }
      const normalizedSubmittedPhone = normalizePhone(sanitizedPhone ?? '');
      if (!normalizedSubmittedPhone) {
        return NextResponse.json(
          { error: 'Invalid phone number. Please include your country code (e.g. +1 for US/Canada).' },
          { status: 400 },
        );
      }

      const firebasePhone = await verifyFirebasePhoneIdToken(firebaseIdToken);
      if (!firebasePhone?.phoneNumber) {
        return NextResponse.json(
          { error: 'Phone verification has expired. Please request and verify a new OTP.' },
          { status: 400 },
        );
      }

      const normalizedFirebasePhone = normalizePhone(firebasePhone.phoneNumber);
      if (!normalizedFirebasePhone || normalizedFirebasePhone !== normalizedSubmittedPhone) {
        return NextResponse.json(
          { error: 'The verified phone number does not match the number entered on signup.' },
          { status: 400 },
        );
      }

      verifiedPhone = normalizedFirebasePhone;
    }

    const now = new Date();
    const settings = data.role === 'SELLER' ? await getMarketplaceSettings() : null;
    const freePromotionEnd = settings && settings.freePromotionEnabled
      ? new Date(now.getTime() + settings.freePromotionDurationDays * 24 * 60 * 60 * 1000)
      : null;
    const normalizedEmail = data.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (existing) {
      if (data.role === 'SELLER' && existing.role === 'CUSTOMER') {
        const passwordOk = await safeComparePassword(data.password, existing.password, 'signup/upgrade-to-seller');
        if (!passwordOk) {
          return NextResponse.json(
            { error: 'This email is already in use. Please continue with your existing account password to enable seller access.' },
            { status: 409 },
          );
        }

        await prisma.user.update({
          where: { id: existing.id },
          data: {
            role: 'SELLER',
            phone: verifiedPhone,
            sellerStatus: SellerStatus.PENDING,
            phoneVerified: true,
            phoneVerifiedAt: now,
            hasFreePromotion: settings?.freePromotionEnabled ? true : existing.hasFreePromotion,
            freePromotionStart:
              settings?.freePromotionEnabled && !existing.freePromotionStart ? now : existing.freePromotionStart,
            freePromotionEnd:
              settings?.freePromotionEnabled && !existing.freePromotionEnd ? freePromotionEnd : existing.freePromotionEnd,
            freePromotionGrantedAt:
              settings?.freePromotionEnabled && !existing.freePromotionGrantedAt ? now : existing.freePromotionGrantedAt,
            freePromotionExpiresAt:
              settings?.freePromotionEnabled && !existing.freePromotionExpiresAt ? freePromotionEnd : existing.freePromotionExpiresAt,
          },
        });

        return NextResponse.json({ ok: true, upgradedToSeller: true });
      }

      return NextResponse.json(
        { error: 'This email is already linked to a FlupFlap account. Please sign in and continue with the same email.' },
        { status: 409 },
      );
    }

    const password = await bcrypt.hash(data.password, 12);

    await prisma.user.create({
      data: {
        name: sanitizedName,
        email: normalizedEmail,
        password,
        role: data.role,
        phone: data.role === 'SELLER' ? verifiedPhone : null,
        ...(data.role === 'SELLER'
          ? {
          sellerStatus: SellerStatus.PENDING,
              phoneVerified: true,
              phoneVerifiedAt: now,
              hasFreePromotion: !!settings?.freePromotionEnabled,
              freePromotionStart: settings?.freePromotionEnabled ? now : null,
              freePromotionEnd,
              freePromotionGrantedAt: settings?.freePromotionEnabled ? now : null,
              freePromotionExpiresAt: freePromotionEnd,
            }
          : {}),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
    }
    logError('Signup failed', err, { tag: 'api/auth/signup' });
    return NextResponse.json({ error: 'Signup failed.' }, { status: 500 });
  }
}
