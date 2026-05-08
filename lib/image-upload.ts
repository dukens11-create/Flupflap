import { getCloudinary } from '@/lib/cloudinary';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Uploads the provided image file to Cloudinary in the given folder and returns
 * the resulting secure URL payload. Throws when Cloudinary does not return a
 * result or when the underlying upload fails.
 */
export async function uploadImageToCloudinary(file: File, folder: string) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const cloudinary = getCloudinary();

  return new Promise<{ secure_url: string }>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder, resource_type: 'image' }, (err, res) => {
        if (err || !res) reject(err ?? new Error('No result from Cloudinary'));
        else resolve(res as { secure_url: string });
      })
      .end(buffer);
  });
}
