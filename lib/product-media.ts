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

const DEFAULT_PRODUCTS_FOLDER = 'flupflap/products';
const DEFAULT_VIDEOS_FOLDER = 'flupflap/videos';
const DEFAULT_USERS_FOLDER = 'flupflap/users';
const DEFAULT_THUMBNAILS_FOLDER = 'flupflap/thumbnails';

export function getCloudinaryProductsFolder() {
  return process.env.CLOUDINARY_PRODUCTS_FOLDER?.trim()
    || process.env.CLOUDINARY_PRODUCT_MEDIA_FOLDER?.trim()
    || DEFAULT_PRODUCTS_FOLDER;
}

export function getCloudinaryVideosFolder() {
  return process.env.CLOUDINARY_VIDEOS_FOLDER?.trim() || DEFAULT_VIDEOS_FOLDER;
}

export function getCloudinaryUsersFolder() {
  return process.env.CLOUDINARY_USERS_FOLDER?.trim() || DEFAULT_USERS_FOLDER;
}

export function getCloudinaryThumbnailsFolder() {
  return process.env.CLOUDINARY_THUMBNAILS_FOLDER?.trim() || DEFAULT_THUMBNAILS_FOLDER;
}

export function getProductMediaFolderByKind(mediaKind: 'image' | 'video') {
  return mediaKind === 'video' ? getCloudinaryVideosFolder() : getCloudinaryProductsFolder();
}

export function getProductMediaFolder(contentType?: string) {
  if (contentType) {
    const mediaKind = getProductMediaKind(contentType);
    if (mediaKind) {
      return getProductMediaFolderByKind(mediaKind);
    }
  }
  return getCloudinaryProductsFolder();
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
