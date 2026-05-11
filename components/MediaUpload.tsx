'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_PRODUCT_IMAGES,
  MAX_PRODUCT_IMAGE_BYTES,
  MAX_PRODUCT_VIDEO_BYTES,
  PRODUCT_IMAGE_TYPES,
  PRODUCT_VIDEO_TYPES,
} from '@/lib/product-media';
import {
  getOptimizedProductImageUrl,
  getProductImageThumbnailUrl,
  PRODUCT_IMAGE_ENHANCEMENT_LABELS,
  PRODUCT_IMAGE_ENHANCEMENT_OPTIONS,
  type ProductImageEnhancementOption,
} from '@/lib/product-image-enhancement';

interface MediaUploadProps {
  /** Existing image URLs for edit forms. */
  defaultImages?: string[];
  /** Existing video URL for edit forms. */
  defaultVideoUrl?: string;
  /** Whether at least one image is required. */
  required?: boolean;
  /** Optional callback for parent forms that need media readiness state. */
  onStateChange?: (state: MediaUploadState) => void;
}

type UploadStatus = 'uploading' | 'processing' | 'uploaded' | 'error';

type ImageUploadItem = {
  id: string;
  previewUrl: string;
  safePreviewUrl: string;
  originalUploadedUrl: string;
  uploadedUrl: string;
  thumbnailUrl: string;
  selectedEnhancement: ProductImageEnhancementOption;
  suggestedEnhancement: ProductImageEnhancementOption | null;
  suggestionMessage?: string;
  fileName: string;
  fileSize: number | null;
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
  previewKind: 'object-url' | 'remote-url';
  status: UploadStatus;
  error?: string;
};

export type MediaUploadState = {
  imageCount: number;
  uploadedImageCount: number;
  isUploading: boolean;
  hasErrors: boolean;
  canSubmit: boolean;
  message: string;
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

const DARK_IMAGE_BRIGHTNESS_THRESHOLD = 70;
const BLURRY_IMAGE_VARIANCE_THRESHOLD = 500;

async function detectImageEnhancementSuggestion(
  sourceUrl: string
): Promise<{ enhancement: ProductImageEnhancementOption; message: string } | null> {
  if (!sourceUrl) return null;

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image analysis failed.'));
      img.src = sourceUrl;
    });

    const maxDimension = 128;
    const canvas = document.createElement('canvas');
    const ratio = Math.min(maxDimension / image.width, maxDimension / image.height, 1);
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) return null;

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const pixelCount = Math.max(1, data.length / 4);
    let brightnessSum = 0;
    const luminance: number[] = [];

    for (let index = 0; index < data.length; index += 4) {
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      const value = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      brightnessSum += value;
      luminance.push(value);
    }

    const avgBrightness = brightnessSum / pixelCount;
    let variance = 0;
    for (let index = 0; index < luminance.length; index += 1) {
      const diff = (luminance[index] ?? 0) - avgBrightness;
      variance += diff * diff;
    }
    variance /= Math.max(1, luminance.length);

    const isDark = avgBrightness < DARK_IMAGE_BRIGHTNESS_THRESHOLD;
    const isBlurry = variance < BLURRY_IMAGE_VARIANCE_THRESHOLD;

    if (isDark && isBlurry) {
      return {
        enhancement: 'auto_enhance',
        message: 'This image looks dark and soft. Auto enhance is recommended.',
      };
    }
    if (isDark) {
      return {
        enhancement: 'auto_enhance',
        message: 'This image looks dark. Auto enhance is recommended.',
      };
    }
    if (isBlurry) {
      return {
        enhancement: 'hd_upscale',
        message: 'This image looks a bit blurry. HD upscale may improve clarity.',
      };
    }
  } catch {
    return null;
  }

  return null;
}

