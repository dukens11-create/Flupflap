/**
 * OTP utilities for seller phone verification.
 *
 * Flow:
 *   1. createAndSendOtp(userId, phone) — generates a 6-digit code, hashes it,
 *      stores it in SellerOtp (upsert), and sends it by SMS (or logs in dev).
 *   2. verifyOtp(userId, code) — checks the code against the hash, respects
 *      expiry and max-attempts limits, and deletes the record on success.
 *
 * Security measures:
 *   - Codes are 6 random digits (cryptographically secure RNG).
 *   - Codes are bcrypt-hashed before storage (cost 8 — fast enough for 6-digit codes).
 *   - Codes expire after OTP_EXPIRY_MINUTES (10 minutes).
 *   - Max MAX_ATTEMPTS (5) failed checks before the code is invalidated.
 *   - Minimum RESEND_COOLDOWN_SECONDS (60 s) between code requests.
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from './db';
import { sendSms } from './twilio';

const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

/** Generate a cryptographically secure 6-digit code (100000–999999). */
function generateCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

export type CreateOtpResult =
  | { ok: true; maskedPhone: string }
  | { ok: false; error: 'rate_limited' | 'send_failed' };

/**
 * Generate, store, and send a new OTP for the given seller.
 * Returns `maskedPhone` (e.g. "***-***-1234") on success.
 */
export async function createAndSendOtp(
  userId: string,
  phone: string,
): Promise<CreateOtpResult> {
  // Enforce resend cooldown: reject if the last OTP was created < RESEND_COOLDOWN_SECONDS ago.
  const existing = await prisma.sellerOtp.findUnique({ where: { userId } });
  if (existing) {
    const secondsSinceCreated = (Date.now() - existing.createdAt.getTime()) / 1000;
    if (secondsSinceCreated < RESEND_COOLDOWN_SECONDS) {
      return { ok: false, error: 'rate_limited' };
    }
  }

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 8);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await prisma.sellerOtp.upsert({
    where: { userId },
    update: { codeHash, expiresAt, attempts: 0, createdAt: new Date() },
    create: { userId, codeHash, expiresAt },
  });

  const maskedPhone = maskPhone(phone);

  try {
    await sendSms(phone, `Your FlupFlap verification code is: ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`);
  } catch {
    // Clean up the stored code so the user can retry.
    await prisma.sellerOtp.delete({ where: { userId } }).catch(() => null);
    return { ok: false, error: 'send_failed' };
  }

  return { ok: true, maskedPhone };
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; error: 'invalid' | 'expired' | 'too_many_attempts' };

/**
 * Verify a submitted OTP code for the given user.
 * Deletes the record on success so the code cannot be reused.
 */
export async function verifyOtp(
  userId: string,
  code: string,
): Promise<VerifyOtpResult> {
  const record = await prisma.sellerOtp.findUnique({ where: { userId } });
  if (!record) return { ok: false, error: 'invalid' };

  if (record.expiresAt < new Date()) {
    await prisma.sellerOtp.delete({ where: { userId } }).catch(() => null);
    return { ok: false, error: 'expired' };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await prisma.sellerOtp.delete({ where: { userId } }).catch(() => null);
    return { ok: false, error: 'too_many_attempts' };
  }

  const match = await bcrypt.compare(code.trim(), record.codeHash);

  if (!match) {
    await prisma.sellerOtp.update({
      where: { userId },
      data: { attempts: { increment: 1 } },
    });
    // Delete on final attempt to prevent further guessing.
    if (record.attempts + 1 >= MAX_ATTEMPTS) {
      await prisma.sellerOtp.delete({ where: { userId } }).catch(() => null);
    }
    return { ok: false, error: 'invalid' };
  }

  // Success — delete so the code cannot be reused.
  await prisma.sellerOtp.delete({ where: { userId } }).catch(() => null);
  return { ok: true };
}

/** Return "***-***-1234" style masked phone string. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `***-***-${digits.slice(-4)}`;
}
