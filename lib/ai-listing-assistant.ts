import type { MediaUploadState } from '@/components/MediaUpload';

const EMPTY_MEDIA_UPLOAD_STATE: MediaUploadState = {
  imageCount: 0,
  uploadedImageCount: 0,
  isUploading: false,
  isEnhancing: false,
  hasErrors: false,
  canSubmit: false,
  message: 'Please upload at least one image.',
  uploadedImageUrls: [],
};

export function sanitizeMediaUploadState(state: unknown): MediaUploadState {
  if (!state || typeof state !== 'object') {
    return { ...EMPTY_MEDIA_UPLOAD_STATE, uploadedImageUrls: [] };
  }

  const candidate = state as Partial<MediaUploadState>;
  const uploadedImageUrls = Array.isArray(candidate.uploadedImageUrls)
    ? candidate.uploadedImageUrls.filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
    : [];

  return {
    imageCount: typeof candidate.imageCount === 'number' ? candidate.imageCount : 0,
    uploadedImageCount: typeof candidate.uploadedImageCount === 'number' ? candidate.uploadedImageCount : uploadedImageUrls.length,
    isUploading: !!candidate.isUploading,
    isEnhancing: !!candidate.isEnhancing,
    hasErrors: !!candidate.hasErrors,
    canSubmit: !!candidate.canSubmit,
    message: typeof candidate.message === 'string' ? candidate.message : '',
    uploadedImageUrls,
  };
}
