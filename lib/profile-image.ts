export const PROFILE_IMAGE_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_IMAGE_UPLOAD_FOLDER = 'flupflap/profile-images';

export function isAllowedProfileImageType(fileType: string) {
  return PROFILE_IMAGE_ALLOWED_TYPES.includes(fileType as (typeof PROFILE_IMAGE_ALLOWED_TYPES)[number]);
}

export function getProfileImageValidationError(file: File) {
  if (!isAllowedProfileImageType(file.type)) {
    return 'Unsupported file type. Please upload a JPEG, PNG, WebP, or GIF.';
  }
  if (file.size > PROFILE_IMAGE_MAX_BYTES) {
    return 'File is too large. Maximum size is 5 MB.';
  }
  return null;
}

