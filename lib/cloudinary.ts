import { v2 as cloudinaryV2 } from 'cloudinary';

function getCloudinary() {
  // Rely on Cloudinary's own config state instead of a separate flag —
  // this is idempotent and safe across concurrent invocations.
  if (!cloudinaryV2.config().cloud_name) {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error(
        '[cloudinary] CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET must be set.'
      );
    }

    cloudinaryV2.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  }
  return cloudinaryV2;
}

/** Returns true when Cloudinary env vars are all present. */
export function isCloudinaryConfigured() {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

export { getCloudinary };
