'use client';

import Link from 'next/link';
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
    <main className="mx-auto max-w-md py-16 text-center">
      <p className="mb-4 text-5xl" aria-hidden="true">⚠️</p>
      <h2 className="mb-3 text-2xl font-black text-slate-800">Refund dashboard unavailable</h2>
      <p className="mb-6 text-slate-500">
        We couldn&apos;t load the refund dashboard right now. Please try again.
      </p>
      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <button onClick={reset} className="btn-primary">Try again</button>
        <Link href="/admin" className="btn-outline">Admin home</Link>
      </div>
    </main>
  );
}
