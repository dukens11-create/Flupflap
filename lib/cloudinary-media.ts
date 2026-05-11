import { getCloudinary, getCloudinaryEnvConfig } from '@/lib/cloudinary';

type CloudinaryImageRef = {
  publicId: string;
  version?: number;
};

export type CloudinaryImageVariants = {
  originalUrl: string;
  enhancedUrl: string;
  thumbnailUrl: string;
};

const ENHANCED_IMAGE_MAX_WIDTH = 1400;
const ENHANCED_IMAGE_MAX_HEIGHT = 1400;
const DELIVERY_OPTIMIZATION = {
  fetch_format: 'auto' as const,
  quality: 'auto' as const,
  dpr: 'auto' as const,
};

function parseCloudinaryImageRef(imageUrl: string): CloudinaryImageRef | null {
  const env = getCloudinaryEnvConfig();
  if (!env) return null;

  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return null;
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 5 || segments[0] !== env.cloudName) return null;

  const uploadIndex = segments.indexOf('upload');
  if (uploadIndex < 2) return null;
  if (segments[uploadIndex - 1] !== 'image') return null;

  const afterUpload = segments.slice(uploadIndex + 1);
  if (!afterUpload.length) return null;

  let assetSegments = afterUpload;
  const versionIndex = afterUpload.findIndex((part) => /^v\d+$/.test(part));
  let version: number | undefined;
  if (versionIndex >= 0) {
    const versionRaw = afterUpload[versionIndex];
    const parsedVersion = Number(versionRaw.slice(1));
    if (Number.isFinite(parsedVersion) && parsedVersion > 0) {
      version = parsedVersion;
    }
    assetSegments = afterUpload.slice(versionIndex + 1);
  } else if (afterUpload.length > 1) {
    // Best-effort fallback for URLs without version.
    const firstLikelyPublicIdIndex = afterUpload.findIndex((segment) => !segment.includes(','));
    assetSegments =
      firstLikelyPublicIdIndex >= 0 ? afterUpload.slice(firstLikelyPublicIdIndex) : [afterUpload[afterUpload.length - 1]];
  }

  if (!assetSegments.length) return null;

  const withExtension = assetSegments.join('/');
  const lastDot = withExtension.lastIndexOf('.');
  const publicId = lastDot > 0 ? withExtension.slice(0, lastDot) : withExtension;
  if (!publicId) return null;

  return { publicId, version };
}

export function buildCloudinaryImageVariants(
  sourceImageUrl: string,
  options?: { hdUpscale?: boolean },
): CloudinaryImageVariants | null {
  const ref = parseCloudinaryImageRef(sourceImageUrl);
  if (!ref) return null;

  const cloudinary = getCloudinary();
  const hdUpscale = !!options?.hdUpscale;

  const originalUrl = cloudinary.url(ref.publicId, {
    resource_type: 'image',
    secure: true,
    ...DELIVERY_OPTIMIZATION,
    ...(ref.version ? { version: ref.version } : {}),
    transformation: [{ crop: 'limit', width: ENHANCED_IMAGE_MAX_WIDTH, height: ENHANCED_IMAGE_MAX_HEIGHT }],
  });

  const enhancedTransforms: Array<Record<string, string | number>> = [
    { effect: 'background_removal' },
    { effect: 'sharpen' },
    { effect: 'auto_brightness' },
    { effect: 'auto_contrast' },
    {
      crop: 'auto',
      gravity: 'auto',
      width: ENHANCED_IMAGE_MAX_WIDTH,
      height: ENHANCED_IMAGE_MAX_HEIGHT,
    },
  ];
  if (hdUpscale) {
    enhancedTransforms.push({ effect: 'upscale' });
  }
  enhancedTransforms.push(DELIVERY_OPTIMIZATION);

  const enhancedUrl = cloudinary.url(ref.publicId, {
    resource_type: 'image',
    secure: true,
    ...(ref.version ? { version: ref.version } : {}),
    transformation: enhancedTransforms,
  });

  const thumbnailUrl = cloudinary.url(ref.publicId, {
    resource_type: 'image',
    secure: true,
    fetch_format: DELIVERY_OPTIMIZATION.fetch_format,
    quality: DELIVERY_OPTIMIZATION.quality,
    ...(ref.version ? { version: ref.version } : {}),
    transformation: [{ crop: 'fill', gravity: 'auto', width: 420, height: 420 }],
  });

  return { originalUrl, enhancedUrl, thumbnailUrl };
}
