'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_PRODUCT_IMAGES,
  MAX_PRODUCT_IMAGE_BYTES,
  MAX_PRODUCT_VIDEO_BYTES,
  MAX_PRODUCT_VIDEO_DURATION_SECONDS,
  PRODUCT_IMAGE_TYPES,
  PRODUCT_VIDEO_TYPES,
} from '@/lib/product-media';

interface MediaUploadProps {
  /** Existing image URLs for edit forms. */
  defaultImages?: string[];
  /** Existing original image URLs (optional, for enhanced media forms). */
  defaultOriginalImages?: string[];
  /** Existing enhanced image URLs (optional, for enhanced media forms). */
  defaultEnhancedImages?: string[];
  /** Existing image thumbnail URLs (optional, for enhanced media forms). */
  defaultImageThumbnails?: string[];
  /** Existing video URL for edit forms. */
  defaultVideoUrl?: string;
  /** Whether at least one image is required. */
  required?: boolean;
  /** Optional callback for parent forms that need media readiness state. */
  onStateChange?: (state: MediaUploadState) => void;
}

type UploadStatus = 'uploading' | 'uploaded' | 'error';

type ImageUploadItem = {
  id: string;
  previewUrl: string;
  safePreviewUrl: string;
  uploadedUrl: string;
  originalUrl: string;
  enhancedUrl: string;
  thumbnailUrl: string;
  selectedVariant: 'original' | 'enhanced';
  enhancementStatus: 'idle' | 'processing' | 'ready' | 'error';
  fileName: string;
  fileSize: number | null;
  sourceFile: File | null;
  status: UploadStatus;
  error?: string;
};

type VideoUploadItem = {
  id: string;
  previewUrl: string;
  safePreviewUrl: string;
  uploadedUrl: string;
  fileName: string;
  fileSize: number | null;
  sourceFile: File | null;
  previewKind: 'object-url' | 'remote-url';
  status: UploadStatus;
  error?: string;
  aiEnhancementStatus: 'idle' | 'processing' | 'ready' | 'error';
  aiEnhancedUrl?: string;
};

type RecordingState = 'idle' | 'requesting' | 'ready' | 'recording' | 'reviewing' | 'error';
type CameraFacingMode = 'user' | 'environment';

export type MediaUploadState = {
  imageCount: number;
  uploadedImageCount: number;
  isUploading: boolean;
  isEnhancing: boolean;
  hasErrors: boolean;
  canSubmit: boolean;
  message: string;
  /** Resolved URLs of all successfully uploaded images (original or enhanced variant). */
  uploadedImageUrls: string[];
};

function getFileNameFromUrl(url: string) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() || 'Unknown filename');
  } catch {
    return decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'Unknown filename');
  }
}

