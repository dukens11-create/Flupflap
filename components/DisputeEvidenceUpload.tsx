'use client';

import { useState } from 'react';

const MAX_FILES = 3;
const INPUT_ID = 'dispute-evidence-upload';

export default function DisputeEvidenceUpload({ defaultValue = [] }: { defaultValue?: string[] }) {
  const [urls, setUrls] = useState(defaultValue);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (urls.length >= MAX_FILES) return;

    const files = Array.from(e.target.files ?? []).slice(0, MAX_FILES - urls.length);
    if (files.length === 0) return;

    setUploading(true);
    setError('');

    try {
      const uploaded = await Promise.all(files.map(async (file) => {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/disputes/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Upload failed.');
        return json.url as string;
      }));

      setUrls((current) => [...current, ...uploaded].slice(0, MAX_FILES));
    } catch (err) {
      console.error('[DisputeEvidenceUpload]', err);
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function removeUrl(url: string) {
    setUrls((current) => current.filter((value) => value !== url));
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={INPUT_ID} className="label">Evidence images (optional)</label>
        <input
          id={INPUT_ID}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          disabled={uploading || urls.length >= MAX_FILES}
          onChange={handleFileChange}
          className="input py-1.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm file:font-medium cursor-pointer"
        />
        <p className="text-xs text-slate-500 mt-1">
          Upload up to {MAX_FILES} images. Accepted formats: JPEG, PNG, WebP, GIF.
        </p>
      </div>

      {uploading && <p className="text-sm text-slate-500">Uploading evidence…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {urls.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {urls.map((url) => (
            <div key={url} className="rounded-xl border border-slate-200 p-2 space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Dispute evidence" className="h-24 w-full rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => removeUrl(url)}
                className="text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
              <input type="hidden" name="evidenceUrls" value={url} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
