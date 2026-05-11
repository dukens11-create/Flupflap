'use client';

import { useEffect, useRef, useState } from 'react';
import {
  MAX_PRODUCT_IMAGES,
  MAX_PRODUCT_IMAGE_BYTES,
  MAX_PRODUCT_VIDEO_BYTES,
  PRODUCT_IMAGE_TYPES,
  PRODUCT_VIDEO_TYPES,
} from '@/lib/product-media';

interface MediaUploadProps {
  /** Existing image URLs for edit forms. */
  defaultImages?: string[];
  /** Existing video URL for edit forms. */
  defaultVideoUrl?: string;
  /** Whether at least one image is required. */
  required?: boolean;
  /** Reports upload state back to the parent form. */
  onStateChange?: (state: {
    imageCount: number;
    hasVideo: boolean;
    uploading: boolean;
    progress: number;
    error: string;
  }) => void;
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
  const [images, setImages] = useState<string[]>(defaultImages);
  const [videoUrl, setVideoUrl] = useState<string>(defaultVideoUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLabel, setUploadLabel] = useState('');
  const [uploadError, setUploadError] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onStateChange?.({
      imageCount: images.length,
      hasVideo: Boolean(videoUrl),
      uploading,
      progress: uploadProgress,
      error: uploadError,
    });
  }, [images.length, onStateChange, uploadError, uploadProgress, uploading, videoUrl]);

  async function getUploadConfig(file: File) {
    const res = await fetch('/api/upload/product-media', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contentType: file.type,
        fileSize: file.size,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) {
      throw new Error(json?.message ?? 'Upload failed.');
    }
    return json as {
      apiKey: string;
      folder: string;
      signature: string;
      timestamp: number;
      uploadUrl: string;
    };
  }

  async function uploadFile(file: File, onProgress: (progress: number) => void): Promise<string> {
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
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onerror = () => reject(new Error('Upload failed. Please check your connection and try again.'));
      xhr.onload = () => {
        const response = xhr.response;
        if (xhr.status >= 200 && xhr.status < 300 && response?.secure_url) {
          onProgress(100);
          resolve(response.secure_url as string);
          return;
        }

        const cloudinaryError =
          response && typeof response === 'object' && 'error' in response
            ? (response.error as { message?: string })?.message
            : undefined;
        reject(new Error(cloudinaryError ?? 'Upload failed.'));
      };
      xhr.send(fd);
    });
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
      return;
    }

    const toUpload = files.slice(0, remaining);
    if (files.length > remaining) {
      setUploadError(`Only ${remaining} more image(s) can be added (max ${MAX_PRODUCT_IMAGES}). Extra files ignored.`);
    } else {
      setUploadError('');
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const uploadedUrls: string[] = [];

      for (const [index, file] of toUpload.entries()) {
        setUploadLabel(`Uploading image ${index + 1} of ${toUpload.length}`);
        const url = await uploadFile(file, (progress) => {
          const overallProgress = Math.round(((index + progress / 100) / toUpload.length) * 100);
          setUploadProgress(overallProgress);
        });
        uploadedUrls.push(url);
      }

      setImages(prev => [...prev, ...uploadedUrls]);
      setUploadLabel('');
      setUploadProgress(100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setUploadError(msg);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadLabel('');
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
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
    setUploading(true);
    setUploadProgress(0);
    setUploadLabel('Uploading video');
    setUploadError('');
    try {
      const url = await uploadFile(file, setUploadProgress);
      setVideoUrl(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setUploadError(msg);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadLabel('');
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  }

  function removeImage(index: number) {
    setImages(prev => prev.filter((_, i) => i !== index));
  }

  function moveImage(from: number, to: number) {
    if (to < 0 || to >= images.length) return;
    setImages(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  const mainImage = images[0] ?? '';

  return (
    <div className="space-y-4">
      {/* ── Images ─────────────────────────────────────────────────── */}
      <div>
        <label className="label">
          Product Images <span className="text-slate-400 font-normal">(1–6, first = thumbnail)</span>
        </label>

        {/* Grid of previews */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-3">
            {images.map((url, i) => (
              <div key={url} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Product image ${i + 1}`}
                  className="h-24 w-24 rounded-lg object-cover border border-slate-200"
                />
                {/* Thumbnail badge */}
                {i === 0 && (
                  <span className="absolute top-1 left-1 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                    Main
                  </span>
                )}
                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs leading-none opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  aria-label={`Remove image ${i + 1}`}
                >
                  ×
                </button>
                {/* Reorder buttons */}
                <div className="absolute bottom-1 left-1 flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={() => moveImage(i, i - 1)}
                      className="bg-white/80 border border-slate-300 rounded text-xs px-1"
                      aria-label="Move image left"
                    >
                      ←
                    </button>
                  )}
                  {i < images.length - 1 && (
                    <button
                      type="button"
                      onClick={() => moveImage(i, i + 1)}
                      className="bg-white/80 border border-slate-300 rounded text-xs px-1"
                      aria-label="Move image right"
                    >
                      →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add images button */}
        {images.length < MAX_PRODUCT_IMAGES && (
          <div>
            <label className="inline-flex items-center gap-2 cursor-pointer btn-outline text-sm">
              {uploading ? 'Uploading…' : images.length === 0 ? 'Choose images' : 'Add more images'}
              <input
                ref={imageInputRef}
                type="file"
                accept={PRODUCT_IMAGE_TYPES.join(',')}
                multiple
                onChange={handleImageFilesChange}
                disabled={uploading}
                className="hidden"
              />
            </label>
            <p className="text-xs text-slate-400 mt-1">{images.length}/{MAX_PRODUCT_IMAGES} images • JPEG, PNG, WebP, GIF • max 10 MB each</p>
          </div>
        )}

        {/* Hidden inputs for form submission */}
        {images.map((url) => (
          <input key={url} type="hidden" name="images" value={url} />
        ))}
        {/* Legacy single-image field — keeps existing API handlers working.
            When required, use a visually-hidden URL input so the browser
            enforces presence before the form can be submitted. */}
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

        {required && images.length === 0 && (
          <p className="text-xs text-orange-500 mt-1">Please upload at least one image.</p>
        )}
      </div>

      {/* ── Video ──────────────────────────────────────────────────── */}
      <div>
        <label className="label">
          Product Video <span className="text-slate-400 font-normal">(optional, max 1)</span>
        </label>

        {videoUrl ? (
          <div className="space-y-2">
            <video
              src={videoUrl}
              controls
              preload="metadata"
              className="rounded-lg border border-slate-200 max-h-48 w-full object-cover"
            />
            <button
              type="button"
              onClick={() => setVideoUrl('')}
              className="text-sm text-red-600 hover:underline"
            >
              Remove video
            </button>
          </div>
        ) : (
          <div>
            <label className="inline-flex items-center gap-2 cursor-pointer btn-outline text-sm">
              {uploading ? 'Uploading…' : 'Choose video'}
              <input
                ref={videoInputRef}
                type="file"
                accept={PRODUCT_VIDEO_TYPES.join(',')}
                onChange={handleVideoFileChange}
                disabled={uploading}
                className="hidden"
              />
            </label>
            <p className="text-xs text-slate-400 mt-1">MP4, MOV, WebM • max 200 MB</p>
          </div>
        )}

        {/* Hidden input for video URL */}
        <input type="hidden" name="videoUrl" value={videoUrl} />
      </div>

      {/* ── Errors ─────────────────────────────────────────────────── */}
      {uploading && (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">
            {uploadLabel || 'Uploading…'}
            {uploadProgress > 0 ? ` (${uploadProgress}%)` : ''}
          </p>
          <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-[width] duration-150"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}
      {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
    </div>
  );
}
