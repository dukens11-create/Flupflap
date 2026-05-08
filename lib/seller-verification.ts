import type {
  SellerAdminFallbackStatus,
  SellerKycProvider,
  SellerPhoneVerificationStatus,
  SellerVerificationStatus,
} from '@prisma/client';
import { getCloudinary } from '@/lib/cloudinary';

export const SELLER_VERIFICATION_UPLOAD_FOLDER =
  process.env.CLOUDINARY_VERIFICATION_FOLDER ?? 'flupflap/seller-verification';

export type SellerVerificationDocumentKind = 'front' | 'back' | 'selfie';

export function getDefaultSellerKycProvider(): SellerKycProvider {
  const configured = (process.env.KYC_PROVIDER ?? 'stripe').trim().toLowerCase();
  if (configured === 'persona') return 'PERSONA';
  if (configured === 'manual') return 'MANUAL';
  return 'STRIPE';
}

export function sellerKycProviderLabel(provider?: SellerKycProvider | null) {
  if (provider === 'PERSONA') return 'Persona';
  if (provider === 'MANUAL') return 'Manual review';
  return 'Stripe Identity + Connect';
}

export function isSellerVerificationApproved(
  verification?:
    | SellerVerificationStatus
    | {
      status?: SellerVerificationStatus | null;
      eligibleToListAt?: Date | null;
      adminFallbackStatus?: SellerAdminFallbackStatus | null;
    }
    | null,
) {
  if (!verification) return false;

  const status = typeof verification === 'string' ? verification : verification.status;
  if (status !== 'APPROVED') return false;
  if (typeof verification === 'string') return true;

  // Admin fallback approvals should unlock listing even if provider-side
  // eligibility timestamps are missing or delayed.
  if (verification.adminFallbackStatus === 'APPROVED') return true;
  return Boolean(verification.eligibleToListAt);
}

export function sellerVerificationStatusTone(
  status?: SellerVerificationStatus | null,
) {
  if (status === 'APPROVED') return 'badge-green';
  if (status === 'REJECTED') return 'badge-red';
  if (status === 'PENDING') return 'badge-yellow';
  return 'badge-slate';
}

export function sellerPhoneVerificationLabel(
  status?: SellerPhoneVerificationStatus | null,
) {
  if (status === 'VERIFIED') return 'Verified';
  if (status === 'PENDING') return 'Pending';
  return 'Not started';
}

export async function uploadSellerVerificationDocument(
  file: File,
  publicIdPrefix: string,
) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const cloudinary = getCloudinary();

  return new Promise<{ publicId: string; format: string | null }>(
    (resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: SELLER_VERIFICATION_UPLOAD_FOLDER,
            resource_type: 'image',
            type: 'authenticated',
            public_id: publicIdPrefix,
            overwrite: true,
          },
          (err, result) => {
            if (err || !result) {
              reject(err ?? new Error('No result from Cloudinary'));
              return;
            }

            resolve({
              publicId: result.public_id,
              format: result.format ?? null,
            });
          },
        )
        .end(buffer);
    },
  );
}

export function getSignedSellerVerificationDocumentUrl(
  publicId: string,
  format?: string | null,
) {
  return getCloudinary().url(publicId, {
    secure: true,
    sign_url: true,
    type: 'authenticated',
    resource_type: 'image',
    format: format ?? undefined,
  });
}
