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

type AiListingApiPayload = {
  data?: unknown;
  error?: unknown;
};

function getAiListingErrorMessage(error: unknown): string | undefined {
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return undefined;
}

export function sanitizeMediaUploadState(state: unknown): MediaUploadState {
  if (!state || typeof state !== 'object') {
    return { ...EMPTY_MEDIA_UPLOAD_STATE };
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

export function parseAiListingApiPayload(payloadRaw: unknown): {
  data: Record<string, unknown> | null;
  errorMessage?: string;
} {
  if (!payloadRaw || typeof payloadRaw !== 'object') {
    return { data: null };
  }

  const payload = payloadRaw as AiListingApiPayload;
  const data =
    payload.data && typeof payload.data === 'object'
      ? (payload.data as Record<string, unknown>)
      : null;
  const errorMessage = getAiListingErrorMessage(payload.error);

  return { data, errorMessage };
}
