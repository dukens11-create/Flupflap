import type {
  SellerPhoneVerificationStatus,
  SellerVerificationStatus,
} from '@prisma/client';
import { getCloudinary } from '@/lib/cloudinary';

export const SELLER_VERIFICATION_UPLOAD_FOLDER =
  process.env.CLOUDINARY_VERIFICATION_FOLDER ?? 'flupflap/seller-verification';

export type SellerVerificationDocumentKind = 'front' | 'back' | 'selfie';

export function isSellerVerificationApproved(
  status?: SellerVerificationStatus | null,
) {
  return status === 'APPROVED';
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
