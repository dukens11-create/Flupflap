'use client';

import { useState } from 'react';

interface ImageUploadProps {
  /** Current image URL (for edit forms pre-populated with an existing value). */
  defaultValue?: string;
  /** Whether the imageUrl field is required. */
  required?: boolean;
}

/**
 * Dual-mode image field: the seller can either pick a file from their device
 * (which is uploaded to Cloudinary via /api/upload) or paste a hosted image URL
 * directly. Either way the resolved URL ends up in the `name="imageUrl"` input
 * so the existing form POST handler receives it unchanged.
 */
export default function ImageUpload({ defaultValue = '', required }: ImageUploadProps) {
  const [imageUrl, setImageUrl] = useState(defaultValue);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError('');

    const fd = new FormData();
    fd.append('file', file);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) {
        setUploadError(json.error ?? 'Upload failed.');
        return;
      }
      setImageUrl(json.url as string);
    } catch (err) {
      console.error('[ImageUpload] upload error', err);
      setUploadError('Upload failed. Please paste a URL instead.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* File picker */}
      <div>
        <label className="label">Upload image from device</label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileChange}
          disabled={uploading}
          className="input py-1.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm file:font-medium cursor-pointer"
        />
      </div>

      {uploading && (
        <p className="text-sm text-slate-500">Uploading image…</p>
      )}
      {uploadError && (
        <p className="text-sm text-red-600">{uploadError}</p>
      )}

      {/* Preview */}
      {imageUrl && (
        <img
          src={imageUrl}
          alt="Product preview"
          className="h-28 w-28 rounded object-cover border border-slate-200"
        />
      )}

      {/* URL fallback / result display */}
      <div>
        <label className="label">Or paste image URL</label>
        <input
          name="imageUrl"
          type="url"
          className="input"
          placeholder="https://…"
          value={imageUrl}
          onChange={e => setImageUrl(e.target.value)}
          required={required}
        />
      </div>
    </div>
  );
}