function getMediaStatusMessage(
  required: boolean | undefined,
  imageCount: number,
  imageUploadCount: number,
  imageProcessingCount: number,
  videoUploading: boolean,
  hasMediaErrors: boolean,
  firstItemError: string
) {
  if (imageUploadCount > 0 || imageProcessingCount > 0 || videoUploading) {
    return 'Please wait for your selected media to finish uploading.';
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
 * – Up to 6 images: multi-select, preview, remove, reorder
 * – Up to 1 video: preview and remove
 * Hidden inputs (name="images", name="imageUrl", name="videoUrl") carry the
 * resolved Cloudinary URLs to the enclosing form POST.
 */
export default function MediaUpload({
  defaultImages = [],
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
    defaultImages.map((url) => ({
      id: createItemId(),
      previewUrl: url,
      safePreviewUrl: getSafePreviewUrl(url),
      originalUploadedUrl: url,
      uploadedUrl: getOptimizedProductImageUrl(url, 'keep_original'),
      thumbnailUrl: getProductImageThumbnailUrl(url, 'keep_original'),
      selectedEnhancement: 'keep_original' as const,
      suggestedEnhancement: null,
      fileName: getFileNameFromUrl(url),
      fileSize: null,
      status: 'uploaded' as const,
    }))
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
          previewKind: 'remote-url',
          status: 'uploaded' as const,
        }
      : null
  );
  const [uploadError, setUploadError] = useState('');
  const [defaultEnhancement, setDefaultEnhancement] =
    useState<ProductImageEnhancementOption>('keep_original');
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
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

  async function getUploadConfig(file: File) {
    const res = await fetch('/api/upload/product-media', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: file.type, fileSize: file.size }),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) {
      throw new Error(json?.message ?? 'Upload failed.');
    }
    if (!isValidUploadConfig(json)) {
      throw new Error('Upload configuration is invalid. Please try again.');
    }
    return json;
  }

  async function uploadFile(file: File): Promise<string> {
    const uploadConfig = await getUploadConfig(file);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('api_key', uploadConfig.apiKey);
    fd.append('folder', uploadConfig.folder);
    fd.append('signature', uploadConfig.signature);
    fd.append('timestamp', String(uploadConfig.timestamp));

    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
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

  function applyEnhancementUrls(
    originalUploadedUrl: string,
    selectedEnhancement: ProductImageEnhancementOption
  ) {
    return {
      uploadedUrl: getOptimizedProductImageUrl(originalUploadedUrl, selectedEnhancement),
      thumbnailUrl: getProductImageThumbnailUrl(originalUploadedUrl, selectedEnhancement),
    };
  }

  function handleEnhancementChange(imageId: string, nextEnhancement: ProductImageEnhancementOption) {
    setImages((prev) =>
      prev.map((image) => {
        if (image.id !== imageId) return image;
        if (!image.originalUploadedUrl) {
          return { ...image, selectedEnhancement: nextEnhancement };
        }
        return {
          ...image,
          selectedEnhancement: nextEnhancement,
          ...applyEnhancementUrls(image.originalUploadedUrl, nextEnhancement),
        };
      })
    );
  }

  function applyEnhancementToAll(nextEnhancement: ProductImageEnhancementOption) {
    setDefaultEnhancement(nextEnhancement);
    setImages((prev) =>
      prev.map((image) => {
        if (!image.originalUploadedUrl) {
          return { ...image, selectedEnhancement: nextEnhancement };
        }
        return {
          ...image,
          selectedEnhancement: nextEnhancement,
          ...applyEnhancementUrls(image.originalUploadedUrl, nextEnhancement),
        };
      })
    );
  }

  async function handleImageFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const invalidTypeFile = files.find(file => !PRODUCT_IMAGE_TYPES.includes(file.type as (typeof PRODUCT_IMAGE_TYPES)[number]));
    if (invalidTypeFile) {
      setUploadError('Unsupported image format. Please upload JPEG, PNG, WebP, or GIF.');
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }

    const tooLargeImage = files.find(file => file.size > MAX_PRODUCT_IMAGE_BYTES);
    if (tooLargeImage) {
      setUploadError('One or more images are too large. Maximum size is 10 MB each.');
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }

    const remaining = MAX_PRODUCT_IMAGES - images.length;
    if (remaining <= 0) {
      setUploadError(`Maximum ${MAX_PRODUCT_IMAGES} images allowed.`);
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }

    const toUpload = files.slice(0, remaining);
    if (files.length > remaining) {
      setUploadError(`Only ${remaining} more image(s) can be added (max ${MAX_PRODUCT_IMAGES}). Extra files ignored.`);
    } else {
      setUploadError('');
    }

    const nextItems = toUpload.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);

      return {
        id: createItemId(),
        previewUrl,
        safePreviewUrl: previewUrl,
        originalUploadedUrl: '',
        uploadedUrl: '',
        thumbnailUrl: '',
        selectedEnhancement: defaultEnhancement,
        suggestedEnhancement: null,
        fileName: file.name,
        fileSize: file.size,
        status: 'uploading' as const,
      };
    });

    setImages((prev) => [...prev, ...nextItems]);
    if (imageInputRef.current) imageInputRef.current.value = '';

    nextItems.forEach((item, index) => {
      uploadFile(toUpload[index])
        .then((url) => {
          setImages((prev) =>
            prev.map((image) =>
              image.id === item.id
                ? { ...image, originalUploadedUrl: url, status: 'processing', error: undefined }
                : image
            )
          );
          detectImageEnhancementSuggestion(item.safePreviewUrl)
            .then((suggestion) => {
              setImages((prev) =>
                prev.map((image) => {
                  if (image.id !== item.id) return image;
                  const selectedEnhancement = image.selectedEnhancement;
                  return {
                    ...image,
                    selectedEnhancement,
                    suggestedEnhancement: suggestion?.enhancement ?? null,
                    suggestionMessage: suggestion?.message,
                    ...applyEnhancementUrls(url, selectedEnhancement),
                    status: 'uploaded',
                    error: undefined,
                  };
                })
              );
            })
            .catch(() => {
              setImages((prev) =>
                prev.map((image) => {
                  if (image.id !== item.id) return image;
                  return {
                    ...image,
                    ...applyEnhancementUrls(url, image.selectedEnhancement),
                    status: 'uploaded',
                  };
                })
              );
            });
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Upload failed.';
          setImages((prev) =>
            prev.map((image) =>
              image.id === item.id
                ? { ...image, status: 'error', error: msg }
                : image
            )
          );
          setUploadError((current) => current || msg);
        });
    });
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
      previewKind: 'object-url',
      status: 'uploading',
    };

    setVideo(nextVideo);
    if (videoInputRef.current) videoInputRef.current.value = '';

    try {
      const url = await uploadFile(file);
      setVideo((current) =>
        current?.id === nextVideo.id
          ? { ...current, uploadedUrl: url, status: 'uploaded', error: undefined }
          : current
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setVideo((current) =>
        current?.id === nextVideo.id
          ? { ...current, status: 'error', error: msg }
          : current
      );
      setUploadError((current) => current || msg);
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

  function removeVideo() {
    setVideo((current) => {
      if (current && objectUrlsRef.current.has(current.previewUrl)) {
        objectUrlsRef.current.delete(current.previewUrl);
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
    if (videoInputRef.current) videoInputRef.current.value = '';
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

  const uploadedImageUrls = images.map((image) => image.uploadedUrl).filter(Boolean);
  const imageUploadCount = images.filter((image) => image.status === 'uploading').length;
  const imageProcessingCount = images.filter((image) => image.status === 'processing').length;
  const videoUploading = video?.status === 'uploading';
  const hasMediaErrors = images.some((image) => image.status === 'error') || video?.status === 'error';
  const firstItemError =
    images.find((image) => image.status === 'error')?.error ?? video?.error ?? uploadError;
  const mediaMessage = getMediaStatusMessage(
    required,
    images.length,
    imageUploadCount,
    imageProcessingCount,
    videoUploading,
    hasMediaErrors,
    firstItemError || ''
  );
  const mediaReady =
    uploadedImageUrls.length === images.length &&
    !imageUploadCount &&
    !imageProcessingCount &&
    !videoUploading &&
    !hasMediaErrors &&
    (!video || !!video.uploadedUrl) &&
    (!required || images.length > 0);
  const mediaEnhancementPayload = images
    .filter((image) => image.uploadedUrl)
    .map((image) => ({
      finalUrl: image.uploadedUrl,
      originalUrl: image.originalUploadedUrl || image.uploadedUrl,
      thumbnailUrl: image.thumbnailUrl || image.uploadedUrl,
      enhancement: image.selectedEnhancement,
      suggestedEnhancement: image.suggestedEnhancement,
    }));
  const mainImage = uploadedImageUrls[0] ?? '';
  const safeUploadedVideoUrl = video ? getSafePreviewUrl(video.uploadedUrl) : '';

  useEffect(() => {
    onStateChange?.({
      imageCount: images.length,
      uploadedImageCount: uploadedImageUrls.length,
      isUploading: imageUploadCount > 0 || imageProcessingCount > 0 || videoUploading,
      hasErrors: hasMediaErrors,
      canSubmit: mediaReady,
      message: mediaMessage,
    });
  }, [
    hasMediaErrors,
    imageUploadCount,
    imageProcessingCount,
    images.length,
    mediaMessage,
    mediaReady,
    onStateChange,
    uploadedImageUrls.length,
    videoUploading,
  ]);

  return (
    <div className="space-y-4">
      {/* ── Images ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <label className="label">
            Product Images <span className="text-slate-400 font-normal">(1–6, first = thumbnail)</span>
          </label>
          <p className="text-sm text-slate-500">{images.length}/{MAX_PRODUCT_IMAGES} images</p>
        </div>
        <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Default enhancement for new uploads
            </label>
            <select
              className="input mt-1"
              value={defaultEnhancement}
              onChange={(event) =>
                setDefaultEnhancement(event.target.value as ProductImageEnhancementOption)
              }
            >
              {PRODUCT_IMAGE_ENHANCEMENT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {PRODUCT_IMAGE_ENHANCEMENT_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
            onClick={() => applyEnhancementToAll(defaultEnhancement)}
            disabled={!images.length}
          >
            Apply to all images
          </button>
        </div>

        {images.length > 0 && (
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            {images.map((image, i) => (
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
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.originalUploadedUrl ? getProductImageThumbnailUrl(image.originalUploadedUrl, 'keep_original') : image.safePreviewUrl}
                      alt={`Original product image ${i + 1}`}
                      className="h-36 w-full object-cover"
                    />
                    <span className="absolute left-2 top-2 rounded bg-slate-700 px-2 py-1 text-[11px] font-semibold text-white">
                      Before
                    </span>
                  </div>
                  <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.thumbnailUrl || image.safePreviewUrl}
                      alt={`Processed product image ${i + 1}`}
                      className="h-36 w-full object-cover"
                    />
                    <span className="absolute left-2 top-2 rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white">
                      After
                    </span>
                    {i === 0 && (
                      <span className="absolute right-2 top-2 rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white">
                        Thumbnail
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <p className="truncate text-sm font-medium text-slate-900">{image.fileName}</p>
                  <p className="text-xs text-slate-500">{getFileSizeDisplay(image.fileSize)}</p>
                  {image.status === 'uploading' && (
                    <p className="text-xs font-medium text-blue-600">Uploading image…</p>
                  )}
                  {image.status === 'processing' && (
                    <p className="text-xs font-medium text-blue-600">Preparing AI preview…</p>
                  )}
                  {image.status === 'uploaded' && (
                    <p className="text-xs font-medium text-emerald-600">Ready to submit</p>
                  )}
                  {image.status === 'error' && (
                    <p className="text-xs font-medium text-red-600">{image.error}</p>
                  )}
                  {image.suggestionMessage && (
                    <p className="text-xs font-medium text-amber-600">{image.suggestionMessage}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Enhancement mode
                  </label>
                  <select
                    className="input mt-1"
                    value={image.selectedEnhancement}
                    onChange={(event) =>
                      handleEnhancementChange(
                        image.id,
                        event.target.value as ProductImageEnhancementOption
                      )
                    }
                    disabled={image.status === 'uploading' || image.status === 'error'}
                  >
                    {PRODUCT_IMAGE_ENHANCEMENT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {PRODUCT_IMAGE_ENHANCEMENT_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
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
            ))}
          </div>
        )}

        {images.length < MAX_PRODUCT_IMAGES && (
          <div>
            <label className="inline-flex items-center gap-2 cursor-pointer btn-outline text-sm">
              {images.length === 0 ? 'Choose images' : 'Add more images'}
              <input
                ref={imageInputRef}
                type="file"
                accept={PRODUCT_IMAGE_TYPES.join(",")}
                multiple
                onChange={handleImageFilesChange}
                className="hidden"
              />
            </label>
            <p className="mt-1 text-xs text-slate-400">
              JPEG, PNG, WebP, GIF • max 10 MB each
              {images.length > 1 && ' • Drag to reorder on desktop or use the move buttons'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              AI enhancement is optional. Originals are always preserved in Cloudinary.
            </p>
          </div>
        )}

        {images
          .filter((image) => image.uploadedUrl)
          .map((image) => (
            <Fragment key={image.id}>
              {/* Keep both names for backward-compatible seller submit payloads. */}
              <input type="hidden" name="images" value={image.uploadedUrl} />
              <input type="hidden" name="imageUrls" value={image.uploadedUrl} />
              <input
                type="hidden"
                name="originalImages"
                value={image.originalUploadedUrl || image.uploadedUrl}
              />
            </Fragment>
          ))}
        <input
          type="hidden"
          name="mediaEnhancements"
          value={JSON.stringify(mediaEnhancementPayload)}
        />
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
          Product Video <span className="text-slate-400 font-normal">(optional, max 1)</span>
        </label>

        {video ? (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {video.previewKind === 'object-url' ? (
              <video
                ref={videoPreviewRef}
                controls
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
              {video.status === 'uploaded' && (
                <p className="text-xs font-medium text-emerald-600">Ready to submit</p>
              )}
              {video.status === 'error' && (
                <p className="text-xs font-medium text-red-600">{video.error}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700">
                Replace video
                <input
                  ref={videoInputRef}
                  type="file"
                  accept={PRODUCT_VIDEO_TYPES.join(",")}
                  onChange={handleVideoFileChange}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={removeVideo}
                className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600"
              >
                Remove video
              </button>
            </div>
          </div>
        ) : (
          <div>
            <label className="inline-flex items-center gap-2 cursor-pointer btn-outline text-sm">
              Choose video
              <input
                ref={videoInputRef}
                type="file"
                accept={PRODUCT_VIDEO_TYPES.join(",")}
                onChange={handleVideoFileChange}
                className="hidden"
              />
            </label>
            <p className="text-xs text-slate-400 mt-1">MP4, MOV, WebM • max 200 MB</p>
          </div>
        )}

        <input type="hidden" name="videoUrl" value={video?.uploadedUrl ?? ''} />
      </div>

      {(imageUploadCount > 0 || imageProcessingCount > 0 || videoUploading) && (
        <p className="text-sm text-slate-500" aria-live="polite">
          {imageProcessingCount > 0 ? 'Preparing enhanced image previews…' : 'Uploading media…'}
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
