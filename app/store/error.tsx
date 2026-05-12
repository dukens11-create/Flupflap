'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';

export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { boundary: 'StoreError' },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <main className="max-w-md mx-auto py-16 text-center">
      <p className="text-5xl mb-4">🏬</p>
      <h2 className="text-2xl font-black mb-3 text-slate-800">Store unavailable</h2>
      <p className="text-slate-500 mb-6">
        This seller&apos;s store could not be loaded. Please try again.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button onClick={reset} className="btn-primary">Try again</button>
        <Link href="/" className="btn-outline">Browse marketplace</Link>
      </div>
    </main>
  );
}
