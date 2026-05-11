export const MAX_PRODUCT_IMAGES = 6;
export const MAX_PRODUCT_VIDEOS = 1;
export const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_PRODUCT_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB

export const PRODUCT_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const PRODUCT_VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;

export function getProductMediaFolder() {
  return (
    process.env.CLOUDINARY_PRODUCT_MEDIA_FOLDER ??
    process.env.CLOUDINARY_UPLOAD_FOLDER ??
    'flupflap/products'
  );
}

export function getProductMediaKind(contentType: string) {
  if (PRODUCT_IMAGE_TYPES.includes(contentType as (typeof PRODUCT_IMAGE_TYPES)[number])) {
    return 'image' as const;
  }

  if (PRODUCT_VIDEO_TYPES.includes(contentType as (typeof PRODUCT_VIDEO_TYPES)[number])) {
    return 'video' as const;
  }

  return null;
}

export function getProductMediaMaxBytes(contentType: string) {
  return getProductMediaKind(contentType) === 'video'
    ? MAX_PRODUCT_VIDEO_BYTES
    : MAX_PRODUCT_IMAGE_BYTES;
}

export function getProductMediaUploadError(contentType: string) {
  if (getProductMediaKind(contentType) === 'video') {
    return 'Unsupported video format. Please upload MP4, MOV, or WebM.';
  }

  return 'Unsupported image format. Please upload JPEG, PNG, WebP, or GIF.';
}
