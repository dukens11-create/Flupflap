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
    <main className="max-w-md mx-auto py-16 text-center">
      <p className="text-5xl mb-4">⚠️</p>
      <h2 className="text-2xl font-black mb-3 text-slate-800">Refund dashboard unavailable</h2>
      <p className="text-slate-500 mb-6">We couldn&apos;t load the refunds dashboard.</p>
      <button onClick={reset} className="btn-primary">Retry</button>
    </main>
  );
}
