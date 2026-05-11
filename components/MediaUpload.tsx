'use client';

import { useState, useRef } from 'react';

const MAX_IMAGES = 6;
const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif';
const ACCEPTED_VIDEO_TYPES = 'video/mp4,video/quicktime,video/webm';

interface MediaUploadProps {
  /** Existing image URLs for edit forms. */
  defaultImages?: string[];
  /** Existing video URL for edit forms. */
  defaultVideoUrl?: string;
  /** Whether at least one image is required. */
  required?: boolean;
}

/**
 * Multi-image + video upload component.
 * – Up to 6 images: multi-select, preview, remove, reorder
 * – Up to 1 video: preview and remove
 * Hidden inputs (name="images", name="imageUrl", name="videoUrl") carry the
 * resolved Cloudinary URLs to the enclosing form POST.
 */
export default function MediaUpload({ defaultImages = [], defaultVideoUrl = '', required }: MediaUploadProps) {
  const [images, setImages] = useState<string[]>(defaultImages);
  const [videoUrl, setVideoUrl] = useState<string>(defaultVideoUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

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

    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      setUploadError(`Maximum ${MAX_IMAGES} images allowed.`);
      return;
    }

    const toUpload = files.slice(0, remaining);
    if (files.length > remaining) {
      setUploadError(`Only ${remaining} more image(s) can be added (max ${MAX_IMAGES}). Extra files ignored.`);
    } else {
      setUploadError('');
    }

    setUploading(true);
    try {
      const urls = await Promise.all(toUpload.map(uploadFile));
      setImages(prev => [...prev, ...urls]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setUploadError(msg);
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  }

  async function handleVideoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB
    if (file.size > MAX_VIDEO_BYTES) {
      setUploadError('Video is too large. Maximum size is 200 MB.');
      if (videoInputRef.current) videoInputRef.current.value = '';
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      const url = await uploadFile(file);
      setVideoUrl(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setUploadError(msg);
    } finally {
      setUploading(false);
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
        {images.length < MAX_IMAGES && (
          <div>
            <label className="inline-flex items-center gap-2 cursor-pointer btn-outline text-sm">
              {uploading ? 'Uploading…' : images.length === 0 ? 'Choose images' : 'Add more images'}
              <input
                ref={imageInputRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                multiple
                onChange={handleImageFilesChange}
                disabled={uploading}
                className="hidden"
              />
            </label>
            <p className="text-xs text-slate-400 mt-1">{images.length}/{MAX_IMAGES} images • JPEG, PNG, WebP, GIF • max 10 MB each</p>
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
                accept={ACCEPTED_VIDEO_TYPES}
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
      {uploading && <p className="text-sm text-slate-500">Uploading…</p>}
      {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
    </div>
  );
}
