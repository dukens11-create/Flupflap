'use client';

import { useEffect, useRef, useState } from 'react';

const MAX_IMAGES = 6;
const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif';
const ACCEPTED_VIDEO_TYPES = 'video/mp4,video/quicktime,video/webm';
const ACCEPTED_IMAGE_TYPES_LIST = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ACCEPTED_VIDEO_TYPES_LIST = ['video/mp4', 'video/quicktime', 'video/webm'];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB

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

type UploadStatus = 'uploading' | 'uploaded' | 'error';

type ImageUploadItem = {
  id: string;
  previewUrl: string;
  uploadedUrl: string;
  fileName: string;
  fileSize: number | null;
  status: UploadStatus;
  error?: string;
};

type VideoUploadItem = {
  id: string;
  previewUrl: string;
  uploadedUrl: string;
  fileName: string;
  fileSize: number | null;
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

function createItemId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getFileNameFromUrl(url: string) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() || 'Uploaded file');
  } catch {
    return decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'Uploaded file');
  }
}

function formatFileSize(bytes: number | null) {
  if (bytes == null) return 'Uploaded';
  if (bytes < 1024) return `${bytes} B`;

  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;

  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
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
  const [images, setImages] = useState<ImageUploadItem[]>(() =>
    defaultImages.map((url) => ({
      id: createItemId(),
      previewUrl: url,
      uploadedUrl: url,
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
          uploadedUrl: defaultVideoUrl,
          fileName: getFileNameFromUrl(defaultVideoUrl),
          fileSize: null,
          status: 'uploaded' as const,
        }
      : null
  );
  const [uploadError, setUploadError] = useState('');
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
  }, []);

  async function uploadFile(file: File): Promise<string> {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Upload failed.');
    return json.url as string;
  }

  async function handleImageFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const invalidTypeFile = files.find(file => !ACCEPTED_IMAGE_TYPES_LIST.includes(file.type));
    if (invalidTypeFile) {
      setUploadError('Unsupported image format. Please upload JPEG, PNG, WebP, or GIF.');
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }

    const tooLargeImage = files.find(file => file.size > MAX_IMAGE_BYTES);
    if (tooLargeImage) {
      setUploadError('One or more images are too large. Maximum size is 10 MB each.');
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }

    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      setUploadError(`Maximum ${MAX_IMAGES} images allowed.`);
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }

    const toUpload = files.slice(0, remaining);
    if (files.length > remaining) {
      setUploadError(`Only ${remaining} more image(s) can be added (max ${MAX_IMAGES}). Extra files ignored.`);
    } else {
      setUploadError('');
    }

    const nextItems = toUpload.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);

      return {
        id: createItemId(),
        previewUrl,
        uploadedUrl: '',
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
                ? { ...image, uploadedUrl: url, status: 'uploaded', error: undefined }
                : image
            )
          );
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
          setUploadError(msg);
        });
    });
  }

  async function handleVideoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_VIDEO_TYPES_LIST.includes(file.type)) {
      setUploadError('Unsupported video format. Please upload MP4, MOV, or WebM.');
      if (videoInputRef.current) videoInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setUploadError('Video is too large. Maximum size is 200 MB.');
      if (videoInputRef.current) videoInputRef.current.value = '';
      return;
    }
    setUploadError('');
    if (video?.status && objectUrlsRef.current.has(video.previewUrl)) {
      objectUrlsRef.current.delete(video.previewUrl);
      URL.revokeObjectURL(video.previewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    objectUrlsRef.current.add(previewUrl);
    const nextVideo: VideoUploadItem = {
      id: createItemId(),
      previewUrl,
      uploadedUrl: '',
      fileName: file.name,
      fileSize: file.size,
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

  const uploadedImageUrls = images.map((image) => image.uploadedUrl).filter(Boolean);
  const imageUploadCount = images.filter((image) => image.status === 'uploading').length;
  const videoUploading = video?.status === 'uploading';
  const hasMediaErrors = images.some((image) => image.status === 'error') || video?.status === 'error';
  const firstItemError =
    images.find((image) => image.status === 'error')?.error ?? video?.error ?? uploadError;
  const mediaMessage = imageUploadCount > 0 || videoUploading
    ? 'Please wait for your selected media to finish uploading.'
    : hasMediaErrors
      ? firstItemError || 'Please fix the media upload error before submitting.'
      : required && images.length === 0
        ? 'Please upload at least one image.'
        : '';
  const mediaReady =
    uploadedImageUrls.length === images.length &&
    !imageUploadCount &&
    !videoUploading &&
    !hasMediaErrors &&
    (!video || !!video.uploadedUrl) &&
    (!required || images.length > 0);
  const mainImage = uploadedImageUrls[0] ?? '';

  useEffect(() => {
    onStateChange?.({
      imageCount: images.length,
      uploadedImageCount: uploadedImageUrls.length,
      isUploading: imageUploadCount > 0 || videoUploading,
      hasErrors: Boolean(hasMediaErrors),
      canSubmit: mediaReady,
      message: mediaMessage,
    });
  }, [
    hasMediaErrors,
    imageUploadCount,
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
          <p className="text-sm text-slate-500">{images.length}/{MAX_IMAGES} images</p>
        </div>

        {images.length > 0 && (
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            {images.map((image, i) => (
              <div
                key={image.id}
                draggable
                onDragStart={() => setDraggedImageId(image.id)}
                onDragEnd={() => setDraggedImageId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (!draggedImageId || draggedImageId === image.id) return;
                  const from = images.findIndex((item) => item.id === draggedImageId);
                  if (from >= 0) moveImage(from, i);
                  setDraggedImageId(null);
                }}
                className={`rounded-xl border bg-white p-3 shadow-sm ${draggedImageId === image.id ? 'border-blue-400' : 'border-slate-200'}`}
              >
                <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.previewUrl}
                    alt={`Product image ${i + 1}`}
                    className="h-40 w-full object-cover"
                  />
                  {i === 0 && (
                    <span className="absolute left-2 top-2 rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white">
                      Thumbnail
                    </span>
                  )}
                </div>
                <div className="mt-3 space-y-1">
                  <p className="truncate text-sm font-medium text-slate-900">{image.fileName}</p>
                  <p className="text-xs text-slate-500">{formatFileSize(image.fileSize)}</p>
                  {image.status === 'uploading' && (
                    <p className="text-xs font-medium text-blue-600">Uploading image…</p>
                  )}
                  {image.status === 'uploaded' && (
                    <p className="text-xs font-medium text-emerald-600">Ready to submit</p>
                  )}
                  {image.status === 'error' && (
                    <p className="text-xs font-medium text-red-600">{image.error}</p>
                  )}
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

        {images.length < MAX_IMAGES && (
          <div>
            <label className="inline-flex items-center gap-2 cursor-pointer btn-outline text-sm">
              {images.length === 0 ? 'Choose images' : 'Add more images'}
              <input
                ref={imageInputRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                multiple
                onChange={handleImageFilesChange}
                className="hidden"
              />
            </label>
            <p className="mt-1 text-xs text-slate-400">
              JPEG, PNG, WebP, GIF • max 10 MB each
              {images.length > 1 && ' • Drag to reorder on desktop or use the move buttons'}
            </p>
          </div>
        )}

        {uploadedImageUrls.map((url, index) => (
          <input key={`${url}-${index}`} type="hidden" name="images" value={url} />
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
          required={required || imageUploadCount > 0 || videoUploading || Boolean(hasMediaErrors)}
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
            <video
              src={video.previewUrl}
              controls
              preload="metadata"
              className="rounded-lg border border-slate-200 max-h-48 w-full object-cover"
            />
            <div className="space-y-1">
              <p className="truncate text-sm font-medium text-slate-900">{video.fileName}</p>
              <p className="text-xs text-slate-500">{formatFileSize(video.fileSize)}</p>
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
                  accept={ACCEPTED_VIDEO_TYPES}
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
                accept={ACCEPTED_VIDEO_TYPES}
                onChange={handleVideoFileChange}
                className="hidden"
              />
            </label>
            <p className="text-xs text-slate-400 mt-1">MP4, MOV, WebM • max 200 MB</p>
          </div>
        )}

        <input type="hidden" name="videoUrl" value={video?.uploadedUrl ?? ''} />
      </div>

      {(imageUploadCount > 0 || videoUploading) && (
        <p className="text-sm text-slate-500" aria-live="polite">
          Uploading media…
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
