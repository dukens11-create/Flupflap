import { v2 as cloudinaryV2 } from 'cloudinary';

type CloudinaryEnvConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

function hasCloudinaryEnvValue(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function readCloudinaryEnvConfig(): CloudinaryEnvConfig | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  if (!hasCloudinaryEnvValue(cloudName) || !hasCloudinaryEnvValue(apiKey) || !hasCloudinaryEnvValue(apiSecret)) {
    return null;
  }

  return { cloudName, apiKey, apiSecret };
}

function getCloudinary() {
  // Rely on Cloudinary's own config state instead of a separate flag —
  // this is idempotent and safe across concurrent invocations.
  if (!cloudinaryV2.config().cloud_name) {
    const config = readCloudinaryEnvConfig();
    if (!config) {
      throw new Error(
        '[cloudinary] CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET must be set.'
      );
    }

    cloudinaryV2.config({
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      api_secret: config.apiSecret,
    });
  }
  return cloudinaryV2;
}

/** Returns true when Cloudinary env vars are all present. */
export function isCloudinaryConfigured() {
  return !!readCloudinaryEnvConfig();
}

export function getCloudinaryEnvConfig() {
  return readCloudinaryEnvConfig();
}

/** Safe diagnostic log for deployment troubleshooting (never logs raw secret values). */
export function logCloudinaryConfigStatus() {
  console.log('Cloudinary config exists', {
    cloudName: hasCloudinaryEnvValue(process.env.CLOUDINARY_CLOUD_NAME),
    apiKey: hasCloudinaryEnvValue(process.env.CLOUDINARY_API_KEY),
    apiSecret: hasCloudinaryEnvValue(process.env.CLOUDINARY_API_SECRET),
  });
}

export { getCloudinary };
