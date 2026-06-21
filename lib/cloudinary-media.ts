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

// Listing upload delivery target: large enough for product zoom while still optimized.
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

/**
 * Build an AI-enhanced Cloudinary URL for a product video.
 * Applies sharpening + quality optimisation and transcodes to MP4 for
 * maximum browser compatibility.  The URL is computed via Cloudinary's
 * on-the-fly transformation pipeline — no server-side upload is needed.
 *
 * Returns null when the URL is not a recognised Cloudinary video URL or when
 * the Cloudinary environment is not configured.
 */
export function buildCloudinaryVideoEnhancedUrl(videoUrl: string): string | null {
  const env = getCloudinaryEnvConfig();
  if (!env) return null;

  let parsed: URL;
  try {
    parsed = new URL(videoUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.cloudinary.com')) return null;

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 4) return null;

  const uploadIndex = segments.indexOf('upload');
  if (uploadIndex < 0) return null;

  // Expect: /{cloudName}/video/upload/[v{version}]/public_id.ext
  const resourceType = segments[uploadIndex - 1];
  if (resourceType !== 'video') return null;

  const afterUpload = segments.slice(uploadIndex + 1);

  let version: number | undefined;
  let assetSegments = afterUpload;
  const versionIndex = afterUpload.findIndex((part) => /^v\d+$/.test(part));
  if (versionIndex >= 0) {
    const parsedVersion = Number(afterUpload[versionIndex].slice(1));
    if (Number.isFinite(parsedVersion) && parsedVersion > 0) {
      version = parsedVersion;
    }
    assetSegments = afterUpload.slice(versionIndex + 1);
  }

  const withExtension = assetSegments.join('/');
  const lastDot = withExtension.lastIndexOf('.');
  const publicId = lastDot > 0 ? withExtension.slice(0, lastDot) : withExtension;
  if (!publicId) return null;

  const cloudinary = getCloudinary();
  return cloudinary.url(publicId, {
    secure: true,
    resource_type: 'video',
    type: 'upload',
    ...(version ? { version } : {}),
    transformation: [
      { effect: 'sharpen' },
      { quality: 'auto:good' },
    ],
    format: 'mp4',
  });
}