function getFileSizeDisplay(bytes: number | null) {
  if (bytes === null) return 'Uploaded';
  if (bytes < 1024) return `${bytes} B`;

  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;

  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

function getSafePreviewUrl(url: string) {
  if (!url) return '';

  if (url.startsWith('blob:')) {
    return url;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return '';
  }

  return '';
}

function getSkippedUploadMessage(skippedCount: number, uploadableCount: number) {
  const maxImageMb = Math.round(MAX_PRODUCT_IMAGE_BYTES / (1024 * 1024));
  if (!skippedCount) return '';
  if (!uploadableCount) {
    return skippedCount === 1
      ? `The selected file could not be uploaded. Please choose a valid image under ${maxImageMb} MB.`
      : `${skippedCount} files could not be uploaded. Please choose valid images under ${maxImageMb} MB.`;
  }
  return skippedCount === 1
    ? '1 file was skipped because it is invalid or too large.'
    : `${skippedCount} files were skipped because they are invalid or too large.`;
}

function getUploadProgressMessage(imageEnhancingCount: number, videoEnhancing: boolean): string {
  if (imageEnhancingCount > 0) return 'Enhancing images…';
  if (videoEnhancing) return 'AI enhancing video…';
  return 'Uploading media…';
}

function getMediaStatusMessage(
  required: boolean | undefined,
  imageCount: number,
  imageUploadCount: number,
  imageEnhancingCount: number,
  videoUploading: boolean,
  hasMediaErrors: boolean,
  firstItemError: string
) {  if (imageUploadCount > 0 || videoUploading) {
    return 'Please wait for your selected media to finish uploading.';
  }

  if (imageEnhancingCount > 0) {
    return 'Generating AI-enhanced image previews…';
  }

  if (hasMediaErrors) {
    return firstItemError || 'Please fix the media upload error before submitting.';
  }

  if (required && imageCount === 0) {
    return 'Please upload at least one image.';
  }

  return '';
}

/**
 * Multi-image + video upload component.
 * – Up to 12 images: multi-select, preview, remove, reorder
 * – Up to 1 video: preview and remove
 * Hidden inputs (name="images", name="imageUrl", name="videoUrl") carry the
 * resolved Cloudinary URLs to the enclosing form POST.
 */
export default function MediaUpload({
  defaultImages = [],
  defaultOriginalImages = [],
  defaultEnhancedImages = [],
  defaultImageThumbnails = [],
  defaultVideoUrl = '',
  required,
  onStateChange,
}: MediaUploadProps) {
  const fallbackIdCounterRef = useRef(0);
  const createItemId = useCallback(() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    // Fallback for environments without crypto.randomUUID (very old browsers).
    // IDs are used only as React list keys, not for security-sensitive purposes.
    fallbackIdCounterRef.current += 1;
    return `${Date.now()}-${fallbackIdCounterRef.current}-${Math.random().toString(36).slice(2, 10)}`;
  }, []);
  const [images, setImages] = useState<ImageUploadItem[]>(() =>
    defaultImages.map((url, index) => {
      const originalUrl = defaultOriginalImages[index] || url;
      const enhancedUrl = defaultEnhancedImages[index] || '';
      // If the saved form image matches the enhanced URL, keep "After" selected.
      const selectedVariant: 'original' | 'enhanced' = enhancedUrl && url === enhancedUrl ? 'enhanced' : 'original';
      const selectedUrl = selectedVariant === 'enhanced' ? enhancedUrl : originalUrl;
      return {
        id: createItemId(),
        previewUrl: selectedUrl,
        safePreviewUrl: getSafePreviewUrl(selectedUrl),
        uploadedUrl: originalUrl,
        originalUrl,
        enhancedUrl,
        thumbnailUrl: defaultImageThumbnails[index] || '',
        selectedVariant,
        enhancementStatus: enhancedUrl ? ('ready' as const) : ('idle' as const),
        fileName: getFileNameFromUrl(selectedUrl),
        fileSize: null,
        sourceFile: null,
        status: 'uploaded' as const,
      };
    })
  );
  const [video, setVideo] = useState<VideoUploadItem | null>(() =>
    defaultVideoUrl
      ? {
          id: createItemId(),
          previewUrl: defaultVideoUrl,
          safePreviewUrl: getSafePreviewUrl(defaultVideoUrl),
          uploadedUrl: defaultVideoUrl,
          fileName: getFileNameFromUrl(defaultVideoUrl),
          fileSize: null,
          sourceFile: null,
          previewKind: 'remote-url',
          status: 'uploaded' as const,
          aiEnhancementStatus: 'ready' as const,
          aiEnhancedUrl: defaultVideoUrl,
        }
      : null
  );
  const [uploadError, setUploadError] = useState('');
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const [hdUpscale, setHdUpscale] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [cameraFacingMode, setCameraFacingMode] = useState<CameraFacingMode>('environment');
  const [recordingCountdown, setRecordingCountdown] = useState(MAX_PRODUCT_VIDEO_DURATION_SECONDS);
  const [recordingError, setRecordingError] = useState('');
  const [reviewBlobUrl, setReviewBlobUrl] = useState('');
  const [reviewBlob, setReviewBlob] = useState<Blob | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    const element = videoPreviewRef.current;
    if (!element) return;

    if (video?.previewKind === 'object-url' && video.previewUrl) {
      element.src = video.previewUrl;
    } else {
      element.removeAttribute('src');
    }

    element.load();
  }, [video]);

  useEffect(() => {
    const el = liveVideoRef.current;
    if (!el || !mediaStreamRef.current) return;
    if (recordingState === 'ready' || recordingState === 'recording') {
      el.srcObject = mediaStreamRef.current;
    }
  }, [recordingState]);

  function isValidUploadConfig(value: unknown): value is {
    apiKey: string;
    folder: string;
    signature: string;
    timestamp: number;
    uploadUrl: string;
  } {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.apiKey === 'string' &&
      candidate.apiKey.length > 0 &&
      typeof candidate.folder === 'string' &&
      candidate.folder.length > 0 &&
      typeof candidate.signature === 'string' &&
      candidate.signature.length > 0 &&
      typeof candidate.timestamp === 'number' &&
      typeof candidate.uploadUrl === 'string' &&
      candidate.uploadUrl.length > 0
    );
  }

  function getCloudinaryErrorMessage(response: unknown) {
    if (!response || typeof response !== 'object' || !('error' in response)) {
      return undefined;
    }
    const error = (response as { error?: unknown }).error;
    if (!error || typeof error !== 'object' || !('message' in error)) {
      return undefined;
    }
    return typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : undefined;
  }

  async function readJsonSafe(res: Response) {
    try {
      return await res.json();
    } catch (error) {
      console.warn('[MediaUpload] Failed to parse upload response as JSON.', error);
      return null;
    }
  }

  function getApiErrorMessage(json: unknown, fallback: string) {
    if (!json || typeof json !== 'object') return fallback;
    const candidate = json as { message?: unknown };
    return typeof candidate.message === 'string' && candidate.message.trim() ? candidate.message : fallback;
  }

  async function getUploadConfig(file: File) {
    const res = await fetch('/api/upload/product-media', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: file.type, fileSize: file.size }),
    });
    const json = await readJsonSafe(res);
    if (!res.ok || !json?.success) {
      throw new Error(getApiErrorMessage(json, 'Upload failed.'));
    }
    if (!isValidUploadConfig(json)) {
      throw new Error('Upload configuration is invalid. Please try again.');
    }
    return json;
  }

  function getSelectedImageUrl(image: ImageUploadItem) {
    if (image.selectedVariant === 'enhanced' && image.enhancedUrl) return image.enhancedUrl;
    return image.originalUrl || image.uploadedUrl;
  }

  async function getEnhancedVariants(imageUrl: string, enableUpscale: boolean) {
    const res = await fetch('/api/upload/product-media/enhance', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl, hdUpscale: enableUpscale }),
    });
    const json = await readJsonSafe(res);
    if (!res.ok || !json?.success) {
      throw new Error(getApiErrorMessage(json, 'Failed to enhance image.'));
    }
    if (
      typeof json.originalUrl !== 'string' ||
      typeof json.enhancedUrl !== 'string' ||
      typeof json.thumbnailUrl !== 'string'
    ) {
      throw new Error('Received invalid media enhancement response.');
    }
    return {
      originalUrl: json.originalUrl,
      enhancedUrl: json.enhancedUrl,
      thumbnailUrl: json.thumbnailUrl,
    };
  }

  async function enhanceVideo(url: string): Promise<string | null> {
    try {
      const res = await fetch('/api/upload/product-media/enhance-video', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: url }),
      });
      const json = await readJsonSafe(res);
      if (!res.ok || !json?.success || typeof json.enhancedUrl !== 'string') return null;
      return json.enhancedUrl;
    } catch {
      return null;
    }
  }

  async function uploadFile(file: File): Promise<string> {
    const uploadConfig = await getUploadConfig(file);
    const timestamp = String(uploadConfig.timestamp);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('api_key', uploadConfig.apiKey);
    fd.append('folder', uploadConfig.folder);
    fd.append('signature', uploadConfig.signature);
    fd.append('timestamp', timestamp);

    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      console.info('[temporary-upload-debug][frontend] product-media-cloudinary-request', {
        uploadUrl: uploadConfig.uploadUrl,
        params: {
          folder: uploadConfig.folder,
          timestamp,
          api_key: uploadConfig.apiKey,
          signature: uploadConfig.signature,
        },
        file: {
          name: file.name,
          type: file.type,
          size: file.size,
        },
      });
      xhr.open('POST', uploadConfig.uploadUrl);
      xhr.responseType = 'json';
      xhr.onerror = () =>
        reject(new Error('Upload failed. Please check your connection and try again.'));
      xhr.onload = () => {
        const response = xhr.response;
        if (xhr.status >= 200 && xhr.status < 300 && response?.secure_url) {
          resolve(response.secure_url as string);
          return;
        }
        reject(new Error(getCloudinaryErrorMessage(response) ?? 'Upload failed.'));
      };
      xhr.send(fd);
    });
  }

  function startImageUpload(itemId: string, file: File, enableUpscale: boolean) {
    uploadFile(file)
      .then((url) => {
        setImages((prev) =>
          prev.map((image) =>
            image.id === itemId
              ? {
                  ...image,
                  uploadedUrl: url,
                  originalUrl: url,
                  selectedVariant: 'original',
                  status: 'uploaded',
                  enhancementStatus: 'processing',
                  error: undefined,
                }
              : image,
          ),
        );

        return getEnhancedVariants(url, enableUpscale)
          .then((variants) => {
            setImages((prev) =>
              prev.map((image) => {
                if (image.id !== itemId) return image;
                return {
                  ...image,
                  originalUrl: variants.originalUrl,
                  enhancedUrl: variants.enhancedUrl,
                  thumbnailUrl: variants.thumbnailUrl,
                  selectedVariant: 'enhanced',
                  enhancementStatus: 'ready',
                  error: undefined,
                };
              }),
            );
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'AI enhancement failed.';
            setImages((prev) =>
              prev.map((image) =>
                image.id === itemId
                  ? {
                      ...image,
                      enhancementStatus: 'error',
                      selectedVariant: 'original',
                      error: msg,
                    }
                  : image,
              ),
            );
            setUploadError(msg);
          });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Upload failed.';
        setImages((prev) =>
          prev.map((image) => (image.id === itemId ? { ...image, status: 'error', error: msg } : image)),
        );
        setUploadError(msg);
      });
  }

  async function handleImageFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const validFiles = files.filter(
      (file) =>
        PRODUCT_IMAGE_TYPES.includes(file.type as (typeof PRODUCT_IMAGE_TYPES)[number]) &&
        file.size > 0 &&
        file.size <= MAX_PRODUCT_IMAGE_BYTES,
    );
    const skippedCount = files.length - validFiles.length;

    const remaining = MAX_PRODUCT_IMAGES - images.length;
    if (remaining <= 0) {
      setUploadError(`Maximum ${MAX_PRODUCT_IMAGES} images allowed.`);
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }

    if (!validFiles.length) {
      setUploadError(getSkippedUploadMessage(skippedCount || files.length, 0));
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }

    const toUpload = validFiles.slice(0, remaining);
    const skippedBecauseLimit = validFiles.length - toUpload.length;
    const totalSkipped = skippedCount + (skippedBecauseLimit > 0 ? skippedBecauseLimit : 0);
    setUploadError(getSkippedUploadMessage(totalSkipped, toUpload.length));

    const nextItems = toUpload.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);

      return {
        id: createItemId(),
        previewUrl,
        safePreviewUrl: previewUrl,
        uploadedUrl: '',
        originalUrl: '',
        enhancedUrl: '',
        thumbnailUrl: '',
        selectedVariant: 'original' as const,
        enhancementStatus: 'idle' as const,
        fileName: file.name,
        fileSize: file.size,
        sourceFile: file,
        status: 'uploading' as const,
      };
    });

    setImages((prev) => [...prev, ...nextItems]);
    if (imageInputRef.current) imageInputRef.current.value = '';
    nextItems.forEach((item, index) => startImageUpload(item.id, toUpload[index], hdUpscale));
  }

  async function handleVideoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!PRODUCT_VIDEO_TYPES.includes(file.type as (typeof PRODUCT_VIDEO_TYPES)[number])) {
      setUploadError('Unsupported video format. Please upload MP4, MOV, or WebM.');
      if (videoInputRef.current) videoInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_PRODUCT_VIDEO_BYTES) {
      setUploadError('Video is too large. Maximum size is 200 MB.');
      if (videoInputRef.current) videoInputRef.current.value = '';
      return;
    }

    // Client-side duration validation via HTML5 video metadata.
    const tempObjectUrl = URL.createObjectURL(file);
    let detectedDuration = 0;
    try {
      detectedDuration = await new Promise<number>((resolve) => {
        const el = document.createElement('video');
        el.preload = 'metadata';
        const timeout = setTimeout(() => resolve(0), 5000);
        el.onloadedmetadata = () => { clearTimeout(timeout); resolve(el.duration); };
        el.onerror = () => { clearTimeout(timeout); resolve(0); };
        el.src = tempObjectUrl; // LGTM[js/xss-through-dom] — blob: URL from createObjectURL, not user text
      });
    } finally {
      URL.revokeObjectURL(tempObjectUrl);
    }

    if (detectedDuration > MAX_PRODUCT_VIDEO_DURATION_SECONDS) {
      setUploadError(
        `Video is too long (${Math.ceil(detectedDuration)}s). Maximum is ${MAX_PRODUCT_VIDEO_DURATION_SECONDS}s.`,
      );
      if (videoInputRef.current) videoInputRef.current.value = '';
      return;
    }

    setUploadError('');
    if (video?.previewKind === 'object-url' && objectUrlsRef.current.has(video.previewUrl)) {
      objectUrlsRef.current.delete(video.previewUrl);
      URL.revokeObjectURL(video.previewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    objectUrlsRef.current.add(previewUrl);
    const nextVideo: VideoUploadItem = {
      id: createItemId(),
      previewUrl,
      safePreviewUrl: previewUrl,
      uploadedUrl: '',
      fileName: file.name,
      fileSize: file.size,
      sourceFile: file,
      previewKind: 'object-url',
      status: 'uploading',
      aiEnhancementStatus: 'idle',
    };

    setVideo(nextVideo);
    if (videoInputRef.current) videoInputRef.current.value = '';

    try {
      const url = await uploadFile(file);
      setVideo((current) =>
        current?.id === nextVideo.id
          ? { ...current, uploadedUrl: url, status: 'uploaded', aiEnhancementStatus: 'processing', error: undefined }
          : current,
      );
      const enhanced = await enhanceVideo(url);
      setVideo((current) =>
        current?.id === nextVideo.id
          ? {
              ...current,
              aiEnhancementStatus: enhanced ? 'ready' : 'error',
              aiEnhancedUrl: enhanced ?? undefined,
            }
          : current,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setVideo((current) =>
        current?.id === nextVideo.id
          ? { ...current, status: 'error', aiEnhancementStatus: 'idle', error: msg }
          : current,
      );
      setUploadError(msg);
    }
  }

  function removeImage(index: number) {
    setImages((prev) => {
      const image = prev[index];
      if (image && objectUrlsRef.current.has(image.previewUrl)) {
        objectUrlsRef.current.delete(image.previewUrl);
        URL.revokeObjectURL(image.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  function moveImage(from: number, to: number) {
    if (to < 0 || to >= images.length) return;
    setImages((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function chooseImageVariant(imageId: string, variant: 'original' | 'enhanced') {
    setImages((prev) =>
      prev.map((image) => {
        if (image.id !== imageId) return image;
        const canUseEnhanced = variant === 'enhanced' && !!image.enhancedUrl;
        return {
          ...image,
          selectedVariant: canUseEnhanced ? 'enhanced' : 'original',
        };
      }),
    );
  }

  async function retryEnhancement(imageId: string) {
    const target = images.find((image) => image.id === imageId);
    if (!target?.originalUrl) return;

    setImages((prev) =>
      prev.map((image) =>
        image.id === imageId ? { ...image, enhancementStatus: 'processing', error: undefined } : image,
      ),
    );

    try {
      const variants = await getEnhancedVariants(target.originalUrl, hdUpscale);
      setImages((prev) =>
        prev.map((image) =>
          image.id === imageId
            ? {
                ...image,
                originalUrl: variants.originalUrl,
                enhancedUrl: variants.enhancedUrl,
                thumbnailUrl: variants.thumbnailUrl,
                selectedVariant: 'enhanced',
                enhancementStatus: 'ready',
                error: undefined,
              }
            : image,
        ),
      );
      setUploadError('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI enhancement failed.';
      setImages((prev) =>
        prev.map((image) =>
          image.id === imageId
            ? {
                ...image,
                enhancementStatus: 'error',
                selectedVariant: 'original',
                error: msg,
              }
            : image,
        ),
      );
      setUploadError(msg);
    }
  }

  function retryImageUpload(imageId: string) {
    const target = images.find((image) => image.id === imageId);
    if (!target?.sourceFile) return;
    setImages((prev) =>
      prev.map((image) =>
        image.id === imageId
          ? {
              ...image,
              status: 'uploading',
              enhancementStatus: 'idle',
              error: undefined,
            }
          : image,
      ),
    );
    setUploadError('');
    startImageUpload(imageId, target.sourceFile, hdUpscale);
  }

  async function retryVideoUpload() {
    const sourceFile = video?.sourceFile;
    if (!video || !sourceFile) return;
    const videoId = video.id;
    setVideo((current) =>
      current?.id === videoId ? { ...current, status: 'uploading', aiEnhancementStatus: 'idle', error: undefined } : current,
    );
    setUploadError('');
    try {
      const url = await uploadFile(sourceFile);
      setVideo((current) =>
        current?.id === videoId
          ? { ...current, uploadedUrl: url, status: 'uploaded', aiEnhancementStatus: 'processing', error: undefined }
          : current,
      );
      const enhanced = await enhanceVideo(url);
      setVideo((current) =>
        current?.id === videoId
          ? {
              ...current,
              aiEnhancementStatus: enhanced ? 'ready' : 'error',
              aiEnhancedUrl: enhanced ?? undefined,
            }
          : current,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setVideo((current) => (current?.id === videoId ? { ...current, status: 'error', aiEnhancementStatus: 'idle', error: msg } : current));
      setUploadError(msg);
    }
  }

  function stopMediaTracks() {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    mediaRecorderRef.current?.stop();
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
  }

  function removeVideo() {
    stopMediaTracks();
    if (reviewBlobUrl && objectUrlsRef.current.has(reviewBlobUrl)) {
      objectUrlsRef.current.delete(reviewBlobUrl);
      URL.revokeObjectURL(reviewBlobUrl);
    }
    setReviewBlobUrl('');
    setReviewBlob(null);
    setRecordingState('idle');
    setRecordingError('');
    setVideo((current) => {
      if (current && objectUrlsRef.current.has(current.previewUrl)) {
        objectUrlsRef.current.delete(current.previewUrl);
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
    if (videoInputRef.current) videoInputRef.current.value = '';
  }

  async function requestCameraAccess() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordingError('Camera recording is not supported in this browser.');
      setRecordingState('error');
      return;
    }
    setRecordingState('requesting');
    setRecordingError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: cameraFacingMode } },
        audio: true,
      });
      mediaStreamRef.current = stream;
      setRecordingState('ready');
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      const msg =
        name === 'NotAllowedError'
          ? 'Camera access denied. Please allow camera and microphone access in your browser settings.'
          : name === 'NotFoundError'
            ? 'No camera found on this device.'
            : err instanceof Error
              ? err.message
              : 'Could not access camera.';
      setRecordingError(msg);
      setRecordingState('error');
    }
  }

  async function switchCamera() {
    if (!mediaStreamRef.current) return;

    const nextFacingMode: CameraFacingMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
    setRecordingError('');

    try {
      const replacementStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacingMode } },
        audio: false,
      });
      const replacementVideoTrack = replacementStream.getVideoTracks()[0];
      if (!replacementVideoTrack) {
        throw new Error('No alternate camera found.');
      }

      const currentStream = mediaStreamRef.current;
      const currentVideoTrack = currentStream.getVideoTracks()[0];
      if (currentVideoTrack) {
        currentStream.removeTrack(currentVideoTrack);
      }
      currentStream.addTrack(replacementVideoTrack);
      if (currentVideoTrack) {
        currentVideoTrack.stop();
      }

      replacementStream.getTracks().forEach((track) => {
        if (track !== replacementVideoTrack) {
          track.stop();
        }
      });

      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = currentStream;
      }
      setCameraFacingMode(nextFacingMode);
      console.info('[MediaUpload] Switched recording camera.', { facingMode: nextFacingMode });
    } catch (err: unknown) {
      console.warn('[MediaUpload] Failed to switch recording camera.', err);
      setRecordingError('Unable to switch camera. Please try again.');
    }
  }

  function startRecording() {
    if (!mediaStreamRef.current) return;
    recordedChunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : '';
    const recorderOptions = mimeType ? { mimeType } : {};
    const recorder = new MediaRecorder(mediaStreamRef.current, recorderOptions);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blobType = recorder.mimeType || 'video/webm';
      const blob = new Blob(recordedChunksRef.current, { type: blobType });
      const url = URL.createObjectURL(blob);
      objectUrlsRef.current.add(url);
      setReviewBlobUrl(url);
      setReviewBlob(blob);
      setRecordingState('reviewing');
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    };

    recorder.start(100);
    setRecordingCountdown(MAX_PRODUCT_VIDEO_DURATION_SECONDS);
    setRecordingState('recording');

    let remaining = MAX_PRODUCT_VIDEO_DURATION_SECONDS;
    recordingTimerRef.current = setInterval(() => {
      remaining -= 1;
      setRecordingCountdown(remaining);
      if (remaining <= 0) stopRecording();
    }, 1000);
  }

  function stopRecording() {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }

  function cancelRecording() {
    stopMediaTracks();
    if (reviewBlobUrl && objectUrlsRef.current.has(reviewBlobUrl)) {
      objectUrlsRef.current.delete(reviewBlobUrl);
      URL.revokeObjectURL(reviewBlobUrl);
    }
    setReviewBlobUrl('');
    setReviewBlob(null);
    setRecordingState('idle');
    setRecordingError('');
  }

  function retakeRecording() {
    if (reviewBlobUrl && objectUrlsRef.current.has(reviewBlobUrl)) {
      objectUrlsRef.current.delete(reviewBlobUrl);
      URL.revokeObjectURL(reviewBlobUrl);
    }
    setReviewBlobUrl('');
    setReviewBlob(null);
    requestCameraAccess();
  }

  async function useRecording() {
    if (!reviewBlob) return;
    const blobType = reviewBlob.type || 'video/webm';
    const ext = blobType.includes('mp4') ? 'mp4' : 'webm';
    const file = new File([reviewBlob], `recording.${ext}`, { type: blobType });

    if (reviewBlobUrl && objectUrlsRef.current.has(reviewBlobUrl)) {
      objectUrlsRef.current.delete(reviewBlobUrl);
      URL.revokeObjectURL(reviewBlobUrl);
    }
    setReviewBlobUrl('');
    setReviewBlob(null);
    setRecordingState('idle');
    setRecordingError('');

    // Remove any existing video before adding the recording
    if (video?.previewKind === 'object-url' && objectUrlsRef.current.has(video.previewUrl)) {
      objectUrlsRef.current.delete(video.previewUrl);
      URL.revokeObjectURL(video.previewUrl);
    }

    setUploadError('');
    const previewUrl = URL.createObjectURL(file);
    objectUrlsRef.current.add(previewUrl);
    const nextVideo: VideoUploadItem = {
      id: createItemId(),
      previewUrl,
      safePreviewUrl: previewUrl,
      uploadedUrl: '',
      fileName: file.name,
      fileSize: file.size,
      sourceFile: file,
      previewKind: 'object-url',
      status: 'uploading',
      aiEnhancementStatus: 'idle',
    };

    setVideo(nextVideo);

    try {
      const url = await uploadFile(file);
      setVideo((current) =>
        current?.id === nextVideo.id
          ? { ...current, uploadedUrl: url, status: 'uploaded', aiEnhancementStatus: 'processing', error: undefined }
          : current,
      );
      const enhanced = await enhanceVideo(url);
      setVideo((current) =>
        current?.id === nextVideo.id
          ? {
              ...current,
              aiEnhancementStatus: enhanced ? 'ready' : 'error',
              aiEnhancedUrl: enhanced ?? undefined,
            }
          : current,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setVideo((current) =>
        current?.id === nextVideo.id
          ? { ...current, status: 'error', aiEnhancementStatus: 'idle', error: msg }
          : current,
      );
      setUploadError(msg);
    }
  }

  function handleImageKeyDown(index: number, event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveImage(index, index - 1);
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      moveImage(index, index + 1);
    }
  }

  const uploadedImageUrls = images.map((image) => getSelectedImageUrl(image)).filter(Boolean);
  const imageUploadCount = images.filter((image) => image.status === 'uploading').length;
  const imageEnhancingCount = images.filter((image) => image.enhancementStatus === 'processing').length;
  const videoUploading = video?.status === 'uploading';
  const videoEnhancing = video?.aiEnhancementStatus === 'processing';
  const hasMediaErrors =
    images.some((image) => image.status === 'error' || image.enhancementStatus === 'error') ||
    video?.status === 'error';
  const firstItemError =
    images.find((image) => image.status === 'error' || image.enhancementStatus === 'error')?.error ??
    video?.error ??
    uploadError;
  const mediaMessage = getMediaStatusMessage(
    required,
    images.length,
    imageUploadCount,
    imageEnhancingCount,
    videoUploading || videoEnhancing,
    hasMediaErrors,
    firstItemError || ''
  );
  const mediaReady =
    uploadedImageUrls.length === images.length &&
    !imageUploadCount &&
    !imageEnhancingCount &&
    !videoUploading &&
    !videoEnhancing &&
    !hasMediaErrors &&
    (!video || !!video.uploadedUrl) &&
    (!required || images.length > 0);
  const mainImage = uploadedImageUrls[0] ?? '';
  const safeUploadedVideoUrl = video ? getSafePreviewUrl(video.uploadedUrl) : '';

  useEffect(() => {
    onStateChange?.({
      imageCount: images.length,
      uploadedImageCount: uploadedImageUrls.length,
      isUploading: imageUploadCount > 0 || videoUploading || videoEnhancing,
      isEnhancing: imageEnhancingCount > 0,
      hasErrors: hasMediaErrors,
      canSubmit: mediaReady,
      message: mediaMessage,
      uploadedImageUrls,
    });
  }, [
    hasMediaErrors,
    imageUploadCount,
    imageEnhancingCount,
    images.length,
    mediaMessage,
    mediaReady,
    onStateChange,
    uploadedImageUrls.length,
    videoUploading,
    videoEnhancing,
  ]);

  return (
    <div className="space-y-4">
      {/* ── Images ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <label className="label">
            Product Images <span className="text-slate-400 font-normal">(1–12, first = thumbnail)</span>
          </label>
          <p className="text-sm text-slate-500">{images.length}/{MAX_PRODUCT_IMAGES} images</p>
        </div>
        <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={hdUpscale}
            onChange={(event) => setHdUpscale(event.target.checked)}
            className="rounded"
          />
          Enable HD upscale for new AI-enhanced images
        </label>

        {images.length > 0 && (
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            {images.map((image, i) => {
              const showRetryButton =
                image.status === 'uploaded' &&
                image.enhancementStatus === 'error' &&
                !!image.originalUrl;
              const showRetryUploadButton = image.status === 'error' && !!image.sourceFile;
              return (
              <div
                key={image.id}
                draggable
                tabIndex={0}
                onDragStart={() => setDraggedImageId(image.id)}
                onDragEnd={() => setDraggedImageId(null)}
                onDragOver={(event) => event.preventDefault()}
                onKeyDown={(event) => handleImageKeyDown(i, event)}
                onDrop={() => {
                  if (!draggedImageId || draggedImageId === image.id) return;
                  const from = images.findIndex((item) => item.id === draggedImageId);
                  if (from >= 0) moveImage(from, i);
                  setDraggedImageId(null);
                }}
                aria-label={`Product image ${i + 1}. Drag to reorder or use arrow keys and move buttons.`}
                className={`rounded-xl border bg-white p-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200 ${draggedImageId === image.id ? 'border-blue-400' : 'border-slate-200'}`}
              >
                <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getSafePreviewUrl(getSelectedImageUrl(image)) || image.safePreviewUrl}
                    alt={`Product image ${i + 1}`}
                    className="h-40 w-full object-contain p-2"
                  />
                  {i === 0 && (
                    <span className="absolute left-2 top-2 rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white">
                      Thumbnail
                    </span>
                  )}
                </div>
                <div className="mt-3 space-y-1">
                  <p className="truncate text-sm font-medium text-slate-900">{image.fileName}</p>
                  <p className="text-xs text-slate-500">{getFileSizeDisplay(image.fileSize)}</p>
                  {image.status === 'uploading' && (
                    <p className="text-xs font-medium text-blue-600">Uploading image…</p>
                  )}
                  {image.status === 'uploaded' && (
                    <p className="text-xs font-medium text-emerald-600">Ready to submit</p>
                  )}
                  {image.status === 'uploaded' && image.enhancementStatus === 'processing' && (
                    <p className="text-xs font-medium text-blue-600">Enhancing image with AI…</p>
                  )}
                  {image.status === 'uploaded' && image.enhancementStatus === 'ready' && (
                    <p className="text-xs font-medium text-emerald-600">AI-enhanced version ready</p>
                  )}
                  {image.status === 'error' && (
                    <p className="text-xs font-medium text-red-600">{image.error}</p>
                  )}
                  {image.status !== 'error' && image.enhancementStatus === 'error' && (
                    <p className="text-xs font-medium text-red-600">{image.error}</p>
                  )}
                </div>
                {image.status === 'uploaded' && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => chooseImageVariant(image.id, 'original')}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                        image.selectedVariant === 'original'
                          ? 'border-blue-300 bg-blue-50 text-blue-700'
                          : 'border-slate-300 text-slate-700'
                      }`}
                    >
                      Before (Original)
                    </button>
                    <button
                      type="button"
                      onClick={() => chooseImageVariant(image.id, 'enhanced')}
                      disabled={!image.enhancedUrl || image.enhancementStatus === 'processing'}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                        image.selectedVariant === 'enhanced'
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                          : 'border-slate-300 text-slate-700'
                      }`}
                    >
                      After (Enhanced)
                    </button>
                    {showRetryButton && (
                      <button
                        type="button"
                        onClick={() => retryEnhancement(image.id)}
                        className="rounded-md border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-700"
                      >
                        Retry AI enhance
                      </button>
                    )}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {showRetryUploadButton && (
                    <button
                      type="button"
                      onClick={() => retryImageUpload(image.id)}
                      className="rounded-md border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-700"
                    >
                      Retry upload
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => moveImage(i, i - 1)}
                    disabled={i === 0}
                    className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Move earlier
                  </button>
                  <button
                    type="button"
                    onClick={() => moveImage(i, i + 1)}
                    disabled={i === images.length - 1}
                    className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Move later
                  </button>
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600"
                  >
                    Remove
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {images.length < MAX_PRODUCT_IMAGES && (
          <div>
            <label
              className={`inline-flex min-h-[44px] items-center gap-2 btn-outline px-4 py-2 text-sm ${
                imageUploadCount > 0 ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
              }`}
              aria-disabled={imageUploadCount > 0}
            >
              {images.length === 0 ? 'Choose images' : 'Add more images'}
              <input
                ref={imageInputRef}
                type="file"
                accept={PRODUCT_IMAGE_TYPES.join(",")}
                multiple
                onChange={handleImageFilesChange}
                disabled={imageUploadCount > 0}
                className="hidden"
              />
            </label>
            <p className="mt-1 text-xs text-slate-400">
              JPEG, PNG, WebP, GIF • max 10 MB each
              {images.length > 1 && ' • Drag to reorder on desktop or use the move buttons'}
            </p>
          </div>
        )}

        {images
          .filter((image) => getSelectedImageUrl(image))
          .map((image) => (
            <Fragment key={image.id}>
              {/* Keep both names for backward-compatible seller submit payloads. */}
              <input type="hidden" name="images" value={getSelectedImageUrl(image)} />
              <input type="hidden" name="imageUrls" value={getSelectedImageUrl(image)} />
              {image.originalUrl && <input type="hidden" name="originalImages" value={image.originalUrl} />}
              {image.enhancedUrl && <input type="hidden" name="enhancedImages" value={image.enhancedUrl} />}
              {image.thumbnailUrl && <input type="hidden" name="imageThumbnails" value={image.thumbnailUrl} />}
            </Fragment>
          ))}
        <input
          type="url"
          name="imageUrl"
          value={mainImage}
          readOnly
          required={required}
          tabIndex={-1}
          aria-hidden="true"
          style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }}
        />
        <input
          type="text"
          value={mediaReady ? 'ready' : ''}
          readOnly
          required={!mediaReady}
          tabIndex={-1}
          aria-hidden="true"
          style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }}
        />

        {required && images.length === 0 && (
          <p className="text-xs text-orange-500 mt-1">Please upload at least one image.</p>
        )}
      </div>

      {/* ── Video ──────────────────────────────────────────────────── */}
      <div>
        <label className="label">
          Product Video <span className="text-slate-400 font-normal">(optional · max {MAX_PRODUCT_VIDEO_DURATION_SECONDS}s)</span>
        </label>

        {/* ── Recording UI (shown when recording is active) ─── */}
        {recordingState !== 'idle' && (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {recordingState === 'requesting' && (
              <p className="text-sm text-slate-600">Accessing camera…</p>
            )}

            {(recordingState === 'ready' || recordingState === 'recording') && (
              <>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  ref={liveVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full rounded-lg border border-slate-200 max-h-52 object-cover bg-black"
                />
                {recordingState === 'recording' && (
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                    <p className="text-sm font-semibold text-red-600">
                      Recording — {recordingCountdown}s remaining
                    </p>
                  </div>
                )}
                {recordingError && (
                  <p className="text-sm text-red-600">{recordingError}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {recordingState === 'ready' && (
                    <button
                      type="button"
                      onClick={startRecording}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                    >
                      ● Start recording
                    </button>
                  )}
                  {recordingState === 'recording' && (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900"
                    >
                      ■ Stop recording
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={switchCamera}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                  >
                    ↺ Switch to {cameraFacingMode === 'environment' ? 'front' : 'back'} camera
                  </button>
                  <button
                    type="button"
                    onClick={cancelRecording}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {recordingState === 'reviewing' && (
              <>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  src={reviewBlobUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full rounded-lg border border-slate-200 max-h-52 object-cover"
                />
                <p className="text-sm text-slate-600">Review your recording. Use it or retake.</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={useRecording}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    ✓ Use this video
                  </button>
                  <button
                    type="button"
                    onClick={retakeRecording}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                  >
                    Retake
                  </button>
                  <button
                    type="button"
                    onClick={cancelRecording}
                    className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {recordingState === 'error' && (
              <>
                <p className="text-sm text-red-600">{recordingError}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={requestCameraAccess}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={cancelRecording}
                    className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Existing / uploaded video ─── */}
        {recordingState === 'idle' && video && (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {video.previewKind === 'object-url' ? (
              <video
                ref={videoPreviewRef}
                controls
                playsInline
                preload="metadata"
                className="rounded-lg border border-slate-200 max-h-48 w-full object-cover"
              />
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Current uploaded video is attached.
                {safeUploadedVideoUrl && (
                  <div className="mt-3">
                    <a
                      href={safeUploadedVideoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
                    >
                      Open current video
                    </a>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-1">
              <p className="truncate text-sm font-medium text-slate-900">{video.fileName}</p>
              <p className="text-xs text-slate-500">{getFileSizeDisplay(video.fileSize)}</p>
              {video.status === 'uploading' && (
                <p className="text-xs font-medium text-blue-600">Uploading video…</p>
              )}
              {video.status === 'uploaded' && video.aiEnhancementStatus === 'processing' && (
                <p className="text-xs font-medium text-blue-600">AI enhancing video…</p>
              )}
              {video.status === 'uploaded' && video.aiEnhancementStatus === 'ready' && (
                <p className="text-xs font-medium text-emerald-600">✨ AI enhanced · Ready to submit</p>
              )}
              {video.status === 'uploaded' && video.aiEnhancementStatus === 'idle' && (
                <p className="text-xs font-medium text-emerald-600">Ready to submit</p>
              )}
              {video.status === 'error' && (
                <p className="text-xs font-medium text-red-600">{video.error}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <label
                className={`inline-flex min-h-[44px] items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 ${
                  videoUploading || videoEnhancing ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                }`}
                aria-disabled={videoUploading || videoEnhancing}
              >
                Replace video
                <input
                  ref={videoInputRef}
                  type="file"
                  accept={PRODUCT_VIDEO_TYPES.join(",")}
                  onChange={handleVideoFileChange}
                  disabled={videoUploading || videoEnhancing}
                  className="hidden"
                />
              </label>
              {video.status === 'error' && video.sourceFile && (
                <button
                  type="button"
                  onClick={retryVideoUpload}
                  className="rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-700"
                >
                  Retry upload
                </button>
              )}
              <button
                type="button"
                onClick={removeVideo}
                className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600"
              >
                Remove video
              </button>
            </div>
          </div>
        )}

        {/* ── No video yet — offer record or upload ─── */}
        {recordingState === 'idle' && !video && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={requestCameraAccess}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                🎥 Record video
              </button>
              <label
                className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 btn-outline px-4 py-2 text-sm"
              >
                Choose file
                <input
                  ref={videoInputRef}
                  type="file"
                  accept={PRODUCT_VIDEO_TYPES.join(",")}
                  onChange={handleVideoFileChange}
                  className="hidden"
                />
              </label>
            </div>
            <p className="text-xs text-slate-400">
              MP4, MOV, WebM · max {MAX_PRODUCT_VIDEO_DURATION_SECONDS}s · AI enhancement applied on upload
            </p>
          </div>
        )}

        <input type="hidden" name="videoUrl" value={video?.aiEnhancedUrl ?? video?.uploadedUrl ?? ''} />
      </div>

      {(imageUploadCount > 0 || imageEnhancingCount > 0 || videoUploading || videoEnhancing) && (
        <p className="text-sm text-slate-500" aria-live="polite">
          {getUploadProgressMessage(imageEnhancingCount, videoEnhancing)}
        </p>
      )}
      {uploadError && (
        <p className="text-sm text-red-600" aria-live="polite">
          {uploadError}
        </p>
      )}
    </div>
  );
}
