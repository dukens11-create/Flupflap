import crypto from 'crypto';
import {
  SellerKycProvider,
  SellerVerificationStatus,
} from '@prisma/client';
import { NextResponse } from 'next/server';
import { applyAutomatedKycResult } from '@/lib/kyc/providers';
import { prisma } from '@/lib/db';
import { logError } from '@/lib/logger';

function timingSafeEqualHex(a: string, b: string) {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) return false;
  const aBuf = Buffer.from(a, 'hex');
  const bBuf = Buffer.from(b, 'hex');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyPersonaSignature(rawBody: string, signatureHeader: string, secret: string) {
  if (!signatureHeader || !secret) return false;
  const parts = signatureHeader.split(',').map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) return false;

  const payload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return signatures.some((signature) => timingSafeEqualHex(expected, signature));
}

export async function POST(req: Request) {
  try {
    const signature = req.headers.get('persona-signature') ?? '';
    const secret = (process.env.PERSONA_WEBHOOK_SECRET ?? '').trim();
    const body = await req.text();
    if (!verifyPersonaSignature(body, signature, secret)) {
      return new NextResponse('Invalid signature', { status: 400 });
    }

    let payload: {
      data?: {
        id?: string;
        type?: string;
        attributes?: {
          name?: string;
          status?: string;
          payload?: {
            data?: {
              id?: string;
              attributes?: {
                status?: string;
                'reference-id'?: string;
              };
            };
          };
        };
      };
    };

    try {
      payload = JSON.parse(body);
    } catch {
      return new NextResponse('Invalid payload', { status: 400 });
    }

    const eventName = payload.data?.attributes?.name ?? '';
    const inquiryData = payload.data?.attributes?.payload?.data;
    const inquiryId = inquiryData?.id ?? null;
    const sellerId = inquiryData?.attributes?.['reference-id'] ?? null;
    const providerStatus = inquiryData?.attributes?.status ?? payload.data?.attributes?.status ?? 'pending';

    if (!sellerId) {
      return new NextResponse('ok', { status: 200 });
    }

    const existing = await prisma.sellerVerification.findUnique({
      where: { sellerId },
      select: {
        providerAccountId: true,
        providerVerificationId: true,
        addressVerified: true,
        phoneVerified: true,
        governmentIdVerified: true,
        selfieVerified: true,
      },
    });

    const checks = {
      governmentIdVerified: existing?.governmentIdVerified ?? false,
      selfieVerified: existing?.selfieVerified ?? false,
      addressVerified: existing?.addressVerified ?? false,
      phoneVerified: existing?.phoneVerified ?? false,
    };
    const alreadyApprovedByProvider =
      checks.governmentIdVerified
      && checks.selfieVerified
      && checks.addressVerified
      && checks.phoneVerified;

    let forcedStatus: SellerVerificationStatus | undefined;
    let rejectionReason: string | null = null;

    if (eventName === 'inquiry.approved') {
      checks.governmentIdVerified = true;
      checks.selfieVerified = true;
      checks.addressVerified = true;
      checks.phoneVerified = true;
    } else if (eventName === 'inquiry.declined' && !alreadyApprovedByProvider) {
      forcedStatus = SellerVerificationStatus.REJECTED;
      rejectionReason = 'Persona verification was declined.';
    } else if (eventName === 'inquiry.failed' && !alreadyApprovedByProvider) {
      forcedStatus = SellerVerificationStatus.REJECTED;
      rejectionReason = 'Persona verification failed.';
    }

    await applyAutomatedKycResult({
      sellerId,
      provider: SellerKycProvider.PERSONA,
      providerStatus,
      providerAccountId: existing?.providerAccountId ?? null,
      providerInquiryId: inquiryId,
      providerVerificationId: existing?.providerVerificationId ?? inquiryId,
      webhookEventId: payload.data?.id ?? null,
      checks,
      forcedStatus,
      rejectionReason,
    });

    return new NextResponse('ok', { status: 200 });
  } catch (err) {
    logError('Unhandled Persona webhook error', err, { tag: 'kyc/webhook/persona/POST' });
    return new NextResponse('Server error', { status: 500 });
  }
}
