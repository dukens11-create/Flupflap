'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Props {
  listingId: string;
  listingStatus: string;
}

export default function FraudListingActions({ listingId, listingStatus }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function doAction(action: 'approve' | 'reject' | 'hide') {
    if (loading) return;
    setLoading(action);
    setError(null);

    try {
      const statusMap: Record<string, string> = {
        approve: 'APPROVED',
        reject: 'REJECTED',
        hide: 'HIDDEN',
      };
      const res = await fetch(`/api/admin/products/${listingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusMap[action] }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError((json as { error?: string }).error ?? `Action failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {error && (
        <div className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
          ⚠ {error}
        </div>
      )}
      {listingStatus === 'PENDING' && (
        <>
          <button
            onClick={() => doAction('approve')}
            disabled={!!loading}
            className="btn bg-green-600 hover:bg-green-700 text-white text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading === 'approve' ? 'Approving…' : 'Approve'}
          </button>
          <button
            onClick={() => doAction('reject')}
            disabled={!!loading}
            className="btn bg-red-600 hover:bg-red-700 text-white text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
        </>
      )}
      <button
        onClick={() => doAction('hide')}
        disabled={!!loading}
        className="btn bg-slate-900 hover:bg-slate-800 text-white text-sm disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading === 'hide' ? 'Hiding…' : 'Hide listing'}
      </button>
      {listingStatus === 'APPROVED' && (
        <Link href={`/products/${listingId}`} target="_blank" className="btn-outline text-sm">
          View listing ↗
        </Link>
      )}
    </div>
  );
}
