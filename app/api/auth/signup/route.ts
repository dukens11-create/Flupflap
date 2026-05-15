import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getMarketplaceSettings } from '@/lib/commission';
import { SellerStatus } from '@prisma/client';
import { applyRateLimit, sanitizeTextInput } from '@/lib/security';
import { logError, logWarn } from '@/lib/logger';
import { verifyFirebasePhoneIdToken } from '@/lib/firebase/phone-verification';
import { normalizePhone } from '@/lib/phone';

const schema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['CUSTOMER', 'SELLER']).default('CUSTOMER'),
  phone: z.string().max(20).optional(),
  phoneVerificationIdToken: z.string().min(1).optional(),
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

    if (!sanitizedName) {
      return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
    }

    if (data.role === 'SELLER' && !data.phoneVerificationIdToken?.trim()) {
      return NextResponse.json(
        { error: 'Phone verification is required for seller accounts.' },
        { status: 400 },
      );
    }

    if (data.role === 'SELLER' && !sanitizedPhone?.trim()) {
      return NextResponse.json(
        { error: 'A mobile phone number is required for seller accounts.' },
        { status: 400 },
      );
    }

    let verifiedPhoneForSeller: string | null = null;
    if (data.role === 'SELLER') {
      const verification = await verifyFirebasePhoneIdToken(data.phoneVerificationIdToken!.trim());
      if (!verification.ok) {
        if (verification.error === 'missing_config') {
          logError('Firebase phone verification is not configured for seller signup.', null, {
            tag: 'api/auth/signup',
          });
          return NextResponse.json(
            { error: 'Phone verification is temporarily unavailable. Please try again shortly.' },
            { status: 503 },
          );
        }
        if (verification.error === 'invalid_token') {
          return NextResponse.json(
            { error: 'Phone verification expired. Please verify your phone number again.' },
            { status: 400 },
          );
        }
        return NextResponse.json(
          { error: 'Unable to verify phone number right now. Please try again.' },
          { status: 502 },
        );
      }

      const normalizedVerified = normalizePhone(verification.phoneNumber);
      const normalizedInput = normalizePhone(sanitizedPhone ?? '');
      if (!normalizedVerified || !normalizedInput || normalizedVerified !== normalizedInput) {
        logWarn('Seller signup phone mismatch between Firebase verification and submitted phone.', {
          tag: 'api/auth/signup',
          normalizedInputPresent: Boolean(normalizedInput),
          normalizedVerifiedPresent: Boolean(normalizedVerified),
        });
        return NextResponse.json(
          { error: 'The verified phone number does not match the number entered.' },
          { status: 400 },
        );
      }
      verifiedPhoneForSeller = normalizedVerified;
    }

    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }

    const password = await bcrypt.hash(data.password, 12);
    const now = new Date();
    const settings = data.role === 'SELLER' ? await getMarketplaceSettings() : null;
    const freePromotionEnd = settings && settings.freePromotionEnabled
      ? new Date(now.getTime() + settings.freePromotionDurationDays * 24 * 60 * 60 * 1000)
      : null;

    await prisma.user.create({
      data: {
        name: sanitizedName,
        email: data.email.toLowerCase(),
        password,
        role: data.role,
        phone: data.role === 'SELLER' ? verifiedPhoneForSeller : null,
        phoneVerified: data.role === 'SELLER',
        phoneVerifiedAt: data.role === 'SELLER' ? now : null,
        ...(data.role === 'SELLER'
          ? {
            sellerStatus: SellerStatus.PENDING,
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
