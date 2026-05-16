'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type AdminRemoveProfileImageButtonProps = {
  userId: string;
};

export default function AdminRemoveProfileImageButton({ userId }: AdminRemoveProfileImageButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRemove() {
    if (!confirm('Remove this user profile picture?')) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to remove profile picture.');
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to remove profile picture.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        className="btn-outline text-xs text-red-600 border-red-200 hover:bg-red-50"
        onClick={handleRemove}
        disabled={loading}
      >
        {loading ? 'Removing…' : 'Remove profile picture'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

