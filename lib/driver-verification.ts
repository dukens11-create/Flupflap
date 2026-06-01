import { getCloudinary } from '@/lib/cloudinary';

export * from '@/lib/driver-verification-shared';

export const DRIVER_VERIFICATION_UPLOAD_FOLDER =
  process.env.CLOUDINARY_DRIVER_VERIFICATION_FOLDER ?? 'flupflap/driver-verification';

export async function uploadDriverVerificationDocument(file: File, publicIdPrefix: string) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const cloudinary = getCloudinary();

  return new Promise<{ publicId: string; format: string | null }>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: DRIVER_VERIFICATION_UPLOAD_FOLDER,
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
  });
}

export function getSignedDriverVerificationDocumentUrl(publicId: string, format?: string | null) {
  return getCloudinary().url(publicId, {
    secure: true,
    sign_url: true,
    type: 'authenticated',
    resource_type: 'image',
    format: format ?? undefined,
  });
}
