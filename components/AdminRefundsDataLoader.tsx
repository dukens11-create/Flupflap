'use client';

import { useEffect, useState } from 'react';
import AdminRefundReviewList from '@/components/AdminRefundReviewList';
import type { AdminRefundRecord } from '@/lib/admin-refunds';

type AdminRefundsResponse = {
  refunds?: AdminRefundRecord[];
  error?: string;
};

export default function AdminRefundsDataLoader() {
  const [refunds, setRefunds] = useState<AdminRefundRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminAccessRequired, setAdminAccessRequired] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadRefunds() {
      try {
        const response = await fetch('/api/admin/refunds', { cache: 'no-store' });
        let data: AdminRefundsResponse = {};
        try {
          data = await response.json() as AdminRefundsResponse;
        } catch (parseError) {
          console.error('[admin/refunds] Failed to parse refunds response.', parseError);
        }

        if (!active) return;

        const nextRefunds = Array.isArray(data.refunds) ? data.refunds : [];
        setRefunds(nextRefunds);

        if (!response.ok) {
          const message = data.error ?? 'Unable to load refund requests';
          if (response.status === 401 || response.status === 403) {
            setAdminAccessRequired(true);
            setError('Admin access required.');
            return;
          }
          setError(message);
          return;
        }

        setError(null);
      } catch (requestError) {
        if (!active) return;
        console.error('[admin/refunds] Failed to fetch refunds.', requestError);
        setError('Unable to load refund requests');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadRefunds();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="card p-8 text-center text-sm text-slate-500">
        Loading refund requests…
      </div>
    );
  }

  if (adminAccessRequired) {
    return (
      <div className="card p-8 text-center text-sm text-slate-500">
        Admin access required.
      </div>
    );
  }

  if (error && refunds.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {error}
      </div>
    );
  }

  return (
    <section className="space-y-4">
      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}
      <AdminRefundReviewList initialRefundRequests={refunds} allowEmptyState />
    </section>
  );
}
