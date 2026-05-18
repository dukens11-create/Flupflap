'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';

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
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-5xl" aria-hidden="true">💸</p>
      <h2 className="mt-4 text-2xl font-black text-slate-900">Refund dashboard unavailable</h2>
      <p className="mt-3 text-sm text-slate-500">
        We hit a problem while loading the admin refunds page. Please try again.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <button onClick={reset} className="btn-primary">Try again</button>
        <Link href="/admin" className="btn-outline">Admin home</Link>
      </div>
    </main>
  );
}
