'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function AdminRefundsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { boundary: 'AdminRefundsError' },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <main className="mx-auto max-w-3xl py-10">
      <div className="card p-6 text-center space-y-3">
        <p className="text-4xl" aria-hidden="true">⚠️</p>
        <h2 className="text-2xl font-black text-slate-800">Refund dashboard unavailable</h2>
        <p className="text-sm text-slate-500">We could not load refund data right now. Please retry.</p>
        <div>
          <button type="button" onClick={reset} className="btn-primary">Retry</button>
        </div>
      </div>
    </main>
  );
}
