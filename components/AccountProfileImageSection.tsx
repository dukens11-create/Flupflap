'use client';

import { useEffect, useRef, useState } from 'react';
import UserAvatar from '@/components/UserAvatar';
import {
  getProfileImageValidationError,
  PROFILE_IMAGE_MAX_BYTES,
} from '@/lib/profile-image';

type AccountProfileImageSectionProps = {
  userName?: string | null;
};

export default function AccountProfileImageSection({ userName }: AccountProfileImageSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    async function loadAvatar() {
      try {
        const res = await fetch('/api/account/avatar', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Failed to load profile photo.');
          return;
        }
        setImageUrl(data.profileImageUrl ?? null);
      } catch {
        setError('Failed to load profile photo.');
      }
    }
    void loadAvatar();
  }, []);

  async function uploadAvatar(file: File) {
    const validationError = getProfileImageValidationError(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    const fd = new FormData();
    fd.append('file', file);

    setUploading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/account/avatar', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to upload profile photo.');
        return;
      }
      setImageUrl(data.profileImageUrl ?? null);
      setSuccess('Profile photo updated.');
    } catch {
      setError('Failed to upload profile photo.');
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    setRemoving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/account/avatar', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to remove profile photo.');
        return;
      }
      setImageUrl(null);
      setSuccess('Profile photo removed.');
    } catch {
      setError('Failed to remove profile photo.');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div>
      <p className="label">Profile photo</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <UserAvatar imageUrl={imageUrl} name={userName} className="h-16 w-16" />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-outline text-xs"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || removing}
          >
            {uploading ? 'Uploading…' : imageUrl ? 'Change photo' : 'Upload photo'}
          </button>
          {imageUrl && (
            <button
              type="button"
              className="btn-outline text-xs text-red-600 border-red-200 hover:bg-red-50"
              onClick={removeAvatar}
              disabled={uploading || removing}
            >
              {removing ? 'Removing…' : 'Remove photo'}
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        JPG, PNG, WebP, or GIF up to {Math.floor(PROFILE_IMAGE_MAX_BYTES / (1024 * 1024))} MB.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void uploadAvatar(file);
          }
          event.target.value = '';
        }}
        disabled={uploading || removing}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {success && <p className="mt-1 text-xs text-green-600">{success}</p>}
    </div>
  );
}
